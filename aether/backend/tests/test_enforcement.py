"""
Unit tests for enforcement priority scoring.
Validates the formula: severity (35%) + exposure (25%) + actionability (20%) + trend (20%)
"""
from __future__ import annotations
import pytest
from unittest.mock import MagicMock
from app.services.enforcement_scorer import compute_priority, generate_action_text


def make_ward(**kwargs) -> MagicMock:
    """Create a mock Ward object with sensible defaults."""
    defaults = dict(
        id=1,
        name="Test Ward",
        ward_no=1,
        city="Kolkata",
        population=100000,
        school_count=3,
        hospital_count=2,
        svi_index=0.5,
        road_density=2.0,
        industrial_score=30.0,
        construction_count=5,
    )
    defaults.update(kwargs)
    ward = MagicMock()
    for k, v in defaults.items():
        setattr(ward, k, v)
    return ward


class TestComputePriority:
    def test_priority_is_bounded_0_100(self):
        """Priority score must always be in [0, 100]."""
        ward = make_ward()
        score = compute_priority(ward, 300.0, 350.0, {"primary_source": "industrial"})
        assert 0 <= score <= 100

    def test_higher_aqi_yields_higher_priority(self):
        """Higher current AQI should produce higher priority score."""
        ward = make_ward()
        attr = {"primary_source": "construction"}
        low = compute_priority(ward, 80.0, 90.0, attr)
        high = compute_priority(ward, 280.0, 300.0, attr)
        assert high > low

    def test_construction_actionability_exceeds_residential(self):
        """Construction source (0.9) should score higher than residential (0.2)."""
        ward = make_ward()
        construction = compute_priority(ward, 200.0, 210.0, {"primary_source": "construction"})
        residential = compute_priority(ward, 200.0, 210.0, {"primary_source": "residential"})
        assert construction > residential

    def test_increasing_trend_raises_priority(self):
        """When forecast > current AQI, priority should increase (trend = 1.0 vs 0.7)."""
        ward = make_ward()
        attr = {"primary_source": "traffic"}
        stable = compute_priority(ward, 200.0, 200.0, attr)    # trend = 0.7
        worsening = compute_priority(ward, 200.0, 250.0, attr) # trend = 1.0
        assert worsening > stable

    def test_missing_population_uses_default(self):
        """Ward with population=None should not raise."""
        ward = make_ward(population=None)
        score = compute_priority(ward, 150.0, 160.0, {"primary_source": "biomass"})
        assert isinstance(score, float)

    def test_zero_aqi_yields_low_priority(self):
        """AQI=0 should produce very low priority score."""
        ward = make_ward()
        score = compute_priority(ward, 0.0, 0.0, {"primary_source": "traffic"})
        assert score < 20.0


class TestGenerateActionText:
    def test_construction_template(self):
        ward = make_ward(name="Kalighat", ward_no=5, construction_count=3)
        text = generate_action_text(ward, {"primary_source": "construction"})
        assert "construction" in text.lower() or "stop-work" in text.lower()

    def test_traffic_template(self):
        ward = make_ward(name="Park Street", ward_no=10)
        text = generate_action_text(ward, {"primary_source": "traffic"})
        assert "traffic" in text.lower() or "odd-even" in text.lower()

    def test_unknown_source_falls_back_to_traffic(self):
        """Unknown source types should not raise and fall back to traffic template."""
        ward = make_ward()
        text = generate_action_text(ward, {"primary_source": "unknown_source"})
        assert isinstance(text, str)
        assert len(text) > 10
