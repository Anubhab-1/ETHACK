from __future__ import annotations
"""
AETHER — SQLAlchemy ORM Models
All database tables for the platform.
Python 3.8 compatible.
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Integer, String, Float, Text, DateTime, Boolean,
    ForeignKey
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Station(Base):
    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    city: Mapped[str] = mapped_column(String(100), default="Kolkata", index=True)
    ward_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("wards.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    def __repr__(self):
        return f"<Station {self.name} ({self.city})>"


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_id: Mapped[int] = mapped_column(Integer, ForeignKey("stations.id"), index=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    pm25: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pm10: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    no2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    so2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    co: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    o3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    aqi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class Weather(Base):
    __tablename__ = "weather"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city: Mapped[str] = mapped_column(String(100), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    temp_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_dir: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pressure: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    precipitation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class Ward(Base):
    __tablename__ = "wards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_no: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100), default="Kolkata", index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    population: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    school_count: Mapped[int] = mapped_column(Integer, default=0)
    hospital_count: Mapped[int] = mapped_column(Integer, default=0)
    road_density: Mapped[float] = mapped_column(Float, default=0.0)
    industrial_score: Mapped[float] = mapped_column(Float, default=0.0)
    construction_count: Mapped[int] = mapped_column(Integer, default=0)
    geojson: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    elderly_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    child_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    low_income_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    svi_index: Mapped[float] = mapped_column(Float, default=0.0)


class Forecast(Base):
    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[int] = mapped_column(Integer, ForeignKey("wards.id"), index=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    forecast_for: Mapped[datetime] = mapped_column(DateTime, index=True)
    horizon_hours: Mapped[int] = mapped_column(Integer)
    predicted_aqi: Mapped[float] = mapped_column(Float)
    predicted_category: Mapped[str] = mapped_column(String(50))
    confidence_lower: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence_upper: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class Attribution(Base):
    __tablename__ = "attributions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[int] = mapped_column(Integer, ForeignKey("wards.id"), index=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    traffic_pct: Mapped[float] = mapped_column(Float, default=0.0)
    industrial_pct: Mapped[float] = mapped_column(Float, default=0.0)
    construction_pct: Mapped[float] = mapped_column(Float, default=0.0)
    biomass_pct: Mapped[float] = mapped_column(Float, default=0.0)
    residential_pct: Mapped[float] = mapped_column(Float, default=0.0)
    primary_source: Mapped[str] = mapped_column(String(50))
    confidence: Mapped[float] = mapped_column(Float)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class EnforcementAction(Base):
    __tablename__ = "enforcement_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[int] = mapped_column(Integer, ForeignKey("wards.id"), index=True)
    city: Mapped[str] = mapped_column(String(100), default="Kolkata", index=True)
    priority_score: Mapped[float] = mapped_column(Float, index=True)
    action_text: Mapped[str] = mapped_column(Text)
    target_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    alerts_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    alerts_confirmed: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Document(Base):
    """RAG Corpus"""
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str] = mapped_column(String(50))
    embedding: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meta: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AdvisoryLog(Base):
    __tablename__ = "advisory_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(100))
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(10), default="en")
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CitizenReport(Base):
    __tablename__ = "citizen_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[int] = mapped_column(Integer, ForeignKey("wards.id"), index=True)
    city: Mapped[str] = mapped_column(String(100), default="Kolkata", index=True)
    reporter_name: Mapped[str] = mapped_column(String(200), default="Anonymous")
    report_type: Mapped[str] = mapped_column(String(50))  # "garbage_burning", "construction_dust", "industrial_smoke", "vehicle_emissions", "other"
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="medium")  # "low", "medium", "high"
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending", "verified", "dispatched", "resolved"
    upvote_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Optional relationship mapping back to Ward
    ward = relationship("Ward")

