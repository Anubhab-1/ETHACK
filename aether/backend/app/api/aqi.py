from __future__ import annotations
"""AETHER — AQI data endpoints."""
import math
from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Station, Reading, Ward
from app.schemas import LiveAQIPoint, HeatmapPoint, WardOut, WardDetail
from app.services.attributor import get_current_aqi_for_ward, run_attribution_for_ward

router = APIRouter()

AQI_CATEGORIES = [(0, 50, "Good"), (51, 100, "Satisfactory"), (101, 200, "Moderate"),
                   (201, 300, "Poor"), (301, 400, "Very Poor"), (401, 500, "Severe")]


def aqi_to_category(aqi: float | None) -> str:
    if aqi is None:
        return "Unknown"
    for lo, hi, cat in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return cat
    return "Severe"


def idw_interpolate(target_lat: float, target_lon: float, points: list[tuple]) -> float:
    """Inverse distance weighted interpolation from nearby station readings."""
    if not points:
        return 150.0
    total_w, total_v = 0, 0
    for lat, lon, value in points:
        dist = math.sqrt((lat - target_lat) ** 2 + (lon - target_lon) ** 2)
        w = 1 / max(dist, 0.001)
        total_w += w
        total_v += w * value
    return round(total_v / total_w, 1)


@router.get("/aqi/live")
def get_live_aqi(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Get latest AQI reading per station."""
    stations = db.query(Station).filter(Station.city == city, Station.active == True).all()
    result = []
    for st in stations:
        reading = db.query(Reading).filter(
            Reading.station_id == st.id
        ).order_by(Reading.measured_at.desc()).first()

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
    """Get interpolated AQI for each ward center."""
    wards = db.query(Ward).filter(Ward.city == city).all()
    stations = db.query(Station).filter(Station.city == city, Station.active == True).all()

    # Build station-AQI point list
    station_points = []
    for st in stations:
        r = db.query(Reading).filter(Reading.station_id == st.id).order_by(
            Reading.measured_at.desc()
        ).first()
        if r and r.aqi:
            station_points.append((st.lat, st.lon, r.aqi))

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
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Ward not found")

    aqi = get_current_aqi_for_ward(ward, db)

    # Get latest attribution
    from app.models import Attribution
    attr = db.query(Attribution).filter(
        Attribution.ward_id == ward_id
    ).order_by(Attribution.computed_at.desc()).first()

    attribution_data = None
    primary_source = None
    if attr:
        attribution_data = {
            "traffic": attr.traffic_pct,
            "industrial": attr.industrial_pct,
            "construction": attr.construction_pct,
            "biomass": attr.biomass_pct,
            "residential": attr.residential_pct,
        }
        primary_source = attr.primary_source

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
        primary_source=primary_source,
        attribution=attribution_data,
        geojson=ward.geojson,
    )
