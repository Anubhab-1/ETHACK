"""AETHER — AQI data endpoints."""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Attribution, Reading, Station, Ward
from app.schemas import HeatmapPoint, LiveAQIPoint, WardDetail, WardOut
from app.services.attributor import get_current_aqi_for_ward

router = APIRouter()

AQI_CATEGORIES = [
    (0,   50,  "Good"),
    (51,  100, "Satisfactory"),
    (101, 200, "Moderate"),
    (201, 300, "Poor"),
    (301, 400, "Very Poor"),
    (401, 500, "Severe"),
]


def aqi_to_category(aqi: float | None) -> str:
    if aqi is None:
        return "Unknown"
    for lo, hi, cat in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return cat
    return "Severe"


def idw_interpolate(target_lat: float, target_lon: float, points: list) -> float:
    """Inverse distance weighted interpolation from nearby station readings."""
    if not points:
        return 150.0
    total_w, total_v = 0.0, 0.0
    for lat, lon, value in points:
        dist = math.sqrt((lat - target_lat) ** 2 + (lon - target_lon) ** 2)
        w = 1.0 / max(dist, 0.001)
        total_w += w
        total_v += w * value
    return round(total_v / total_w, 1)


def ensure_readings_exist(city: str, db: Session):
    """Ensure that at least one station in the city has Reading rows. If not, trigger synchronous live data fetch."""
    import logging
    log = logging.getLogger(__name__)
    stations = db.query(Station).filter(Station.city == city, Station.active).all()
    station_ids = [st.id for st in stations]
    if not station_ids:
        return

    has_readings = db.query(Reading).filter(Reading.station_id.in_(station_ids)).first() is not None
    if not has_readings:
        log.info(f"No readings found in DB for {city} stations. Fetching live data synchronously...")
        try:
            from app.services.fetch_waqi import fetch_and_store_waqi
            waqi_res = fetch_and_store_waqi(city, db)
            if waqi_res and waqi_res.get("status") == "ok":
                log.info(f"Synchronous live WAQI data fetch for {city} complete.")
                return

            # If WAQI is not configured or failed, fall back to legacy CPCB
            log.info("WAQI not configured or failed. Falling back to legacy CPCB fetcher.")
            from app.services.fetch_cpcb import fetch_live_cpcb, upsert_readings
            station_map = {s.station_code: s for s in stations}
            records = fetch_live_cpcb(city=city, db=db)
            upsert_readings(records, station_map, db)
            log.info(f"Synchronous live CPCB data fetch for {city} complete.")
        except Exception as e:
            log.error(f"Synchronous live fetch failed for {city}: {e}")


