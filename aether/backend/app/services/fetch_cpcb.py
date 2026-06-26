from __future__ import annotations
"""
AETHER — CPCB AQI Data Fetcher
Fetches live AQI data from data.gov.in API (CPCB).
Falls back to generated realistic data if API key is not set.
"""
import requests
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Station, Reading
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# AQI breakpoints for computation (Indian AQI standard)
AQI_BREAKPOINTS = {
    "pm25": [
        (0, 30, 0, 50, "Good"),
        (31, 60, 51, 100, "Satisfactory"),
        (61, 90, 101, 200, "Moderate"),
        (91, 120, 201, 300, "Poor"),
        (121, 250, 301, 400, "Very Poor"),
        (251, 500, 401, 500, "Severe"),
    ],
    "pm10": [
        (0, 50, 0, 50, "Good"),
        (51, 100, 51, 100, "Satisfactory"),
        (101, 250, 101, 200, "Moderate"),
        (251, 350, 201, 300, "Poor"),
        (351, 430, 301, 400, "Very Poor"),
        (431, 600, 401, 500, "Severe"),
    ],
}

AQI_CATEGORIES = [
    (0, 50, "Good"),
    (51, 100, "Satisfactory"),
    (101, 200, "Moderate"),
    (201, 300, "Poor"),
    (301, 400, "Very Poor"),
    (401, 500, "Severe"),
]


def compute_sub_index(concentration: float, pollutant: str) -> float | None:
    """Compute Indian AQI sub-index for a pollutant."""
    if pollutant not in AQI_BREAKPOINTS:
        return None
    for (c_lo, c_hi, i_lo, i_hi, _) in AQI_BREAKPOINTS[pollutant]:
        if c_lo <= concentration <= c_hi:
            return i_lo + (i_hi - i_lo) * (concentration - c_lo) / (c_hi - c_lo)
    return 500.0  # capped at severe


def compute_aqi(pm25: float | None, pm10: float | None) -> tuple[float | None, str | None]:
    """Compute overall AQI as max of sub-indices."""
    sub_indices = []
    if pm25 is not None:
        si = compute_sub_index(pm25, "pm25")
        if si:
            sub_indices.append(si)
    if pm10 is not None:
        si = compute_sub_index(pm10, "pm10")
        if si:
            sub_indices.append(si)

    if not sub_indices:
        return None, None

    aqi = max(sub_indices)
    category = "Severe"
    for lo, hi, cat in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            category = cat
            break
    return round(aqi, 1), category


def fetch_live_cpcb(city: str = "Kolkata", db: Session = None) -> list[dict]:
    """Fetch live AQI from data.gov.in CPCB API."""
    if not settings.cpcb_api_key:
        logger.warning("No CPCB API key set — using fallback realistic data")
        return _generate_fallback_data(city)

    try:
        url = f"{settings.cpcb_api_base}/{settings.cpcb_resource_id}"
        params = {
            "api-key": settings.cpcb_api_key,
            "format": "json",
            "filters[city]": city,
            "limit": 100,
        }
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        records = data.get("records", [])
        logger.info(f"Fetched {len(records)} CPCB records for {city}")
        return records
    except Exception as e:
        logger.error(f"CPCB API error: {e} — using fallback")
        return _generate_fallback_data(city)


def _generate_fallback_data(city: str) -> list[dict]:
    """Generate realistic fallback data when API key is unavailable."""
    import random
    import math
    
    hour = datetime.now().hour
    # Morning rush / evening rush / night pattern
    base_aqi = 80 + 40 * math.sin((hour - 8) * math.pi / 12) + random.uniform(-20, 20)
    
    stations_data = _get_city_station_defaults(city)
    results = []
    for s in stations_data:
        local_aqi = base_aqi + s.get("local_modifier", 0) + random.uniform(-15, 15)
        local_aqi = max(30, min(450, local_aqi))
        pm25 = local_aqi * 0.55 + random.uniform(-5, 5)
        pm10 = local_aqi * 0.85 + random.uniform(-10, 10)
        results.append({
            "station": s["name"],
            "city": city,
            "latitude": s["lat"],
            "longitude": s["lon"],
            "pollutant_avg": round(pm25, 1),
            "pm10_avg": round(pm10, 1),
            "aqi": round(local_aqi, 1),
            "last_update": datetime.now(timezone.utc).isoformat(),
        })
    return results


