from __future__ import annotations

import logging
import os
import json
import math
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException

from app.database import get_db

logger = logging.getLogger("carbon_guardian.external")
DATAGOV_RESOURCE_ID = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
DATAGOV_MIN_REFRESH_SECONDS = 180


def aqi_label(aqi: int) -> str:
    """Standard 5-tier AQI classification (US EPA scale)."""
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy (Sensitive)"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very Unhealthy"
    return "Hazardous"


def _validate_coordinates(lat: float, lon: float) -> None:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates. Expected lat in [-90,90] and lon in [-180,180].")


def _validated_aqi(value: Any) -> int:
    if value is None:
        raise HTTPException(status_code=503, detail="AQI provider returned null AQI.")
    try:
        aqi_value = int(round(float(value)))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="AQI provider returned non-numeric AQI.") from exc
    if not (0 <= aqi_value <= 500):
        raise HTTPException(status_code=503, detail="AQI provider returned out-of-range AQI.")
    return aqi_value


def _sub_index(concentration: float, breakpoints: list[tuple[float, float, int, int]]) -> int | None:
    for c_low, c_high, i_low, i_high in breakpoints:
        if c_low <= concentration <= c_high:
            scaled = ((i_high - i_low) / (c_high - c_low)) * (concentration - c_low) + i_low
            return int(round(scaled))
    return None


def _aqi_from_openweather_components(components: dict[str, Any]) -> int:
    pm25 = float(components.get("pm2_5", 0.0))
    pm10 = float(components.get("pm10", 0.0))
    pm25_bps = [
        (0.0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    pm10_bps = [
        (0.0, 54.0, 0, 50),
        (55.0, 154.0, 51, 100),
        (155.0, 254.0, 101, 150),
        (255.0, 354.0, 151, 200),
        (355.0, 424.0, 201, 300),
        (425.0, 504.0, 301, 400),
        (505.0, 604.0, 401, 500),
    ]
    pm25_idx = _sub_index(pm25, pm25_bps)
    pm10_idx = _sub_index(pm10, pm10_bps)
    candidates = [value for value in [pm25_idx, pm10_idx] if value is not None]
    if not candidates:
        raise HTTPException(status_code=503, detail="OpenWeather AQI components unavailable.")
    return _validated_aqi(max(candidates))


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _record_first(record: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in record and record[key] not in (None, "", "NA", "N/A", "-"):
            return record[key]
    return None


def _extract_datagov_record(record: dict[str, Any]) -> tuple[int, float | None, float | None, str]:
    pollutant_id = str(_record_first(record, ("pollutant_id", "pollutant", "parameter")) or "").strip().upper()
    aqi_raw = _record_first(
        record,
        (
            "aqi",
            "AQI",
            "air_quality_index",
            "airqualityindex",
            "aqi_value",
            "pollutant_avg",
            "pollutant_avg_value",
        ),
    )
    if aqi_raw is None:
        raise ValueError("AQI missing")
    # If this endpoint returns pollutant rows, only AQI rows should be treated as AQI values.
    if pollutant_id and pollutant_id not in {"AQI", "NA"}:
        raise ValueError("Not an AQI row")
    aqi = _validated_aqi(aqi_raw)

    rec_lat = _safe_float(_record_first(record, ("latitude", "lat", "Latitude", "LATITUDE")))
    rec_lon = _safe_float(_record_first(record, ("longitude", "lon", "lng", "Longitude", "LONGITUDE")))
    area = _record_first(record, ("station", "station_name", "city", "city_name", "location")) or "AQI Station"
    return aqi, rec_lat, rec_lon, str(area)


async def _fetch_datagov_aqi(lat: float, lon: float, city_hint: str | None, api_key: str) -> tuple[int, str]:
    import httpx

    url = f"https://api.data.gov.in/resource/{DATAGOV_RESOURCE_ID}"
    params_base = {
        "api-key": api_key,
        "format": "json",
        "limit": 100,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        records: list[dict[str, Any]] = []
        city_norm = (city_hint or "").strip()
        if city_norm:
            filtered = dict(params_base)
            filtered["filters[city]"] = city_norm
            filtered["filters[pollutant_id]"] = "AQI"
            response = await client.get(url, params=filtered)
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="Data.gov.in rate limit exceeded.")
            response.raise_for_status()
            records = response.json().get("records") or []
        if not records:
            response = await client.get(url, params=params_base)
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="Data.gov.in rate limit exceeded.")
            response.raise_for_status()
            records = response.json().get("records") or []
            records = [row for row in records if str(row.get("pollutant_id", "")).strip().upper() in {"", "AQI"}]
        if not records:
            raise HTTPException(status_code=503, detail="Data.gov.in returned no AQI records.")

        nearest: tuple[float, int, str] | None = None
        city_match: tuple[int, str] | None = None
        city_norm_l = city_norm.lower()

        for item in records:
            try:
                aqi, rec_lat, rec_lon, area = _extract_datagov_record(item)
            except Exception:
                continue

            city_name = str(_record_first(item, ("city", "city_name", "City", "CITY")) or "").strip().lower()
            if city_norm_l and city_name and city_name == city_norm_l and city_match is None:
                city_match = (aqi, area)

            if rec_lat is not None and rec_lon is not None:
                distance = _haversine_km(lat, lon, rec_lat, rec_lon)
                if nearest is None or distance < nearest[0]:
                    nearest = (distance, aqi, area)

        if nearest is not None:
            return nearest[1], nearest[2]
        if city_match is not None:
            return city_match[0], city_match[1]

        raise HTTPException(status_code=503, detail="No valid AQI record found in Data.gov.in response.")


async def _fetch_waqi_aqi(lat: float, lon: float, token: str) -> tuple[int, str]:
    import httpx

    url = f"https://api.waqi.info/feed/geo:{lat};{lon}/"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, params={"token": token})
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") != "ok":
            message = payload.get("data") or payload.get("message") or "WAQI request failed"
            raise HTTPException(status_code=503, detail=f"WAQI failed: {message}")
        data = payload.get("data", {})
        aqi = _validated_aqi(data.get("aqi"))
        city_name = (data.get("city") or {}).get("name")
        return aqi, city_name or ""


async def _fetch_openweather_aqi(lat: float, lon: float, api_key: str) -> tuple[int, dict[str, Any]]:
    import httpx

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            "https://api.openweathermap.org/data/2.5/air_pollution",
            params={"lat": lat, "lon": lon, "appid": api_key},
        )
        response.raise_for_status()
        data = response.json()
        rows = data.get("list") or []
        if not rows:
            raise HTTPException(status_code=503, detail="OpenWeather AQI response empty.")
        components = rows[0].get("components") or {}
        return _aqi_from_openweather_components(components), components


