"""
AETHER — Proactive Enforcement & Risk Scoring API Router
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Ward
from app.services.risk_scoring import (
    PredictiveRiskScorer,
    generate_mock_sources_data,
    generate_source_features,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/enforcement-advanced", tags=["enforcement"])

risk_scorer = PredictiveRiskScorer()


@router.get("/risk-score/{source_id}")
async def get_risk_score(source_id: str, db: Session = Depends(get_db)):
    """
    Get predictive risk score for an emission source.
    """
    # Fetch source features from database (simulated based on source_id)
    features = generate_source_features(source_id, db)

    # Get prediction
    result = risk_scorer.predict(features)

    return {"source_id": source_id, **result, "timestamp": datetime.now().isoformat()}


@router.get("/priority-list/{ward_id}")
async def get_priority_list(
    ward_id: str, top_k: int = 10, db: Session = Depends(get_db)
):
    """
    Get top-K highest risk sources in a ward for proactive inspection.
    """
    # 1. Load ward
    try:
        w_id = int(ward_id)
        ward = db.query(Ward).filter(Ward.id == w_id).first()
    except ValueError:
        ward = db.query(Ward).filter(Ward.name.like(f"%{ward_id}%")).first()

    if not ward:
        raise HTTPException(status_code=404, detail=f"Ward '{ward_id}' not found")

    # 2. Get sources in ward
    sources = generate_mock_sources_data(ward.id)

    # 3. Score each source
    scored_sources = []
    for source in sources:
        features = generate_source_features(source["id"], db)
        risk = risk_scorer.predict(features)
        scored_sources.append({**source, **risk})

    # Sort by risk score descending
    scored_sources.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "ward_id": ward.id,
        "ward_name": ward.name,
        "total_sources": len(sources),
        "priority_inspections": scored_sources[:top_k],
        "critical_count": sum(
            1 for s in scored_sources if s["risk_tier"] == "CRITICAL"
        ),
        "high_count": sum(1 for s in scored_sources if s["risk_tier"] == "HIGH"),
        "generated_at": datetime.now().isoformat(),
    }
