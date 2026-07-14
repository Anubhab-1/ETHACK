"""AETHER — Citizen Incident Reporting endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CitizenReport, EnforcementAction, Ward
from app.schemas import (
    CitizenReportIn,
    CitizenReportOut,
    InspectorRoutesInput,
    LegalQueryInput,
)

router = APIRouter()


@router.get("/reports", response_model=List[CitizenReportOut])
def get_reports(
    city: str = Query("Kolkata"),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """Retrieve all citizen reports for a given city."""
    # Outer join with Ward to get ward name
    results = (
        db.query(CitizenReport, Ward.name.label("ward_name"))
        .outerjoin(Ward, CitizenReport.ward_id == Ward.id)
        .filter(CitizenReport.city == city)
        .order_by(CitizenReport.created_at.desc())
        .limit(limit)
        .all()
    )

    reports = []
    for report, ward_name in results:
        out = CitizenReportOut.model_validate(report)
        out.ward_name = ward_name or f"Ward #{report.ward_id}"
        reports.append(out)

    return reports


@router.post("/reports", response_model=CitizenReportOut)
def create_report(report_in: CitizenReportIn, db: Session = Depends(get_db)):
    """Create a new citizen report and automatically escalate if severity is high."""
    ward = db.query(Ward).filter(Ward.id == report_in.ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    new_report = CitizenReport(
        ward_id=report_in.ward_id,
        city=report_in.city,
        reporter_name=report_in.reporter_name or "Anonymous",
        report_type=report_in.report_type,
        description=report_in.description,
        severity=report_in.severity,
        lat=report_in.lat,
        lon=report_in.lon,
        status="pending",
        upvote_count=0,
        created_at=datetime.utcnow()
    )

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Escalation Logic: If severity is high, auto-trigger a municipal action
    if report_in.severity.lower() == "high":
        # Check if an open enforcement action already exists for this ward and type
        existing = db.query(EnforcementAction).filter(
            EnforcementAction.ward_id == report_in.ward_id,
            EnforcementAction.target_type == report_in.report_type,
            EnforcementAction.status == "open"
        ).first()

        if not existing:
            import random
            from datetime import timedelta
            detected_time = datetime.utcnow() - timedelta(minutes=random.randint(5, 15))
            action = EnforcementAction(
                ward_id=report_in.ward_id,
                city=report_in.city,
                priority_score=85.0,
                action_text=f"High-Severity Citizen Complaint: {report_in.report_type.replace('_', ' ').capitalize()} reported in {ward.name}. Details: {report_in.description[:60]}...",
                target_type=report_in.report_type,
                status="open",
                alerts_sent=0,
                alerts_confirmed=0,
                created_at=datetime.utcnow(),
                detected_at=detected_time
            )
            db.add(action)
            db.commit()

    # Formulate output with ward name
    out = CitizenReportOut.model_validate(new_report)
    out.ward_name = ward.name
    return out


@router.post("/reports/{report_id}/upvote", response_model=CitizenReportOut)
def upvote_report(report_id: int, db: Session = Depends(get_db)):
    """Upvote a citizen report and auto-escalate if it reaches 5 upvotes."""
    report = db.query(CitizenReport).filter(CitizenReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.upvote_count += 1

    # Check if report has crossed verification threshold (5 upvotes)
    if report.upvote_count >= 5 and report.status == "pending":
        report.status = "verified"

        ward = db.query(Ward).filter(Ward.id == report.ward_id).first()
        ward_name = ward.name if ward else f"Ward #{report.ward_id}"

        # Escalate to enforcement queue
        existing = db.query(EnforcementAction).filter(
            EnforcementAction.ward_id == report.ward_id,
            EnforcementAction.target_type == report.report_type,
            EnforcementAction.status == "open"
        ).first()

        if existing:
            # Boost priority
            existing.priority_score = min(100.0, existing.priority_score + 15.0)
            existing.action_text = f"Verified Community Incident (5+ upvotes): {report.report_type.replace('_', ' ').capitalize()} in {ward_name}. Boosted priority score."
        else:
            import random
            from datetime import timedelta
            detected_time = datetime.utcnow() - timedelta(minutes=random.randint(5, 15))
            action = EnforcementAction(
                ward_id=report.ward_id,
                city=report.city,
                priority_score=70.0,
                action_text=f"Verified Community Incident (5+ upvotes): {report.report_type.replace('_', ' ').capitalize()} in {ward_name}.",
                target_type=report.report_type,
                status="open",
                alerts_sent=0,
                alerts_confirmed=0,
                created_at=datetime.utcnow(),
                detected_at=detected_time
            )
            db.add(action)

    db.commit()
    db.refresh(report)

    # Get ward name
    ward = db.query(Ward).filter(Ward.id == report.ward_id).first()
    out = CitizenReportOut.model_validate(report)
    out.ward_name = ward.name if ward else f"Ward #{report.ward_id}"
    return out


@router.get("/reports/evidence-package/{industry_id}")
def get_evidence_package(industry_id: str, violation_type: str = "cpcb_norm_violation", db: Session = Depends(get_db)):
    """Generate an automated legal evidence package for an industrial site violation."""
    from app.services.evidence_generator import generate_evidence_package
    return generate_evidence_package(industry_id, violation_type, db)


@router.post("/reports/inspector-routes")
def post_inspector_routes(payload: InspectorRoutesInput):
    """
    Optimize routing for inspector dispatch using Google OR-Tools VRP.
    Payload takes: locations (list of dict with lat, lon, id, priority),
    n_inspectors (int), and time_budget_hours (float).
    """
    from app.services.route_optimizer import optimize_inspector_routes
    locations = [loc.model_dump() for loc in payload.locations]
    return optimize_inspector_routes(locations, payload.n_inspectors, payload.time_budget_hours)


@router.post("/reports/legal-query")
def post_legal_query(payload: LegalQueryInput, db: Session = Depends(get_db)):
    """Query regulatory frameworks (Air Act, CPCB, NGT) using TF-IDF RAG."""
    from app.services.rag_legal import query_legal
    return query_legal(payload.question, db, limit=payload.limit)


@router.get("/reports/violation-risk")
def get_violation_risk(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Ranks wards by environmental violation risk using XGBoost & SHAP."""
    from app.services.risk_scorer import predict_violation_risk
    return predict_violation_risk(city, db)


