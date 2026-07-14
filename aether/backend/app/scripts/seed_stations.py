"""
AETHER — Seed all CPCB stations for Kolkata, Delhi, Mumbai.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import Station
from app.services.fetch_cpcb import _get_city_station_defaults

logger = logging.getLogger(__name__)

CITY_STATIONS = {
    "Kolkata": _get_city_station_defaults("Kolkata"),
    "Delhi": _get_city_station_defaults("Delhi"),
    "Mumbai": _get_city_station_defaults("Mumbai"),
}


def seed_all_stations(db: Session):
    """Seed all CPCB stations if not already present."""
    total = 0
    for city, stations in CITY_STATIONS.items():
        for i, s in enumerate(stations):
            code = f"{city[:3].upper()}-{i+1:03d}"
            existing = db.query(Station).filter(Station.station_code == code).first()
            if not existing:
                station = Station(
                    station_code=code,
                    name=s["name"],
                    lat=s["lat"],
                    lon=s["lon"],
                    city=city,
                    active=True,
                )
                db.add(station)
                total += 1

    db.commit()
    logger.info(f"Seeded {total} stations")
    return total


if __name__ == "__main__":
    from app.database import SessionLocal, create_tables
    create_tables()
    db = SessionLocal()
    seed_all_stations(db)
    db.close()
    print("✅ Stations seeded successfully")
