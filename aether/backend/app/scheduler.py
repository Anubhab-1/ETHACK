"""
AETHER — Background Scheduler
Uses APScheduler to periodically refresh live air quality (WAQI) and weather (Open-Meteo) data.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.scripts.refresh_data import refresh_all

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def scheduled_refresh_job():
    """Trigger periodic database data refresh."""
    logger.info("⏰ Background job: Starting periodic data refresh (WAQI + Open-Meteo)...")
    db = SessionLocal()
    try:
        refresh_all(db)
        logger.info("⏰ Background job: Periodic data refresh completed successfully.")
    except Exception as e:
        logger.error(f"⏰ Background job failed: {e}")
    finally:
        db.close()

def start_scheduler():
    """Start the background scheduler."""
    if not scheduler.running:
        # Run every 30 minutes to capture hourly updates with low latency
        scheduler.add_job(scheduled_refresh_job, "interval", minutes=30, id="data_refresh_job")
        scheduler.start()
        logger.info("⏰ Background scheduler initialized and started (interval: 30 minutes).")

def shutdown_scheduler():
    """Gracefully shutdown the background scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("⏰ Background scheduler shut down.")
