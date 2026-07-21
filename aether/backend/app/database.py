from __future__ import annotations

import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_is_postgres = "postgresql" in settings.database_url
_is_sqlite = "sqlite" in settings.database_url

# Build engine kwargs based on DB type
_engine_kwargs: dict = {"echo": settings.sql_echo}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
if _is_postgres:
    # pool_pre_ping validates connections before use — prevents "connection closed" errors
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20

engine = create_engine(settings.database_url, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _run_migrations():
    """Add columns dynamically if they do not exist."""
    from sqlalchemy import inspect, text
    try:
        inspector = inspect(engine)
        table_names = inspector.get_table_names()
        with engine.begin() as conn:
            if "stations" in table_names:
                columns = [col["name"] for col in inspector.get_columns("stations")]
                if "last_calibrated_at" not in columns:
                    conn.execute(text("ALTER TABLE stations ADD COLUMN last_calibrated_at DATETIME"))
                    logger.info("Database Migration: Added 'last_calibrated_at' column to 'stations' table.")
                if "last_maintenance_at" not in columns:
                    conn.execute(text("ALTER TABLE stations ADD COLUMN last_maintenance_at DATETIME"))
                    logger.info("Database Migration: Added 'last_maintenance_at' column to 'stations' table.")
            
            if "citizen_reports" in table_names:
                columns = [col["name"] for col in inspector.get_columns("citizen_reports")]
                if "photo_url" not in columns:
                    conn.execute(text("ALTER TABLE citizen_reports ADD COLUMN photo_url TEXT"))
                    logger.info("Database Migration: Added 'photo_url' column to 'citizen_reports' table.")

            if "enforcement_queue" in table_names:
                columns = [col["name"] for col in inspector.get_columns("enforcement_queue")]
                if "evidence_notes" not in columns:
                    conn.execute(text("ALTER TABLE enforcement_queue ADD COLUMN evidence_notes TEXT"))
                    logger.info("Database Migration: Added 'evidence_notes' column to 'enforcement_queue' table.")
                if "evidence_photo_url" not in columns:
                    conn.execute(text("ALTER TABLE enforcement_queue ADD COLUMN evidence_photo_url TEXT"))
                    logger.info("Database Migration: Added 'evidence_photo_url' column to 'enforcement_queue' table.")
                if "evidence_severity" not in columns:
                    conn.execute(text("ALTER TABLE enforcement_queue ADD COLUMN evidence_severity VARCHAR(20)"))
                    logger.info("Database Migration: Added 'evidence_severity' column to 'enforcement_queue' table.")
    except Exception as e:
        logger.warning(f"Dynamic database migration skipped or failed: {e}")


def create_tables():
    """Create all tables in the database. Enable extensions and hypertables if PostgreSQL."""
    from sqlalchemy import text

    from app import models  # noqa: F401

    # Run migration checks
    _run_migrations()

    Base.metadata.create_all(bind=engine)

    if _is_postgres:
        with engine.connect() as conn:
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis CASCADE;"))
                conn.commit()
            except Exception as e:
                logger.warning("Non-critical: postgis extension unavailable: %s", e)
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
                conn.commit()
            except Exception as e:
                logger.warning("Non-critical: timescaledb extension unavailable: %s", e)

    Base.metadata.create_all(bind=engine)

    if _is_postgres:
        with engine.connect() as conn:
            try:
                conn.execute(text("SELECT create_hypertable('readings', 'measured_at', if_not_exists => TRUE);"))
                conn.execute(text("ALTER TABLE readings SET (timescaledb.compress, timescaledb.compress_segmentby = 'station_id');"))
                conn.execute(text("SELECT add_compression_policy('readings', INTERVAL '7 days', if_not_exists => TRUE);"))
                conn.execute(text("SELECT add_retention_policy('readings', INTERVAL '90 days', if_not_exists => TRUE);"))
                conn.commit()
                logger.info("TimescaleDB hypertables, compression, and retention policy configured.")
            except Exception as e:
                logger.warning("Non-critical: TimescaleDB hypertable setup failed: %s", e)

