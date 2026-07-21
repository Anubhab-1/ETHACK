"""
AETHER — Pydantic Schemas for API request/response validation.
Compatible with Python 3.8+
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

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
    detected_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    evidence_notes: Optional[str] = None
    evidence_photo_url: Optional[str] = None
    evidence_severity: Optional[str] = None

    model_config = {"from_attributes": True}


class EnforcementStatusUpdate(BaseModel):
    status: str  # 'detected', 'open', 'dispatched', 'deployed', 'evidence_collected', 'resolved'
    notes: Optional[str] = None
    severity: Optional[str] = None
    photo_url: Optional[str] = None


class DecreeSignOffIn(BaseModel):
    ward_id: int
    city: str
    action_text: str
    target_type: str
    priority_score: float = 75.0



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
    photo_url: Optional[str] = None


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
    photo_url: Optional[str] = None
    created_at: datetime
    ward_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Citizen Subscriptions ──────────────────────────────────────────────────────

class CitizenSubscriptionIn(BaseModel):
    city: str
    ward_id: int
    phone_number: Optional[str] = None
    email: Optional[str] = None
    language: str = "en"
    notify_level: str = "poor"  # moderate, poor, very_poor, severe


class CitizenSubscriptionOut(BaseModel):
    id: int
    city: str
    ward_id: int
    phone_number: Optional[str] = None
    email: Optional[str] = None
    language: str
    notify_level: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Agent Simulation ─────────────────────────────────────────────────────────

class ToolCall(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]
    result: Optional[Dict[str, Any]] = None


class AgentTurn(BaseModel):
    agent: str
    role: str
    avatar: str
    thought: str
    tool_calls: List[ToolCall] = []
    observation: str
    recommendation: str


class ConstitutionalCheck(BaseModel):
    principle: str
    status: str  # "PASS" | "WARN" | "FAIL"
    note: str


class CausalEvidence(BaseModel):
    intervention_type: str
    ate_ugm3: float
    ci_lower: float
    ci_upper: float
    p_value: float
    is_significant: bool
    health_savings_lakhs: float


class AgentSimulationResponse(BaseModel):
    ward_id: int
    ward_name: str
    city: str
    current_aqi: float
    agent_turns: List[AgentTurn]
    constitutional_checks: List[ConstitutionalCheck]
    causal_evidence: Optional[CausalEvidence] = None
    decree: str
    dialogue: List[Dict] = []


# ── Inspector Routing & Legal Query ───────────────────────────────────────────

class InspectorLocation(BaseModel):
    id: int
    lat: float
    lon: float
    priority: Optional[float] = 0.0


class InspectorRoutesInput(BaseModel):
    locations: List[InspectorLocation]
    n_inspectors: int = Field(3, ge=1, le=10)
    time_budget_hours: float = Field(8.0, ge=1.0, le=24.0)


class LegalQueryInput(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(3, ge=1, le=10)


