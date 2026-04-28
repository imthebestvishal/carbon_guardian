from __future__ import annotations

import math
from typing import Any

import httpx
from fastapi import HTTPException

MODE_CONFIG = {
    "driving_car": {"osrm_profile": "driving", "emission_factor": 0.21, "color": "#ef4444", "speed_kmh": 34.0},
    "cycling_regular": {"osrm_profile": "cycling", "emission_factor": 0.0, "color": "#22c55e", "speed_kmh": 14.0},
    "foot_walking": {"osrm_profile": "walking", "emission_factor": 0.0, "color": "#3b82f6", "speed_kmh": 4.8},
}


async def geocode_query(query: str) -> dict[str, Any]:
    q = query.strip()
    if not q:
        raise HTTPException(status_code=422, detail="query is required")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": q, "count": 5, "language": "en", "format": "json"},
        )
        response.raise_for_status()
        results = response.json().get("results", [])
        if results:
            top = results[0]
            name = ", ".join(
                value for value in [top.get("name"), top.get("admin1"), top.get("country")] if value
            )
            return {"name": name, "lat": float(top["latitude"]), "lon": float(top["longitude"])}

        nominatim = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "jsonv2", "limit": 1},
            headers={"User-Agent": "CarbonGuardianAI/1.0"},
        )
        nominatim.raise_for_status()
        rows = nominatim.json()
        if not rows:
            raise HTTPException(status_code=404, detail=f"Location not found: {query}")
        row = rows[0]
        return {
            "name": row.get("display_name", query),
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
        }


async def _fetch_single_route(
    mode: str,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> dict[str, Any] | None:
    cfg = MODE_CONFIG[mode]
    coords = f"{start_lon},{start_lat};{end_lon},{end_lat}"
    url = f"https://router.project-osrm.org/route/v1/{cfg['osrm_profile']}/{coords}"
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.get(url, params={"overview": "full", "geometries": "geojson"})
        response.raise_for_status()
        body = response.json()
        routes = body.get("routes") or []
        if not routes:
            return None
        route = routes[0]
        distance_km = float(route["distance"]) / 1000.0
        duration_min = float(route["duration"]) / 60.0
        emission_kg = distance_km * float(cfg["emission_factor"])
        return {
            "mode": mode,
            "distance_km": round(distance_km, 2),
            "duration_min": round(duration_min, 1),
            "co2_kg": round(emission_kg, 3),
            "geometry": route["geometry"]["coordinates"],
            "color": cfg["color"],
            "provider": "osrm",
        }


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _fallback_route(
    mode: str,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> dict[str, Any]:
    cfg = MODE_CONFIG[mode]
    straight = _haversine_km(start_lat, start_lon, end_lat, end_lon)
    # Mode-dependent path factor for realistic routing without external provider.
    factor = 1.2 if mode == "driving_car" else 1.08 if mode == "cycling_regular" else 1.03
    distance_km = max(0.1, straight * factor)
    duration_min = (distance_km / cfg["speed_kmh"]) * 60.0
    emission_kg = distance_km * float(cfg["emission_factor"])
    return {
        "mode": mode,
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
        "co2_kg": round(emission_kg, 3),
        "geometry": [[start_lon, start_lat], [end_lon, end_lat]],
        "color": cfg["color"],
        "provider": "fallback",
    }


def _explain(best: dict[str, str], route_map: dict[str, dict[str, Any]]) -> str:
    eco = route_map[best["eco_best"]]
    fastest = route_map[best["fastest"]]
    delta = eco["duration_min"] - fastest["duration_min"]
    if delta <= 0:
        return (
            f"{best['eco_best']} is the most eco-friendly ({eco['co2_kg']} kg CO2) and also the fastest choice."
        )
    return (
        f"{best['eco_best']} is the most eco-friendly ({eco['co2_kg']} kg CO2) and only {round(delta, 1)} min "
        f"slower than {best['fastest']}."
    )


async def compare_routes(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> dict[str, Any]:
    if abs(start_lat - end_lat) < 0.00001 and abs(start_lon - end_lon) < 0.00001:
        raise HTTPException(status_code=400, detail="Start and end locations must be different")

    routes: list[dict[str, Any]] = []
    seen_modes: set[str] = set()
    for mode in MODE_CONFIG:
        try:
            route = await _fetch_single_route(mode, start_lat, start_lon, end_lat, end_lon)
            if route:
                routes.append(route)
                seen_modes.add(mode)
        except httpx.HTTPError:
            continue

    for mode in MODE_CONFIG:
        if mode not in seen_modes:
            routes.append(_fallback_route(mode, start_lat, start_lon, end_lat, end_lon))

    shortest = min(routes, key=lambda item: item["distance_km"])["mode"]
    fastest = min(routes, key=lambda item: item["duration_min"])["mode"]
    eco_best = min(routes, key=lambda item: item["co2_kg"])["mode"]
    best = {"shortest": shortest, "fastest": fastest, "eco_best": eco_best}
    route_map = {route["mode"]: route for route in routes}

    return {
        "routes": routes,
        "best": best,
        "explanation": _explain(best, route_map),
        "emission_factors": {
            "car": 0.21,
            "metro": 0.05,
            "cycle": 0.0,
            "walk": 0.0,
        },
    }
