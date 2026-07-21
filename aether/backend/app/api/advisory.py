"""AETHER — Advisory chatbot endpoint (LangChain + GPT-4o-mini)."""

from __future__ import annotations

import logging
import math
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.aqi import AQI_CATEGORIES, idw_interpolate
from app.config import get_settings
from app.database import get_db
from app.models import AdvisoryLog, EnforcementAction, Reading, Station, Ward, Weather
from app.schemas import AdvisoryRequest, AdvisoryResponse
from app.services.attributor import get_current_aqi_for_ward

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
    },
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

    nearest = min(
        wards, key=lambda w: math.sqrt((w.lat - lat) ** 2 + (w.lon - lon) ** 2)
    )
    aqi = get_current_aqi_for_ward(nearest, db)

    for lo, hi, cat in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return aqi, cat
    return aqi, "Severe"


def generate_advisory_with_llm(
    request: AdvisoryRequest, aqi: float | None, category: str, db: Session
) -> str | None:
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
            max_retries=0,
        )

        lang_map = {"en": "English", "bn": "Bengali", "hi": "Hindi"}
        lang = lang_map.get(request.language, "English")

        # RAG search for relevant regulations if applicable
        rag_context = ""
        try:
            from app.services.rag_legal import query_legal

            rag_docs = query_legal(request.question, db, limit=2)
            if rag_docs:
                rag_context = "\n\nRelevant Environmental Regulations & Directives (RAG Context):\n"
                for doc in rag_docs:
                    rag_context += (
                        f"- Title: {doc['title']}\n  Content: {doc['content']}\n"
                    )
        except Exception as e:
            logger.warning(f"RAG lookup in advisory failed: {e}")

        system_prompt = f"""You are AETHER, an air quality health advisor for Kolkata, Delhi, and Mumbai residents.
Answer in {lang} only. Be concise (2-3 sentences max).
Include specific AQI numbers and actionable advice.
Current AQI: {aqi or "Unknown"} ({category})
Base your advice on the air quality data and environmental regulations provided below if applicable.{rag_context}"""

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


