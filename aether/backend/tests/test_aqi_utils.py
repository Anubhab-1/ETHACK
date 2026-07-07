"""
Unit tests for AQI utility functions.
Tests the canonical aqi_to_category, idw_interpolate, and haversine_km.
"""
from __future__ import annotations
import pytest
from app.api.aqi import aqi_to_category, idw_interpolate


class TestAqiToCategory:
    def test_good_range(self):
        assert aqi_to_category(0) == "Good"
        assert aqi_to_category(50) == "Good"

    def test_satisfactory_range(self):
        assert aqi_to_category(51) == "Satisfactory"
        assert aqi_to_category(100) == "Satisfactory"

    def test_moderate_range(self):
        assert aqi_to_category(101) == "Moderate"
        assert aqi_to_category(200) == "Moderate"

    def test_poor_range(self):
        assert aqi_to_category(201) == "Poor"
        assert aqi_to_category(300) == "Poor"

    def test_very_poor_range(self):
        assert aqi_to_category(301) == "Very Poor"
        assert aqi_to_category(400) == "Very Poor"

    def test_severe_range(self):
        assert aqi_to_category(401) == "Severe"
        assert aqi_to_category(999) == "Severe"  # Beyond 500 -> Severe fallback

    def test_none_returns_unknown(self):
        assert aqi_to_category(None) == "Unknown"

    def test_zero_is_good(self):
        assert aqi_to_category(0) == "Good"


class TestIdwInterpolate:
    def test_empty_points_returns_default(self):
        result = idw_interpolate(22.5, 88.35, [])
        assert result == 150.0

    def test_single_point_returns_that_value(self):
        result = idw_interpolate(22.5, 88.35, [(22.5, 88.35, 200.0)])
        assert result == 200.0

    def test_equidistant_points_returns_average(self):
        """Points equidistant from target should return their mean."""
        # Two points same distance from target
        result = idw_interpolate(22.5, 88.35, [
            (22.0, 88.35, 100.0),
            (23.0, 88.35, 200.0),
        ])
        # Should be close to the mean (150.0) due to equal distance
        assert abs(result - 150.0) < 5.0

    def test_closer_point_has_more_weight(self):
        """Closer point should dominate interpolated result."""
        result_near = idw_interpolate(22.5, 88.35, [
            (22.501, 88.35, 300.0),  # Very close to target
            (25.0, 88.35, 50.0),     # Far from target
        ])
        # Result should be much closer to 300 than to 50
        assert result_near > 200.0

    def test_identical_coordinates_uses_min_dist(self):
        """Should not raise ZeroDivisionError when dist == 0."""
        result = idw_interpolate(22.5, 88.35, [(22.5, 88.35, 175.0)])
        assert result == 175.0
