"""
AETHER — CLI to train XGBoost forecast models
Usage: python -m app.cli.train_forecasts --city Kolkata
Or: call `scheduled_train_job()` from the scheduler for automated runs.
"""
from __future__ import annotations

import argparse
import logging
from typing import Sequence

from app.database import SessionLocal
from app.services.forecaster import train_model

logger = logging.getLogger(__name__)


def run_training(cities: Sequence[str]):
    db = SessionLocal()
    try:
        results = {}
        for city in cities:
            logger.info(f"Training models for {city}...")
            res = train_model(city, db)
            results[city] = res
            logger.info(f"Training result for {city}: {res}")
        return results
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Train XGBoost forecast models for cities")
    parser.add_argument("--city", "-c", nargs="*", help="City or cities to train (default: Kolkata Delhi Mumbai)")
    args = parser.parse_args()

    cities = args.city if args.city else ["Kolkata", "Delhi", "Mumbai"]
    run_training(cities)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
    main()
