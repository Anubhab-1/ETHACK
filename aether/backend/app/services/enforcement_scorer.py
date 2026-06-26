from __future__ import annotations
"""
AETHER — Enforcement Priority Scoring Engine
Ranks wards by intervention priority based on severity, exposure,
actionability, and trend. Outputs a ranked list for inspectors.
"""
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import Ward, EnforcementAction, Attribution, Forecast
from app.services.attributor import get_current_aqi_for_ward, run_attribution_for_ward

logger = logging.getLogger(__name__)

# Actionability scores by source type
ACTIONABILITY = {
    "construction": 0.9,   # Can halt work immediately
    "industrial": 0.7,     # Can inspect, reduce load
    "traffic": 0.6,        # Can divert, enforce odd-even
    "biomass": 0.3,        # Hard to control quickly
    "residential": 0.2,    # Very hard to control
}

ACTION_TEMPLATES = {
    "construction": (
        "Deploy inspection team to {ward_name} — {n_sites} active construction site(s) identified. "
        "Issue stop-work order for dust suppression non-compliance. "
        "Require water spraying and net covering of all active excavations."
    ),
    "industrial": (
        "Dispatch WBPCB inspection to industrial units in {ward_name}. "
        "Verify stack emission limits per CPCB notification. "
        "Check for proper scrubber operation and stack height compliance."
    ),
    "traffic": (
        "Coordinate with Kolkata Police traffic division for {ward_name}. "
        "Implement temporary odd-even vehicle restrictions or signal timing optimization. "
        "Deploy traffic constables at key choke points."
    ),
    "biomass": (
        "Issue advisory to {ward_name} residents against open burning. "
        "Coordinate with waste management for debris clearance. "
        "Monitor for illegal biomass burning and issue penalty notices."
    ),
    "residential": (
        "Conduct awareness campaign in {ward_name} on clean cooking fuels. "
        "Survey LPG connection coverage and coordinate with OMCs for gap filling. "
        "Check waste burning incidents with KMC ward officer."
    ),
}


def compute_priority(
    ward: Ward,
    current_aqi: float,
    forecast_24h: float,
    attribution: dict,
) -> float:
    """
    Compute enforcement priority score (0–100).
    
    Formula:
        priority = severity (35%) + exposure (25%) + actionability (20%) + trend (20%)
    """
    # Severity: how bad is it now + forecast
    severity = (current_aqi * 0.3) + (forecast_24h * 0.4)

    # Exposure: population + vulnerable facilities
    population_score = (ward.population or 100000) / 100000
    exposure = (
        population_score * 0.15 +
        min(ward.school_count * 2, 20) * 0.05 +
        min(ward.hospital_count * 3, 15) * 0.05
    )

    # Actionability
    primary_source = attribution.get("primary_source", "traffic")
    actionability = ACTIONABILITY.get(primary_source, 0.5)

    # Trend: is it getting worse?
    trend = 1.0 if forecast_24h > current_aqi else 0.7

    priority = (
        severity * 0.35 +
        exposure * 0.25 +
        actionability * 20 * 0.20 +
        trend * 10 * 0.20
    )
    return round(min(priority, 100), 1)


def generate_action_text(ward: Ward, attribution: dict) -> str:
    """Generate a specific, actionable enforcement recommendation."""
    primary = attribution.get("primary_source", "traffic")
    template = ACTION_TEMPLATES.get(primary, ACTION_TEMPLATES["traffic"])
    return template.format(
        ward_name=f"Ward {ward.ward_no} ({ward.name})",
        n_sites=max(ward.construction_count, 1),
    )


def recompute_enforcement_queue(city: str, db: Session, limit: int = 20):
    """Recompute enforcement priority for all wards in a city."""
    wards = db.query(Ward).filter(Ward.city == city).all()
    logger.info(f"Recomputing enforcement queue for {len(wards)} wards in {city}")
    
    created = 0
    for ward in wards:
        try:
            current_aqi = get_current_aqi_for_ward(ward, db)
            if current_aqi < 50:
                continue  # Skip wards with good air quality

            # Get latest attribution (or compute fresh)
            attribution_rec = db.query(Attribution).filter(
                Attribution.ward_id == ward.id
            ).order_by(Attribution.computed_at.desc()).first()
            
            if not attribution_rec:
                attr_result = run_attribution_for_ward(ward, db)
            else:
                attr_result = {
                    "primary_source": attribution_rec.primary_source,
                    "breakdown": {
                        "traffic": attribution_rec.traffic_pct,
                        "industrial": attribution_rec.industrial_pct,
                        "construction": attribution_rec.construction_pct,
                        "biomass": attribution_rec.biomass_pct,
                        "residential": attribution_rec.residential_pct,
                    },
                }

            # Get 24h forecast
            forecast_rec = db.query(Forecast).filter(
                Forecast.ward_id == ward.id,
                Forecast.horizon_hours == 24,
            ).order_by(Forecast.generated_at.desc()).first()
            forecast_24h = forecast_rec.predicted_aqi if forecast_rec else current_aqi * 1.1

            priority = compute_priority(ward, current_aqi, forecast_24h, attr_result)
            action_text = generate_action_text(ward, attr_result)

            # Only create if no open action exists for this ward
            existing = db.query(EnforcementAction).filter(
                EnforcementAction.ward_id == ward.id,
                EnforcementAction.status == "open",
            ).first()

            if not existing:
                action = EnforcementAction(
                    ward_id=ward.id,
                    city=city,
                    priority_score=priority,
                    action_text=action_text,
                    target_type=attr_result["primary_source"],
                    status="open",
                )
                db.add(action)
                created += 1
            else:
                # Update priority score
                existing.priority_score = priority
                existing.action_text = action_text

        except Exception as e:
            logger.warning(f"Error processing ward {ward.id}: {e}")
            continue

    db.commit()
    logger.info(f"Enforcement queue updated: {created} new actions created")
    return created
