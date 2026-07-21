"""
Unit and integration tests for citizen subscriptions, alerts, and incident reporting.
"""

from __future__ import annotations

from datetime import datetime
import pytest
from app.models import CitizenReport, CitizenAlertSubscription, Ward, Station, Reading
from app.services.citizen_notifier import evaluate_citizen_alerts

def test_citizen_report_photo_and_status(client, db):
    """Test creating a citizen report with a photo, retrieving it, and checking the status."""
    # Seed a ward
    ward = Ward(
        ward_no=101,
        name="Ward test-01",
        city="Kolkata",
        lat=22.5,
        lon=88.5,
        population=10000,
        school_count=1,
        hospital_count=1,
        elderly_percentage=10.0,
        child_percentage=10.0,
        low_income_percentage=15.0,
        svi_index=0.2
    )
    db.add(ward)
    db.commit()

    # Submit a citizen report via API
    report_payload = {
        "ward_id": ward.id,
        "city": "Kolkata",
        "reporter_name": "Test Reporter",
        "report_type": "garbage_burning",
        "description": "Thick black toxic smoke from landfill burning",
        "severity": "high",
        "lat": 22.501,
        "lon": 88.501,
        "photo_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ix..."
    }
    
    response = client.post("/api/reports", json=report_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["reporter_name"] == "Test Reporter"
    assert data["status"] == "pending"
    assert "photo_url" in data
    assert data["photo_url"].startswith("data:image/png;base64")
    assert data["ward_name"] == "Ward test-01"

    # Query details using the GET /reports/{id} endpoint
    report_id = data["id"]
    get_response = client.get(f"/api/reports/{report_id}")
    assert get_response.status_code == 200
    get_data = get_response.json()
    assert get_data["id"] == report_id
    assert get_data["status"] == "pending"
    assert get_data["photo_url"] == report_payload["photo_url"]
    assert get_data["description"] == report_payload["description"]


def test_citizen_alert_subscription_and_eval(client, db):
    """Test subscribing to alert notifications and triggering automated threshold warning dispatches."""
    # Seed ward
    ward = Ward(
        ward_no=102,
        name="Salt Lake Ward",
        city="Kolkata",
        lat=22.58,
        lon=88.42,
        population=15000,
        school_count=2,
        hospital_count=1,
        elderly_percentage=12.0,
        child_percentage=8.0,
        low_income_percentage=10.0,
        svi_index=0.1
    )
    db.add(ward)
    
    # Seed active station in the same ward to anchor interpolation
    station = Station(
        station_code="SL-STATION-01",
        name="Salt Lake Station",
        lat=22.58,
        lon=88.42,
        city="Kolkata",
        active=True,
        ward_id=ward.id
    )
    db.add(station)
    db.commit()

    # Seed poor air quality reading (AQI 220, exceeds "poor" threshold which is 201)
    reading = Reading(
        station_id=station.id,
        measured_at=datetime.utcnow(),
        pm25=120.0,
        pm10=210.0,
        aqi=220.0,
        category="Poor"
    )
    db.add(reading)
    db.commit()

    # Create alert subscription via API
    sub_payload = {
        "city": "Kolkata",
        "ward_id": ward.id,
        "phone_number": "+919999999999",
        "email": "test@citizen.org",
        "language": "bn",
        "notify_level": "poor"
    }
    sub_response = client.post("/api/citizen/subscribe", json=sub_payload)
    assert sub_response.status_code == 200
    sub_data = sub_response.json()
    assert sub_data["phone_number"] == "+919999999999"
    assert sub_data["notify_level"] == "poor"

    # Evaluate citizen alerts: check alert trigger dispatches successfully
    evaluate_citizen_alerts(db, "Kolkata")
    
    # Assert subscription is in DB
    db_sub = db.query(CitizenAlertSubscription).filter_by(id=sub_data["id"]).first()
    assert db_sub is not None
    assert db_sub.language == "bn"
