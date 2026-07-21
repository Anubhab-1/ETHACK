"""
AETHER — Seed Kolkata KMC Ward Data.
Generates 144 Kolkata Municipal Corporation wards with realistic coordinates,
population estimates, and OSM-derived features.
"""

from __future__ import annotations

import logging
import math
import random

from sqlalchemy.orm import Session

from app.models import Ward

logger = logging.getLogger(__name__)

# Kolkata bounding box: 22.45 to 22.65 lat, 88.25 to 88.55 lon
# 144 wards organized roughly in a grid across the city
KOLKATA_BOUNDS = {
    "lat_min": 22.46,
    "lat_max": 22.64,
    "lon_min": 22.26,
    "lon_max": 88.52,
}

# Known high-pollution zones for realistic local modifiers
HIGH_POLLUTION_AREAS = [
    {
        "name": "Howrah Industrial",
        "lat_center": 22.590,
        "lon_center": 88.270,
        "radius": 0.04,
    },
    {
        "name": "Barrackpore Industrial",
        "lat_center": 22.760,
        "lon_center": 88.380,
        "radius": 0.05,
    },
    {
        "name": "Garden Reach Port",
        "lat_center": 22.530,
        "lon_center": 88.300,
        "radius": 0.03,
    },
    {
        "name": "New Town Construction",
        "lat_center": 22.575,
        "lon_center": 88.450,
        "radius": 0.04,
    },
]

# Ward names (sampling of real KMC ward names/areas)
AREA_NAMES = [
    "Amherst Street",
    "Ultadanga",
    "Belgachia",
    "Shyambazar",
    "Hatibagan",
    "Jorasanko",
    "Posta",
    "Rajabazar",
    "Manicktala",
    "Phool Bagan",
    "Narkeldanga",
    "Entally",
    "Tiljala",
    "Topsia",
    "Park Circus",
    "Ballygunge",
    "Dhakuria",
    "Jadavpur",
    "Behala",
    "Barisha",
    "Tollygunge",
    "Regent Park",
    "Lake Gardens",
    "Alipore",
    "Kalighat",
    "Bhowanipore",
    "Rashbehari",
    "Ekdalia",
    "Gariahat",
    "Lake Town",
    "Kestopur",
    "Baguiati",
    "VIP Nagar",
    "Teghoria",
    "Rajarhat New Town",
    "Bidhannagar Sector V",
    "Salt Lake Sector III",
    "Noapara",
    "Dum Dum",
    "Airport Zone",
    "Patuli",
    "Garia",
    "Sonarpur",
    "Narendrapur",
    "Princep Street",
    "Chowringhee",
    "Dharmatala",
    "Esplanade",
    "BBD Bag",
    "Strand Road",
    "Garden Reach",
    "Metiabruz",
    "Khidderpore",
    "Watgunge",
    "Fort William Zone",
    "Maidan",
    "Victoria",
    "Park Street",
    "Camac Street",
    "Elgin",
    "Chetla",
    "Shibpur Howrah",
    "Howrah Station",
    "Liluah Howrah",
    "Howrah North",
    "Belur",
    "Bally",
    "Baidyabati",
    "Uttarpara",
    "Konnagar",
    "Serampore",
    "Chandannagar",
    "Hooghly District",
    "Dakshineswar",
    "Baranagar",
    "Kamarhati",
    "Khardah",
    "Titagarh",
    "Barrackpore",
    "Naihati",
    "Bhatpara",
    "Jagatdal",
    "Nainan",
    "Ichapur",
    "Ashokenagar",
    "Amdanga",
    "Sodepur",
    "Agarpara",
]


def _distance_to_area(lat: float, lon: float, area: dict) -> float:
    return math.sqrt((lat - area["lat_center"]) ** 2 + (lon - area["lon_center"]) ** 2)


