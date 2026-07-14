from __future__ import annotations
"""AETHER — Attribution and Enforcement endpoints v2.0.
Includes PMF/NMF source apportionment with 95% CI (Phase 2 National Upgrade).
"""
from fastapi import APIRouter, BackgroundTasks, Depends, Header, Query, HTTPException
from app.config import get_settings
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Ward, Attribution, EnforcementAction
from app.schemas import (
    AttributionResponse, EnforcementActionOut,
    EnforcementStatusUpdate, EnforcementStats
)
from app.services.attributor import run_attribution_for_ward, get_current_aqi_for_ward, run_pmf_attribution
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/attribution/{ward_id}/pmf")
def get_pmf_attribution(ward_id: int, db: Session = Depends(get_db)):
    """
    PMF/NMF source apportionment with 95% bootstrap confidence intervals.
    Returns: Traffic: 34% (CI: 28%-41%) — publication-grade methodology.
    Method: Positive Matrix Factorization with 50 bootstrap resamples.
    """
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    pmf_result = run_pmf_attribution(ward, db)

    if pmf_result is None:
        # Fallback to heuristic with simulated CI (shows architecture even without real data)
        result = run_attribution_for_ward(ward, db)
        breakdown = result["breakdown"]
        # Add ±15% synthetic CI for demo when real data is insufficient
        import random
        rng = random.Random(ward.id)
        ci_breakdown = {}
        for source, pct in breakdown.items():
            spread = pct * 0.15
            ci_breakdown[source] = {
                "mean": round(pct, 1),
                "ci_lower": round(max(0, pct - spread - rng.uniform(0, spread)), 1),
                "ci_upper": round(min(100, pct + spread + rng.uniform(0, spread)), 1),
            }
        return {
            "ward_id": ward_id,
            "ward_name": ward.name,
            "breakdown_with_ci": ci_breakdown,
            "method": "Heuristic scoring with synthetic ±15% CI (activate PMF with ≥20 multi-pollutant readings)",
            "note": "Real NMF-PMF requires ≥20 simultaneous PM2.5, PM10, NO2, SO2, CO, O3 readings.",
            "primary_source": result["primary_source"],
            "heuristic_confidence": result["confidence"],
        }

    # Real NMF-PMF result
    breakdown = pmf_result["breakdown_with_ci"]
    primary = max(breakdown.items(), key=lambda x: x[1]["mean"])[0]

    # Format as readable strings for display
    formatted = {
        source: f"{v['mean']:.0f}% (CI: {v['ci_lower']:.0f}%-{v['ci_upper']:.0f}%)"
        for source, v in breakdown.items()
    }

    return {
        "ward_id": ward_id,
        "ward_name": ward.name,
        "breakdown_with_ci": breakdown,
        "breakdown_formatted": formatted,
        "primary_source": primary,
        "method": pmf_result["method"],
        "n_bootstrap": pmf_result["n_bootstrap"],
        "n_samples": pmf_result["n_samples"],
        "note": pmf_result["note"],
    }


@router.get("/attribution/{ward_id}", response_model=AttributionResponse)
def get_attribution(ward_id: int, db: Session = Depends(get_db)):
    """Get source attribution for a ward."""
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    # Check for recent cached attribution (< 2 hours old)
    from datetime import timedelta
    from sqlalchemy import desc
    
    recent = db.query(Attribution).filter(
        Attribution.ward_id == ward_id,
    ).order_by(desc(Attribution.computed_at)).first()
    
    if recent and (datetime.utcnow() - recent.computed_at).total_seconds() < 7200:
        return AttributionResponse(
            ward_id=ward.id,
            ward_name=ward.name,
            breakdown={
                "traffic": recent.traffic_pct,
                "industrial": recent.industrial_pct,
                "construction": recent.construction_pct,
                "biomass": recent.biomass_pct,
                "residential": recent.residential_pct,
            },
            primary_source=recent.primary_source,
            confidence=recent.confidence,
            explanation=recent.explanation or "",
        )
    
    # Compute fresh
    result = run_attribution_for_ward(ward, db)
    return AttributionResponse(
        ward_id=ward.id,
        ward_name=ward.name,
        breakdown=result["breakdown"],
        primary_source=result["primary_source"],
        confidence=result["confidence"],
        explanation=result["explanation"],
    )


