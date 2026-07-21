"""AETHER — Forecast endpoint."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from threading import Thread
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import Ward
from app.services.attributor import get_current_aqi_for_ward
from app.services.forecaster import predict_aqi

router = APIRouter()

_training_jobs: dict[str, dict] = {}


def find_nearest_ward(
    lat: float, lon: float, db: Session, city: str = "Kolkata"
) -> Ward | None:
    wards = db.query(Ward).filter(Ward.city == city).all()
    if not wards:
        return None
    nearest = min(
        wards, key=lambda w: math.sqrt((w.lat - lat) ** 2 + (w.lon - lon) ** 2)
    )
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
    """Queue XGBoost model training for a city and return a job id for polling."""
    job_id = str(uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    _training_jobs[job_id] = {
        "job_id": job_id,
        "city": city,
        "status": "queued",
        "message": "Training queued",
        "created_at": created_at,
        "updated_at": created_at,
        "results": None,
    }

    def run_training() -> None:
        from app.main import app

        is_test_session = get_db in app.dependency_overrides
        if is_test_session:
            session = next(app.dependency_overrides[get_db]())
        else:
            session = SessionLocal()
        try:
            job = _training_jobs[job_id]
            job["status"] = "running"
            job["message"] = "Training in progress"
            job["updated_at"] = datetime.now(timezone.utc).isoformat()

            from app.services.forecaster import train_model

            results = train_model(city, session)
            job["status"] = "completed"
            job["message"] = "Training completed"
            job["results"] = results
            job["updated_at"] = datetime.now(timezone.utc).isoformat()
        except Exception as exc:  # pragma: no cover - defensive path
            job = _training_jobs[job_id]
            job["status"] = "failed"
            job["message"] = str(exc)
            job["updated_at"] = datetime.now(timezone.utc).isoformat()
        finally:
            if not is_test_session:
                session.close()

    Thread(target=run_training, daemon=True).start()
    return {
        "city": city,
        "job_id": job_id,
        "status": "queued",
        "message": "Training queued",
        "created_at": created_at,
    }


@router.get("/forecast/train/{job_id}")
def get_training_job(job_id: str):
    """Return the current state of a training job."""
    job = _training_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job
