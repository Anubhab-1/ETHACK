"""
AETHER — Open-Meteo Weather Data Fetcher
Fetches free hourly weather data for any city.
No API key required.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Weather

logger = logging.getLogger(__name__)
settings = get_settings()

CITY_COORDS = {
    "Kolkata": {"lat": 22.5726, "lon": 88.3639},
    "Delhi": {"lat": 28.6139, "lon": 77.2090},
    "Mumbai": {"lat": 19.0760, "lon": 72.8777},
}


def fetch_weather(city: str = "Kolkata", db: Session = None) -> list[dict]:
    """Fetch hourly weather from Open-Meteo API (free, no key)."""
    coords = CITY_COORDS.get(city, CITY_COORDS["Kolkata"])

    try:
        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,precipitation",
            "timezone": "Asia/Kolkata",
            "past_days": 7,
            "forecast_days": 7,
        }
        resp = requests.get(settings.open_meteo_base, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        temps = hourly.get("temperature_2m", [])
        humidities = hourly.get("relative_humidity_2m", [])
        wind_speeds = hourly.get("wind_speed_10m", [])
        wind_dirs = hourly.get("wind_direction_10m", [])
        pressures = hourly.get("surface_pressure", [])
        precips = hourly.get("precipitation", [])

        records = []
        for i, t in enumerate(times):
            records.append({
                "time": t,
                "temp_c": temps[i] if i < len(temps) else None,
                "humidity_pct": humidities[i] if i < len(humidities) else None,
                "wind_speed": wind_speeds[i] if i < len(wind_speeds) else None,
                "wind_dir": wind_dirs[i] if i < len(wind_dirs) else None,
                "pressure": pressures[i] if i < len(pressures) else None,
                "precipitation": precips[i] if i < len(precips) else None,
            })

        logger.info(f"Fetched {len(records)} weather records for {city}")
        return records

    except Exception as e:
        logger.error(f"Open-Meteo API error: {e}")
        return []


def upsert_weather(records: list[dict], city: str, db: Session) -> int:
    """Insert weather records, skipping duplicates."""
    inserted = 0
    for rec in records:
        try:
            dt = datetime.fromisoformat(rec["time"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)

            # Check if record exists
            existing = db.query(Weather).filter(
                Weather.city == city,
                Weather.recorded_at == dt
            ).first()
            if existing:
                continue

            w = Weather(
                city=city,
                recorded_at=dt,
                temp_c=rec.get("temp_c"),
                humidity_pct=rec.get("humidity_pct"),
                wind_speed=rec.get("wind_speed"),
                wind_dir=rec.get("wind_dir"),
                pressure=rec.get("pressure"),
                precipitation=rec.get("precipitation"),
            )
            db.add(w)
            inserted += 1
        except Exception as e:
            logger.warning(f"Skipping weather record: {e}")
            continue

    db.commit()
    logger.info(f"Inserted {inserted} new weather records for {city}")
    return inserted


def get_current_weather(city: str, db: Session) -> dict | None:
    """Get the most recent weather record for a city."""
    rec = db.query(Weather).filter(
        Weather.city == city
    ).order_by(Weather.recorded_at.desc()).first()

    if not rec:
        return None

    return {
        "temp_c": rec.temp_c,
        "humidity_pct": rec.humidity_pct,
        "wind_speed": rec.wind_speed,
        "wind_dir": rec.wind_dir,
        "pressure": rec.pressure,
        "precipitation": rec.precipitation,
        "recorded_at": rec.recorded_at,
    }


def get_weather_forecast(city: str, hours_ahead: int = 72) -> list[dict]:
    """Fetch future weather forecast from Open-Meteo."""
    coords = CITY_COORDS.get(city, CITY_COORDS["Kolkata"])
    try:
        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure",
            "timezone": "Asia/Kolkata",
            "forecast_days": (hours_ahead // 24) + 1,
        }
        resp = requests.get(settings.open_meteo_base, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        datetime.now()

        result = []
        for i, t in enumerate(times[:hours_ahead]):
            result.append({
                "time": t,
                "temp_c": hourly.get("temperature_2m", [None]*len(times))[i],
                "humidity_pct": hourly.get("relative_humidity_2m", [None]*len(times))[i],
                "wind_speed": hourly.get("wind_speed_10m", [None]*len(times))[i],
                "wind_dir": hourly.get("wind_direction_10m", [None]*len(times))[i],
                "pressure": hourly.get("surface_pressure", [None]*len(times))[i],
            })
        return result
    except Exception as e:
        logger.error(f"Weather forecast error: {e}")
        return []
