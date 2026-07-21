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
    Get a calibrated Sentinel-5P tropospheric column density grid for the city bounds.
    """
    import time as _time

    cache_key = f"satellite_calibrated_{city}"
    cached = _SATELLITE_CACHE.get(cache_key)
    if cached and (_time.time() - cached["ts"]) < 3600:
        return cached["data"]

    from app.services.satellite import fetch_calibrated_satellite_grid

    result = fetch_calibrated_satellite_grid(city)
    _SATELLITE_CACHE[cache_key] = {"ts": _time.time(), "data": result}
    return result


# Module-level satellite data cache {city: {ts: float, data: dict}}
_SATELLITE_CACHE: dict = {}



