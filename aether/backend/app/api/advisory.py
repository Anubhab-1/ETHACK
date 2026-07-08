from __future__ import annotations
"""AETHER — Advisory chatbot endpoint (LangChain + GPT-4o-mini)."""
import uuid
import math
import logging
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import AdvisoryRequest, AdvisoryResponse
from app.models import AdvisoryLog, Ward, Station, Reading, EnforcementAction, Weather
from app.config import get_settings
from app.services.attributor import get_current_aqi_for_ward
from app.api.aqi import aqi_to_category, idw_interpolate, AQI_CATEGORIES

logger = logging.getLogger(__name__)
router = APIRouter()

# Pre-written advisory templates for offline/no-key mode
ADVISORY_TEMPLATES = {
    "en": {
        "Good": "Air quality is Good (AQI {aqi}). It's safe for outdoor activities. Enjoy the fresh air!",
        "Satisfactory": "Air quality is Satisfactory (AQI {aqi}). Most people can enjoy outdoor activities. Sensitive individuals may feel slight discomfort.",
        "Moderate": "Air quality is Moderate (AQI {aqi}). People with respiratory conditions should limit prolonged outdoor exposure. Others can continue normal activities.",
        "Poor": "Air quality is Poor (AQI {aqi}). Avoid prolonged outdoor activities, especially for children and the elderly. Wear an N95 mask if going out.",
        "Very Poor": "Air quality is Very Poor (AQI {aqi}). Avoid going outdoors. Keep windows closed. Use air purifiers if available.",
        "Severe": "HEALTH EMERGENCY — AQI {aqi} is Severe. Stay indoors. All outdoor activities should be cancelled. Seek medical attention if experiencing breathing difficulty.",
    },
    "bn": {
        "Good": "বায়ু মান ভালো (AQI {aqi})। বাইরে যাওয়া নিরাপদ। তাজা বাতাস উপভোগ করুন!",
        "Satisfactory": "বায়ু মান সন্তোষজনক (AQI {aqi})। বেশিরভাগ মানুষ বাইরের কার্যক্রম উপভোগ করতে পারেন। সংবেদনশীল ব্যক্তিরা সামান্য অস্বস্তি অনুভব করতে পারেন।",
        "Moderate": "বায়ু মান মাঝারি (AQI {aqi})। শ্বাসকষ্টের সমস্যা থাকলে দীর্ঘ সময় বাইরে থাকা এড়িয়ে চলুন।",
        "Poor": "বায়ু মান খারাপ (AQI {aqi})। শিশু ও বয়স্কদের বাইরে যাওয়া এড়ানো উচিত। বাইরে গেলে N95 মাস্ক পরুন।",
        "Very Poor": "বায়ু মান অত্যন্ত খারাপ (AQI {aqi})। ঘরের বাইরে যাবেন না। জানালা বন্ধ রাখুন।",
        "Severe": "স্বাস্থ্য জরুরি অবস্থা — AQI {aqi} অত্যন্ত বিপজ্জনক। ঘরের ভেতরে থাকুন। শ্বাসকষ্ট হলে অবিলম্বে চিকিৎসা নিন।",
    },
    "hi": {
        "Good": "वायु गुणवत्ता अच्छी है (AQI {aqi})। बाहरी गतिविधियां सुरक्षित हैं।",
        "Satisfactory": "वायु गुणवत्ता संतोषजनक है (AQI {aqi})। संवेदनशील व्यक्तियों को थोड़ी सावधानी बरतनी चाहिए।",
        "Moderate": "वायु गुणवत्ता मध्यम है (AQI {aqi})। सांस की समस्या वाले लोग लंबे समय बाहर न रहें।",
        "Poor": "वायु गुणवत्ता खराब है (AQI {aqi})। बच्चों और बुजुर्गों को बाहर जाने से बचना चाहिए। मास्क पहनें।",
        "Very Poor": "वायु गुणवत्ता बहुत खराब है (AQI {aqi})। बाहर न जाएं। खिड़कियां बंद रखें।",
        "Severe": "स्वास्थ्य आपातकाल — AQI {aqi} गंभीर है। घर के अंदर रहें। सांस लेने में तकलीफ हो तो तुरंत डॉक्टर से मिलें।",
    }
}


def _get_settings():
    """Deferred settings access — avoids module-level singleton that breaks tests."""
    return get_settings()


