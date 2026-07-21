"""
Integration tests for all major AETHER API endpoints.
Uses FastAPI TestClient with in-memory SQLite database.
"""
from __future__ import annotations
import json
import math
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest


class TestHealthEndpoints:
    def test_health_returns_ok(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert data["db_connected"] is True

    def test_cities_returns_list(self, client):
        resp = client.get("/api/cities")
        assert resp.status_code == 200
        cities = resp.json()
        assert isinstance(cities, list)
        assert len(cities) >= 1


class TestAQIEndpoints:
    def test_live_aqi_returns_list(self, client):
        resp = client.get("/api/aqi/live?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_live_aqi_has_expected_fields(self, client):
        resp = client.get("/api/aqi/live?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        if data:  # Only check if there are results
            item = data[0]
            assert "station_id" in item
            assert "name" in item
            assert "lat" in item
            assert "lon" in item
            assert "city" in item

    def test_heatmap_returns_list(self, client):
        resp = client.get("/api/aqi/heatmap?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_heatmap_points_have_aqi_field(self, client):
        resp = client.get("/api/aqi/heatmap?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        if data:
            assert "aqi" in data[0]
            assert "ward_name" in data[0]
            assert "category" in data[0]

    def test_wards_endpoint(self, client):
        resp = client.get("/api/wards?city=Kolkata")
        assert resp.status_code == 200
        wards = resp.json()
        assert isinstance(wards, list)

    def test_ward_detail_404_for_nonexistent(self, client):
        resp = client.get("/api/wards/99999")
        assert resp.status_code == 404

    def test_forecast_endpoint_returns_hourly_forecasts(self, client, monkeypatch):
        # Stub weather forecast to avoid external network dependency
        def fake_weather_forecast(city: str, hours_ahead: int = 72):
            now = datetime.now(timezone.utc)
            return [
                {
                    "time": (now + timedelta(hours=i)).isoformat(),
                    "temp_c": 28.0,
                    "humidity_pct": 60.0,
                    "wind_speed": 5.0,
                    "wind_dir": 180.0,
                    "pressure": 1013.0,
                }
                for i in range(hours_ahead)
            ]

        monkeypatch.setattr("app.services.fetch_weather.get_weather_forecast", fake_weather_forecast)

        resp = client.get("/api/forecast?lat=22.5&lon=88.35&city=Kolkata&hours=24")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ward_id"] == 1
        assert isinstance(data["forecasts"], list)
        assert len(data["forecasts"]) == 24
        assert all("predicted_aqi" in f and "confidence_lower" in f for f in data["forecasts"])


class TestAdvisoryEndpoints:
    def test_advisory_ask_basic(self, client):
        resp = client.post("/api/advisory/ask", json={
            "question": "Is it safe to go outside today?",
            "language": "en",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data
        assert isinstance(data["answer"], str)
        assert len(data["answer"]) > 10

    def test_advisory_question_too_long_rejected(self, client):
        """Question over 500 chars should return 422 validation error."""
        resp = client.post("/api/advisory/ask", json={
            "question": "a" * 501,
            "language": "en",
        })
        assert resp.status_code == 422

    def test_advisory_empty_question_rejected(self, client):
        resp = client.post("/api/advisory/ask", json={
            "question": "   ",
            "language": "en",
        })
        assert resp.status_code == 422

    def test_advisory_invalid_language_rejected(self, client):
        """Invalid language code should return 422."""
        resp = client.post("/api/advisory/ask", json={
            "question": "Is the air safe?",
            "language": "fr",  # Not supported
        })
        assert resp.status_code == 422

    def test_briefing_endpoint(self, client):
        resp = client.get("/api/advisory/briefing?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        assert "briefing" in data
        assert isinstance(data["briefing"], str)


class TestEnforcementEndpoints:
    def test_enforcement_list(self, client):
        resp = client.get("/api/enforcement?city=Kolkata")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_enforcement_stats(self, client):
        resp = client.get("/api/enforcement/stats?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        assert "open" in data
        assert "total" in data

    def test_weather_current(self, client):
        resp = client.get("/api/weather/current?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        assert "temp_c" in data
        assert "wind_speed" in data


class TestAgentsEndpoints:
    def test_agents_simulation_basic(self, client):
        resp = client.post("/api/agents/simulation?ward_id=1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ward_id"] == 1
        assert "ward_name" in data
        assert "agent_turns" in data
        assert len(data["agent_turns"]) == 5
        assert "decree" in data
        assert "constitutional_checks" in data

    def test_agents_simulation_nonexistent_ward(self, client):
        resp = client.post("/api/agents/simulation?ward_id=99999")
        assert resp.status_code == 404

    def test_advanced_deliberation(self, client):
        resp = client.post("/api/agents-advanced/deliberate/1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ward_id"] == "1"
        assert "consensus" in data
        assert "avg_agent_confidence" in data


class TestModelingEndpoints:
    def test_forecast_train_endpoint_returns_model_artifacts(self, client, seeded_db, monkeypatch, tmp_path):
        from app.models import Reading, Weather
        from app.services import forecaster

        # Seed additional historical data to satisfy train_model requirements
        base_time = datetime.now(timezone.utc) - timedelta(hours=120)
        for i in range(120):
            dt = base_time + timedelta(hours=i)
            aqi_value = 120 + 20 * math.sin(i / 6.0) + random.uniform(-5, 5)
            reading = Reading(
                station_id=1,
                measured_at=dt,
                pm25=max(5.0, aqi_value * 0.45),
                pm10=max(10.0, aqi_value * 0.85),
                no2=max(1.0, aqi_value * 0.25),
                so2=max(0.5, aqi_value * 0.08),
                co=max(0.1, aqi_value * 0.01),
                o3=max(1.0, aqi_value * 0.12),
                aqi=round(aqi_value, 1),
                category="Moderate",
            )
            seeded_db.add(reading)
        for i in range(120):
            dt = base_time + timedelta(hours=i)
            weather = Weather(
                city="Kolkata",
                recorded_at=dt,
                temp_c=28.0 + 3.0 * math.sin(i / 24.0),
                humidity_pct=60.0 + 10.0 * math.sin(i / 18.0),
                wind_speed=5.0 + 1.2 * math.cos(i / 16.0),
                wind_dir=180.0,
                pressure=1013.0,
            )
            seeded_db.add(weather)
        seeded_db.commit()

        monkeypatch.setattr(forecaster, "MODEL_PATH", tmp_path)

        resp = client.post("/api/forecast/train?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        assert data["city"] == "Kolkata"
        assert "job_id" in data
        assert data["status"] in {"queued", "running", "completed"}

        job_id = data["job_id"]
        deadline = time.time() + 10
        while time.time() < deadline:
            poll_resp = client.get(f"/api/forecast/train/{job_id}")
            assert poll_resp.status_code == 200
            job_data = poll_resp.json()
            if job_data["status"] == "completed":
                break
            time.sleep(0.1)

        final_resp = client.get(f"/api/forecast/train/{job_id}")
        assert final_resp.status_code == 200
        final_data = final_resp.json()
        print("JOB STATUS:", final_data.get("status"))
        print("JOB MESSAGE:", final_data.get("message"))
        print("JOB RESULTS:", final_data.get("results"))
        assert final_data["status"] == "completed"
        assert final_data["results"] is not None
        for horizon in ["24h", "48h", "72h"]:
            assert horizon in final_data["results"]
            assert "model_saved" in final_data["results"][horizon]
            assert (tmp_path / f"kolkata_{horizon}.json").exists()


class TestSimulationEndpoints:
    def test_evaluate_simulation(self, client):
        resp = client.post("/api/simulation/evaluate", json={
            "ward_id": 1,
            "traffic_reduction": 20,
            "construction_halt": True,
            "industrial_restriction": 15
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["target_ward_id"] == 1
        assert "results" in data
        assert len(data["results"]) > 0

    def test_train_model_persists_metrics_when_training_fails(self, db, tmp_path, monkeypatch):
        from app.services import forecaster

        monkeypatch.setattr(forecaster, "MODEL_PATH", tmp_path)

        result = forecaster.train_model("Kolkata", db)

        assert "error" in result
        metrics_path = tmp_path / "kolkata_24h.metrics.json"
        assert metrics_path.exists(), "expected a metrics file even when training cannot proceed"

        payload = json.loads(metrics_path.read_text(encoding="utf-8"))
        assert payload["status"] == "insufficient_data"
        assert payload["city"] == "Kolkata"

    def test_satellite_calibration(self, client):
        resp = client.get("/api/simulation/calibrate?city=Kolkata")
        assert resp.status_code == 200
        data = resp.json()
        assert "r_squared" in data
        assert "points" in data
        assert len(data["points"]) > 0


class TestReportsAdvancedEndpoints:
    def test_inspector_routes_validation_success(self, client):
        resp = client.post("/api/reports/inspector-routes", json={
            "locations": [
                {"id": 1, "lat": 22.57, "lon": 88.36, "priority": 1.0},
                {"id": 2, "lat": 22.58, "lon": 88.37, "priority": 2.0}
            ],
            "n_inspectors": 2,
            "time_budget_hours": 6.0
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "routes" in data

    def test_inspector_routes_validation_failure(self, client):
        resp = client.post("/api/reports/inspector-routes", json={
            "locations": [],
            "n_inspectors": 2,
            "time_budget_hours": 30.0
        })
        assert resp.status_code == 422

    def test_legal_query_validation_success(self, client):
        resp = client.post("/api/reports/legal-query", json={
            "question": "What is the penalty for burning garbage?",
            "limit": 3
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_legal_query_validation_failure(self, client):
        resp = client.post("/api/reports/legal-query", json={
            "question": "a" * 501,
            "limit": 3
        })
        assert resp.status_code == 422

