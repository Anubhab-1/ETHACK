"""
AETHER -- AQI Utility Functions
Single source of truth for AQI constants and interpolation helpers.

Replaces duplicate definitions in api/aqi.py and api/advisory.py.
"""
from __future__ import annotations

import math
from typing import Optional

# India CPCB AQI category breakpoints
AQI_CATEGORIES: list = [
    (0,   50,  "Good"),
    (51,  100, "Satisfactory"),
    (101, 200, "Moderate"),
    (201, 300, "Poor"),
    (301, 400, "Very Poor"),
    (401, 500, "Severe"),
]

# Default fallback AQI when no station data is available
DEFAULT_AQI: float = 150.0

# Compass bearings for wind direction labels
_COMPASS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]


def aqi_to_category(aqi: Optional[float]) -> str:
    """Map a numeric AQI value to its India CPCB category label."""
    if aqi is None:
        return "Unknown"
    for lo, hi, cat in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return cat
    return "Severe"


def idw_interpolate(
    target_lat: float,
    target_lon: float,
    points: list,
    power: float = 2.0,
    min_dist: float = 0.001,
) -> float:
    """Inverse Distance Weighted (IDW) interpolation.

    Args:
        target_lat: Target latitude.
        target_lon: Target longitude.
        points: List of (lat, lon, value) tuples.
        power: IDW power parameter (higher = more local influence).
        min_dist: Minimum distance to prevent division by zero.
    """
    if not points:
        return DEFAULT_AQI

    total_weight = 0.0
    weighted_sum = 0.0

    for lat, lon, value in points:
        dist = math.sqrt((lat - target_lat) ** 2 + (lon - target_lon) ** 2)
        w = 1.0 / max(dist ** power, min_dist ** power)
        total_weight += w
        weighted_sum += w * value

    if total_weight == 0:
        return DEFAULT_AQI

    return round(weighted_sum / total_weight, 1)


def wind_dir_to_compass(wind_dir: float) -> str:
    """Convert a wind direction in degrees to a compass label."""
    idx = int((wind_dir / 22.5) + 0.5) % 16
    return _COMPASS[idx]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance between two coordinates in kilometres."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
