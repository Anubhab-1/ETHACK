from __future__ import annotations
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
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


def create_tables():
    """Create all tables in the database. Enable extensions and hypertables if PostgreSQL."""
    from app import models  # noqa: F401
    from sqlalchemy import text
    
    is_postgres = "postgresql" in str(engine.url)
    
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