OFFLINE_TOPIC_ADVISORIES = {
    "en": {
        "exercise": {
            "Good": "Perfect conditions for outdoor sports, jogging, and physical training. Enjoy the fresh air!",
            "Satisfactory": "Comfortable air for outdoor activities. Sensitive individuals should monitor their breathing.",
            "Moderate": "You can exercise outside, but reduce intensity or move indoors if you experience chest tightness, coughing, or fatigue.",
            "Poor": "Avoid outdoor running, cycling, or heavy sports. Active physical exertion draws harmful PM2.5 deep into the lungs. Keep activities light and indoors if possible.",
            "Very Poor": "STAY INDOORS — High-intensity outdoor exercise is highly hazardous. Move all workouts and sports indoors.",
            "Severe": "HEALTH EMERGENCY — Do not perform any physical activity outdoors. Toxic air levels present immediate health risks.",
        },
        "sensitive": {
            "Good": "Completely safe for children, senior citizens, and individuals with respiratory conditions.",
            "Satisfactory": "Safe for sensitive groups, but individuals with severe asthma should monitor symptoms.",
            "Moderate": "Vulnerable groups (seniors, children, asthmatics) should take frequent breaks during outdoor play and reduce intense activities.",
            "Poor": "Children, elderly, and individuals with heart/lung disease should stay indoors. Keep inhalers and medication close by.",
            "Very Poor": "Children and seniors must remain indoors. Asthmatics are at high risk of severe breathing issues; run indoor air filtration.",
            "Severe": "Vulnerable individuals must stay in closed, purified rooms. Avoid all outdoor exposure to prevent respiratory distress.",
        },
        "mask": {
            "Good": "No mask is needed today. Breathe freely!",
            "Satisfactory": "Masks are not required for the general public.",
            "Moderate": "Masks are optional, but sensitive individuals or long-distance commuters may wear a face cover to avoid dust.",
            "Poor": "General cloth/surgical masks do not block fine particulate matter. Wear a certified N95 or FFP2 respirator mask when stepping outside.",
            "Very Poor": "Do not step outside without a fitted N95 respirator mask. Standard masks provide zero protection against PM2.5.",
            "Severe": "A well-fitting N95 respirator mask is mandatory for any outdoor emergency. Minimize any outside exposure.",
        },
        "indoor": {
            "Good": "Excellent day to open doors and windows for complete cross-ventilation.",
            "Satisfactory": "Open windows to circulate clean outdoor air through your rooms.",
            "Moderate": "Safe to ventilate rooms, but keep windows closed during peak traffic hours if living near main roads.",
            "Poor": "Keep windows and doors closed to prevent outdoor smoke and dust from entering. Run an air purifier if available.",
            "Very Poor": "Lock all windows and doors. Run an air purifier with a HEPA filter continuously to keep indoor air clean.",
            "Severe": "Seal all doors and windows. Run HEPA air purifiers on high speed. Avoid using vacuum cleaners or cooking methods that generate smoke.",
        },
        "symptoms": {
            "Good": "Air quality is excellent. If you have symptoms, they may be related to seasonal allergies or cold.",
            "Satisfactory": "Air quality is good. Slight throat tickle or allergy symptoms may occur in highly sensitive individuals.",
            "Moderate": "Some individuals may experience dry cough, throat irritation, or minor eye watering. Stay hydrated and rest.",
            "Poor": "Toxic particulates are causing airway inflammation. Coughing, burning eyes, and headache are common. Relocate indoors immediately.",
            "Very Poor": "Heavy soot can trigger chest tightness, severe coughing, and shortness of breath. Use saline eye drops, stay indoors, and seek medical help if symptoms persist.",
            "Severe": "High risk of acute respiratory distress, throat constriction, and severe eye inflammation. Stay in purified indoor areas and contact a doctor.",
        },
        "travel": {
            "Good": "Safe for all travel, walking, and outdoor commutes.",
            "Satisfactory": "Normal travel and public transit commute are safe.",
            "Moderate": "Commuting is safe. Keep car windows rolled up in congested traffic zones to avoid exhaust fumes.",
            "Poor": "Commute with windows closed. If possible, avoid open vehicles like auto-rickshaws or motorcycles. Wear an N95 mask during travel.",
            "Very Poor": "Minimize commutes. Travel only in closed vehicles with air conditioning set to recirculate mode. Always wear a mask.",
            "Severe": "Avoid all travel unless it is an emergency. Toxic smog reduces visibility and poses severe direct health risks.",
        },
    },
    "bn": {
        "exercise": {
            "Good": "বাইরে খেলাধুলা, দৌড়ানো এবং ব্যায়াম করার জন্য আদর্শ আবহাওয়া। তাজা বাতাস উপভোগ করুন!",
            "Satisfactory": "বাইরের কার্যক্রমের জন্য উপযোগী আবহাওয়া। সংবেদনশীল ব্যক্তিরা শ্বাসকষ্টের দিকে খেয়াল রাখুন।",
            "Moderate": "আপনি বাইরে ব্যায়াম করতে পারেন, তবে বুকে অস্বস্তি বা কাশি হলে তীব্রতা কমিয়ে ঘরের ভেতরে যান।",
            "Poor": "বাইরে দৌড়াদৌড়ি, সাইকেল চালানো বা ভারী ব্যায়াম বন্ধ রাখুন। জোরে শ্বাস নিলে ক্ষতিকর ধূলিকণা ফুসফুসের গভীরে চলে যায়।",
            "Very Poor": "ঘরের ভেতরে থাকুন — বাইরে ব্যায়াম করা স্বাস্থ্যের জন্য অত্যন্ত ঝুঁকিপূর্ণ। সমস্ত কসরত ঘরের ভেতরে করুন।",
            "Severe": "জরুরি অবস্থা — বাইরে কোনো ধরনের শারীরিক কসরত বা ব্যায়াম করবেন... বাতাস সরাসরি ফুসফুসের ক্ষতি করতে পারে।",
        },
        "sensitive": {
            "Good": "শিশু, বয়স্ক এবং শ্বাসকষ্টের রোগীদের জন্য সম্পূর্ণ নিরাপদ পরিবেশ।",
            "Satisfactory": "সংবেদনশীলদের জন্য নিরাপদ, তবে মারাত্মক হাঁপানি রোগীরা নিজেদের লক্ষণের দিকে নজর রাখুন।",
            "Moderate": "শিশু ও বয়স্করা বাইরে খেলাধুলার সময় মাঝে মাঝে বিরতি নিন এবং ভারী পরিশ্রমের কাজ কমান।",
            "Poor": "শিশু, বয়স্ক এবং হৃদরোগ/ফুসফুসের রোগীরা ঘরের ভেতরে থাকুন। ইনহেলার ও প্রয়োজনীয় ওষুধপত্র কাছে রাখুন।",
            "Very Poor": "শিশু ও বয়স্করা ঘরের বাইরে যাবেন না। হাঁপানি রোগীরা ঘরের ভেতরে এয়ার পিউরিফায়ার চালু রাখুন।",
            "Severe": "সংবেদনশীল ব্যক্তিরা অবশ্যই বন্ধ এবং বিশুদ্ধ হাওয়াযুক্ত ঘরে থাকুন। বাইরে যাওয়া সম্পূর্ণ এড়িয়ে চলুন।",
        },
        "mask": {
            "Good": "আজ কোনো মাস্ক পরার প্রয়োজন নেই। বুক ভরে শ্বাস নিন!",
            "Satisfactory": "সাধারণ মানুষের জন্য মাস্ক ব্যবহারের প্রয়োজন নেই।",
            "Moderate": "মাস্ক পরা বাধ্যতামূলক নয়, তবে সংবেদনশীল ব্যক্তিরা ধুলোবালি এড়াতে মাস্ক ব্যবহার করতে পারেন।",
            "Poor": "সাধারণ কাপড়ের মাস্ক PM2.5 আটকাতে পারে না। বাইরে বের হলে অবশ্যই N95 বা FFP2 মাস্ক ব্যবহার করুন।",
            "Very Poor": "N95 মাস্ক ছাড়া ঘরের বাইরে যাবেন না। সাধারণ মাস্ক বিষাক্ত বাতাস থেকে কোনো সুরক্ষা দেয় না।",
            "Severe": "বাইরে যেকোনো জরুরি প্রয়োজনে N95 মাস্ক পরা বাধ্যতামূলক। ঘরের বাইরে বের হওয়া ন্যূনতম করুন।",
        },
        "indoor": {
            "Good": "ঘরের জানালা ও দরজা খুলে দিয়ে বাতাস চলাচল করতে দেওয়ার জন্য চমৎকার দিন।",
            "Satisfactory": "ঘরের জানালা খুলে বাইরের তাজা বাতাস চলাচল করতে দিন।",
            "Moderate": "ঘর বায়ু চলাচলের জন্য জানালা খুলতে পারেন, তবে মূল রাস্তার পাশে থাকলে ট্রাফিকের সময় বন্ধ রাখুন।",
            "Poor": "ঘরের দরজা ও জানালা বন্ধ রাখুন যাতে বাইরের ধোঁয়া ও ধুলো ঘরে না ঢোকে। এয়ার পিউরিফায়ার থাকলে চালান।",
            "Very Poor": "ঘরের সব দরজা-জানালা বন্ধ রাখুন। ঘরের বাতাস পরিষ্কার রাখতে অনবরত HEPA এয়ার পিউরিফায়ার চালান।",
            "Severe": "ঘরের সব ফাঁকফোকর সিল করে দিন। HEPA পিউরিফায়ার সর্বোচ্চ গতিতে চালান। ঘরে ধোঁয়া ছড়ায় এমন কাজ (রান্না বা ভ্যাকিউম) এড়িয়ে চলুন।",
        },
        "symptoms": {
            "Good": "বাতাসের মান চমৎকার। আপনার কোনো উপসর্গ থাকলে তা ঋতু পরিবর্তন বা ঠাণ্ডাজনিত কারণে হতে পারে।",
            "Satisfactory": "বাতাসের মান ভালো। অত্যন্ত সংবেদনশীল ব্যক্তিদের ক্ষেত্রে হালকা গলা খুসখুস বা অ্যালার্জি হতে পারে।",
            "Moderate": "কারো কারো শুকনো কাশি, গলা জ্বালা বা চোখ দিয়ে সামান্য জল পড়তে পারে। পর্যাপ্ত জল পান করুন।",
            "Poor": "বিষাক্ত কণার কারণে ফুসফুস ও গলায় প্রদাহ হতে পারে। কাশি, চোখ জ্বালা ও মাথাব্যথা হলে অবিলম্বে ঘরের ভেতরে চলে যান।",
            "Very Poor": "বুকে চাপ লাগা, মারাত্মক কাশি এবং শ্বাসকষ্ট হতে পারে। চোখ পরিষ্কার জল দিয়ে ধুয়ে নিন এবং ঘরের ভেতরে থাকুন।",
            "Severe": "মারাত্মক শ্বাসকষ্ট, গলা বসে যাওয়া এবং চোখের তীব্র জ্বালা হতে পারে। বিশুদ্ধ বাতাসযুক্ত ঘরে থাকুন এবং ডাক্তারের পরামর্শ নিন।",
        },
        "travel": {
            "Good": "যাতায়াত, হাঁটা এবং সাইকেল চালানোর জন্য সম্পূর্ণ নিরাপদ দিন।",
            "Satisfactory": "স্বাভাবিক যাতায়াত এবং গণপরিবহন ব্যবহার করা নিরাপদ।",
            "Moderate": "যাতায়াত নিরাপদ। যানজটের এলাকায় গাড়ির কাচ বন্ধ রাখুন যাতে ক্ষতিকর ধোঁয়া ভেতরে না ঢোকে।",
            "Poor": "গাড়ির জানালা বন্ধ রেখে যাতায়াত করুন। অটোরিকশা বা মোটরসাইকেলের বদলে বন্ধ গাড়ি ব্যবহার করার চেষ্টা করুন এবং N95 মাস্ক পরুন।",
            "Very Poor": "যাতায়াত সীমিত করুন। কেবল এসি অন থাকা বন্ধ যানবাহনে যাতায়াত করুন। সবসময় মাস্ক পরে থাকুন।",
            "Severe": "জরুরি প্রয়োজন ছাড়া যেকোনো ভ্রমণ এড়িয়ে চলুন। বিষাক্ত কুয়াশার কারণে দুর্ঘটনা ঘটতে পারে এবং মারাত্মক স্বাস্থ্যঝুঁকি রয়েছে।",
        },
    },
    "hi": {
        "exercise": {
            "Good": "बाहरी खेल, दौड़ने और शारीरिक व्यायाम के लिए बेहतरीन मौसम। ताजी हवा का आनंद लें!",
            "Satisfactory": "बाहरी गतिविधियों के लिए अनुकूल हवा। संवेदनशील लोग सांस लेने पर ध्यान दें।",
            "Moderate": "आप बाहर व्यायाम कर सकते हैं, लेकिन यदि सीने में जकड़न या खांसी हो तो तीव्रता कम करें और अंदर जाएं।",
            "Poor": "बाहर दौड़ना, साइकिल चलाना या भारी व्यायाम बंद करें। भारी सांस लेने से प्रदूषक फेफड़ों में गहराई तक चले जाते हैं।",
            "Very Poor": "घर के अंदर रहें — बाहर व्यायाम करना अत्यंत खतरनाक है। सभी व्यायाम घर के अंदर ही करें।",
            "Severe": "स्वास्थ्य आपातकाल — बाहर किसी भी प्रकार का व्यायाम या शारीरिक श्रम न करें। यह हवा फेफड़ों को भारी नुकसान पहुंचा सकती है।",
        },
        "sensitive": {
            "Good": "बच्चों, बुजुर्गों और सांस के रोगियों के लिए पूरी तरह से सुरक्षित वातावरण।",
            "Satisfactory": "संवेदनशील समूहों के लिए सुरक्षित, लेकिन गंभीर अस्थमा रोगी अपने लक्षणों पर नजर रखें।",
            "Moderate": "बच्चे और बुजुर्ग बाहर खेलने के दौरान बीच-बीच में आराम करें और भारी गतिविधियों को कम करें।",
            "Poor": "बच्चे, बुजुर्ग और सांस/हृदय के रोगी घर के अंदर ही रहें। इनहेलर और आवश्यक दवाएं हमेशा पास रखें।",
            "Very Poor": "बच्चे और बुजुर्ग घर से बाहर न निकलें। अस्थमा रोगी घर के अंदर एयर प्यूरिफायर चलाकर रखें।",
            "Severe": "संवेदनशील लोग बंद और स्वच्छ हवा वाले कमरों में ही रहें। बाहर जाना पूरी तरह से टालें।",
        },
        "mask": {
            "Good": "आज मास्क पहनने की कोई आवश्यकता नहीं है। ताजी हवा में खुलकर सांस लें!",
            "Satisfactory": "सामान्य जनता के लिए मास्क पहनने की आवश्यकता नहीं है।",
            "Moderate": "मास्क पहनना वैकल्पिक है, लेकिन संवेदनशील लोग धूल से बचने के लिए मास्क का उपयोग कर सकते हैं।",
            "Poor": "साधारण कपड़े के मास्क PM2.5 को नहीं रोकते। बाहर निकलते समय N95 या FFP2 मास्क अवश्य पहनें।",
            "Very Poor": "N95 मास्क पहने बिना घर से बाहर न निकलें। साधारण मास्क प्रदूषित हवा से कोई सुरक्षा नहीं प्रदान करते।",
            "Severe": "बाहर किसी भी आपातकालीन स्थिति में N95 मास्क पहनना अनिवार्य है। बाहर जाना बहुत कम करें।",
        },
        "indoor": {
            "Good": "कमरों में ताजी हवा के आने-जाने के लिए दरवाजे और खिड़कियां खोलने का उत्तम दिन।",
            "Satisfactory": "कमरों को हवादार बनाने के लिए खिड़कियां खुली रख सकते हैं।",
            "Moderate": "कमरा हवादार बना सकते हैं, लेकिन यदि मुख्य सड़क के पास रहते हैं तो व्यस्त ट्रैफिक के समय खिड़की बंद रखें।",
            "Poor": "खिड़कियां और दरवाजे बंद रखें ताकि बाहर का धुआं और धूल कमरे में न आए। एयर प्यूरिफायर चालू करें।",
            "Very Poor": "खिड़कियां और दरवाजे पूरी तरह बंद रखें। कमरे की हवा साफ रखने के लिए HEPA एयर प्यूरिफायर चलाएं।",
            "Severe": "खिड़कियों और दरवाजों को अच्छी तरह सील करें। HEPA प्यूरिफायर को तेज गति से चलाएं। घर में धुआं पैदा करने वाले काम न करें।",
        },
        "symptoms": {
            "Good": "वायु गुणवत्ता बेहतरीन है। यदि आपको लक्षण हैं, तो वे मौसमी एलर्जी या जुकाम के कारण हो सकते हैं।",
            "Satisfactory": "वायु गुणवत्ता अच्छी है। अत्यधिक संवेदनशील लोगों में हल्की खांसी या एलर्जी के लक्षण हो सकते हैं।",
            "Moderate": "कुछ लोगों को सूखी खांसी, गले में खराश या आंखों में हल्की जलन हो सकती है। अधिक पानी पिएं।",
            "Poor": "प्रदूषित कणों से श्वसन मार्ग में सूजन आ सकती है। खांसी, आंखों में जलन और सिरदर्द होने पर तुरंत अंदर जाएं।",
            "Very Poor": "सीने में जकड़न, तेज खांसी और सांस फूलने की समस्या हो सकती है। आंखों को धोएं और घर के अंदर रहें।",
            "Severe": "सांस लेने में भारी तकलीफ, गले में तेज खराश और आंखों में जलन हो सकती है। स्वच्छ हवा में रहें और डॉक्टर से परामर्श लें।",
        },
        "travel": {
            "Good": "यात्रा, चलने और साइकिल चलाने के लिए पूरी तरह से सुरक्षित दिन।",
            "Satisfactory": "सामान्य यात्रा और सार्वजनिक परिवहन का उपयोग सुरक्षित है।",
            "Moderate": "यात्रा सुरक्षित है। भीड़भाड़ वाले इलाकों में गाड़ी के शीशे बंद रखें ताकि धुआं अंदर न आए।",
            "Poor": "गाड़ी की खिड़कियां बंद रखकर यात्रा करें। ऑटोरिकशा या बाइक के बजाय बंद वाहनों का उपयोग करें और N95 मास्क पहनें।",
            "Very Poor": "यात्रा कम करें। केवल एसी ऑन वाले बंद वाहनों (जैसे कार, मेट्रो) से यात्रा करें और हमेशा मास्क पहनें।",
            "Severe": "किसी भी आपातकालीन स्थिति के अलावा यात्रा करने से बचें। जहरीले स्मॉग से दृश्यता कम होती है और दुर्घटना का खतरा रहता है।",
        },
    },
}