def _get_city_station_defaults(city: str) -> list[dict]:
    """Return known CPCB station coordinates per city."""
    stations = {
        "Kolkata": [
            {"name": "Rabindra Bharati University", "lat": 22.5974, "lon": 88.3694, "local_modifier": 20},
            {"name": "Victoria Memorial", "lat": 22.5448, "lon": 88.3426, "local_modifier": 5},
            {"name": "Fort William", "lat": 22.5587, "lon": 88.3394, "local_modifier": -5},
            {"name": "Jadavpur", "lat": 22.4975, "lon": 88.3714, "local_modifier": 10},
            {"name": "Bidhannagar", "lat": 22.5834, "lon": 88.4323, "local_modifier": -10},
            {"name": "Howrah", "lat": 22.5958, "lon": 88.2636, "local_modifier": 35},
            {"name": "Ballygunge", "lat": 22.5266, "lon": 88.3670, "local_modifier": 15},
            {"name": "Barrackpore", "lat": 22.7620, "lon": 88.3806, "local_modifier": 25},
            {"name": "Durgapur", "lat": 23.5204, "lon": 87.3119, "local_modifier": 60},
            {"name": "Asansol", "lat": 23.6840, "lon": 86.9658, "local_modifier": 55},
        ],
        "Delhi": [
            {"name": "Anand Vihar", "lat": 28.6469, "lon": 77.3161, "local_modifier": 80},
            {"name": "ITO", "lat": 28.6289, "lon": 77.2409, "local_modifier": 60},
            {"name": "Punjabi Bagh", "lat": 28.6720, "lon": 77.1310, "local_modifier": 70},
            {"name": "RK Puram", "lat": 28.5633, "lon": 77.1734, "local_modifier": 50},
            {"name": "Dwarka", "lat": 28.5821, "lon": 77.0508, "local_modifier": 55},
            {"name": "Okhla", "lat": 28.5355, "lon": 77.2726, "local_modifier": 75},
            {"name": "Bawana", "lat": 28.7892, "lon": 77.0411, "local_modifier": 90},
            {"name": "Jahangirpuri", "lat": 28.7338, "lon": 77.1641, "local_modifier": 85},
        ],
        "Mumbai": [
            {"name": "Bandra Kurla", "lat": 19.0596, "lon": 72.8656, "local_modifier": 20},
            {"name": "Colaba", "lat": 18.9067, "lon": 72.8147, "local_modifier": -10},
            {"name": "Worli", "lat": 19.0176, "lon": 72.8183, "local_modifier": 15},
            {"name": "Sion", "lat": 19.0390, "lon": 72.8619, "local_modifier": 30},
            {"name": "Navi Mumbai", "lat": 19.0330, "lon": 73.0297, "local_modifier": 10},
            {"name": "Borivali", "lat": 19.2183, "lon": 72.8564, "local_modifier": -5},
        ],
    }
    return stations.get(city, [])


def upsert_readings(records: list[dict], station_map: dict, db: Session):
    """Insert new readings from fetched records."""
    now = datetime.now(timezone.utc)
    inserted = 0
    for rec in records:
        station_name = rec.get("station", rec.get("station_name", ""))
        # Find station by name fuzzy match
        station = None
        for code, st in station_map.items():
            if st.name.lower() in station_name.lower() or station_name.lower() in st.name.lower():
                station = st
                break
        if not station:
            continue

        # Parse AQI/pollutants
        try:
            pm25 = float(rec.get("pollutant_avg", rec.get("pm2_5", 0)) or 0)
            pm10 = float(rec.get("pm10_avg", rec.get("pm10", 0)) or 0)
        except (TypeError, ValueError):
            continue

        aqi, category = compute_aqi(pm25 if pm25 > 0 else None, pm10 if pm10 > 0 else None)
        # Use pre-computed AQI if available
        if "aqi" in rec and rec["aqi"]:
            try:
                aqi = float(rec["aqi"])
                category = _aqi_to_category(aqi)
            except (TypeError, ValueError):
                pass

        reading = Reading(
            station_id=station.id,
            measured_at=now,
            pm25=pm25 or None,
            pm10=pm10 or None,
            aqi=aqi,
            category=category,
        )
        db.add(reading)
        inserted += 1

    db.commit()
    logger.info(f"Inserted {inserted} new readings")
    return inserted


def _aqi_to_category(aqi: float) -> str:
    for lo, hi, cat in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return cat
    return "Severe"
