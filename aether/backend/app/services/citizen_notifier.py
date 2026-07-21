"""
AETHER — Citizen Alert Notification Engine
Dispatches hyperlocal SMS warnings when ward air quality crosses user-defined safety thresholds.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import CitizenAlertSubscription, Station, Ward
from app.services.attributor import get_current_aqi_for_ward
from app.services.notifier import send_sms_notification

logger = logging.getLogger(__name__)

# Map string notify_levels to CPCB breakpoints
NOTIFY_LEVEL_THRESHOLDS = {
    "good": 0.0,
    "satisfactory": 51.0,
    "moderate": 101.0,
    "poor": 201.0,
    "very_poor": 301.0,
    "severe": 401.0,
}


def aqi_to_category_lower(aqi: float) -> str:
    if aqi <= 50:
        return "good"
    if aqi <= 100:
        return "satisfactory"
    if aqi <= 200:
        return "moderate"
    if aqi <= 300:
        return "poor"
    if aqi <= 400:
        return "very poor"
    return "severe"


def evaluate_citizen_alerts(db: Session, city: str):
    """
    Checks active citizen subscriptions in a city against live ward-level AQI.
    Triggers Twilio SMS notifications when thresholds are breached.
    """
    logger.info(f"🔔 Running citizen alert evaluation for {city}...")

    subscriptions = (
        db.query(CitizenAlertSubscription)
        .filter(CitizenAlertSubscription.city == city)
        .all()
    )

    if not subscriptions:
        logger.info(f"No active citizen alert subscriptions for {city}.")
        return

    stations = db.query(Station).filter(Station.city == city, Station.active).all()

    for sub in subscriptions:
        ward = db.query(Ward).filter(Ward.id == sub.ward_id).first()
        if not ward:
            continue

        # Compute hyperlocal interpolated AQI for this ward
        ward_aqi = get_current_aqi_for_ward(ward, db, stations=stations)

        # Check threshold
        threshold = NOTIFY_LEVEL_THRESHOLDS.get(sub.notify_level.lower(), 201.0)

        if ward_aqi >= threshold:
            category = aqi_to_category_lower(ward_aqi).upper()
            message = (
                f"⚠️ AETHER Hyperlocal AQI Alert!\n"
                f"Ward: {ward.name}\n"
                f"Current AQI: {ward_aqi:.1f} ({category})\n"
                f"Recommendation: Health risk is elevated. Please stay indoors, close windows, and wear an N95 mask outside."
            )
            recipient = sub.phone_number or sub.email or "Simulated User"
            logger.info(
                f"🚨 Dispatched alert to {recipient} in {sub.language} for Ward {ward.name}"
            )

            # Send notification (SMS)
            if sub.phone_number:
                send_sms_notification(message, to_number=sub.phone_number)