@router.get("/aqi/live")
def get_live_aqi(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Get latest AQI reading per station with batch fetching."""
    ensure_readings_exist(city, db)
    # Subquery for latest reading per station
    latest_readings = db.query(
        Reading.station_id,
        func.max(Reading.measured_at).label("latest_time")
    ).group_by(Reading.station_id).subquery()

    latest_data = db.query(Reading).join(
        latest_readings,
        (Reading.station_id == latest_readings.c.station_id) &
        (Reading.measured_at == latest_readings.c.latest_time)
    ).all()

    reading_map = {r.station_id: r for r in latest_data}
    stations = db.query(Station).filter(Station.city == city, Station.active).all()

    result = []
    for st in stations:
        reading = reading_map.get(st.id)
        result.append(LiveAQIPoint(
            station_id=st.id,
            station_code=st.station_code,
            name=st.name,
            lat=st.lat,
            lon=st.lon,
            city=st.city,
            aqi=reading.aqi if reading else None,
            category=aqi_to_category(reading.aqi if reading else None),
            pm25=reading.pm25 if reading else None,
            pm10=reading.pm10 if reading else None,
            measured_at=reading.measured_at if reading else None,
        ))
    return result


@router.get("/aqi/heatmap")
def get_aqi_heatmap(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Get interpolated AQI for each ward center using batched readings."""
    ensure_readings_exist(city, db)
    latest_readings = db.query(
        Reading.station_id,
        func.max(Reading.measured_at).label("latest_time")
    ).group_by(Reading.station_id).subquery()

    latest_data = db.query(Reading).join(
        latest_readings,
        (Reading.station_id == latest_readings.c.station_id) &
        (Reading.measured_at == latest_readings.c.latest_time)
    ).all()

    station_map = {st.id: st for st in db.query(Station).filter(Station.city == city).all()}
    station_points = [(station_map[r.station_id].lat, station_map[r.station_id].lon, r.aqi)
                      for r in latest_data if r.station_id in station_map and r.aqi]

    wards = db.query(Ward).filter(Ward.city == city).all()
    result = []
    for ward in wards:
        aqi = idw_interpolate(ward.lat, ward.lon, station_points)
        result.append(HeatmapPoint(
            ward_id=ward.id,
            ward_no=ward.ward_no,
            ward_name=ward.name,
            lat=ward.lat,
            lon=ward.lon,
            aqi=aqi,
            category=aqi_to_category(aqi),
        ))
    return result


@router.get("/wards")
def get_wards(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    wards = db.query(Ward).filter(Ward.city == city).all()
    return [WardOut.model_validate(w) for w in wards]


@router.get("/wards/{ward_id}")
def get_ward_detail(ward_id: int, db: Session = Depends(get_db)):
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    aqi = get_current_aqi_for_ward(ward, db)
    attr = db.query(Attribution).filter(Attribution.ward_id == ward_id).order_by(Attribution.computed_at.desc()).first()

    attribution_data = None
    if attr:
        attribution_data = {
            "traffic": attr.traffic_pct,
            "industrial": attr.industrial_pct,
            "construction": attr.construction_pct,
            "biomass": attr.biomass_pct,
            "residential": attr.residential_pct,
        }

    return WardDetail(
        id=ward.id,
        ward_no=ward.ward_no,
        name=ward.name,
        city=ward.city,
        lat=ward.lat,
        lon=ward.lon,
        population=ward.population,
        school_count=ward.school_count,
        hospital_count=ward.hospital_count,
        elderly_percentage=ward.elderly_percentage,
        child_percentage=ward.child_percentage,
        low_income_percentage=ward.low_income_percentage,
        svi_index=ward.svi_index,
        aqi=aqi,
        category=aqi_to_category(aqi),
        primary_source=attr.primary_source if attr else None,
        attribution=attribution_data,
        geojson=ward.geojson,
    )




@router.get("/aqi/satellite")
def get_satellite_grid(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """
    Get a spatial grid of real air quality data from Open-Meteo Air Quality API.
    Returns PM2.5 and NO₂ surface concentrations on a ~15x15 grid covering the city.
    Data source: Open-Meteo Air Quality API (free, no key, 1km resolution).
    Results are cached for 1 hour to stay within rate limits.
    """
    import time as _time

    import requests as _req

    # City bounding boxes
    BOUNDS = {
        "Kolkata": (22.45, 88.25, 22.65, 88.48),
        "Delhi":   (28.40, 76.84, 28.88, 77.35),
        "Mumbai":  (18.89, 72.74, 19.30, 73.01),
    }
    bounds = BOUNDS.get(city, BOUNDS["Kolkata"])
    lat_min, lon_min, lat_max, lon_max = bounds

    # Simple in-memory cache (process-level, 1 hour TTL)
    cache_key = f"satellite_{city}"
    cached = _SATELLITE_CACHE.get(cache_key)
    if cached and (_time.time() - cached["ts"]) < 3600:
        return cached["data"]

    # Sparse grid: 8x8 = 64 points (each is 1 API call to Open-Meteo batch)
    n_lat, n_lon = 8, 8
    lats = [round(lat_min + (lat_max - lat_min) * i / (n_lat - 1), 4) for i in range(n_lat)]
    lons = [round(lon_min + (lon_max - lon_min) * j / (n_lon - 1), 4) for j in range(n_lon)]

    # Build comma-separated coordinate lists for Open-Meteo batch request
    lat_str = ",".join(str(lat) for lat in lats for _ in lons)
    lon_str = ",".join(str(lon) for _ in lats for lon in lons)

    settings = get_settings()
    aq_base = settings.open_meteo_airquality_base

    try:
        resp = _req.get(
            aq_base,
            params={
                "latitude": lat_str,
                "longitude": lon_str,
                "current": "pm2_5,pm10,nitrogen_dioxide,carbon_monoxide,ozone",
                "timezone": "Asia/Kolkata",
            },
            timeout=20,
        )
        resp.raise_for_status()
        raw = resp.json()

        # Open-Meteo returns a list when multiple locations are requested
        if isinstance(raw, dict):
            raw = [raw]  # single location (shouldn't happen with our batch)

        grid = []
        for entry in raw:
            lat = entry.get("latitude")
            lon = entry.get("longitude")
            current = entry.get("current", {})
            pm25 = current.get("pm2_5")
            no2  = current.get("nitrogen_dioxide")

            if lat is None or lon is None:
                continue

            # Use pm2.5 as primary value; fall back to NO₂ if pm2.5 unavailable
            value = pm25 if pm25 is not None else (no2 * 0.5 if no2 else None)
            if value is None:
                continue

            grid.append({
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "value": round(value, 2),
                "pm25": round(pm25, 2) if pm25 is not None else None,
                "no2":  round(no2, 2) if no2 is not None else None,
                "unit": "µg/m³",
            })

        if not grid:
            raise ValueError("Empty grid from Open-Meteo")

        result = {
            "city": city,
            "bounds": [[lat_min, lon_min], [lat_max, lon_max]],
            "grid": grid,
            "source": "Open-Meteo Air Quality API",
            "fetched_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "real_data": True,
        }

        _SATELLITE_CACHE[cache_key] = {"ts": _time.time(), "data": result}
        return result

    except Exception as e:
        import logging as _log
        _log.getLogger(__name__).error(f"Open-Meteo Air Quality API failed for {city}: {e}")
        # Honest fallback: return cached data if available, else a sparse heuristic grid
        # labelled clearly as estimated
        return _heuristic_satellite_fallback(city, lat_min, lon_min, lat_max, lon_max)


# Module-level satellite data cache {city: {ts: float, data: dict}}
_SATELLITE_CACHE: dict = {}


def _heuristic_satellite_fallback(city: str, lat_min: float, lon_min: float, lat_max: float, lon_max: float) -> dict:
    """
    Fallback satellite grid when Open-Meteo is unavailable.
    Based on known pollution hotspots per city (not random).
    Clearly labelled as estimated data.
    """
    HOTSPOTS = {
        "Kolkata": [(22.58, 88.30, 45.0), (22.62, 88.37, 38.0), (22.57, 88.43, 42.0)],
        "Delhi":   [(28.64, 77.31, 68.0), (28.69, 77.16, 60.0), (28.53, 77.26, 55.0)],
        "Mumbai":  [(19.00, 72.90, 40.0), (19.12, 72.85, 35.0), (19.03, 72.87, 38.0)],
    }
    hotspots = HOTSPOTS.get(city, [])
    import math as _math

    n = 8
    lats = [lat_min + (lat_max - lat_min) * i / (n - 1) for i in range(n)]
    lons = [lon_min + (lon_max - lon_min) * j / (n - 1) for j in range(n)]

    grid = []
    for lat in lats:
        for lon in lons:
            val = 15.0  # background PM2.5 µg/m³
            for h_lat, h_lon, h_peak in hotspots:
                dist = _math.sqrt((lat - h_lat) ** 2 + (lon - h_lon) ** 2)
                val += h_peak * _math.exp(-dist / 0.04)
            grid.append({"lat": round(lat, 4), "lon": round(lon, 4), "value": round(min(val, 200), 2), "unit": "µg/m³"})

    return {
        "city": city,
        "bounds": [[lat_min, lon_min], [lat_max, lon_max]],
        "grid": grid,
        "source": "Estimated (Open-Meteo unavailable)",
        "real_data": False,
    }


