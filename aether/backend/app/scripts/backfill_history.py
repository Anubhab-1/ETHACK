"""
AETHER — Historical Data Backfill & XGBoost Training Script
Generates 30 days of hourly historical readings + weather data for all cities,
then trains the 24h, 48h, and 72h XGBoost models.
"""

from __future__ import annotations

import logging
import math
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal, create_tables
from app.models import Reading, Station, Weather
from app.services.forecaster import train_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger(__name__)


def backfill_city_history(city: str, days: int, db: Session):
    """Generate mock historical readings for all active stations in a city."""
    logger.info(f"Backfilling {days} days of historical logs for {city}...")

    stations = db.query(Station).filter(Station.city == city, Station.active).all()
    if not stations:
        logger.warning(f"No active stations found for {city}. Skipping.")
        return

    now = datetime.now(timezone.utc)
    start_time = now - timedelta(days=days)

    # Check if we already have history
    existing = db.query(Reading).filter(
        Reading.station_id == stations[0].id,
        Reading.measured_at >= start_time
    ).count()
    if existing >= days * 24:
        logger.info(f"Historical readings already present for {city} ({existing} count). Skipping backfill.")
        return

    # Generate weather history
    logger.info(f"Generating weather history for {city}...")
    weather_records = []
    current_time = start_time
    while current_time <= now:
        hour = current_time.hour
        month = current_time.month

        # Seasonality (Winter is colder, summer is hotter)
        temp_base = 18 if month in [11, 12, 1, 2] else 32
        temp = temp_base + 6 * math.sin((hour - 14) * math.pi / 12) + random.uniform(-2, 2)
        humidity = 60 - 20 * math.sin((hour - 14) * math.pi / 12) + random.uniform(-5, 5)
        wind_speed = max(1.0, 5 + 4 * math.sin((hour - 12) * math.pi / 12) + random.uniform(-2, 2))
        wind_dir = (180 + 90 * math.sin(current_time.day * math.pi / 15) + random.uniform(-20, 20)) % 360
        pressure = 1013 - 3 * math.sin((hour - 10) * math.pi / 12)

        w = Weather(
            city=city,
            recorded_at=current_time,
            temp_c=round(temp, 1),
            humidity_pct=round(min(100.0, max(0.0, humidity)), 1),
            wind_speed=round(wind_speed, 1),
            wind_dir=round(wind_dir, 1),
            pressure=round(pressure, 1),
            precipitation=0.0
        )
        weather_records.append(w)
        current_time += timedelta(hours=1)

    db.bulk_save_objects(weather_records)
    db.commit()

    # Generate station readings history
    logger.info(f"Generating station readings history for {len(stations)} stations...")
    readings = []

    for station in stations:
        current_time = start_time
        # Baseline AQI based on city defaults (Delhi is generally higher, Mumbai has coastal dispersion)
        base_aqi = 180 if city == "Delhi" else (100 if city == "Kolkata" else 75)

        while current_time <= now:
            hour = current_time.hour
            month = current_time.month
            day_of_week = current_time.weekday()

            # Rush hour and diurnal fluctuations
            rush_hour_modifier = 40 if (7 <= hour <= 10 or 17 <= hour <= 20) else 0
            weekend_modifier = -25 if day_of_week >= 5 else 0
            winter_modifier = 60 if month in [11, 12, 1, 2] else -20

            aqi = base_aqi + rush_hour_modifier + weekend_modifier + winter_modifier + random.uniform(-15, 15)
            aqi = max(15.0, min(480.0, aqi))

            pm25 = aqi * 0.45 + random.uniform(-5, 5)
            pm10 = aqi * 0.85 + random.uniform(-10, 10)

            # CPCB AQI Categories mapping
            if aqi <= 50:
                cat = "Good"
            elif aqi <= 100:
                cat = "Satisfactory"
            elif aqi <= 200:
                cat = "Moderate"
            elif aqi <= 300:
                cat = "Poor"
            elif aqi <= 400:
                cat = "Very Poor"
            else:
                cat = "Severe"

            r = Reading(
                station_id=station.id,
                measured_at=current_time,
                pm25=round(max(2.0, pm25), 1),
                pm10=round(max(5.0, pm10), 1),
                aqi=round(aqi, 1),
                category=cat
            )
            readings.append(r)
            current_time += timedelta(hours=1)

            # Bulk save in batches to avoid high memory usage
            if len(readings) >= 5000:
                db.bulk_save_objects(readings)
                db.commit()
                readings = []

    if readings:
        db.bulk_save_objects(readings)
        db.commit()
    logger.info(f"Finished generating logs for {city}.")


def main():
    db = SessionLocal()
    try:
        # Seed 30 days of data
        days = 30
        for city in ["Kolkata", "Delhi", "Mumbai"]:
            backfill_city_history(city, days, db)

        # Train XGBoost models for each city
        for city in ["Kolkata", "Delhi", "Mumbai"]:
            logger.info(f"Training XGBoost models for {city}...")
            res = train_model(city, db)
            logger.info(f"Results for {city}: {res}")

    except Exception as e:
        logger.error(f"Error in backfill script: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    create_tables()
    main()
