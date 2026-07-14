"""AETHER — Forecast endpoint."""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Ward
from app.services.attributor import get_current_aqi_for_ward
from app.services.forecaster import predict_aqi

router = APIRouter()


def find_nearest_ward(lat: float, lon: float, db: Session, city: str = "Kolkata") -> Ward | None:
    wards = db.query(Ward).filter(Ward.city == city).all()
    if not wards:
        return None
    nearest = min(wards, key=lambda w: math.sqrt((w.lat - lat) ** 2 + (w.lon - lon) ** 2))
    return nearest


@router.get("/forecast")
def get_forecast(
    lat: float = Query(22.5726, description="Latitude"),
    lon: float = Query(88.3639, description="Longitude"),
    hours: int = Query(72, ge=24, le=72),
    city: str = Query("Kolkata"),
    db: Session = Depends(get_db),
):
    """Get AQI forecast for a location (24h/48h/72h)."""
    ward = find_nearest_ward(lat, lon, db, city)
    if not ward:
        raise HTTPException(status_code=404, detail="No wards found for this city")

    current_aqi = get_current_aqi_for_ward(ward, db)
    forecasts = predict_aqi(ward, db)

    # Filter to requested horizon
    filtered = [f for f in forecasts if f["horizon_hours"] <= hours]

    return {
        "ward_id": ward.id,
        "ward_name": ward.name,
        "ward_no": ward.ward_no,
        "lat": lat,
        "lon": lon,
        "current_aqi": current_aqi,
        "forecasts": filtered,
    }


@router.post("/forecast/train")
def trigger_training(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Trigger XGBoost model training for a city."""
    from app.services.forecaster import train_model
    results = train_model(city, db)
    return {"city": city, "results": results}
