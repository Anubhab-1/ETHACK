"""AETHER — Data refresh script (called on startup and by scheduler)."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import Station

logger = logging.getLogger(__name__)

# Module-level status registry — read by the health endpoint
LAST_REFRESH_STATUS: dict[str, dict] = {}


def refresh_all(db: Session):
    """
    Fetch latest AQI + weather data for all cities.
    Primary source: WAQI (real CPCB data via aqicn.org).
    Fallback: legacy data.gov.in CPCB fetcher (requires CPCB_API_KEY).
    """
    from app.services.fetch_waqi import fetch_and_store_waqi
    from app.services.fetch_weather import fetch_weather, upsert_weather

    cities = ["Kolkata", "Delhi", "Mumbai"]

    for city in cities:
        try:
            # ── Primary: WAQI real AQI data ────────────────────────────────
            waqi_result = fetch_and_store_waqi(city, db)
            LAST_REFRESH_STATUS[city] = waqi_result

            if waqi_result["status"] != "ok":
                # WAQI failed (likely no token) — fall back to legacy CPCB fetcher
                logger.warning(
                    f"WAQI unavailable for {city} ({waqi_result.get('reason')}). "
                    "Falling back to legacy CPCB fetcher."
                )
                from app.services.fetch_cpcb import fetch_live_cpcb, upsert_readings
                stations = db.query(Station).filter(Station.city == city, Station.active).all()
                station_map = {s.station_code: s for s in stations}
                if station_map:
                    records = fetch_live_cpcb(city=city, db=db)
                    upsert_readings(records, station_map, db)

            # ── Verification: OpenAQ/Municipal verification baseline ───────
            try:
                from app.services.fetch_verification import fetch_and_store_verification
                fetch_and_store_verification(city, db)
            except Exception as ev:
                logger.error(f"Failed to ingest verification baseline for {city}: {ev}")

            # ── Weather: Open-Meteo (no key, always real) ──────────────────
            weather_records = fetch_weather(city=city, db=db)
            upsert_weather(weather_records, city, db)

            # ── Enforcement: automated spike detection ─────────────────────
            from app.services.enforcement_scorer import detect_spikes_and_auto_escalate
            anomalies = detect_spikes_and_auto_escalate(db, city)
            if anomalies > 0:
                logger.info(f"🚨 Spike detection: {anomalies} enforcement actions created for {city}")

            # ── Citizen Alerts: evaluate subscription thresholds ───────────
            try:
                from app.services.citizen_notifier import evaluate_citizen_alerts
                evaluate_citizen_alerts(db, city)
            except Exception as ec:
                logger.error(f"Failed to evaluate citizen alerts for {city}: {ec}")

            logger.info(f"✅ Refreshed data for {city} (WAQI: {waqi_result['status']})")

        except Exception as e:
            logger.error(f"Error refreshing {city}: {e}")
            LAST_REFRESH_STATUS[city] = {"status": "error", "reason": str(e)}


if __name__ == "__main__":
    from app.database import SessionLocal, create_tables
    create_tables()
    db = SessionLocal()
    refresh_all(db)
    db.close()
    print("✅ Data refresh complete")
