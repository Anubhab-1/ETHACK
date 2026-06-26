from __future__ import annotations
"""AETHER — Data refresh script (called on startup and by scheduler)."""
import logging
from sqlalchemy.orm import Session
from app.models import Station

logger = logging.getLogger(__name__)


def refresh_all(db: Session):
    """Fetch latest AQI + weather data for all cities."""
    from app.services.fetch_cpcb import fetch_live_cpcb, upsert_readings
    from app.services.fetch_weather import fetch_weather, upsert_weather

    cities = ["Kolkata", "Delhi", "Mumbai"]

    for city in cities:
        try:
            # Build station map for this city
            stations = db.query(Station).filter(Station.city == city, Station.active == True).all()
            station_map = {s.station_code: s for s in stations}

            if not station_map:
                logger.warning(f"No stations found for {city}, skipping")
                continue

            # Fetch and insert AQI data
            records = fetch_live_cpcb(city=city, db=db)
            upsert_readings(records, station_map, db)

            # Fetch and insert weather data
            weather_records = fetch_weather(city=city, db=db)
            upsert_weather(weather_records, city, db)

            logger.info(f"✅ Refreshed data for {city}")
        except Exception as e:
            logger.error(f"Error refreshing {city}: {e}")


if __name__ == "__main__":
    from app.database import SessionLocal, create_tables
    create_tables()
    db = SessionLocal()
    refresh_all(db)
    db.close()
    print("✅ Data refresh complete")
