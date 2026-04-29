from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

from app.database import get_db
from app.services.emissions import carbon_breakdown, points_for_action
from app.services.external import aqi_label, fetch_environment, geocode_city, latest_cached_environment, search_locations
from app.services.recommender import get_recommendation, recommend_for_trip, update_weights_with_feedback
from app.services.routing import compare_routes, geocode_query

router = APIRouter(prefix="/api", tags=["api"])
logger = logging.getLogger("carbon_guardian.api")


class CreateUserIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    location: str = "Unknown"


class ActionIn(BaseModel):
    user_id: int
    action: str = Field(pattern="^(metro|public_transport|carpool|bike|walk|walk_cycle|avoid_travel|cab|car|bus|train|airplane|energy|waste|food)$")
    accepted: bool
    recommendation_id: int | None = None
    recommended_action: str | None = None
    distance_km: float = Field(ge=0, le=300, default=6.0)
    energy_kwh: float = Field(ge=0, le=500, default=1.2)
    waste_kg: float = Field(ge=0, le=200, default=0.2)


class SimulateIn(BaseModel):
    current: str = "cab"
    alternative: str = "bike"
    distance_km: float = Field(ge=1, le=200)


class RedeemIn(BaseModel):
    user_id: int
    points: int = Field(ge=1, le=100000)
    reward_name: str = Field(min_length=2, max_length=80)


class PreferencesIn(BaseModel):
    user_id: int
    transport: Literal["car", "bike", "public_transport", "walk_cycle"]
    effort: Literal["low", "medium", "high"]
    time: Literal["busy", "flexible"]
    goal: Literal["reduce_carbon", "save_money", "fitness"] | None = None


class RouteCompareIn(BaseModel):
    start_lat: float = Field(ge=-90, le=90)
    start_lon: float = Field(ge=-180, le=180)
    end_lat: float = Field(ge=-90, le=90)
    end_lon: float = Field(ge=-180, le=180)


class TripComputeIn(BaseModel):
    source_lat: float = Field(ge=-90, le=90)
    source_lon: float = Field(ge=-180, le=180)
    destination: str = Field(min_length=2, max_length=180)


class AiRecommendIn(BaseModel):
    user_id: int
    distance_km: float = Field(ge=0)
    duration_min: float = Field(ge=0)
    aqi: float = Field(ge=0, le=500)
    current_action: Literal["walk", "bike", "bus", "metro", "train", "cab", "airplane"] = "cab"


