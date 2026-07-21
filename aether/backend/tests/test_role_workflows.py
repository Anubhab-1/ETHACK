import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import EnforcementAction, Ward
from app.main import app

def test_approve_decree(client, seeded_db):
    # Retrieve the seeded ward from conftest
    ward = seeded_db.query(Ward).filter(Ward.ward_no == 1).first()
    assert ward is not None

    # Call the decree sign-off API
    payload = {
        "ward_id": ward.id,
        "city": "Kolkata",
        "action_text": "Signed-off Decree: Industrial Curtailment 50%",
        "target_type": "Industrial Restriction",
        "priority_score": 85.0
    }
    response = client.post("/api/enforcement/approve-decree", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["ward_id"] == ward.id
    assert data["city"] == "Kolkata"
    assert data["action_text"] == "Signed-off Decree: Industrial Curtailment 50%"
    assert data["status"] == "open"

    # Verify database persistence
    action = seeded_db.query(EnforcementAction).filter(EnforcementAction.id == data["id"]).first()
    assert action is not None
    assert action.action_text == "Signed-off Decree: Industrial Curtailment 50%"

def test_update_action_evidence(client, seeded_db):
    # Retrieve the seeded ward
    ward = seeded_db.query(Ward).filter(Ward.ward_no == 1).first()
    assert ward is not None

    # Insert an enforcement action
    action = EnforcementAction(
        ward_id=ward.id,
        city="Kolkata",
        priority_score=90.0,
        action_text="Suspicious Emissions near Test Ward 999",
        target_type="Construction Halt",
        status="open"
    )
    seeded_db.add(action)
    seeded_db.commit()
    seeded_db.refresh(action)

    # Move status to dispatched
    res1 = client.post(f"/api/enforcement/{action.id}/action", json={"status": "dispatched"})
    assert res1.status_code == 200

    # Submit evidence and transition status to evidence_collected
    payload = {
        "status": "evidence_collected",
        "notes": "Black soot observed during brick kiln production. Operations halted immediately.",
        "severity": "critical",
        "photo_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"
    }
    response = client.post(f"/api/enforcement/{action.id}/action", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "evidence_collected"

    # Verify db storage
    seeded_db.refresh(action)
    assert action.evidence_notes == payload["notes"]
    assert action.evidence_severity == payload["severity"]
    assert action.evidence_photo_url == payload["photo_url"]

def test_ortools_vrp_route_optimization(client):
    # Submit locations to VRP routing solver
    payload = {
        "locations": [
            {"id": 0, "lat": 22.54, "lon": 88.32, "priority": 0.0},
            {"id": 101, "lat": 22.56, "lon": 88.34, "priority": 90.0},
            {"id": 102, "lat": 22.58, "lon": 88.36, "priority": 80.0}
        ],
        "n_inspectors": 1,
        "time_budget_hours": 8.0
    }
    response = client.post("/api/reports/inspector-routes", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "routes" in data
    assert len(data["routes"]) == 1
    assert data["routes"][0]["inspector_id"] == 1
    # The route should contain stops
    stops = data["routes"][0]["stops"]
    assert len(stops) > 0
