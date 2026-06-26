from __future__ import annotations
"""AETHER — Health check endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import HealthResponse
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return HealthResponse(
        status="ok",
        version="1.0.0",
        city=settings.default_city,
        db_connected=db_ok,
    )


@router.get("/cities")
def list_cities(db: Session = Depends(get_db)):
    from app.models import Station
    from sqlalchemy import func
    
    cities_data = [
        {"id": "kolkata", "name": "Kolkata", "lat": 22.5726, "lon": 88.3639},
        {"id": "delhi", "name": "Delhi", "lat": 28.6139, "lon": 77.2090},
        {"id": "mumbai", "name": "Mumbai", "lat": 19.0760, "lon": 72.8777},
    ]
    
    result = []
    for city in cities_data:
        count = db.query(Station).filter(Station.city == city["name"], Station.active == True).count()
        result.append({**city, "station_count": count})
    
    return result


@router.get("/weather/current")
def get_current_weather(city: str = "Kolkata", db: Session = Depends(get_db)):
    from app.models import Weather
    from sqlalchemy import desc
    row = db.query(Weather).filter(Weather.city == city).order_by(desc(Weather.recorded_at)).first()
    if not row:
        return {"city": city, "temp_c": 28.0, "humidity_pct": 70.0, "wind_speed": 6.5, "wind_dir": 180.0}
    return {
        "city": city,
        "temp_c": row.temp_c,
        "humidity_pct": row.humidity_pct,
        "wind_speed": row.wind_speed,
        "wind_dir": row.wind_dir,
        "pressure": row.pressure,
    }

