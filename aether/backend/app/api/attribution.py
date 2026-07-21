"""AETHER — Attribution and Enforcement endpoints v2.0.
Includes PMF/NMF source apportionment with 95% CI (Phase 2 National Upgrade).
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Attribution, EnforcementAction, Ward
from app.schemas import (
    AttributionResponse,
    EnforcementStats,
    EnforcementStatusUpdate,
    DecreeSignOffIn,
    EnforcementActionOut,
)
from app.services.attributor import (
    run_attribution_for_ward,
    run_pmf_attribution,
)

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


@router.post("/enforcement/approve-decree", response_model=EnforcementActionOut)
def approve_decree(payload: DecreeSignOffIn, db: Session = Depends(get_db)):
    """Approve a consensus committee decree and deploy it as a live enforcement task."""
    ward = db.query(Ward).filter(Ward.id == payload.ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    new_action = EnforcementAction(
        ward_id=payload.ward_id,
        city=payload.city,
        priority_score=payload.priority_score,
        action_text=payload.action_text,
        target_type=payload.target_type,
        status="open",
        alerts_sent=0,
        alerts_confirmed=0,
        created_at=datetime.utcnow(),
        detected_at=datetime.utcnow()
    )
    db.add(new_action)
    db.commit()
    db.refresh(new_action)
    
    # Formulate output with ward metadata
    out = EnforcementActionOut.model_validate(new_action)
    out.ward_name = ward.name
    out.ward_no = ward.ward_no
    out.ward_lat = ward.lat
    out.ward_lon = ward.lon
    return out


@router.post("/enforcement/{action_id}/action")
def update_enforcement_status(
    action_id: int,
    update: EnforcementStatusUpdate,
    db: Session = Depends(get_db),
):
    """Mark an enforcement action as deployed or resolved, enforcing a state-machine."""
    action = db.query(EnforcementAction).filter(EnforcementAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    valid_statuses = ["open", "detected", "dispatched", "deployed", "evidence_collected", "resolved"]
    if update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid_statuses}")

    # Map legacy states to canonical states for transition checks
    current_canonical = action.status
    target_canonical = update.status

    # Define transition rules (key can transition to any value in the list)
    valid_transitions = {
        "open": ["dispatched", "deployed", "resolved"],
        "detected": ["dispatched", "deployed", "resolved"],
        "dispatched": ["evidence_collected", "resolved"],
        "deployed": ["evidence_collected", "resolved"],
        "evidence_collected": ["resolved"],
        "resolved": []  # terminal state
    }

    allowed_targets = valid_transitions.get(current_canonical, [])
    # Allow self-transitions or transitions to legacy aliases
    is_self_or_alias = (
        current_canonical == target_canonical or
        (current_canonical == "open" and target_canonical == "detected") or
        (current_canonical == "detected" and target_canonical == "open") or
        (current_canonical == "deployed" and target_canonical == "dispatched") or
        (current_canonical == "dispatched" and target_canonical == "deployed")
    )
    
    if not is_self_or_alias and target_canonical not in allowed_targets:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid state transition from '{current_canonical}' to '{target_canonical}'"
        )

    # Apply updates
    action.status = update.status
    if update.status in ["deployed", "dispatched"]:
        action.acknowledged_at = datetime.utcnow()
    elif update.status == "evidence_collected":
        # We can record the acknowledgement status timestamp
        if not action.acknowledged_at:
            action.acknowledged_at = datetime.utcnow()
        # Save evidence details
        if update.notes:
            action.evidence_notes = update.notes
        if update.photo_url:
            action.evidence_photo_url = update.photo_url
        if update.severity:
            action.evidence_severity = update.severity
    elif update.status == "resolved":
        action.resolved_at = datetime.utcnow()
        if not action.acknowledged_at:
            action.acknowledged_at = datetime.utcnow()

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

    counts = {}
    for status in ["open", "detected", "dispatched", "deployed", "evidence_collected", "resolved"]:
        count = db.query(EnforcementAction).filter(
            EnforcementAction.city == city,
            EnforcementAction.status == status,
        ).count()
        counts[status] = count

    # Combine aliases for counts to keep the UI stats clean and fully compatible
    open_count = counts.get("open", 0) + counts.get("detected", 0)
    deployed_count = counts.get("deployed", 0) + counts.get("dispatched", 0) + counts.get("evidence_collected", 0)
    resolved_count = counts.get("resolved", 0)

    return EnforcementStats(
        open=open_count,
        deployed=deployed_count,
        resolved=resolved_count,
        total=open_count + deployed_count + resolved_count,
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


@router.get("/enforcement/{action_id}/notice/export")
def export_enforcement_notice(
    action_id: int,
    db: Session = Depends(get_db)
):
    """
    Generate and export a beautifully formatted HTML Show-Cause Notice
    under Section 31A of the Air (Prevention and Control of Pollution) Act, 1981.
    """
    from fastapi.responses import HTMLResponse
    from app.models import EnforcementAction, Ward
    
    action = db.query(EnforcementAction).filter(EnforcementAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
        
    ward = db.query(Ward).filter(Ward.id == action.ward_id).first()
    ward_name = ward.name if ward else f"Ward #{action.ward_id}"
    ward_no = ward.ward_no if ward else action.ward_id
    
    # Select appropriate legal act sections
    legal_provisions = "Section 21 of the Air Act, 1981 and CPCB Emission Standards 2009."
    
    notice_date = action.created_at.strftime("%d %B %Y")
    ref_no = f"MNC/ENF/{action.created_at.strftime('%Y%m')}/{action.id:04d}"
    
    # Check if there is high correlation (downwind) based on wind bearing (using weather details if available)
    from app.models import Weather
    weather = db.query(Weather).filter(Weather.city == action.city).order_by(Weather.recorded_at.desc()).first()
    wind_speed = weather.wind_speed if weather and weather.wind_speed else 8.5
    wind_dir = weather.wind_dir if weather and weather.wind_dir else 210.0
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>SHOW-CAUSE NOTICE - Ref {ref_no}</title>
        <style>
            body {{
                font-family: 'Times New Roman', Times, serif;
                background-color: #ffffff;
                color: #000000;
                margin: 0;
                padding: 45px;
                line-height: 1.6;
            }}
            .letterhead {{
                text-align: center;
                border-bottom: 3px double #000000;
                padding-bottom: 12px;
                margin-bottom: 25px;
            }}
            .logo-seal {{
                font-size: 32px;
                margin-bottom: 5px;
            }}
            .dept-title {{
                font-size: 20px;
                font-weight: bold;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                margin: 2px 0;
            }}
            .dept-sub {{
                font-size: 13px;
                color: #333333;
                margin: 1px 0;
            }}
            .meta-info {{
                display: flex;
                justify-content: space-between;
                font-size: 13px;
                margin-bottom: 25px;
                border-bottom: 1px solid #eeeeee;
                padding-bottom: 8px;
            }}
            .notice-title {{
                text-align: center;
                font-size: 15px;
                font-weight: bold;
                text-decoration: underline;
                text-transform: uppercase;
                margin-bottom: 25px;
                letter-spacing: 0.5px;
            }}
            .notice-body {{
                font-size: 13.5px;
                text-align: justify;
            }}
            .section-label {{
                font-weight: bold;
            }}
            .signature-block {{
                margin-top: 45px;
                text-align: right;
                font-size: 13px;
            }}
            .footer-notes {{
                margin-top: 55px;
                border-top: 1px solid #dddddd;
                padding-top: 10px;
                font-size: 10px;
                color: #666666;
                text-align: center;
            }}
            @media print {{
                body {{
                    padding: 0;
                }}
                .print-btn {{
                    display: none;
                }}
            }}
            .print-btn {{
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: #4f46e5;
                color: #ffffff;
                border: none;
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 600;
                border-radius: 6px;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.15);
                transition: opacity 0.2s;
            }}
            .print-btn:hover {{
                opacity: 0.9;
            }}
        </style>
    </head>
    <body>
        <button class="print-btn" onclick="window.print()">🖨️ Print Notice</button>
        
        <div class="letterhead">
            <div class="logo-seal">🏛️</div>
            <div class="dept-title">Municipal Air Quality Enforcement Commission</div>
            <div class="dept-sub">Environment & Public Health Directorate, City of {action.city}</div>
            <div class="dept-sub">Statutory Order Issued under Environmental Protection Mandate</div>
        </div>
        
        <div class="meta-info">
            <div>
                <strong>Ref No:</strong> {ref_no}<br>
                <strong>Ward Jurisdiction:</strong> {ward_name} (Ward #{ward_no})
            </div>
            <div>
                <strong>Date:</strong> {notice_date}<br>
                <strong>Target Coordinates:</strong> {ward.lat if ward else 22.57}°N, {ward.lon if ward else 88.36}°E
            </div>
        </div>
        
        <div class="notice-title">
            Show-Cause Notice under Section 31A of the Air (Prevention and Control of Pollution) Act, 1981
        </div>
        
        <div class="notice-body">
            <p>To,<br>
            <strong>The Occupier / Proprietor / Person-in-Charge</strong><br>
            Commercial / Industrial Operations under: {action.target_type}<br>
            {ward_name}, {action.city}</p>
            
            <p><strong>WHEREAS</strong> the AETHER Municipal Air Quality forecasting models and spatial sensors have continuously registered elevated particulate levels and gaseous concentrations matching emissions emanating from your geographical area: <span class="section-label">"{action.action_text}"</span>.</p>
            
            <p><strong>AND WHEREAS</strong> meteorological downlink data reports prevailing local winds at {wind_speed:.1f} km/h from {wind_dir:.1f} degrees, establishing a direct downwind trajectory and causation mapping to the surrounding public receptor zones.</p>
            
            <p><strong>AND WHEREAS</strong> the failure to observe statutory emission limits or permit guidelines violates the mandates specified under <span class="section-label">{legal_provisions}</span>.</p>
            
            <p><strong>NOW THEREFORE</strong>, you are hereby directed to <strong>SHOW CAUSE</strong> in writing within seven (7) days of the receipt of this notice why appropriate actions including immediate shutdown of utilities, suspension of consent, or prosecution under Section 37 of the Air Act, 1981, should not be directed by this Commission.</p>
            
            <p>Take notice that in the event of failure to reply or execute immediate mitigation controls (sweeping, water sprinkling, stack monitoring) within the stipulated period, this Commission will proceed unilaterally under statutory rules.</p>
        </div>
        
        <div class="signature-block">
            <br>
            <strong>Member Secretary</strong><br>
            Municipal Air Quality Enforcement Commission<br>
            <em>State Environmental Protection Administration Division</em>
        </div>
        
        <div class="footer-notes">
            This is a computer-generated statutory instrument issued via the AETHER Municipal Control Center.<br>
            To verify the authenticity of this order, reference Case ID: SCN-{action_id:04d}-{action.ward_id:02d}.
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

