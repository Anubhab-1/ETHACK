from __future__ import annotations
"""
AETHER — Hierarchical Multi-Agent Intelligence Engine v2.0
National Upgrade: 5 specialist agents with real tool use + constitutional deliberation.

Architecture:
  - 5 specialist agents, each with access to specific tools
  - ReAct loop: Thought → Tool Call → Observation → Reasoning
  - Constitutional framework: 5 principles checked before decree
  - Coordinator synthesizes all agent outputs into final decree
  - Causal impact analysis integrated into decree
  - Knowledge graph queried for institutional memory

Constitutional Principles (enforced before every decree):
  1. HEALTH FIRST: Vulnerable populations are protected above economic interests
  2. EVIDENCE REQUIRED: Every recommendation must cite specific data
  3. COST-EFFECTIVENESS: Maximize AQI reduction per rupee of cost
  4. LEGAL DEFENSIBILITY: Enforcement actions cite specific legal provisions
  5. PRECEDENT: Past interventions and their measured outcomes are considered
"""
import logging
import json
from typing import List, Dict, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Ward, Weather
from app.config import get_settings
from app.services.agent_tools import invoke_tool, TOOL_REGISTRY
from app.services.causal_impact import compute_causal_impact, get_intervention_history_for_ward
from app.services.knowledge_graph import get_knowledge_graph
from app.services.attributor import get_current_aqi_for_ward
from app.api.forecast import find_nearest_ward
import math
from datetime import datetime

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()


from app.schemas import AgentSimulationResponse
from app.services.agent_committee import (
    run_agent_react_loop,
    run_constitutional_checks,
    synthesize_decree,
    AGENT_CONFIGS
)


# ─── Main Endpoint ────────────────────────────────────────────────────────────

@router.post("/agents/simulation", response_model=AgentSimulationResponse)
def run_agent_consensus(
    ward_id: int = Query(..., description="ID of the target ward"),
    custom_objective: Optional[str] = Query(None, description="Custom policy objective to debate"),
    db: Session = Depends(get_db),
):
    """
    Run the 5-agent constitutional intelligence engine.
    Each agent uses real tools, reasons about evidence, then the Coordinator
    synthesizes a legally-defensible enforcement decree with causal proof.
    """
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    aqi = get_current_aqi_for_ward(ward, db)
    weather = (
        db.query(Weather)
        .filter(Weather.city == ward.city)
        .order_by(Weather.recorded_at.desc())
        .first()
    )

    # Seed the knowledge graph with this ward's data
    kg = get_knowledge_graph()
    if not kg._seeded:
        kg.seed(db=db, city=ward.city)

    # — Run all 5 agent ReAct loops —
    agent_turns: List[AgentTurn] = []
    for config in AGENT_CONFIGS:
        turn = run_agent_react_loop(config, ward, aqi, weather, custom_objective, db)
        agent_turns.append(turn)

    # — Count tool calls made across all agents —
    total_tool_calls = sum(len(t.tool_calls) for t in agent_turns)

    # — Run Constitutional Checks —
    check_metadata = {
        "vulnerable_pop": ward.school_count + ward.hospital_count,
        "health_included": any("Health" in t.agent for t in agent_turns),
        "tool_calls_made": total_tool_calls,
        "economic_impact_estimated": any(
            tc.result and "health_cost_saved" in str(tc.result)
            for t in agent_turns
            for tc in t.tool_calls
        ),
        "legal_basis_cited": any(
            tc.result and "Air Act" in str(tc.result)
            for t in agent_turns
            for tc in t.tool_calls
        ),
        "historical_evidence": any(
            tc.tool_name == "get_historical_outcomes"
            for t in agent_turns
            for tc in t.tool_calls
        ),
    }
    constitutional_checks = run_constitutional_checks(check_metadata)

    # — Compute Causal Impact (for the recommended primary intervention) —
    causal_evidence = None
    try:
        primary_action = _get_recommended_action("Enforcement Logistics", ward)
        causal_result = compute_causal_impact(
            ward_id=ward_id,
            intervention_type=primary_action,
            db=db,
            pre_days=21,
            post_days=10,
        )
        if "causal_estimate" in causal_result:
            ce = causal_result["causal_estimate"]
            hi = causal_result.get("health_impact", {})
            causal_evidence = CausalEvidence(
                intervention_type=primary_action,
                ate_ugm3=ce["average_treatment_effect_ugm3"],
                ci_lower=ce["confidence_interval_95"][0],
                ci_upper=ce["confidence_interval_95"][1],
                p_value=ce["p_value"],
                is_significant=ce["statistically_significant"],
                health_savings_lakhs=hi.get("economic_value_saved_lakhs_inr", 0.0),
            )
    except Exception as e:
        logger.warning(f"Causal impact computation failed: {e}")

    # — Synthesize Decree —
    decree = synthesize_decree(
        ward=ward,
        aqi=aqi,
        agent_turns=agent_turns,
        constitutional_checks=constitutional_checks,
        causal_evidence=causal_evidence,
        custom_objective=custom_objective,
        weather=weather,
    )

    # — Legacy dialogue compatibility —
    dialogue = [
        {
            "agent": t.agent,
            "message": t.recommendation,
            "avatar": t.avatar,
        }
        for t in agent_turns
    ]

    return AgentSimulationResponse(
        ward_id=ward.id,
        ward_name=ward.name,
        city=ward.city,
        current_aqi=aqi,
        agent_turns=agent_turns,
        constitutional_checks=constitutional_checks,
        causal_evidence=causal_evidence,
        decree=decree,
        dialogue=dialogue,
    )