@router.get("/enforcement")
def get_enforcement_queue(
    city: str = Query("Kolkata"),
    limit: int = Query(20, le=50),
    status: str = Query("open"),
    db: Session = Depends(get_db),
):
    """Get ranked enforcement action queue — O(1) queries via join."""
    # Single JOIN query instead of N per-action Ward lookups
    rows = (
        db.query(EnforcementAction, Ward)
        .outerjoin(Ward, EnforcementAction.ward_id == Ward.id)
        .filter(
            EnforcementAction.city == city,
            EnforcementAction.status == status,
        )
        .order_by(EnforcementAction.priority_score.desc())
        .limit(limit)
        .all()
    )

    result = []
    for a, ward in rows:
        result.append({
            "id": a.id,
            "ward_id": a.ward_id,
            "ward_name": ward.name if ward else "Unknown",
            "ward_no": ward.ward_no if ward else 0,
            "ward_lat": ward.lat if ward else 0.0,
            "ward_lon": ward.lon if ward else 0.0,
            "city": a.city,
            "priority_score": a.priority_score,
            "action_text": a.action_text,
            "target_type": a.target_type,
            "status": a.status,
            "alerts_sent": a.alerts_sent or 0,
            "alerts_confirmed": a.alerts_confirmed or 0,
            "created_at": a.created_at.isoformat(),
            "detected_at": a.detected_at.isoformat() if a.detected_at else None,
            "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        })

    return result


@router.post("/enforcement/{action_id}/action")
def update_enforcement_status(
    action_id: int,
    update: EnforcementStatusUpdate,
    db: Session = Depends(get_db),
):
    """Mark an enforcement action as deployed or resolved."""
    action = db.query(EnforcementAction).filter(EnforcementAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    valid_statuses = ["open", "deployed", "resolved"]
    if update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid_statuses}")
    
    action.status = update.status
    if update.status == "deployed":
        action.acknowledged_at = datetime.utcnow()
    elif update.status == "resolved":
        action.resolved_at = datetime.utcnow()
        if not action.acknowledged_at:
            action.acknowledged_at = datetime.utcnow() # safe fallback
    
    db.commit()
    db.refresh(action)
    return {"id": action.id, "status": action.status, "updated": True}


@router.post("/enforcement/{action_id}/broadcast")
def broadcast_alerts(
    action_id: int,
    db: Session = Depends(get_db),
    x_admin_key: str | None = Header(None, alias="X-Admin-Key"),
):
    """Broadcast localized alerts to residents in the ward. Simulates and sends IVR / WhatsApp / SMS alerts."""
    settings = get_settings()
    if x_admin_key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid X-Admin-Key")
    import random
    import requests
    from app.config import get_settings
    
    settings = get_settings()
    action = db.query(EnforcementAction).filter(EnforcementAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Broadcast alerts to random count of residents (e.g. 120 to 240)
    action.alerts_sent = random.randint(120, 240)
    action.alerts_confirmed = 0
    action.status = "deployed"
    
    # Attempt real Twilio SMS if credentials are configured
    twilio_status = "simulated"
    if (settings.twilio_account_sid and settings.twilio_auth_token and 
            settings.twilio_from_number and settings.twilio_to_number):
        try:
            from app.models import Ward
            from app.services.attributor import get_current_aqi_for_ward
            ward = db.query(Ward).filter(Ward.id == action.ward_id).first()
            aqi_val = get_current_aqi_for_ward(ward, db) if ward else "N/A"
            
            message_body = (
                f"KMC Alert: Ward {ward.ward_no if ward else '?' } ({ward.name if ward else '?'}) "
                f"AQI is severe ({round(aqi_val) if isinstance(aqi_val, (int, float)) else aqi_val}). "
                f"Enforcement action '{action.target_type}' deployed. Citizens advised to wear masks and limit outdoor activities."
            )
            
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
            auth = (settings.twilio_account_sid, settings.twilio_auth_token)
            data = {
                "From": settings.twilio_from_number,
                "To": settings.twilio_to_number,
                "Body": message_body
            }
            res = requests.post(url, auth=auth, data=data, timeout=10)
            if res.status_code == 201:
                twilio_status = f"sent_sms_sid_{res.json().get('sid')}"
                logger.info(f"Twilio alert sent successfully: {twilio_status}")
            else:
                twilio_status = f"failed_http_{res.status_code}"
                logger.warning(f"Twilio API failed with status {res.status_code}: {res.text}")
        except Exception as e:
            twilio_status = f"error_{str(e)}"
            logger.error(f"Error invoking Twilio alert gateway: {e}")

    db.commit()
    db.refresh(action)
    return {
        "id": action.id,
        "status": action.status,
        "alerts_sent": action.alerts_sent,
        "alerts_confirmed": action.alerts_confirmed,
        "twilio_status": twilio_status,
        "updated": True
    }


@router.post("/enforcement/{action_id}/alert/confirm")
def confirm_alert_receipt(
    action_id: int,
    db: Session = Depends(get_db),
    x_admin_key: str | None = Header(None, alias="X-Admin-Key"),
):
    """Simulate a citizen confirming receipt of alert via WhatsApp or IVR response."""
    settings = get_settings()
    if x_admin_key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid X-Admin-Key")
    action = db.query(EnforcementAction).filter(EnforcementAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
        
    if not action.alerts_sent:
        action.alerts_sent = 150  # fallback baseline
        
    # Increment alert confirmed by a random amount
    import random
    increment = random.randint(8, 18)
    action.alerts_confirmed = min(action.alerts_sent, (action.alerts_confirmed or 0) + increment)
    db.commit()
    db.refresh(action)
    return {
        "id": action.id,
        "alerts_sent": action.alerts_sent,
        "alerts_confirmed": action.alerts_confirmed,
        "ratio": round(action.alerts_confirmed / action.alerts_sent, 2) if action.alerts_sent else 0
    }


@router.get("/enforcement/stats", response_model=EnforcementStats)
def get_enforcement_stats(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Get enforcement action counts by status."""
    from sqlalchemy import func
    
    counts = {}
    for status in ["open", "deployed", "resolved"]:
        count = db.query(EnforcementAction).filter(
            EnforcementAction.city == city,
            EnforcementAction.status == status,
        ).count()
        counts[status] = count
    
    return EnforcementStats(
        open=counts["open"],
        deployed=counts["deployed"],
        resolved=counts["resolved"],
        total=sum(counts.values()),
    )


@router.post("/enforcement/recompute", status_code=202)
def recompute_queue(
    background_tasks: BackgroundTasks,
    city: str = Query("Kolkata"),
    db: Session = Depends(get_db),
    x_admin_key: str | None = Header(None, alias="X-Admin-Key"),
):
    settings = get_settings()
    if x_admin_key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid X-Admin-Key")
    """
    Trigger an async recompute of the enforcement priority queue for all wards.
    Returns 202 Accepted immediately; computation runs in the background.
    """
    from app.services.enforcement_scorer import recompute_enforcement_queue

    def _run(city: str):
        from app.database import SessionLocal
        bg_db = SessionLocal()
        try:
            recompute_enforcement_queue(city, bg_db)
        finally:
            bg_db.close()

    background_tasks.add_task(_run, city)
    return {
        "status": "accepted",
        "city": city,
        "message": f"Recompute started for {city} wards. Check /api/enforcement/stats for progress.",
    }
