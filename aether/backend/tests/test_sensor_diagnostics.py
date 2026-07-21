"""
Unit and integration tests for sensor diagnostics, drift detection, and self-healing endpoints.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.models import Reading, Station, VerificationReading


def test_diagnostics_baseline(client, db):
    """Test standard diagnostics output for active stations."""
    # Seed a station
    station = Station(
        station_code="DIAG-01",
        name="Diagnostic Station 1",
        lat=22.56,
        lon=88.36,
        city="Kolkata",
        active=True
    )
    db.add(station)
    db.commit()

    # Seed fresh reading (1 hour ago)
    now = datetime.utcnow()
    reading = Reading(
        station_id=station.id,
        measured_at=now - timedelta(hours=1),
        pm25=50.0,
        pm10=90.0,
        aqi=100.0,
        category="Satisfactory"
    )
    db.add(reading)

    # Seed matching verification reading (1 hour ago)
    v_reading = VerificationReading(
        station_id=station.id,
        measured_at=(now - timedelta(hours=1)).replace(minute=0, second=0, microsecond=0),
        source_name="Verification IoT Feed",
        pm25=48.0,
        pm10=88.0,
        aqi=98.0
    )
    db.add(v_reading)
    db.commit()

    # Query diagnostics endpoint
    resp = client.get("/api/aqi/diagnostics?city=Kolkata")
    assert resp.status_code == 200
    data = resp.json()
    assert data["city"] == "Kolkata"
    assert len(data["alerts"]) >= 1

    alert = [a for a in data["alerts"] if a["station_code"] == "DIAG-01"][0]
    assert alert["status"] == "OK"
    assert alert["data_quality_score"] == 100.0
    assert "Passed" in alert["diagnostics"]["drift_test"]


def test_diagnostics_drift_detection(client, db):
    """Test that a systematic bias between primary and verification sensors triggers drift warning."""
    station = Station(
        station_code="DRIFT-01",
        name="Drifting Station",
        lat=22.57,
        lon=88.37,
        city="Kolkata",
        active=True
    )
    db.add(station)
    db.commit()

    now = datetime.utcnow()
    # Create 6 readings over past 6 hours where CPCB is consistently ~35 AQI units higher than verification
    for i in range(6):
        time_point = now - timedelta(hours=i)
        
        # Primary reading (Drifted High)
        reading = Reading(
            station_id=station.id,
            measured_at=time_point,
            pm25=80.0,
            pm10=150.0,
            aqi=180.0 + (i * 2.0),
            category="Moderate"
        )
        # Verification reading (Accurate Baseline)
        v_reading = VerificationReading(
            station_id=station.id,
            measured_at=time_point.replace(minute=0, second=0, microsecond=0),
            source_name="Verification IoT Feed",
            pm25=50.0,
            pm10=90.0,
            aqi=145.0 + (i * 2.0)
        )
        db.add(reading)
        db.add(v_reading)
    db.commit()

    # Query diagnostics
    resp = client.get("/api/aqi/diagnostics?city=Kolkata")
    assert resp.status_code == 200
    data = resp.json()
    
    alert = [a for a in data["alerts"] if a["station_code"] == "DRIFT-01"][0]
    assert alert["status"] == "Warning"
    assert "drift" in alert["issue"].lower()
    # Deducts 30 points for drift failure, yielding quality score of 70
    assert alert["data_quality_score"] == 70.0
    assert "Failed" in alert["diagnostics"]["drift_test"]


def test_diagnostics_self_healing_recalibration(client, db):
    """Test that calling recalibrate POST endpoint sets last_calibrated_at and overrides drift warnings."""
    station = Station(
        station_code="RECAL-01",
        name="Recalibrating Station",
        lat=22.58,
        lon=88.38,
        city="Kolkata",
        active=True
    )
    db.add(station)
    db.commit()

    now = datetime.utcnow()
    # Seed drifted readings
    for i in range(6):
        time_point = now - timedelta(hours=i)
        db.add(Reading(station_id=station.id, measured_at=time_point, aqi=200.0 + (i * 2.0)))
        db.add(VerificationReading(station_id=station.id, measured_at=time_point.replace(minute=0, second=0, microsecond=0), aqi=150.0 + (i * 2.0)))
    db.commit()

    # Step 1: Verify drift is flagged
    resp = client.get("/api/aqi/diagnostics?city=Kolkata")
    alert = [a for a in resp.json()["alerts"] if a["station_code"] == "RECAL-01"][0]
    assert alert["status"] == "Warning"
    assert alert["data_quality_score"] == 70.0

    # Step 2: Trigger Recalibration Action
    action_resp = client.post("/api/aqi/diagnostics/recalibrate", json={"station_id": station.id})
    assert action_resp.status_code == 200
    assert action_resp.json()["status"] == "success"

    # Step 3: Re-evaluate diagnostics and verify bypass override clears the alert
    resp_after = client.get("/api/aqi/diagnostics?city=Kolkata")
    alert_after = [a for a in resp_after.json()["alerts"] if a["station_code"] == "RECAL-01"][0]
    assert alert_after["status"] == "OK"
    assert alert_after["data_quality_score"] == 100.0
    assert "Passed (Calibrated" in alert_after["diagnostics"]["drift_test"]


def test_diagnostics_tech_dispatch(client, db):
    """Test that dispatching a tech crew overrides connection outage/delay alerts."""
    station = Station(
        station_code="DISPATCH-01",
        name="Delayed Connection Station",
        lat=22.59,
        lon=88.39,
        city="Kolkata",
        active=True
    )
    db.add(station)
    db.commit()

    # Seed an old reading (8 hours ago) -> triggers delay warning (>4h)
    now = datetime.utcnow()
    reading = Reading(
        station_id=station.id,
        measured_at=now - timedelta(hours=8),
        aqi=100.0
    )
    db.add(reading)
    db.commit()

    # Step 1: Verify lag critical alert is active
    resp = client.get("/api/aqi/diagnostics?city=Kolkata")
    alert = [a for a in resp.json()["alerts"] if a["station_code"] == "DISPATCH-01"][0]
    assert alert["status"] == "Critical"
    assert "delay" in alert["issue"].lower()

    # Step 2: Dispatch Tech Crew
    action_resp = client.post("/api/aqi/diagnostics/dispatch", json={"station_id": station.id})
    assert action_resp.status_code == 200
    assert action_resp.json()["status"] == "success"

    # Step 3: Verify bypass override is applied
    resp_after = client.get("/api/aqi/diagnostics?city=Kolkata")
    alert_after = [a for a in resp_after.json()["alerts"] if a["station_code"] == "DISPATCH-01"][0]
    assert alert_after["status"] == "OK"
    assert "Tech on-site" in alert_after["diagnostics"]["ingestion_delay"]
    assert alert_after["data_quality_score"] == 100.0