@router.get("/agents/knowledge-graph")
def get_ward_knowledge_graph(
    ward_id: int = Query(..., description="Ward ID"),
    db: Session = Depends(get_db),
):
    """Return the industry-ward-violation knowledge graph for a specific ward."""
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    kg = get_knowledge_graph()
    if not kg._seeded:
        kg.seed(db=db, city=ward.city)

    return kg.get_industry_risk_graph(ward_id)


@router.get("/agents/pagerank-polluters")
def get_top_polluters_pagerank(
    city: str = Query("Kolkata"),
    db: Session = Depends(get_db),
):
    """Return top polluters ranked by PageRank influence score."""
    kg = get_knowledge_graph()
    if not kg._seeded:
        kg.seed(db=db, city=city)

    return {
        "city": city,
        "top_polluters": kg.get_pagerank_polluters(city),
        "graph_stats": kg.get_graph_stats(),
    }


@router.get("/agents/causal-impact")
def get_causal_impact(
    ward_id: int = Query(...),
    intervention_type: str = Query("combined_emergency"),
    pre_days: int = Query(30, ge=7, le=90),
    post_days: int = Query(14, ge=3, le=30),
    db: Session = Depends(get_db),
):
    """Compute causal impact of an intervention using synthetic control methodology."""
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    return compute_causal_impact(
        ward_id=ward_id,
        intervention_type=intervention_type,
        db=db,
        pre_days=pre_days,
        post_days=post_days,
    )


@router.post("/agents/tools/invoke")
def invoke_agent_tool(
    tool_name: str = Query(..., description="Tool name to invoke"),
    ward_id: int = Query(..., description="Target ward ID"),
    action_type: Optional[str] = Query(None, description="Action type (for simulate_intervention)"),
    industry_id: Optional[str] = Query(None, description="Industry ID (for show-cause)"),
    violation_type: Optional[str] = Query(None, description="Violation type (for show-cause)"),
    db: Session = Depends(get_db),
):
    """Directly invoke any agent tool — useful for debugging and frontend exploration."""
    params = {"ward_id": ward_id}
    if action_type:
        params["action_type"] = action_type
    if industry_id:
        params["industry_id"] = industry_id
    if violation_type:
        params["violation_type"] = violation_type

    if tool_name not in TOOL_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}. Available: {list(TOOL_REGISTRY.keys())}")

    return invoke_tool(tool_name, params, db)