def get_offline_advisory(
    question: str, aqi: float | None, category: str, lang: str
) -> str | None:
    """Keyword-based Local NLP fallback engine for offline/free advisory chats."""
    q_lower = question.lower()

    # Multilingual topic detection
    topic = None
    if any(
        k in q_lower
        for k in [
            "jog",
            "run",
            "exercise",
            "walk",
            "sport",
            "play",
            "outdoor",
            "outside",
            "swim",
            "cycle",
            "gym",
            "cardio",
            "breathe",
            "running",
            "jogging",
            "sports",
            "workout",
            "workouts",
            "ব্যায়াম",
            "দৌড়",
            "হাঁটা",
            "খেলা",
            "ব্যায়াম",
            "দৌড়",
            "व्यायाम",
            "दौड़",
            "दौड़ने",
            "खेल",
            "कसरत",
            "सैर",
        ]
    ):
        topic = "exercise"
    elif any(
        k in q_lower
        for k in [
            "old",
            "elderly",
            "grand",
            "parent",
            "kid",
            "child",
            "baby",
            "son",
            "daughter",
            "school",
            "asthma",
            "heart",
            "pregnant",
            "mother",
            "family",
            "senior",
            "seniors",
            "kids",
            "children",
            "asthmatic",
            "শিশু",
            "বয়স্ক",
            "বয়স্ক",
            "বাচ্চা",
            "হাঁপানি",
            "গর্ভবতী",
            "बच्चे",
            "बुजुर्ग",
            "बच्चा",
            "बूढ़े",
            "अस्थमा",
            "गर्भवती",
        ]
    ):
        topic = "sensitive"
    elif any(
        k in q_lower
        for k in [
            "mask",
            "n95",
            "filter",
            "ppe",
            "wear",
            "respirator",
            "masks",
            "মাস্ক",
            "मास्क",
        ]
    ):
        topic = "mask"
    elif any(
        k in q_lower
        for k in [
            "window",
            "door",
            "ventilation",
            "indoor",
            "purifier",
            "clean air",
            "open",
            "close",
            "purifiers",
            "hepa",
            "জানালা",
            "দরজা",
            "ভেতরে",
            "পিউরিফায়ার",
            "खिड़की",
            "दरवाजा",
            "कमरे",
            "प्यूरिफायर",
        ]
    ):
        topic = "indoor"
    elif any(
        k in q_lower
        for k in [
            "cough",
            "eye",
            "headache",
            "chest",
            "throat",
            "breath",
            "burn",
            "sick",
            "ache",
            "pain",
            "allergy",
            "coughing",
            "throat",
            "eyes",
            "কাশি",
            "চোখ",
            "মাথাব্যথা",
            "গলা",
            "শ্বাস",
            "खांसी",
            "आँख",
            "आंक",
            "सिरदर्द",
            "गले",
            "सांस",
        ]
    ):
        topic = "symptoms"
    elif any(
        k in q_lower
        for k in [
            "travel",
            "commute",
            "work",
            "office",
            "go to",
            "car",
            "metro",
            "drive",
            "bus",
            "road",
            "vehicle",
            "ভ্রমণ",
            "যাতায়াত",
            "অফিস",
            "গাড়ি",
            "মেট্রো",
            "यात्रा",
            "ऑफिस",
            "गाड़ी",
            "मेट्रो",
            "सफर",
        ]
    ):
        topic = "travel"

    if not topic:
        return None

    lang_data = OFFLINE_TOPIC_ADVISORIES.get(lang, OFFLINE_TOPIC_ADVISORIES["en"])
    topic_data = lang_data.get(topic)

    # Resolve category key
    cat_key = category
    if cat_key not in [
        "Good",
        "Satisfactory",
        "Moderate",
        "Poor",
        "Very Poor",
        "Severe",
    ]:
        cat_key = "Moderate"

    advice = topic_data.get(cat_key, topic_data["Moderate"])

    # Format standard header prefix
    header = ""
    aqi_str = f" (AQI {round(aqi)})" if aqi else ""
    if lang == "en":
        header = f"Air quality is {category}{aqi_str}. "
    elif lang == "bn":
        header = f"বাতাসের মান {category}{aqi_str}। "
    elif lang == "hi":
        header = f"वायु गुणवत्ता {category}{aqi_str} है। "

    return header + advice