@router.post("/user")
def create_user(payload: CreateUserIn) -> dict:
    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (payload.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already exists")
        cursor = db.execute(
            """
            INSERT INTO users (name, email, location, preferred_transport, avg_distance_km, carbon_score, green_points)
            VALUES (?, ?, ?, 'metro', 6.0, 0, 0)
            """,
            (payload.name, payload.email, payload.location),
        )
        user_id = cursor.lastrowid
    return {"id": user_id, "name": payload.name, "email": payload.email, "location": payload.location}


@router.get("/user/{user_id}")
def get_user(user_id: int) -> dict:
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        recent = db.execute(
            "SELECT action, accepted, carbon_score, created_at FROM user_activity WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 10",
            (user_id,),
        ).fetchall()
        leaderboard = db.execute("SELECT id, name, green_points, streak_days FROM users ORDER BY green_points DESC LIMIT 10").fetchall()
        return {
            **dict(user),
            "recent_activity": [dict(row) for row in recent],
            "leaderboard": [dict(row) for row in leaderboard],
        }


@router.post("/user/preferences")
def save_preferences(payload: PreferencesIn) -> dict:
    with get_db() as db:
        user = db.execute("SELECT id FROM users WHERE id = ?", (payload.user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        db.execute(
            """
            INSERT INTO preferences (user_id, transport, effort, time, goal, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
              transport = excluded.transport,
              effort = excluded.effort,
              time = excluded.time,
              goal = excluded.goal,
              updated_at = CURRENT_TIMESTAMP
            """,
            (payload.user_id, payload.transport, payload.effort, payload.time, payload.goal),
        )

    return {
        "status": "saved",
        "user_id": payload.user_id,
        "preferences": {
            "transport": payload.transport,
            "effort": payload.effort,
            "time": payload.time,
            "goal": payload.goal,
        },
    }


@router.get("/user/preferences/{user_id}")
def get_preferences(user_id: int) -> dict:
    with get_db() as db:
        row = db.execute(
            "SELECT user_id, transport, effort, time, goal, updated_at FROM preferences WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return {"user_id": user_id, "preferences": None}
        return {"user_id": user_id, "preferences": dict(row)}


def _latest_environment_context() -> dict:
    with get_db() as db:
        row = db.execute(
            "SELECT city, local_area, aqi, temperature FROM environment_cache ORDER BY datetime(created_at) DESC LIMIT 1"
        ).fetchone()
    if not row:
        return {"city": "Unknown Location", "area": "Unknown Location", "aqi": 0.0, "temperature": 0.0}
    return {
        "city": row["city"],
        "area": row["local_area"],
        "aqi": float(row["aqi"]),
        "temperature": float(row["temperature"]),
    }


def _normalize_action(action: str) -> str:
    lookup = {
        "public_transport": "public_transport",
        "walk_cycle": "walk_cycle",
        "carpool": "carpool",
        "walk": "walk",
        "metro": "metro",
        "bike": "bike",
        "bus": "bus",
        "train": "train",
        "airplane": "airplane",
        "avoid_travel": "avoid_travel",
        "cab": "cab",
        "car": "car",
    }
    return lookup.get(action.strip().lower(), "cab")


@router.get("/environment")
async def environment(lat: float | None = None, lon: float | None = None, city: str | None = None) -> dict:
    if lat is None or lon is None:
        if not city:
            raise HTTPException(status_code=422, detail="Provide lat/lon or city")
        try:
            lat, lon = await geocode_city(city)
        except HTTPException:
            cached = latest_cached_environment()
            if cached:
                cached_aqi = int(round(float(cached.get("aqi", 0))))
                return {
                    "city": cached.get("city", "Unknown Location"),
                    "area": cached.get("local_area", cached.get("city", "Unknown Location")),
                    "lat": float(cached.get("lat", lat)),
                    "lon": float(cached.get("lon", lon)),
                    "aqi": cached_aqi,
                    "aqi_label": aqi_label(cached_aqi),
                    "temperature": round(float(cached.get("temperature", 0)), 1),
                    "source": {
                        "aqi": cached.get("aqi_source", "Cache"),
                        "temperature": cached.get("temperature_source", "Cache"),
                    },
                    "aqi_station": cached.get("aqi_station"),
                    "realtime": False,
                    "updated_at": cached.get("created_at"),
                    "detail": "Live geocoding failed, returning cached environment.",
                }
            raise
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates. Expected lat in [-90,90] and lon in [-180,180].")

    env = await fetch_environment(lat, lon, city_hint=city)
    resolved_aqi = int(round(float(env["aqi"])))
    return {
        "city": env.get("city", "Unknown Location"),
        "area": env.get("local_area", env.get("area", "Unknown Location")),
        "lat": float(env.get("lat", lat)),
        "lon": float(env.get("lon", lon)),
        "aqi": resolved_aqi,
        "aqi_label": env.get("aqi_label", aqi_label(resolved_aqi)),
        "temperature": round(float(env.get("temperature", 0)), 1),
        "source": env.get("source", {"aqi": "WAQI", "temperature": "OpenWeather"}),
        "aqi_station": env.get("aqi_station"),
        "realtime": not bool(env.get("fallback")),
        "updated_at": datetime.utcnow().isoformat(),
        "detail": env.get("detail"),
    }


@router.get("/search")
async def search(
    query: str = Query(min_length=2, max_length=80),
    lat: float | None = None,
    lon: float | None = None
) -> dict:
    try:
        items = await search_locations(query, lat, lon)
        return {"items": items}
    except Exception as exc:
        logger.exception("search failed for query=%s", query)
        raise HTTPException(status_code=503, detail=f"Search failed: {exc}") from exc


@router.get("/geocode")
async def geocode(query: str = Query(min_length=2, max_length=120)) -> dict:
    try:
        return await geocode_query(query)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("geocode failed for query=%s", query)
        raise HTTPException(status_code=503, detail=f"Geocode provider failed: {exc}") from exc


@router.post("/routes/compare")
async def routes_compare(payload: RouteCompareIn) -> dict:
    try:
        return await compare_routes(
            start_lat=payload.start_lat,
            start_lon=payload.start_lon,
            end_lat=payload.end_lat,
            end_lon=payload.end_lon,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("route compare failed")
        raise HTTPException(status_code=503, detail=f"Route engine failed: {exc}") from exc


@router.post("/trip/compute")
async def trip_compute(payload: TripComputeIn) -> dict:
    try:
        destination = await geocode_query(payload.destination)
        compared = await compare_routes(
            start_lat=payload.source_lat,
            start_lon=payload.source_lon,
            end_lat=destination["lat"],
            end_lon=destination["lon"],
        )
        env = await fetch_environment(payload.source_lat, payload.source_lon)
        fastest_mode = compared["best"]["fastest"]
        fastest = next((route for route in compared["routes"] if route["mode"] == fastest_mode), compared["routes"][0])
        return {
            "source": {"lat": payload.source_lat, "lon": payload.source_lon},
            "destination": destination,
            "distance_km": fastest["distance_km"],
            "duration_min": fastest["duration_min"],
            "aqi": env["aqi"],
            "aqi_label": env["aqi_label"],
            "routes": compared["routes"],
            "best": compared["best"],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("trip compute failed")
        raise HTTPException(status_code=503, detail=f"Trip computation failed: {exc}") from exc


@router.post("/ai/recommend")
def ai_recommend(payload: AiRecommendIn) -> dict:
    with get_db() as db:
        user = db.execute("SELECT id FROM users WHERE id = ?", (payload.user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        try:
            recommendation = recommend_for_trip(
                db,
                payload.user_id,
                distance_km=payload.distance_km,
                duration_min=payload.duration_min,
                aqi=payload.aqi,
                current_action=payload.current_action,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return recommendation


@router.get("/recommendation/{user_id}")
def recommendation(
    user_id: int,
    aqi: float | None = None,
    temperature: float | None = None,
) -> dict:
    with get_db() as db:
        user = db.execute("SELECT id, avg_distance_km FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        env_row = db.execute(
            "SELECT aqi, temperature FROM environment_cache ORDER BY datetime(created_at) DESC LIMIT 1"
        ).fetchone()

        effective_aqi = float(aqi) if aqi is not None else float(env_row["aqi"] if env_row else 100.0)
        effective_temp = float(temperature) if temperature is not None else float(env_row["temperature"] if env_row else 28.0)
        distance_km = float(user["avg_distance_km"] or 6.0)

        try:
            result = get_recommendation(
                db,
                user_id,
                aqi=effective_aqi,
                temperature=effective_temp,
                traffic=60.0,
                distance_km=distance_km,
                time_of_day=datetime.now().hour,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "recommendation_id": result.recommendation_id,
        "user_id": result.user_id,
        "top_action": result.top_action,
        "ranked_actions": result.ranked_actions,
        "recommendations": result.ranked_actions,
        "confidence": result.confidence,
        "estimated_co2_reduction": result.estimated_co2_reduction,
        "model_name": result.model_name,
        "cold_start": result.cold_start,
        "context": {
            "aqi": effective_aqi,
            "temperature": effective_temp,
        },
    }


@router.post("/action")
def action(payload: ActionIn) -> dict:
    env = _latest_environment_context()
    hour = datetime.now().hour
    normalized_action = _normalize_action(payload.action)

    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE id = ?", (payload.user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        emissions = carbon_breakdown(normalized_action, payload.distance_km, payload.energy_kwh, payload.waste_kg)
        points_delta = points_for_action(normalized_action, payload.accepted)

        db.execute(
            """
            INSERT INTO actions (user_id, action, accepted, aqi, temperature, hour)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload.user_id,
                normalized_action,
                1 if payload.accepted else 0,
                int(round(env["aqi"])),
                float(env["temperature"]),
                hour,
            ),
        )

        db.execute(
            """
            INSERT INTO user_activity
            (user_id, action, accepted, time_of_day, location_name, location_aqi, weather_temp, traffic, distance_km,
             transport_emissions, energy_emissions, waste_emissions, carbon_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.user_id,
                normalized_action,
                1 if payload.accepted else 0,
                hour,
                f"{env['area']}, {env['city']}",
                env["aqi"],
                env["temperature"],
                50,
                payload.distance_km,
                emissions["transport_emissions"],
                emissions["energy_emissions"],
                emissions["waste_emissions"],
                emissions["carbon_score"],
            ),
        )

        db.execute(
            """
            INSERT INTO action_feedback
            (user_id, recommendation_id, recommended_action, actual_action, accepted, points_delta, aqi, temperature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.user_id,
                payload.recommendation_id,
                payload.recommended_action,
                normalized_action,
                1 if payload.accepted else 0,
                points_delta,
                env["aqi"],
                env["temperature"],
            ),
        )

        update_weights_with_feedback(
            db,
            payload.user_id,
            recommended_action=payload.recommended_action,
            actual_action=normalized_action,
            accepted=payload.accepted,
        )

        user_dict = dict(user)
        next_points = user_dict["green_points"] + points_delta
        last_action_date = user_dict.get("last_action_date")
        streak_days = int(user_dict.get("streak_days") or 0)
        today = date.today()
        if last_action_date:
            try:
                last = datetime.fromisoformat(last_action_date).date()
                delta = (today - last).days
                if delta == 1:
                    streak_days += 1
                elif delta > 1:
                    streak_days = 1
            except ValueError:
                streak_days = 1
        else:
            streak_days = 1

        db.execute(
            """
            UPDATE users
            SET green_points = ?, carbon_score = ?, preferred_transport = ?, avg_distance_km = ?, streak_days = ?, last_action_date = ?
            WHERE id = ?
            """,
            (
                next_points,
                emissions["carbon_score"],
                normalized_action,
                payload.distance_km,
                streak_days,
                datetime.utcnow().isoformat(),
                payload.user_id,
            ),
        )

        count = db.execute("SELECT COUNT(*) AS count FROM action_feedback WHERE user_id = ?", (payload.user_id,)).fetchone()["count"]
        retrain_signal = bool(count % 5 == 0 or payload.accepted)
    return {
        "status": "tracked",
        "action": normalized_action,
        "points_delta": points_delta,
        "carbon_score": emissions["carbon_score"],
        "streak_days": streak_days,
        "environment": {"aqi": env["aqi"], "temperature": env["temperature"], "hour": hour},
        "retrain_signal": retrain_signal,
    }


@router.get("/history/{user_id}")
def history(user_id: int) -> list[dict]:
    with get_db() as db:
        rows = db.execute(
            """
            SELECT created_at, carbon_score
            FROM user_activity
            WHERE user_id = ?
            ORDER BY datetime(created_at) DESC
            LIMIT 90
            """,
            (user_id,),
        ).fetchall()
    if not rows:
        return []

    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        dt = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")) if "T" in row["created_at"] else datetime.strptime(row["created_at"], "%Y-%m-%d %H:%M:%S")
        day = dt.strftime("%a")
        buckets[day].append(float(row["carbon_score"]))

    ordered = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    out = []
    for day in ordered:
        scores = buckets.get(day, [])
        if scores:
            out.append({"day": day, "co2": round(sum(scores) / len(scores), 2)})
    return out


@router.get("/carbon-score/{user_id}")
def carbon_score(user_id: int) -> dict:
    with get_db() as db:
        rows = db.execute(
            """
            SELECT transport_emissions, energy_emissions, waste_emissions
            FROM user_activity
            WHERE user_id = ?
            ORDER BY datetime(created_at) DESC
            LIMIT 30
            """,
            (user_id,),
        ).fetchall()
    if not rows:
        return {"score": None, "breakdown": {"transport": 0, "energy": 0, "waste": 0}, "message": "No data yet"}

    transport = sum(float(row["transport_emissions"]) for row in rows)
    energy = sum(float(row["energy_emissions"]) for row in rows)
    waste = sum(float(row["waste_emissions"]) for row in rows)
    score = round(transport * 0.5 + energy * 0.3 + waste * 0.2, 3)
    return {
        "score": score,
        "breakdown": {
            "transport": round(transport, 3),
            "energy": round(energy, 3),
            "waste": round(waste, 3),
        },
    }


@router.post("/simulate")
def simulate(payload: SimulateIn) -> dict:
    from app.services.emissions import TRANSPORT_EMISSIONS
    
    curr_em = TRANSPORT_EMISSIONS.get(payload.current, 0.18) * payload.distance_km
    alt_em = TRANSPORT_EMISSIONS.get(payload.alternative, 0) * payload.distance_km
    saved = max(0, curr_em - alt_em)
    
    return {
        "emissions_saved": round(saved, 2),
        "current_emissions": round(curr_em, 2),
        "alternative_emissions": round(alt_em, 2),
        "potential_points": int(saved * 10) + 10
    }


@router.post("/redeem")
def redeem(payload: RedeemIn) -> dict:
    with get_db() as db:
        user = db.execute("SELECT green_points FROM users WHERE id = ?", (payload.user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        points = int(user["green_points"])
        if points < payload.points:
            raise HTTPException(status_code=400, detail="Insufficient points")
        next_points = points - payload.points
        db.execute("UPDATE users SET green_points = ? WHERE id = ?", (next_points, payload.user_id))
        db.execute(
            "INSERT INTO action_feedback (user_id, actual_action, accepted, points_delta) VALUES (?, ?, ?, ?)",
            (payload.user_id, f"redeem:{payload.reward_name}", 1, -payload.points),
        )
    return {"status": "redeemed", "points_spent": payload.points, "remaining_points": next_points}


@router.get("/leaderboard")
def leaderboard() -> list[dict]:
    with get_db() as db:
        rows = db.execute(
            "SELECT name, green_points as points, streak_days, preferred_transport FROM users ORDER BY green_points DESC LIMIT 20"
        ).fetchall()
    return [{"rank": i + 1, **dict(row)} for i, row in enumerate(rows)]


@router.get("/community/stats")
def community_stats() -> dict:
    with get_db() as db:
        total_points = db.execute("SELECT SUM(green_points) as total FROM users").fetchone()["total"] or 0
        total_users = db.execute("SELECT COUNT(*) as count FROM users").fetchone()["count"] or 1
        
        # Aggregate stats
        trees_today = int(total_points / 50) + 120 # Mocking some growth for demo
        target_percent = min(98, int((total_points / 10000) * 100) if total_points > 0 else 0)
        
        return {
            "total_points": total_points,
            "total_users": total_users,
            "trees_today": trees_today,
            "target_percent": target_percent,
            "active_now": max(1, int(total_users * 0.15))
        }