def get_aqi_for_location(lat: float | None, lon: float | None, db: Session) -> tuple:
    """Get AQI for a lat/lon by finding nearest ward across all cities."""
    if lat is None or lon is None:
        return None, "Unknown"

    wards = db.query(Ward).all()
    if not wards:
        return None, "Unknown"

    nearest = min(wards, key=lambda w: math.sqrt((w.lat - lat) ** 2 + (w.lon - lon) ** 2))
    aqi = get_current_aqi_for_ward(nearest, db)

    for lo, hi, cat in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return aqi, cat
    return aqi, "Severe"




def generate_advisory_with_llm(request: AdvisoryRequest, aqi: float | None, category: str) -> str:
    """Use LLM to generate contextual advisory if API key is available."""
    settings = _get_settings()
    if not settings.openai_api_key:
        return None
    
    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base or None,
            timeout=5.0,
            max_retries=0
        )
        
        lang_map = {"en": "English", "bn": "Bengali", "hi": "Hindi"}
        lang = lang_map.get(request.language, "English")
        
        system_prompt = f"""You are AETHER, an air quality health advisor for Kolkata residents.
Answer in {lang} only. Be concise (2-3 sentences max).
Include specific AQI numbers and actionable advice.
Current AQI: {aqi or 'Unknown'} ({category})
Base your advice only on the air quality data provided."""

        response = client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.question},
            ],
            max_tokens=200,
            temperature=0.3,
            timeout=5.0,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"LLM advisory failed: {e}")
        return None


@router.post("/advisory/ask", response_model=AdvisoryResponse)
def ask_advisory(request: AdvisoryRequest, db: Session = Depends(get_db)):
    """Get a health advisory for the user's question and location."""
    session_id = request.session_id or str(uuid.uuid4())
    lang = request.language if request.language in ["en", "bn", "hi"] else "en"
    
    aqi, category = get_aqi_for_location(request.lat, request.lon, db)

    # Try LLM first
    answer = generate_advisory_with_llm(request, aqi, category)
    
    # Fall back to template
    if not answer:
        templates = ADVISORY_TEMPLATES.get(lang, ADVISORY_TEMPLATES["en"])
        template = templates.get(category, templates["Moderate"])
        answer = template.format(aqi=round(aqi, 0) if aqi else "N/A")
        
        # Add question context
        q_lower = request.question.lower()
        if "jog" in q_lower or "run" in q_lower or "exercise" in q_lower:
            if lang == "en":
                answer += " Consider exercising indoors or early morning when AQI is lower."
            elif lang == "bn":
                answer += " ভোরবেলা বা ঘরের ভেতরে ব্যায়াম করার কথা বিবেচনা করুন।"
        elif "school" in q_lower or "children" in q_lower or "kids" in q_lower:
            if lang == "en" and category in ["Poor", "Very Poor", "Severe"]:
                answer += " Keep children indoors and contact school authorities regarding outdoor activities."
            elif lang == "bn" and category in ["Poor", "Very Poor", "Severe"]:
                answer += " শিশুদের ঘরের ভেতরে রাখুন এবং স্কুলে বাইরের কার্যক্রম সম্পর্কে জিজ্ঞেস করুন।"

    # Log to DB
    log = AdvisoryLog(
        session_id=session_id,
        question=request.question,
        answer=answer,
        language=lang,
        lat=request.lat,
        lon=request.lon,
    )
    db.add(log)
    db.commit()

    return AdvisoryResponse(
        answer=answer,
        aqi=aqi,
        category=category,
        language=lang,
        session_id=session_id,
    )


@router.get("/advisory/templates")
def get_templates(language: str = Query("en")):
    """Get pre-written advisory templates by AQI range."""
    lang = language if language in ADVISORY_TEMPLATES else "en"
    return ADVISORY_TEMPLATES[lang]


