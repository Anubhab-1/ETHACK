from __future__ import annotations
"""
AETHER — Multi-Agent Municipal Consensus Room Router
Runs simulated debates between municipal department leads to issue enforcement decrees.
"""
import logging
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Ward, Weather
from app.config import get_settings
from app.services.attributor import get_current_aqi_for_ward
from app.api.forecast import find_nearest_ward
import math
from datetime import datetime

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

class DialogueTurn(BaseModel):
    agent: str
    message: str
    avatar: str

class AgentSimulationResponse(BaseModel):
    ward_id: int
    ward_name: str
    city: str
    current_aqi: float
    dialogue: List[DialogueTurn]
    decree: str

# Local dynamic consensus generator for offline/fallback mode
def generate_offline_consensus(
    ward: Ward,
    aqi: float,
    weather: Optional[Weather],
    custom_objective: Optional[str] = None
) -> AgentSimulationResponse:
    wind_speed = weather.wind_speed if weather else 6.5
    wind_dir = weather.wind_dir if weather else 180.0
    
    # Analyze dominant issues
    has_schools = ward.school_count > 0
    has_hospitals = ward.hospital_count > 0
    is_industrial = ward.industrial_score > 40
    is_heavy_traffic = ward.road_density > 2.5
    
    dialogue = []
    
    # Dialogue Turn 1: Citizen Health Director
    if custom_objective:
        health_msg = (
            f"Commissioner, to address our priority to '{custom_objective}', we must act on the critical AQI of {round(aqi)} in {ward.name}. "
            f"With {ward.school_count} schools and {ward.hospital_count} hospitals, we cannot compromise on public health exposure."
        )
    else:
        health_msg = (
            f"Commissioner, Ward {ward.ward_no} ({ward.name}) is at a critical AQI of {round(aqi)}. "
        )
        if has_schools or has_hospitals:
            health_msg += f"We have {ward.school_count} schools and {ward.hospital_count} hospitals inside this hazard zone. "
            health_msg += "I request immediate suspension of outdoor activities and mask distribution protocols."
        else:
            health_msg += f"With a population density of {ward.population or 'dense'} residents, public health exposure is high. We need warning broadcasts immediately."
        
    dialogue.append(DialogueTurn(
        agent="Citizen Health Director",
        message=health_msg,
        avatar="👩‍⚕️"
    ))
    
    # Dialogue Turn 2: Traffic Control Chief
    if custom_objective:
        traffic_msg = (
            f"Regarding the directive '{custom_objective}', my team will implement vehicle diversions on high-density intersections. "
            f"This will lower local transport emissions immediately in alignment with the directive."
        )
    else:
        if is_heavy_traffic:
            traffic_msg = (
                f"The road density here is {ward.road_density:.1f} km/km², which is contributing heavily to emission buildup. "
                "I suggest immediate diversion of heavy vehicles and implementing odd-even lane restrictions around the central corridors."
            )
        else:
            traffic_msg = (
                "Traffic corridor density is moderate here, but secondary vehicle emissions are trapping. "
                "I recommend deploying traffic wardens to halt vehicle idling near sensitive intersections."
            )
        
    dialogue.append(DialogueTurn(
        agent="Traffic Control Chief",
        message=traffic_msg,
        avatar="👮"
    ))
    
    # Dialogue Turn 3: Industrial Compliance Lead
    if custom_objective:
        ind_msg = (
            f"To achieve '{custom_objective}', we are issuing strict caps on local industrial plants. "
            f"We will restrict construction sites (active count: {ward.construction_count}) and enforce 50% boiler emission cuts."
        )
    else:
        if is_industrial:
            ind_msg = (
                f"Industrial score is high at {ward.industrial_score:.1f}. Combined with a wind speed of {wind_speed} km/h "
                f"heading {wind_dir}°, emissions are spreading rapidly to downwind sectors. "
                "We must enforce a temporary 50% cap on boiler outputs in the industrial zone."
            )
        else:
            ind_msg = (
                "This ward has lower industrial counts, but upwind dispersion carries external plumes here. "
                f"I recommend audit checks on active construction sites (count: {ward.construction_count}) to enforce dust suppression."
            )
        
    dialogue.append(DialogueTurn(
        agent="Industrial Compliance Lead",
        message=ind_msg,
        avatar="🏭"
    ))
    
    # Dialogue Turn 4: Municipal Commissioner (Resolution)
    if custom_objective:
        comm_msg = (
            f"Thank you, directors. To successfully deliver on our mandate: '{custom_objective}', we will mobilize joint enforcement teams. "
            f"All municipal departments are instructed to execute the tactical order immediately."
        )
    else:
        comm_msg = (
            "Thank you, teams. The evidence is clear. We cannot allow this exposure to persist. "
            "We will execute a joint tactical directive immediately: restrict traffic, halt open construction, and notify local institutions."
        )
    dialogue.append(DialogueTurn(
        agent="Municipal Commissioner",
        message=comm_msg,
        avatar="👨‍💼"
    ))
    
    # Final Decree text
    decree_header = f"### 📜 MUNICIPAL TACTICAL ENFORCEMENT ORDER\n\n"
    if custom_objective:
        decree_header += f"**Tactical Agenda/Directive:** {custom_objective}  \n"
        
    decree = decree_header + f"""**Target Location:** {ward.name} (Ward #{ward.ward_no})  
**Current Air Quality:** AQI {round(aqi)} (Category: Health Hazard)  
**Meteorological Conditions:** Wind heading {wind_dir}° at {wind_speed} km/h  

By order of the Municipal Commission, the following interventions are enacted:
1. **Traffic Control:** Reroute commercial vehicles away from central ward junctions. Establish no-idling enforcement zones.
2. **Construction Controls:** Immediate 24-hour halt on active sites (Total sites: {ward.construction_count}) failing dust water-sprinkling rules.
3. **Health Advisory:** Dispatch localized SMS alert notifications to residents and coordinate safety briefs with the {ward.school_count} local schools.
"""
    return AgentSimulationResponse(
        ward_id=ward.id,
        ward_name=ward.name,
        city=ward.city,
        current_aqi=aqi,
        dialogue=dialogue,
        decree=decree
    )


