"""
AETHER test fixtures — in-memory SQLite database with seeded test data.
"""
from __future__ import annotations
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.database import Base, get_db
from app.main import app


TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def db_engine():
    """Create an in-memory SQLite engine for the test session."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db(db_engine):
    """Return a DB session that rolls back after each test."""
    SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = SessionFactory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="function")
def seeded_db(db):
    """DB session pre-seeded with minimal test data."""
    from app.models import Station, Ward, Reading, Weather

    station = Station(
        station_code="TEST-01",
        name="Test Station",
        lat=22.5,
        lon=88.35,
        city="Kolkata",
        active=True,
    )
    db.add(station)
    db.flush()

    ward = Ward(
        ward_no=1,
        name="Test Ward",
        city="Kolkata",
        lat=22.5,
        lon=88.35,
        population=50000,
        school_count=3,
        hospital_count=2,
        road_density=2.0,
        industrial_score=30.0,
        construction_count=5,
        elderly_percentage=12.0,
        child_percentage=18.0,
        low_income_percentage=25.0,
        svi_index=0.5,
    )
    db.add(ward)
    db.flush()

    reading = Reading(
        station_id=station.id,
        measured_at=datetime.now(timezone.utc),
        pm25=85.0,
        pm10=140.0,
        no2=45.0,
        so2=12.0,
        co=1.2,
        o3=38.0,
        aqi=185.0,
        category="Moderate",
    )
    db.add(reading)

    weather = Weather(
        city="Kolkata",
        recorded_at=datetime.now(timezone.utc),
        temp_c=28.0,
        humidity_pct=70.0,
        wind_speed=6.5,
        wind_dir=180.0,
    )
    db.add(weather)
    db.commit()

    return db


@pytest.fixture(scope="function")
def client(seeded_db):
    """FastAPI TestClient using the seeded in-memory database."""
    def override_get_db():
        yield seeded_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