@router.post("/advisory/ask", response_model=AdvisoryResponse)
def ask_advisory(request: AdvisoryRequest, db: Session = Depends(get_db)):
    """Get a health advisory for the user's question and location."""
    session_id = request.session_id or str(uuid.uuid4())
    lang = request.language if request.language in ["en", "bn", "hi"] else "en"

    aqi, category = get_aqi_for_location(request.lat, request.lon, db)

    # Try LLM first
    answer = generate_advisory_with_llm(request, aqi, category, db)

    # Try Topic-specific offline fallback
    if not answer:
        answer = get_offline_advisory(request.question, aqi, category, lang)

    # Fall back to general template
    if not answer:
        templates = ADVISORY_TEMPLATES.get(lang, ADVISORY_TEMPLATES["en"])
        template = templates.get(category, templates["Moderate"])
        answer = template.format(aqi=round(aqi, 0) if aqi else "N/A")

        # Add question context
        q_lower = request.question.lower()
        if "jog" in q_lower or "run" in q_lower or "exercise" in q_lower:
            if lang == "en":
                answer += (
                    " Consider exercising indoors or early morning when AQI is lower."
                )
            elif lang == "bn":
                answer += " ভোরবেলা বা ঘরের ভেতরে ব্যায়াম করার কথা বিবেচনা করুন।"
        elif "school" in q_lower or "children" in q_lower or "kids" in q_lower:
            if lang == "en" and category in ["Poor", "Very Poor", "Severe"]:
                answer += " Keep children indoors and contact school authorities regarding outdoor activities."
            elif lang == "bn" and category in ["Poor", "Very Poor", "Severe"]:
                answer += (
                    " শিশুদের ঘরের ভেতরে রাখুন এবং স্কুলে বাইরের কার্যক্রম সম্পর্কে জিজ্ঞেস করুন।"
                )

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

    stations = db.query(Station).filter(Station.city == city, Station.active).all()
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
        .join(
            latest_subq,
            (Reading.station_id == latest_subq.c.station_id)
            & (Reading.measured_at == latest_subq.c.max_ts),
        )
        .all()
    )

    latest_aqi_values = [r.aqi for r in readings if r.aqi]
    avg_aqi = (
        round(sum(latest_aqi_values) / len(latest_aqi_values), 0)
        if latest_aqi_values
        else 120.0
    )

    station_points = [
        (station_map[r.station_id].lat, station_map[r.station_id].lon, r.aqi)
        for r in readings
        if r.aqi and r.station_id in station_map
    ]

    wards = db.query(Ward).filter(Ward.city == city).all()

    ward_aqis = [(w, idw_interpolate(w.lat, w.lon, station_points)) for w in wards]
    ward_aqis.sort(key=lambda x: x[1], reverse=True)
    top_hotspots = ward_aqis[:3]
    if len(top_hotspots) < 2:
        return {
            "city": city,
            "briefing": "Insufficient ward data to generate briefing.",
        }

    weather_row = (
        db.query(Weather)
        .filter(Weather.city == city)
        .order_by(desc(Weather.recorded_at))
        .first()
    )
    wind_speed = weather_row.wind_speed if weather_row else 6.5
    wind_dir = weather_row.wind_dir if weather_row else 180.0
    temp_c = weather_row.temp_c if weather_row else 28.0

    open_count = (
        db.query(EnforcementAction)
        .filter(EnforcementAction.city == city, EnforcementAction.status == "open")
        .count()
    )
    deployed_count = (
        db.query(EnforcementAction)
        .filter(EnforcementAction.city == city, EnforcementAction.status == "deployed")
        .count()
    )

    compass = [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
    ]
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
                max_retries=0,
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
        category = (
            "Satisfactory"
            if avg_aqi <= 100
            else ("Moderate" if avg_aqi <= 200 else "Poor")
        )
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