@router.get("/advisory/briefing")
def get_briefing(city: str = Query("Kolkata"), db: Session = Depends(get_db)):
    """Generate strategic executive briefing for the commissioner."""
    from sqlalchemy import desc
    settings = _get_settings()

    stations = db.query(Station).filter(Station.city == city, Station.active == True).all()
    station_ids = [s.id for s in stations]
    station_map = {s.id: s for s in stations}

    # Batch-fetch latest readings in ONE query (was N+1)
    latest_subq = (
        db.query(
            Reading.station_id,
            func.max(Reading.measured_at).label("max_ts"),
        )
        .filter(Reading.station_id.in_(station_ids))
        .group_by(Reading.station_id)
        .subquery()
    )
    readings = (
        db.query(Reading)
        .join(latest_subq, (Reading.station_id == latest_subq.c.station_id) & (Reading.measured_at == latest_subq.c.max_ts))
        .all()
    )

    latest_aqi_values = [r.aqi for r in readings if r.aqi]
    avg_aqi = round(sum(latest_aqi_values) / len(latest_aqi_values), 0) if latest_aqi_values else 120.0

    station_points = [
        (station_map[r.station_id].lat, station_map[r.station_id].lon, r.aqi)
        for r in readings
        if r.aqi and r.station_id in station_map
    ]

    wards = db.query(Ward).filter(Ward.city == city).all()
    from app.api.aqi import idw_interpolate

    ward_aqis = [(w, idw_interpolate(w.lat, w.lon, station_points)) for w in wards]
    ward_aqis.sort(key=lambda x: x[1], reverse=True)
    top_hotspots = ward_aqis[:3]
    if len(top_hotspots) < 2:
        return {"city": city, "briefing": "Insufficient ward data to generate briefing."}

    weather_row = db.query(Weather).filter(Weather.city == city).order_by(desc(Weather.recorded_at)).first()
    wind_speed = weather_row.wind_speed if weather_row else 6.5
    wind_dir = weather_row.wind_dir if weather_row else 180.0
    temp_c = weather_row.temp_c if weather_row else 28.0

    open_count = db.query(EnforcementAction).filter(EnforcementAction.city == city, EnforcementAction.status == "open").count()
    deployed_count = db.query(EnforcementAction).filter(EnforcementAction.city == city, EnforcementAction.status == "deployed").count()

    compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    wind_compass = compass[int((wind_dir / 22.5) + 0.5) % 16]
    hotspot_str = ", ".join([f"{w.name} (AQI {round(aqi)})" for w, aqi in top_hotspots])

    briefing_markdown = None
    if settings.openai_api_key:
        try:
            from openai import OpenAI
            client = OpenAI(
                api_key=settings.openai_api_key,
                base_url=settings.openai_api_base or None,
                timeout=5.0,
                max_retries=0
            )
            
            system_prompt = f"""You are AETHER, the Chief Environmental Intelligence Agent.
Write a strategic "AI Executive Briefing" for the City Commissioner of {city}.
The briefing must be highly professional, structured in clean markdown, and use bullet points where necessary.
Keep the briefing under 150 words. Be tactical, direct, and actionable.

Current Parameters:
- City: {city}
- City-wide Average AQI: {avg_aqi}
- Top 3 Hotspot Wards: {hotspot_str}
- Wind Vector: {wind_speed} km/h from {wind_compass} ({wind_dir}°)
- Active Enforcement Actions: {open_count} open cases, {deployed_count} teams deployed.
- Temperature: {temp_c}°C
"""
            prompt = "Generate the Commissioner's strategic air quality morning brief."
            response = client.chat.completions.create(
                model=settings.llm_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=250,
                temperature=0.3,
                timeout=5.0,
            )
            briefing_markdown = response.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"Failed to generate LLM briefing: {e}")
            
    if not briefing_markdown:
        category = "Satisfactory" if avg_aqi <= 100 else ("Moderate" if avg_aqi <= 200 else "Poor")
        briefing_markdown = f"""### 🌫️ AETHER Strategic Morning Briefing — {city}
**Executive Summary:** {city} is currently recording an average AQI of **{round(avg_aqi)} ({category})**. Atmospheric conditions indicate localized trapping of pollutants.

**Key Hotspots & Risks:**
* The highest pollution loads are concentrated near **{top_hotspots[0][0].name}** (AQI {round(top_hotspots[0][1])}) and **{top_hotspots[1][0].name}** (AQI {round(top_hotspots[1][1])}).
* Wind currents are blowing at **{wind_speed} km/h** from **{wind_compass}**, causing downwind drift of PM2.5 particulates towards neighboring sectors.

**Tactical Enforcement Status:**
* There are currently **{open_count} open** enforcement warnings in the queue.
* **{deployed_count} municipal teams** are deployed in the field enforcing anti-dust measures.
* *Immediate Recommendation:* Deploy anti-smog water sprinklers to **{top_hotspots[0][0].name}** to control construction dust before rush hour.
"""
    return {"city": city, "briefing": briefing_markdown}

