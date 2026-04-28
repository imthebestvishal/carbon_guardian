from __future__ import annotations

import math
from datetime import datetime
from sqlite3 import Connection

from app.services.emissions import TRANSPORT_EMISSION_KG_PER_KM

ALL_ACTIONS = ["public_transport", "carpool", "bike", "walk_cycle", "avoid_travel", "cab"]
TRANSPORT_TO_BASE_ACTION = {
    "car": "car",
    "bike": "bike",
    "public_transport": "public_transport",
    "walk_cycle": "walk_cycle",
}


def _safe_env_context(db: Connection) -> dict:
    row = db.execute(
        "SELECT city, local_area, aqi, temperature, source FROM environment_cache ORDER BY datetime(created_at) DESC LIMIT 1"
    ).fetchone()
    if not row:
        return {
            "city": "Unknown",
            "area": "Unknown",
            "aqi": 100,
            "temperature": 28.0,
            "source": "default",
            "message": "Environment data unavailable; using safe defaults.",
        }
    return {
        "city": row["city"],
        "area": row["local_area"],
        "aqi": float(row["aqi"]),
        "temperature": float(row["temperature"]),
        "source": row["source"],
        "message": None,
    }


def _load_user_preferences(db: Connection, user_id: int) -> dict | None:
    row = db.execute("SELECT transport, effort, time, goal FROM preferences WHERE user_id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def _action_acceptance(db: Connection, user_id: int) -> dict[str, float]:
    rows = db.execute(
        """
        SELECT action, AVG(CAST(accepted AS REAL)) AS acceptance
        FROM actions
        WHERE user_id = ?
        GROUP BY action
        """,
        (user_id,),
    ).fetchall()
    return {row["action"]: float(row["acceptance"]) for row in rows}


def _co2_saved_estimate(base_action: str, action: str, distance_km: float = 6.0) -> float:
    base = TRANSPORT_EMISSION_KG_PER_KM.get(base_action, TRANSPORT_EMISSION_KG_PER_KM["car"])
    alt = TRANSPORT_EMISSION_KG_PER_KM.get(action, TRANSPORT_EMISSION_KG_PER_KM["cab"])
    return round(max(0.0, (base - alt) * distance_km), 3)


def _rule_scores(preferences: dict | None, context: dict) -> dict[str, float]:
    scores = {action: 0.15 for action in ALL_ACTIONS}
    scores["public_transport"] += 0.2
    scores["carpool"] += 0.14
    scores["avoid_travel"] += 0.1

    aqi = float(context["aqi"])
    temperature = float(context["temperature"])
    hour = int(context["hour"])

    if aqi > 150:
        scores["public_transport"] += 0.32
        scores["carpool"] += 0.24
        scores["avoid_travel"] += 0.28
        scores["bike"] -= 0.2
        scores["walk_cycle"] -= 0.24
    elif aqi < 70:
        scores["bike"] += 0.22
        scores["walk_cycle"] += 0.24

    if hour in {8, 9, 17, 18, 19}:
        scores["public_transport"] += 0.18
        scores["carpool"] += 0.15

    if preferences is None:
        return scores

    transport = preferences["transport"]
    effort = preferences["effort"]
    availability = preferences["time"]
    goal = preferences.get("goal")

    if transport == "car":
        scores["public_transport"] += 0.2
        scores["carpool"] += 0.2
        scores["cab"] -= 0.12
    if transport == "public_transport":
        scores["public_transport"] += 0.18
    if transport == "bike":
        scores["bike"] += 0.16
    if transport == "walk_cycle":
        scores["walk_cycle"] += 0.16

    if effort == "low":
        scores["bike"] -= 0.25
        scores["walk_cycle"] -= 0.2
        scores["public_transport"] += 0.2
        scores["carpool"] += 0.16
    elif effort == "high":
        scores["bike"] += 0.2
        scores["walk_cycle"] += 0.2

    if availability == "busy":
        scores["public_transport"] += 0.2
        scores["carpool"] += 0.16
    elif availability == "flexible":
        scores["walk_cycle"] += 0.1
        scores["avoid_travel"] += 0.1

    if temperature > 35 and effort != "high":
        scores["bike"] -= 0.18
        scores["walk_cycle"] -= 0.2

    if goal == "fitness" and effort != "low":
        scores["bike"] += 0.25
        scores["walk_cycle"] += 0.23
    elif goal == "save_money":
        scores["public_transport"] += 0.18
        scores["walk_cycle"] += 0.14
        scores["bike"] += 0.12
        scores["cab"] -= 0.2
    elif goal == "reduce_carbon":
        scores["avoid_travel"] += 0.22
        scores["public_transport"] += 0.2

    return scores


def generate_recommendations(db: Connection, user_id: int) -> dict:
    context = _safe_env_context(db)
    context["hour"] = datetime.now().hour
    preferences = _load_user_preferences(db, user_id)
    base_action = TRANSPORT_TO_BASE_ACTION.get((preferences or {}).get("transport", "car"), "car")

    scores = _rule_scores(preferences, context)
    acceptance = _action_acceptance(db, user_id)
    for action, rate in acceptance.items():
        if action in scores:
            scores[action] += (rate - 0.5) * 0.2

    positives = {k: max(v, 0.01) for k, v in scores.items()}
    total = sum(math.exp(v) for v in positives.values())
    ranked = []
    for action, score in positives.items():
        prob = math.exp(score) / total if total else 0.0
        ranked.append(
            {
                "action": action,
                "score": round(prob, 4),
                "estimated_co2_reduction": _co2_saved_estimate(base_action, action),
            }
        )
    ranked.sort(key=lambda item: item["score"], reverse=True)

    if len(ranked) < 2:
        ranked = ranked + [{"action": "public_transport", "score": 0.5, "estimated_co2_reduction": 0.0}]

    top_actions = [item["action"] for item in ranked[:3]]
    return {
        "user_id": user_id,
        "recommendations": ranked[:4],
        "top_action": ranked[0]["action"],
        "ranked_actions": ranked[:4],
        "context": {
            "aqi": context["aqi"],
            "temperature": context["temperature"],
            "hour": context["hour"],
            "city": context["city"],
            "area": context["area"],
        },
        "message": context["message"],
        "used_preferences": bool(preferences),
        "top_actions": top_actions,
        "engine": "rule-based-v1",
    }