async def _fetch_temperature(lat: float, lon: float, openweather_key: str | None) -> tuple[float, str]:
    import httpx

    async with httpx.AsyncClient(timeout=10) as client:
        if openweather_key:
            response = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"lat": lat, "lon": lon, "appid": openweather_key, "units": "metric"},
            )
            response.raise_for_status()
            body = response.json()
            temp = body.get("main", {}).get("temp")
            if temp is None:
                raise HTTPException(status_code=503, detail="OpenWeather temperature missing.")
            return float(temp), "OpenWeather"

        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": lat, "longitude": lon, "current": "temperature_2m"},
        )
        response.raise_for_status()
        body = response.json()
        temp = body.get("current", {}).get("temperature_2m")
        if temp is None:
            raise HTTPException(status_code=503, detail="Open-Meteo temperature missing.")
        return float(temp), "Open-Meteo"


def _cache_environment(payload: dict[str, Any]) -> None:
    source = payload.get("source")
    source_text = source if isinstance(source, str) else json.dumps(source or {})
    with get_db() as db:
        db.execute(
            """
            INSERT INTO environment_cache
            (lat, lon, city, local_area, aqi, aqi_label, temperature, co2_ppm, source, aqi_source, temperature_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["lat"],
                payload["lon"],
                payload["city"],
                payload["local_area"],
                payload["aqi"],
                payload["aqi_label"],
                payload["temperature"],
                payload["co2_ppm"],
                source_text,
                payload["source"]["aqi"],
                payload["source"]["temperature"],
            ),
        )


def _latest_cached(lat: float | None = None, lon: float | None = None) -> dict[str, Any] | None:
    with get_db() as db:
        if lat is not None and lon is not None:
            row = db.execute(
                """
                SELECT * FROM environment_cache
                WHERE aqi BETWEEN 0 AND 500
                ORDER BY ABS(lat - ?) + ABS(lon - ?), datetime(created_at) DESC
                LIMIT 1
                """,
                (lat, lon),
            ).fetchone()
        else:
            row = db.execute(
                "SELECT * FROM environment_cache WHERE aqi BETWEEN 0 AND 500 ORDER BY datetime(created_at) DESC LIMIT 1"
            ).fetchone()
    return dict(row) if row else None


def _cached_is_fresh(row: dict[str, Any] | None, max_age_seconds: int) -> bool:
    if not row:
        return False
    created_at = row.get("created_at")
    if not created_at:
        return False
    try:
        dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = datetime.strptime(str(created_at), "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return False
    return (datetime.utcnow() - dt) <= timedelta(seconds=max_age_seconds)


def latest_cached_environment() -> dict[str, Any] | None:
    return _latest_cached()


async def reverse_geocode(lat: float, lon: float) -> dict[str, str]:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=9, headers={"User-Agent": "CarbonGuardianAI/1.0"}) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json", "addressdetails": 1},
            )
            response.raise_for_status()
            data = response.json()
            address = data.get("address", {})
            logger.debug("RAW ADDRESS: %s", address)
            print("RAW ADDRESS:", address)

            # Smallest locality first — suburb > neighbourhood > village > town > city
            local_area = (
                address.get("suburb")
                or address.get("neighbourhood")
                or address.get("hamlet")
                or address.get("quarter")
                or address.get("village")
                or address.get("town")
                or ""
            )
            city = (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("county")
                or ""
            )
            return {"city": city, "local_area": local_area}
    except Exception:
        return {"city": "", "local_area": ""}


async def geocode_city(city: str) -> tuple[float, float]:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=9) as client:
            response = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "count": 1, "language": "en", "format": "json"},
            )
            response.raise_for_status()
            data = response.json()
            results = data.get("results", [])
            if not results:
                raise HTTPException(status_code=404, detail=f"City not found: {city}")
            return float(results[0]["latitude"]), float(results[0]["longitude"])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Geocoding failed: {exc}") from exc


async def search_locations(query: str, lat: float | None = None, lon: float | None = None) -> list[dict[str, Any]]:
    import httpx

    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "extratags": 1,
            "limit": 8,
        }

        if lat is not None and lon is not None:
            params["viewbox"] = f"{lon-0.2},{lat+0.2},{lon+0.2},{lat-0.2}"
            params["bounded"] = 1

        headers = {
            "User-Agent": "carbon-guardian-app"
        }

        async with httpx.AsyncClient(timeout=9) as client:
            res = await client.get(url, params=params, headers=headers)
            res.raise_for_status()
            data = res.json()

        results = []
        for item in data:
            results.append({
                "name": item.get("display_name", "").split(",")[0],
                "full": item.get("display_name"),
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
                "type": item.get("type"),
                "category": item.get("class")
            })

        def score(item):
            item_name = item["name"].lower()
            q = query.lower()
            s = 0
            if q in item_name:
                s += 10
            if item["type"] in ["hospital", "school", "college", "university", "clinic", "monument"]:
                s += 5
            return s

        results.sort(key=score, reverse=True)
        return results
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Search provider failed: {exc}") from exc


async def fetch_environment(lat: float, lon: float, city_hint: str | None = None) -> dict[str, Any]:
    try:
        import httpx
        import asyncio
    except Exception as exc:
        logger.exception("environment fetch failed lat=%s lon=%s", lat, lon)
        cached = _latest_cached(lat, lon)
        if cached:
            return {**cached, "fallback": "cache"}
        raise HTTPException(status_code=503, detail="Install httpx to fetch environment data") from exc

    _validate_coordinates(lat, lon)

    # FAST PATH: Return cached data instantly if fresh (within 5 minutes)
    # This eliminates ALL external API calls for repeat requests
    cached_nearby = _latest_cached(lat, lon)
    if _cached_is_fresh(cached_nearby, 300):
        cached_aqi = _validated_aqi(cached_nearby.get("aqi"))
        return {
            "lat": lat,
            "lon": lon,
            "city": cached_nearby.get("city") or city_hint or "Delhi",
            "local_area": cached_nearby.get("local_area") or cached_nearby.get("city") or "",
            "aqi": cached_aqi,
            "aqi_label": aqi_label(cached_aqi),
            "temperature": round(float(cached_nearby.get("temperature", 0)), 1),
            "co2_ppm": float(cached_nearby.get("co2_ppm", 420)),
            "source": {"aqi": cached_nearby.get("aqi_source") or "Cache", "temperature": cached_nearby.get("temperature_source") or "Cache"},
            "aqi_station": cached_nearby.get("aqi_station"),
            "fallback": "cache_fast",
            "detail": "Returned cached environment for instant response.",
        }

    openweather_key = os.getenv("OPENWEATHER_API_KEY")
    waqi_token = os.getenv("WAQI_API_TOKEN")
    datagov_key = (
        os.getenv("DATAGOV_API_KEY")
        or os.getenv("DATA_GOV_API_KEY")
        or "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b"
    )

    # PARALLEL: Fire reverse geocode + temperature at the same time
    # Use OpenWeather key for temperature when available (more accurate)
    location_task = reverse_geocode(lat, lon)
    temperature_task = _fetch_temperature(lat, lon, openweather_key)
    location, (temperature, temperature_source) = await asyncio.gather(
        location_task, temperature_task
    )

    city = city_hint or location["city"] or "Location unavailable"
    local_area = location["local_area"] or city

    try:
        aqi_source = ""
        aqi_station = None
        co2_ppm = 420.0

        # PRIORITY ORDER: WAQI (user requested) → OpenWeather → Data.gov.in
        if waqi_token:
            aqi_value, waqi_city_name = await _fetch_waqi_aqi(lat, lon, waqi_token)
            aqi_source = "WAQI"
            aqi_station = waqi_city_name or None
            if not location["city"] and waqi_city_name:
                city = waqi_city_name
            logger.info("[AQI] WAQI live AQI=%d for (%.4f, %.4f)", aqi_value, lat, lon)
        elif openweather_key:
            aqi_value, components = await _fetch_openweather_aqi(lat, lon, openweather_key)
            aqi_source = "OpenWeather"
            aqi_station = None
            co2_ppm = round(420 + (float(components.get("co", 0.0)) / 1000.0), 1)
            logger.info("[AQI] OpenWeather live AQI=%d for (%.4f, %.4f)", aqi_value, lat, lon)
        elif datagov_key:
            if _cached_is_fresh(cached_nearby, DATAGOV_MIN_REFRESH_SECONDS):
                cached_aqi = _validated_aqi(cached_nearby.get("aqi"))
                payload = {
                    "lat": lat,
                    "lon": lon,
                    "city": city,
                    "local_area": local_area,
                    "aqi": cached_aqi,
                    "aqi_label": aqi_label(cached_aqi),
                    "temperature": round(float(temperature), 1),
                    "co2_ppm": float(cached_nearby.get("co2_ppm", 420)),
                    "source": {"aqi": "Data.gov.in (cached)", "temperature": temperature_source},
                    "aqi_station": cached_nearby.get("aqi_station"),
                    "fallback": "aqi_cache_fresh",
                    "detail": f"Using recent cached AQI to respect Data.gov.in limits ({DATAGOV_MIN_REFRESH_SECONDS}s).",
                }
                _cache_environment(payload)
                return payload
            aqi_value, matched_area = await _fetch_datagov_aqi(lat, lon, city, datagov_key)
            aqi_source = "Data.gov.in"
            aqi_station = matched_area
            logger.info("[AQI] Data.gov.in live AQI=%d for (%.4f, %.4f)", aqi_value, lat, lon)
        else:
            cached = _latest_cached(lat, lon)
            if cached:
                cached_aqi = _validated_aqi(cached.get("aqi"))
                payload = {
                    "lat": lat,
                    "lon": lon,
                    "city": cached.get("city") or city,
                    "local_area": cached.get("local_area") or local_area,
                    "aqi": cached_aqi,
                    "aqi_label": aqi_label(cached_aqi),
                    "temperature": round(float(temperature), 1),
                    "co2_ppm": float(cached.get("co2_ppm", 420)),
                    "source": {"aqi": cached.get("aqi_source") or "Cache", "temperature": temperature_source},
                    "fallback": "aqi_cache_only",
                    "detail": "AQI provider not configured. Using cached AQI with live temperature from Open-Meteo.",
                }
                _cache_environment(payload)
                return payload
            raise HTTPException(
                status_code=503,
                detail="No AQI provider configured and no cached AQI available. Set WAQI_API_TOKEN or OPENWEATHER_API_KEY.",
            )

        aqi_int = _validated_aqi(aqi_value)
        payload = {
            "lat": lat,
            "lon": lon,
            "city": city,
            "local_area": local_area,
            "aqi": aqi_int,
            "aqi_label": aqi_label(aqi_int),
            "temperature": round(float(temperature), 1),
            "co2_ppm": co2_ppm,
            "source": {"aqi": aqi_source, "temperature": temperature_source},
            "aqi_station": aqi_station,
        }
        _cache_environment(payload)
        return payload
    except HTTPException as exc:
        cached = _latest_cached(lat, lon)
        if cached:
            cached_aqi = _validated_aqi(cached.get("aqi"))
            return {
                "lat": lat,
                "lon": lon,
                "city": city,          # always use fresh reverse geocode
                "local_area": local_area,  # always use fresh reverse geocode
                "aqi": cached_aqi,
                "aqi_label": aqi_label(cached_aqi),
                "temperature": round(float(temperature), 1),
                "co2_ppm": float(cached.get("co2_ppm", 420)),
                "source": {
                    "aqi": cached.get("aqi_source") or "Cache",
                    "temperature": temperature_source,
                },
                "fallback": "cache",
                "detail": f"Live provider unavailable. Returned cached environment. Reason: {exc.detail}",
            }
        # No cache at all — return location with default AQI so UI doesn't break
        return {
            "lat": lat,
            "lon": lon,
            "city": city,
            "local_area": local_area,
            "aqi": 100,
            "aqi_label": aqi_label(100),
            "temperature": round(float(temperature), 1),
            "co2_ppm": 420.0,
            "source": {"aqi": "Default (provider unavailable)", "temperature": temperature_source},
            "fallback": "no_aqi_provider",
            "detail": f"AQI provider temporarily unavailable. Showing default AQI. Reason: {exc.detail}",
        }
    except Exception as exc:
        logger.warning("[AQI] All providers failed: %s", exc)
        cached = _latest_cached(lat, lon)
        if cached:
            cached_aqi = _validated_aqi(cached.get("aqi"))
            return {
                "lat": lat,
                "lon": lon,
                "city": cached.get("city") or city,
                "local_area": cached.get("local_area") or local_area,
                "aqi": cached_aqi,
                "aqi_label": aqi_label(cached_aqi),
                "temperature": round(float(temperature), 1),
                "co2_ppm": float(cached.get("co2_ppm", 420)),
                "source": {
                    "aqi": cached.get("aqi_source") or "Cache",
                    "temperature": temperature_source,
                },
                "fallback": "cache",
                "detail": f"Live provider unavailable. Returned cached environment. Reason: {exc}",
            }
        # No cache at all — return location with default AQI so UI doesn't break
        return {
            "lat": lat,
            "lon": lon,
            "city": city,
            "local_area": local_area,
            "aqi": 100,
            "aqi_label": aqi_label(100),
            "temperature": round(float(temperature), 1),
            "co2_ppm": 420.0,
            "source": {"aqi": "Default (all providers failed)", "temperature": temperature_source},
            "fallback": "no_provider",
            "detail": f"All AQI providers failed and no cache available. Showing default AQI. Reason: {exc}",
        }