def _compute_industrial_score(lat: float, lon: float) -> float:
    """0-100 based on proximity to industrial zones."""
    score = 10.0  # baseline
    for area in HIGH_POLLUTION_AREAS:
        dist = _distance_to_area(lat, lon, area)
        if dist < area["radius"]:
            score += (1 - dist / area["radius"]) * 60
    return min(100.0, score)


def seed_kolkata_wards(db: Session):
    """Seed 144 Kolkata wards with realistic spatial distribution."""
    existing = db.query(Ward).filter(Ward.city == "Kolkata").count()
    if existing >= 100:
        logger.info(f"Wards already seeded ({existing} existing)")
        return existing

    random.seed(42)  # deterministic

    # Create a 12x12 grid roughly covering Kolkata
    lat_range = 22.64 - 22.46
    lon_range = 88.52 - 88.26
    rows, cols = 12, 12

    wards_created = 0
    ward_no = 1

    for row in range(rows):
        for col in range(cols):
            if ward_no > 144:
                break

            # Compute centroid with jitter
            base_lat = 22.46 + (row / rows) * lat_range + (lat_range / rows) * 0.5
            base_lon = 88.26 + (col / cols) * lon_range + (lon_range / cols) * 0.5
            lat = base_lat + random.uniform(-0.005, 0.005)
            lon = base_lon + random.uniform(-0.005, 0.005)

            # Name
            name_idx = (ward_no - 1) % len(AREA_NAMES)
            name = f"{AREA_NAMES[name_idx]} Ward {ward_no}"

            # Features
            industrial_score = _compute_industrial_score(lat, lon)
            road_density = random.uniform(0.3, 1.0) * (
                0.8 + 0.4 * min(industrial_score / 100, 1)
            )
            construction_count = max(0, int(random.gauss(3, 2)))
            population = random.randint(40000, 200000)
            school_count = max(1, int(population / 20000))
            hospital_count = max(0, int(population / 50000))
            elderly_percentage = round(random.uniform(5.0, 16.0), 2)
            child_percentage = round(random.uniform(4.0, 12.0), 2)
            low_income_percentage = round(random.uniform(10.0, 45.0), 2)
            svi_index = round(
                (
                    elderly_percentage * 0.4
                    + child_percentage * 0.4
                    + low_income_percentage * 0.2
                )
                / 100.0,
                4,
            )

            ward = Ward(
                ward_no=ward_no,
                name=name,
                city="Kolkata",
                lat=lat,
                lon=lon,
                population=population,
                school_count=school_count,
                hospital_count=hospital_count,
                road_density=round(road_density, 2),
                industrial_score=round(industrial_score, 1),
                construction_count=construction_count,
                elderly_percentage=elderly_percentage,
                child_percentage=child_percentage,
                low_income_percentage=low_income_percentage,
                svi_index=svi_index,
            )
            db.add(ward)
            ward_no += 1
            wards_created += 1

    db.commit()
    logger.info(f"Seeded {wards_created} Kolkata wards")
    return wards_created


