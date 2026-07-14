"""
AETHER — PMF & Real-time Emission Inventory Fusion API Router
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Ward
from app.services.attribution_advanced import (
    PMFSourceApportionment,
    ensemble_attribution,
    fetch_speciation_data_db,
    get_realtime_emission_inventory,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attribution-advanced", tags=["attribution"])

@router.get("/{ward_id}")
async def get_advanced_attribution(ward_id: str, db: Session = Depends(get_db)):
    """
    Return advanced source apportionment with PMF + real-time emission inventory fusion.
    """
    # 1. Load ward
    try:
        w_id = int(ward_id)
        ward = db.query(Ward).filter(Ward.id == w_id).first()
    except ValueError:
        ward = db.query(Ward).filter(Ward.name.like(f"%{ward_id}%")).first()

    if not ward:
        raise HTTPException(status_code=404, detail=f"Ward '{ward_id}' not found")

    # 2. Fetch speciation data
    speciation = fetch_speciation_data_db(ward, db)

    if not speciation.empty and len(speciation) >= 15:
        try:
            pmf = PMFSourceApportionment(n_sources=6)
            pmf.fit(speciation, n_bootstrap=30)
            pmf_result = pmf.get_latest_contributions(list(speciation.columns))
        except Exception as e:
            logger.warning(f"PMF analysis failed: {e}. Falling back to default inventory.")
            pmf_result = {
                'contributions': [],
                'note': f'PMF analysis error: {e}',
                'confidence_level': None
            }
    else:
        # Fallback: empty contributions
        pmf_result = {
            'contributions': [],
            'note': 'Insufficient speciation data history to run PMF (need 15+ readings). Using real-time inventory fallback.',
            'confidence_level': None
        }

    # 3. Fetch real-time emission inventory
    inventory = get_realtime_emission_inventory(ward)

    # 4. Ensemble PMF & inventory
    final_breakdown = ensemble_attribution(pmf_result, inventory)

    # Sort contributions by percentage descending
    sorted_contribs = sorted(
        final_breakdown['contributions'],
        key=lambda x: x['contribution_percent'],
        reverse=True
    )

    return {
        "ward_id": ward.id,
        "ward_name": ward.name,
        "pmf_analysis": pmf_result,
        "realtime_inventory": inventory,
        "ensemble_breakdown": {
            "contributions": sorted_contribs,
            "summary": final_breakdown['summary']
        },
        "top_sources": sorted_contribs[:3],
        "methodology": "PMF (chemical fingerprinting) + Real-time inventory fusion + Bayesian ensemble"
    }
