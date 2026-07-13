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


from app.schemas import AgentSimulationResponse, AgentTurn, CausalEvidence
from app.services.agent_committee import (
    run_agent_react_loop,
    run_constitutional_checks,
    synthesize_decree,
    AGENT_CONFIGS,
    _get_recommended_action
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


class VoiceCommandRequest(BaseModel):
    command: str
    city: str
    wards: List[str]


@router.post("/agents/voice-command")
def process_voice_command(
    req: VoiceCommandRequest,
    db: Session = Depends(get_db),
):
    """Parse natural language command using LLM or rule fallback."""
    settings = get_settings()
    command_text = req.command
    city_context = req.city
    wards_list = req.wards
    
    # ─── Fallback Local Rules Parser ───
    def local_fallback():
        text = command_text.lower()
        res = {
            "action": "unrecognized",
            "parameters": {},
            "speech_response": "Command not understood."
        }
        
        # City switch
        for c in ["delhi", "mumbai", "kolkata"]:
            if c in text:
                res["action"] = "change_city"
                res["parameters"]["city"] = c.capitalize()
                res["speech_response"] = f"Switching view to {c.capitalize()}."
                return res
                
        # Toggle layers
        if "wind" in text:
            res["action"] = "toggle_layer"
            res["parameters"]["layer"] = "wind"
            res["parameters"]["layer_state"] = None
            res["speech_response"] = "Toggling wind flow layer."
            return res
        if "satellite" in text or "no2" in text:
            res["action"] = "toggle_layer"
            res["parameters"]["layer"] = "satellite"
            res["parameters"]["layer_state"] = None
            res["speech_response"] = "Toggling Sentinel-5P NO2 overlay."
            return res
        if "report" in text:
            res["action"] = "toggle_layer"
            res["parameters"]["layer"] = "citizen_reports"
            res["parameters"]["layer_state"] = None
            res["speech_response"] = "Toggling citizen incident feed."
            return res
            
        # Action triggers
        if "committee" in text or "simulation" in text or "run" in text or "convene" in text:
            res["action"] = "run_simulation"
            res["speech_response"] = "Convening constitutional chamber deliberation."
            return res
        if "briefing" in text:
            res["action"] = "change_simulation_parameter"
            res["parameters"]["briefing"] = True
            res["speech_response"] = "Synthesizing executive briefing."
            return res
            
        # Focus ward
        for w in wards_list:
            if w.lower() in text:
                res["action"] = "focus_ward"
                res["parameters"]["ward_name"] = w
                res["speech_response"] = f"Centering map on {w} ward."
                return res
                
        return res

    # Check for LLM key
    if not settings.openai_api_key:
        logger.info("No LLM key — using local rules fallback for voice routing")
        return local_fallback()
        
    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base or None,
            timeout=5.0,
            max_retries=0
        )
        
        system_prompt = f"""You are AETHER Jarvis, a smart city voice interface router.
Given a spoken command, the current city, and a list of available wards in that city, map the user's intent to one of the structured actions.

Available Wards in {city_context}: {", ".join(wards_list)}
Current City Context: {city_context}

You MUST return a JSON object with the following schema:
{{
  "action": "change_city" | "toggle_layer" | "focus_ward" | "run_simulation" | "change_simulation_parameter" | "unrecognized",
  "parameters": {{
    "city": "Kolkata" | "Delhi" | "Mumbai" (if user wants to change city),
    "ward_name": string (exact match from available wards list if user wants to select/focus a ward),
    "layer": "wind" | "satellite" | "citizen_reports" (if action is toggle_layer),
    "layer_state": true | false (true to enable/show, false to disable/hide, or null if toggling),
    "traffic_reduction": int 0-100 (if user says reduce traffic by X percent),
    "construction_halt": bool (if user says halt/stop construction),
    "industrial_restriction": int 0-100 (if user says restrict industrial emissions by X percent),
    "briefing": bool (if user requested reading/playing briefing)
  }},
  "speech_response": "A short verbal confirmation to speak back to the user in a professional, helpful computer tone."
}}

Response must contain ONLY the valid JSON, no markdown code block tags, no comments.
"""

        resp = client.chat.completions.create(
            model=settings.llm_model or "meta/llama-3.1-70b-instruct",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Spoken command: '{command_text}'"}
            ],
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        
        content = resp.choices[0].message.content.strip()
        parsed = json.loads(content)
        logger.info(f"Jarvis LLM match: {parsed}")
        return parsed
        
    except Exception as e:
        logger.warning(f"Voice LLM match failed: {e}. Falling back to local rules.")
        return local_fallback()