def seed_delhi_wards(db: Session):
    """Seed Delhi zones (272 wards, simplified to ~30 key zones)."""
    existing = db.query(Ward).filter(Ward.city == "Delhi").count()
    if existing >= 20:
        return existing

    random.seed(43)
    delhi_zones = [
        {"name": "Anand Vihar", "lat": 28.6469, "lon": 77.3161, "ind": 85},
        {"name": "ITO", "lat": 28.6289, "lon": 77.2409, "ind": 60},
        {"name": "Punjabi Bagh", "lat": 28.6720, "lon": 77.1310, "ind": 70},
        {"name": "Dwarka", "lat": 28.5821, "lon": 77.0508, "ind": 45},
        {"name": "Rohini", "lat": 28.7495, "lon": 77.0848, "ind": 55},
        {"name": "Okhla", "lat": 28.5355, "lon": 77.2726, "ind": 80},
        {"name": "Bawana", "lat": 28.7892, "lon": 77.0411, "ind": 90},
        {"name": "Jahangirpuri", "lat": 28.7338, "lon": 77.1641, "ind": 85},
        {"name": "Wazirpur", "lat": 28.6956, "lon": 77.1720, "ind": 78},
        {"name": "Shahdara", "lat": 28.6644, "lon": 77.2902, "ind": 72},
    ]

    for i, z in enumerate(delhi_zones):
        elderly_percentage = round(random.uniform(5.0, 16.0), 2)
        child_percentage = round(random.uniform(4.0, 12.0), 2)
        low_income_percentage = round(random.uniform(10.0, 45.0), 2)
        svi_index = round(
            (
                elderly_percentage * 0.4
                + child_percentage * 0.4
                + low_income_percentage * 0.2
            )
            / 100.0,
            4,
        )

        ward = Ward(
            ward_no=i + 1,
            name=z["name"],
            city="Delhi",
            lat=z["lat"],
            lon=z["lon"],
            population=random.randint(80000, 400000),
            school_count=random.randint(3, 15),
            hospital_count=random.randint(1, 5),
            road_density=round(random.uniform(0.5, 1.0), 2),
            industrial_score=float(z["ind"]),
            construction_count=random.randint(2, 10),
            elderly_percentage=elderly_percentage,
            child_percentage=child_percentage,
            low_income_percentage=low_income_percentage,
            svi_index=svi_index,
        )
        db.add(ward)

    db.commit()
    logger.info("Seeded Delhi zones")
    return len(delhi_zones)


def seed_mumbai_wards(db: Session):
    """Seed Mumbai zones."""
    existing = db.query(Ward).filter(Ward.city == "Mumbai").count()
    if existing >= 5:
        return existing

    random.seed(44)
    mumbai_zones = [
        {"name": "Bandra Kurla Complex", "lat": 19.0596, "lon": 72.8656, "ind": 45},
        {"name": "Colaba", "lat": 18.9067, "lon": 72.8147, "ind": 20},
        {"name": "Dharavi", "lat": 19.0380, "lon": 72.8534, "ind": 65},
        {"name": "Govandi", "lat": 19.0697, "lon": 72.9171, "ind": 75},
        {"name": "Mulund", "lat": 19.1724, "lon": 72.9560, "ind": 50},
        {"name": "Borivali", "lat": 19.2183, "lon": 72.8564, "ind": 35},
        {"name": "Worli", "lat": 19.0176, "lon": 72.8183, "ind": 40},
        {"name": "Malad", "lat": 19.1862, "lon": 72.8481, "ind": 45},
    ]

    for i, z in enumerate(mumbai_zones):
        elderly_percentage = round(random.uniform(5.0, 16.0), 2)
        child_percentage = round(random.uniform(4.0, 12.0), 2)
        low_income_percentage = round(random.uniform(10.0, 45.0), 2)
        svi_index = round(
            (
                elderly_percentage * 0.4
                + child_percentage * 0.4
                + low_income_percentage * 0.2
            )
            / 100.0,
            4,
        )

        ward = Ward(
            ward_no=i + 1,
            name=z["name"],
            city="Mumbai",
            lat=z["lat"],
            lon=z["lon"],
            population=random.randint(100000, 500000),
            school_count=random.randint(4, 20),
            hospital_count=random.randint(1, 8),
            road_density=round(random.uniform(0.4, 0.9), 2),
            industrial_score=float(z["ind"]),
            construction_count=random.randint(5, 20),
            elderly_percentage=elderly_percentage,
            child_percentage=child_percentage,
            low_income_percentage=low_income_percentage,
            svi_index=svi_index,
        )
        db.add(ward)

    db.commit()
    logger.info("Seeded Mumbai zones")
    return len(mumbai_zones)


if __name__ == "__main__":
    from app.database import SessionLocal, create_tables

    create_tables()
    db = SessionLocal()
    n = seed_kolkata_wards(db)
    seed_delhi_wards(db)
    seed_mumbai_wards(db)
    db.close()
    print(f"✅ Seeded {n} Kolkata wards + Delhi/Mumbai zones")
