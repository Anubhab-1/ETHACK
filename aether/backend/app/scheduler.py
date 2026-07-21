"""
AETHER — Background Scheduler
Uses APScheduler to periodically refresh live air quality (WAQI) and weather (Open-Meteo) data.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.cli.train_forecasts import run_training
from app.database import SessionLocal
from app.scripts.refresh_data import refresh_all

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()


def scheduled_refresh_job():
    """Trigger periodic database data refresh."""
    logger.info(
        "⏰ Background job: Starting periodic data refresh (WAQI + Open-Meteo)..."
    )
    db = SessionLocal()
    try:
        refresh_all(db)
        logger.info("⏰ Background job: Periodic data refresh completed successfully.")
    except Exception as e:
        logger.error(f"⏰ Background job failed: {e}")
    finally:
        db.close()


def scheduled_train_job():
    """Trigger periodic retraining of XGBoost forecast models."""
    logger.info("⏰ Background job: Starting daily forecast model training...")
    try:
        # Default cities to retrain
        cities = ["Kolkata", "Delhi", "Mumbai"]
        run_training(cities)
        logger.info("⏰ Background job: Forecast model training completed.")
    except Exception as e:
        logger.error(f"⏰ Forecast training job failed: {e}")


def start_scheduler():
    """Start the background scheduler."""
    if not scheduler.running:
        # Run every 30 minutes to capture hourly updates with low latency
        scheduler.add_job(
            scheduled_refresh_job, "interval", minutes=30, id="data_refresh_job"
        )
        # Daily model training at 02:00 local time (non-critical)
        scheduler.add_job(
            scheduled_train_job, "cron", hour=2, minute=0, id="daily_train_models"
        )
        scheduler.start()
        logger.info(
            "⏰ Background scheduler initialized and started (interval: 30 minutes)."
        )


def shutdown_scheduler():
    """Gracefully shutdown the background scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("⏰ Background scheduler shut down.")
