from __future__ import annotations
"""
AETHER — Pydantic Schemas for API request/response validation.
Compatible with Python 3.8+
"""
from datetime import datetime
from typing import Optional, List, Dict, Literal
from pydantic import BaseModel, Field, field_validator


# ── Station ────────────────────────────────────────────────────────────────────

class StationOut(BaseModel):
    id: int
    station_code: str
    name: str
    lat: float
    lon: float
    city: str
    ward_id: Optional[int] = None

    model_config = {"from_attributes": True}


# ── Reading ────────────────────────────────────────────────────────────────────

class ReadingOut(BaseModel):
    id: int
    station_id: int
    measured_at: datetime
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None
    co: Optional[float] = None
    o3: Optional[float] = None
    aqi: Optional[float] = None
    category: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Live AQI ───────────────────────────────────────────────────────────────────

class LiveAQIPoint(BaseModel):
    station_id: int
    station_code: str
    name: str
    lat: float
    lon: float
    city: str
    aqi: Optional[float] = None
    category: Optional[str] = None
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    no2: Optional[float] = None
    measured_at: Optional[datetime] = None


class HeatmapPoint(BaseModel):
    ward_id: int
    ward_no: int
    ward_name: str
    lat: float
    lon: float
    aqi: float
    category: str


# ── Ward ───────────────────────────────────────────────────────────────────────

class WardOut(BaseModel):
    id: int
    ward_no: int
    name: str
    city: str
    lat: float
    lon: float
    population: Optional[int] = None
    school_count: int
    hospital_count: int
    elderly_percentage: float
    child_percentage: float
    low_income_percentage: float
    svi_index: float

    model_config = {"from_attributes": True}


class WardDetail(WardOut):
    aqi: Optional[float] = None
    category: Optional[str] = None
    primary_source: Optional[str] = None
    attribution: Optional[Dict[str, float]] = None
    geojson: Optional[str] = None


# ── Forecast ───────────────────────────────────────────────────────────────────

class ForecastPoint(BaseModel):
    forecast_for: datetime
    horizon_hours: int
    predicted_aqi: float
    predicted_category: str
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None


class ForecastResponse(BaseModel):
    ward_id: Optional[int] = None
    lat: float
    lon: float
    current_aqi: Optional[float] = None
    forecasts: List[ForecastPoint]


# ── Attribution ────────────────────────────────────────────────────────────────

class AttributionResponse(BaseModel):
    ward_id: int
    ward_name: str
    breakdown: Dict[str, float]
    primary_source: str
    confidence: float
    explanation: str


# ── Enforcement ────────────────────────────────────────────────────────────────

class EnforcementActionOut(BaseModel):
    id: int
    ward_id: int
    # ward_name is resolved at the API layer via join; optional for safety
    ward_name: Optional[str] = None
    ward_no: Optional[int] = None
    ward_lat: Optional[float] = None
    ward_lon: Optional[float] = None
    city: str
    priority_score: float
    action_text: str
    target_type: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EnforcementStatusUpdate(BaseModel):
    status: str  # 'deployed' or 'resolved'


class EnforcementStats(BaseModel):
    open: int
    deployed: int
    resolved: int
    total: int


# ── Advisory ───────────────────────────────────────────────────────────────────

class AdvisoryRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="User's air quality question (max 500 characters)",
    )
    language: Literal["en", "bn", "hi"] = "en"
    lat: Optional[float] = None
    lon: Optional[float] = None
    session_id: Optional[str] = None

    @field_validator("question")
    @classmethod
    def sanitize_question(cls, v: str) -> str:
        """Strip leading/trailing whitespace and reject empty input."""
        v = v.strip()
        if not v:
            raise ValueError("Question must not be empty")
        return v


class AdvisoryResponse(BaseModel):
    answer: str
    aqi: Optional[float] = None
    category: Optional[str] = None
    language: str
    session_id: str


# ── City ───────────────────────────────────────────────────────────────────────

class CityOut(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    station_count: int
    current_avg_aqi: Optional[float] = None


# ── Health ─────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str
    city: str
    db_connected: bool


# ── Citizen Reports ────────────────────────────────────────────────────────────

class CitizenReportIn(BaseModel):
    ward_id: int
    city: str
    reporter_name: Optional[str] = "Anonymous"
    report_type: str
    description: str
    severity: str = "medium"
    lat: float
    lon: float


class CitizenReportOut(BaseModel):
    id: int
    ward_id: int
    city: str
    reporter_name: str
    report_type: str
    description: str
    severity: str
    lat: float
    lon: float
    status: str
    upvote_count: int
    created_at: datetime
    ward_name: Optional[str] = None

    model_config = {"from_attributes": True}