@router.post("/agents/simulation", response_model=AgentSimulationResponse)
def run_agent_consensus(
    ward_id: int = Query(..., description="ID of the target ward"),
    custom_objective: Optional[str] = Query(None, description="Custom policy objective to debate"),
    db: Session = Depends(get_db)
):
    """Convenient multi-agent consensus debate using OpenAI, falling back to dynamic rules offline."""
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
        
    aqi = get_current_aqi_for_ward(ward, db)
    
    # Fetch latest weather
    weather = db.query(Weather).filter(Weather.city == ward.city).order_by(Weather.recorded_at.desc()).first()
    
    # Check if OpenAI is available
    if not settings.openai_api_key:
        logger.info("Using local heuristic agent generator (offline fallback).")
        return generate_offline_consensus(ward, aqi, weather, custom_objective)
        
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)
        
        wind_speed = weather.wind_speed if weather else 6.5
        wind_dir = weather.wind_dir if weather else 180.0
        
        system_prompt = f"""You are the AETHER Municipal Consensus Board.
You need to generate a simulated dialogue debate followed by a final Decree.
The debate is between 4 agents:
1. Citizen Health Director (avatar: 👩‍⚕️): Advocate for children, elderly, schools, and hospitals.
2. Traffic Control Chief (avatar: 👮): Advocate for vehicle bans, diversions, public transit.
3. Industrial Compliance Lead (avatar: 🏭): Advocate for factory shutdowns, water-sprinklers, dust limits.
4. Municipal Commissioner (avatar: 👨‍💼): Chairman who listens to all and drafts the final decree.

Target Ward Parameters:
- Ward Name: {ward.name} (Ward #{ward.ward_no})
- City: {ward.city}
- Current AQI: {round(aqi)}
- Population: {ward.population or 'Dense'}
- Schools count: {ward.school_count}
- Hospitals count: {ward.hospital_count}
- Road Density: {ward.road_density}
- Industrial Proximity Score: {ward.industrial_score}
- Active Construction Sites: {ward.construction_count}
- Wind: {wind_speed} km/h at {wind_dir}°
"""

        if custom_objective:
            system_prompt += f"\n- SPECIAL MANDATE / POLICY OBJECTIVE TO DEBATE: {custom_objective}\n"
            
        system_prompt += """
Output format MUST be JSON matching this schema:
{
  "dialogue": [
    {
      "agent": "Citizen Health Director",
      "message": "...",
      "avatar": "👩‍⚕️"
    },
    ...
  ],
  "decree": "### 📜 MUNICIPAL TACTICAL ENFORCEMENT ORDER\n\n..."
}

Ensure the dialogue has exactly 4 turns (one for each agent in order). Keep each message under 3 sentences. The debate and final decree should directly address the special mandate or custom objective if one was provided. The decree should be markdown with numbered action items. Do not output markdown codeblocks around the JSON response, only return raw JSON.
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Convene the consensus chamber and output the decision logs."}
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=800
        )
        
        import json
        res_json = json.loads(response.choices[0].message.content)
        
        dialogue_turns = []
        for turn in res_json.get("dialogue", []):
            dialogue_turns.append(DialogueTurn(
                agent=turn.get("agent"),
                message=turn.get("message"),
                avatar=turn.get("avatar")
            ))
            
        return AgentSimulationResponse(
            ward_id=ward.id,
            ward_name=ward.name,
            city=ward.city,
            current_aqi=aqi,
            dialogue=dialogue_turns,
            decree=res_json.get("decree", "Tactical order generated.")
        )
    except Exception as e:
        logger.warning(f"Failed to compile LLM Consensus: {e}. Falling back to offline model.")
        return generate_offline_consensus(ward, aqi, weather, custom_objective)
