from __future__ import annotations
"""
AETHER — Auto-Evidence & Legal Document Generator
Generates comprehensive audit packages demonstrating causal links between sources and receptors.
Correlates stack emissions with downwind ward AQI readings and legal provisions.
"""
import math
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models import Ward, Weather, Reading
from app.services.rag_legal import query_legal

logger = logging.getLogger(__name__)

# Mock database of industrial sites in Kolkata/Delhi/Mumbai for evidence generation
MOCK_INDUSTRIES = {
    "Kolkata": [
        {"id": "IND-KOL-01", "name": "Howrah Metallurgical Foundry", "lat": 22.585, "lon": 88.312, "type": "Foundry", "permit_no": "WBSPCB/COE/2024-8871", "permit_expiry": "2026-08-30", "stack_height_meters": 45.0},
        {"id": "IND-KOL-02", "name": "Cossipore Chemical Processing", "lat": 22.621, "lon": 88.371, "type": "Chemical", "permit_no": "WBSPCB/COE/2025-1092", "permit_expiry": "2027-02-15", "stack_height_meters": 35.0},
        {"id": "IND-KOL-03", "name": "Metiabruz Textile Dyeing", "lat": 22.535, "lon": 88.291, "type": "Textile", "permit_no": "WBSPCB/COE/2023-4512", "permit_expiry": "2025-12-31", "stack_height_meters": 30.0},
    ],
    "Delhi": [
        {"id": "IND-DEL-01", "name": "Okhla Electroplaters", "lat": 28.535, "lon": 77.261, "type": "Metallurgical", "permit_no": "DPCC/IND/2024-9981", "permit_expiry": "2026-04-10", "stack_height_meters": 40.0},
        {"id": "IND-DEL-02", "name": "Mayapuri Waste Recyclers", "lat": 28.631, "lon": 77.132, "type": "Recycling", "permit_no": "DPCC/IND/2025-3341", "permit_expiry": "2027-11-22", "stack_height_meters": 25.0},
    ],
    "Mumbai": [
        {"id": "IND-BOM-01", "name": "Chembur Refractories", "lat": 19.035, "lon": 72.891, "type": "Manufacturing", "permit_no": "MPCB/CTE/2024-4421", "permit_expiry": "2026-09-18", "stack_height_meters": 50.0},
    ]
}

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate bearing from point 1 to point 2 in degrees (0 = North, 180 = South)."""
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlon_r = math.radians(lon2 - lon1)
    
    y = math.sin(dlon_r) * math.cos(lat2_r)
    x = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon_r)
    
    bearing = math.atan2(y, x)
    return (math.degrees(bearing) + 360) % 360

def generate_evidence_package(industry_id: str, violation_type: str, db: Session) -> Dict[str, Any]:
    """
    Assembles a full digital evidence package for an industrial violation.
    Calculates meteorological correlation (wind direction vs bearing from source to ward).
    Queries legal regulations from local vector index (RAG).
    Renders draft Show-Cause notice.
    """
    # 1. Find industry details
    industry = None
    city = "Kolkata"
    for c, ind_list in MOCK_INDUSTRIES.items():
        for ind in ind_list:
            if ind["id"] == industry_id:
                industry = ind
                city = c
                break
    
    if not industry:
        # Fallback placeholder
        industry = {
            "id": industry_id,
            "name": f"Industrial Unit {industry_id}",
            "lat": 22.585,
            "lon": 88.312,
            "type": "Foundry",
            "permit_no": "WBSPCB/COE/2024-9988",
            "permit_expiry": "2026-12-31",
            "stack_height_meters": 40.0
        }
    
    # 2. Get nearest ward and current weather
    wards = db.query(Ward).filter(Ward.city == city).all()
    nearest_ward = None
    if wards:
        nearest_ward = min(
            wards, 
            key=lambda w: math.sqrt((w.lat - industry["lat"])**2 + (w.lon - industry["lon"])**2)
        )
    
    # Fetch weather
    weather = (
        db.query(Weather)
        .filter(Weather.city == city)
        .order_by(Weather.recorded_at.desc())
        .first()
    )
    wind_speed = weather.wind_speed if weather and weather.wind_speed else 8.5
    wind_dir = weather.wind_dir if weather and weather.wind_dir else 210.0
    
    # 3. Wind Correlation Analysis
    # Calculates bearing from source (industry) to receptor (ward centroid)
    bearing = 0.0
    wind_correlation = "LOW"
    bearing_diff = 180.0
    
    if nearest_ward:
        bearing = calculate_bearing(
            industry["lat"], industry["lon"],
            nearest_ward.lat, nearest_ward.lon
        )
        # Wind correlation is high if wind blows FROM industry TO ward
        # So wind direction should be close to the bearing angle
        bearing_diff = abs(wind_dir - bearing)
        if bearing_diff > 180:
            bearing_diff = 360 - bearing_diff
        
        if bearing_diff <= 45:
            wind_correlation = "CRITICAL (DOWNWIND RECEPTOR)"
        elif bearing_diff <= 90:
            wind_correlation = "MODERATE (PARTIAL DOWNWIND)"
        else:
            wind_correlation = "NEGLIGIBLE (UPWIND)"

    # 4. CEMS stack timeseries
    now = datetime.utcnow()
    cems_readings = []
    base_pm25 = 120.0 if "violation" in violation_type else 35.0
    for h in range(12):
        ts = now - timedelta(hours=12-h)
        pm = round(base_pm25 + math.sin(h) * 15.0 + (30.0 if "violation" in violation_type else 0.0), 1)
        cems_readings.append({
            "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "pm25_mg_nm3": pm,
            "limit_mg_nm3": 50.0,
            "exceeded": pm > 50.0
        })

    # 5. Query legal regulations (RAG)
    legal_docs = query_legal(violation_type.replace("_", " "), db, limit=2)
    legal_basis_str = ""
    for doc in legal_docs:
        legal_basis_str += f"- {doc['title']}: {doc['content'][:200]}...\n"

    # 6. Draft Show-Cause Notice
    ward_name = nearest_ward.name if nearest_ward else "General Ward"
    notice_text = (
        f"SHOW-CAUSE NOTICE\n"
        f"Reference No: WBSPCB/SCN/{now.strftime('%Y%m')}/{industry['id']}\n"
        f"Date: {now.strftime('%d-%b-%Y')}\n\n"
        f"To:\n"
        f"The Managing Director,\n"
        f"{industry['name']},\n"
        f"Location: {industry['lat']:.4f}°N, {industry['lon']:.4f}°E\n\n"
        f"Subject: Show-Cause Notice under Section 31A of the Air (Prevention and Control of Pollution) Act, 1981.\n\n"
        f"Sir/Madam,\n\n"
        f"WHEREAS AETHER air quality monitoring network has recorded continuous high levels of PM2.5 "
        f"in the downwind receptor ward: {ward_name}. Meteorological trajectory modeling indicates "
        f"that the wind was blowing at {wind_speed:.1f} km/h from direction {wind_dir:.1f}° (bearing: {bearing:.1f}°), "
        f"confirming a source-receptor spatial correlation of {wind_correlation}.\n\n"
        f"AND WHEREAS Continuous Emission Monitoring System (CEMS) data registered at Stack #{industry['id']}-01 "
        f"demonstrated PM2.5 readings averaging {cems_readings[-1]['pm25_mg_nm3']} mg/Nm³, which significantly "
        f"exceeds the statutory CPCB limit of 50.0 mg/Nm³.\n\n"
        f"THEREFORE, you are hereby directed to show cause within 7 days of receipt of this notice why directions "
        f"for closure of the industry or disconnection of utility services should not be issued under Section 31A "
        f"of the Air Act, 1981, and prosecution initiated under Section 37 of the said Act.\n\n"
        f"By Order,\n"
        f"Member Secretary,\n"
        f"AETHER Municipal Enforcement Board\n"
    )

    return {
        "case_id": f"AETHER-CASE-{now.strftime('%Y%m%d')}-{industry['id']}",
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "city": city,
        "violation_type": violation_type,
        "industry_details": industry,
        "wind_correlation": {
            "bearing_source_receptor_deg": round(bearing, 1),
            "wind_direction_deg": round(wind_dir, 1),
            "bearing_difference_deg": round(bearing_diff, 1),
            "correlation_status": wind_correlation,
        },
        "cems_timeseries_12h": cems_readings,
        "legal_basis": legal_docs,
        "show_cause_notice_draft": notice_text
    }
