"""
AETHER — Citizen Alert Subscriptions Router
Allows residents to subscribe to ward-specific air quality alerts.
"""

from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CitizenAlertSubscription, Ward
from app.schemas import CitizenSubscriptionIn, CitizenSubscriptionOut

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/citizen/subscribe", response_model=CitizenSubscriptionOut)
def subscribe_citizen(payload: CitizenSubscriptionIn, db: Session = Depends(get_db)):
    """Create a new citizen alert subscription for a ward."""
    # Verify ward exists
    ward = db.query(Ward).filter(Ward.id == payload.ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    # Check if subscription already exists for this number/email and ward
    existing = (
        db.query(CitizenAlertSubscription)
        .filter(
            CitizenAlertSubscription.ward_id == payload.ward_id,
            (CitizenAlertSubscription.phone_number == payload.phone_number)
            if payload.phone_number
            else False,
            (CitizenAlertSubscription.email == payload.email)
            if payload.email
            else False,
        )
        .first()
    )

    if existing:
        # Update existing subscription properties
        existing.city = payload.city
        existing.language = payload.language
        existing.notify_level = payload.notify_level
        db.commit()
        db.refresh(existing)
        logger.info(f"Updated alert subscription ID {existing.id} for ward {ward.name}")
        return existing

    new_sub = CitizenAlertSubscription(
        city=payload.city,
        ward_id=payload.ward_id,
        phone_number=payload.phone_number,
        email=payload.email,
        language=payload.language,
        notify_level=payload.notify_level,
    )

    db.add(new_sub)
    try:
        db.commit()
        db.refresh(new_sub)
        logger.info(f"Created alert subscription ID {new_sub.id} for ward {ward.name}")
        return new_sub
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/citizen/subscriptions", response_model=List[CitizenSubscriptionOut])
def get_subscriptions(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Retrieve all alert subscriptions in a city."""
    return (
        db.query(CitizenAlertSubscription)
        .filter(CitizenAlertSubscription.city == city)
        .all()
    )
