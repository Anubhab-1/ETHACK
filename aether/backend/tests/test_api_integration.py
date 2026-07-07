"""
Integration tests for all major AETHER API endpoints.
Uses FastAPI TestClient with in-memory SQLite database.
"""
from __future__ import annotations
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
