"""
Unit tests for the source attribution engine.
Validates heuristic scoring logic with known inputs and outputs.
"""
from __future__ import annotations
import pytest
from unittest.mock import MagicMock
from app.services.attributor import attribute_sources


def make_ward(**kwargs) -> MagicMock:
    defaults = dict(
        id=1, name="Test Ward", ward_no=1, city="Kolkata",
        road_density=2.5, industrial_score=40.0, construction_count=5,
    )
    defaults.update(kwargs)
    ward = MagicMock()
    for k, v in defaults.items():
        setattr(ward, k, v)
    return ward


RUSH_HOUR_FEATURES = {"hour": 8, "month": 6, "is_weekend": False, "is_rush_hour": True}
NIGHT_FEATURES = {"hour": 2, "month": 6, "is_weekend": False, "is_rush_hour": False}
WINTER_NW_FEATURES = {"hour": 14, "month": 12, "is_weekend": False, "is_rush_hour": False}


class TestAttributeSources:
    def test_breakdown_sums_to_100(self):
        """All breakdown percentages must sum to exactly 100."""
        ward = make_ward()
        result = attribute_sources(ward, 200.0, {"wind_speed": 5, "wind_dir": 180}, RUSH_HOUR_FEATURES)
        total = sum(result["breakdown"].values())
        assert abs(total - 100.0) < 0.5, f"Breakdown sums to {total}, expected 100"

    def test_traffic_elevated_during_rush_hour(self):
        """Traffic contribution should be higher during rush hour vs. night."""
        ward = make_ward(road_density=3.0, industrial_score=10.0)
        rush = attribute_sources(ward, 150.0, {"wind_speed": 7, "wind_dir": 200}, RUSH_HOUR_FEATURES)
        night = attribute_sources(ward, 150.0, {"wind_speed": 7, "wind_dir": 200}, NIGHT_FEATURES)
        assert rush["breakdown"]["traffic"] > night["breakdown"]["traffic"]

    def test_biomass_elevated_in_winter_nw_wind(self):
        """Biomass contribution should be higher in winter with NW wind."""
        ward = make_ward(industrial_score=5.0, road_density=1.0)
        biomass_weather = {"wind_speed": 4, "wind_dir": 315}  # NW wind
        other_weather = {"wind_speed": 7, "wind_dir": 180}    # S wind, summer
        winter = attribute_sources(ward, 250.0, biomass_weather, WINTER_NW_FEATURES)
        summer = attribute_sources(ward, 250.0, other_weather, RUSH_HOUR_FEATURES)
        assert winter["breakdown"]["biomass"] > summer["breakdown"]["biomass"]

    def test_primary_source_is_max_contributor(self):
        """primary_source must match the source with the highest percentage."""
        ward = make_ward()
        result = attribute_sources(ward, 180.0, {"wind_speed": 5, "wind_dir": 200}, RUSH_HOUR_FEATURES)
        primary = result["primary_source"]
        assert result["breakdown"][primary] == max(result["breakdown"].values())

    def test_confidence_in_valid_range(self):
        """Confidence score must be between 0 and 1."""
        ward = make_ward()
        result = attribute_sources(ward, 150.0, {"wind_speed": 5, "wind_dir": 180}, NIGHT_FEATURES)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_explanation_is_non_empty_string(self):
        ward = make_ward()
        result = attribute_sources(ward, 200.0, {"wind_speed": 6, "wind_dir": 90}, RUSH_HOUR_FEATURES)
        assert isinstance(result["explanation"], str)
        assert len(result["explanation"]) > 20
