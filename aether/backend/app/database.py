from __future__ import annotations
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=settings.sql_echo,
)

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
    
    if is_postgres:
        with engine.connect() as conn:
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis CASCADE;"))
                conn.commit()
            except Exception as e:
                print(f"Non-critical error enabling postgis extension: {e}")
                
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
                conn.commit()
            except Exception as e:
                print(f"Non-critical error enabling timescaledb extension: {e}")

    Base.metadata.create_all(bind=engine)
    
    if is_postgres:
        with engine.connect() as conn:
            try:
                # Convert readings to hypertable
                conn.execute(text("SELECT create_hypertable('readings', 'measured_at', if_not_exists => TRUE);"))
                # Enable compression on readings older than 7 days
                conn.execute(text("ALTER TABLE readings SET (timescaledb.compress, timescaledb.compress_segmentby = 'station_id');"))
                conn.execute(text("SELECT add_compression_policy('readings', INTERVAL '7 days', if_not_exists => TRUE);"))
                # Enable retention policy to drop data older than 90 days
                conn.execute(text("SELECT add_retention_policy('readings', INTERVAL '90 days', if_not_exists => TRUE);"))
                conn.commit()
                print("TimescaleDB hypertables, compression (7 days), and retention (90 days) successfully configured.")
            except Exception as e:
                print(f"Non-critical error setting up TimescaleDB hypertables: {e}")

