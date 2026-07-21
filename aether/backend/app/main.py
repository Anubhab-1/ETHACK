"""
AETHER — FastAPI Main Application
Urban Air Quality Intelligence Platform
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_tables

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)




@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables, seed initial data, and start scheduler."""
    logger.info("🌫️  AETHER starting up...")

    import os
    import sys
    is_testing = os.environ.get("APP_ENV") == "testing" or "pytest" in sys.modules

    if not is_testing:
        create_tables()

        # Seed data on first run
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            from datetime import datetime

            from app.models import CitizenReport, Station, Ward
            if db.query(Station).count() == 0:
                logger.info("First run detected — seeding stations and wards...")
                from app.scripts.seed_stations import seed_all_stations
                from app.scripts.seed_wards import (
                    seed_delhi_wards,
                    seed_kolkata_wards,
                    seed_mumbai_wards,
                )
                seed_all_stations(db)
                seed_kolkata_wards(db)
                seed_delhi_wards(db)
                seed_mumbai_wards(db)

            if db.query(CitizenReport).count() == 0:
                logger.info("Seeding initial mock citizen reports...")
                kolkata_wards = db.query(Ward).filter(Ward.city == "Kolkata").limit(5).all()
                delhi_wards = db.query(Ward).filter(Ward.city == "Delhi").limit(2).all()
                mumbai_wards = db.query(Ward).filter(Ward.city == "Mumbai").limit(2).all()

                reports = []
                if len(kolkata_wards) >= 3:
                    reports.append(CitizenReport(
                        ward_id=kolkata_wards[0].id,
                        city="Kolkata",
                        reporter_name="Debasish S.",
                        report_type="garbage_burning",
                        description="Thick black smoke from garbage dump burning near Sector V park. Smells like plastic. Difficult to breathe.",
                        severity="high",
                        lat=kolkata_wards[0].lat + 0.001,
                        lon=kolkata_wards[0].lon - 0.001,
                        status="pending",
                        upvote_count=4,
                        created_at=datetime.utcnow()
                    ))
                    reports.append(CitizenReport(
                        ward_id=kolkata_wards[1].id,
                        city="Kolkata",
                        reporter_name="Ananya R.",
                        report_type="construction_dust",
                        description="Uncovered demolition site near the metro corridor. Excessive dust blow, road visibility is reduced.",
                        severity="medium",
                        lat=kolkata_wards[1].lat - 0.0005,
                        lon=kolkata_wards[1].lon + 0.0005,
                        status="pending",
                        upvote_count=2,
                        created_at=datetime.utcnow()
                    ))
                    reports.append(CitizenReport(
                        ward_id=kolkata_wards[2].id,
                        city="Kolkata",
                        reporter_name="Sanjay M.",
                        report_type="vehicle_emissions",
                        description="Multiple overloaded commercial diesel trucks emitting heavy dark smoke at the crossroads.",
                        severity="low",
                        lat=kolkata_wards[2].lat + 0.0008,
                        lon=kolkata_wards[2].lon + 0.0002,
                        status="verified",
                        upvote_count=6,
                        created_at=datetime.utcnow()
                    ))
                if len(delhi_wards) >= 1:
                    reports.append(CitizenReport(
                        ward_id=delhi_wards[0].id,
                        city="Delhi",
                        reporter_name="Preeti G.",
                        report_type="garbage_burning",
                        description="Biomass and leaf burning on the roadside in Anand Vihar block. High smog levels.",
                        severity="high",
                        lat=delhi_wards[0].lat + 0.0012,
                        lon=delhi_wards[0].lon - 0.0008,
                        status="pending",
                        upvote_count=3,
                        created_at=datetime.utcnow()
                    ))
                if len(mumbai_wards) >= 1:
                    reports.append(CitizenReport(
                        ward_id=mumbai_wards[0].id,
                        city="Mumbai",
                        reporter_name="Vikram A.",
                        report_type="industrial_smoke",
                        description="Fumes leaking from a chemical processing facility chimney down in Chembur industrial zone.",
                        severity="high",
                        lat=mumbai_wards[0].lat - 0.0015,
                        lon=mumbai_wards[0].lon + 0.001,
                        status="pending",
                        upvote_count=8,
                        created_at=datetime.utcnow()
                    ))

                if reports:
                    db.add_all(reports)
                    db.commit()
                    logger.info(f"Successfully seeded {len(reports)} mock citizen reports.")

            # Run the first CPCB/weather refresh synchronously (blocking)
            try:
                from app.scripts.refresh_data import refresh_all
                logger.info("📡 Running initial database CPCB/weather refresh synchronously...")
                refresh_all(db)
                logger.info("📡 Initial database refresh complete.")
            except Exception as e:
                logger.error(f"Startup data refresh error: {e}")
        except Exception as e:
            logger.error(f"Startup database/seeding error: {e}")
        finally:
            db.close()

        # Seed Knowledge Graph (in-memory graph of industries, violations, outcomes)
        try:
            from app.database import SessionLocal as KGSession
            from app.services.knowledge_graph import seed_knowledge_graph
            kg_db = KGSession()
            seed_knowledge_graph(db=kg_db, city="Kolkata")
            kg_db.close()
            logger.info("🕸️  AETHER Knowledge Graph seeded (NetworkX — Neo4j-swappable)")
        except Exception as e:
            logger.warning(f"Knowledge graph seed failed (non-critical): {e}")

        # Start APScheduler background scheduler
        from app.scheduler import start_scheduler
        start_scheduler()
    else:
        logger.info("🧪 Running in testing mode — skipping DB migrations, seeds, external API syncs, and scheduler.")

    logger.info("✅ AETHER National v2.0 ready — 5-agent constitutional intelligence online!")
    yield

    if not is_testing:
        logger.info("AETHER shutting down background scheduler...")
        from app.scheduler import shutdown_scheduler
        shutdown_scheduler()
    logger.info("AETHER shutting down...")



app = FastAPI(
    title="AETHER API — National Edition",
    description=(
        "Urban Air Quality Intelligence Platform — ET AI Hackathon 2026\n\n"
        "**v2.0 National Upgrade:** 5-agent constitutional intelligence, "
        "causal impact analysis (synthetic control), in-memory knowledge graph (NetworkX/Neo4j-ready), "
        "PINN dispersion simulation, PMF source apportionment with 95% CI, "
        "OR-Tools inspector routing, RAG legal advisory."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — include localhost + all Vercel preview/production deployments
origins = [o.strip() for o in settings.allowed_origins.split(",")]
# Always allow localhost dev origins
for dev_origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
    if dev_origin not in origins:
        origins.append(dev_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.(vercel\.app|railway\.app|up\.railway\.app|onrender\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_tracing(request, call_next):
    import time
    import uuid
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    
    logger.info(f"[{request_id}] {request.method} {request.url.path} - STARTED")
    start_time = time.time()
    
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} - "
            f"{response.status_code} ({process_time:.2f}ms)"
        )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time-Ms"] = f"{process_time:.2f}"
        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(
            f"[{request_id}] {request.method} {request.url.path} - "
            f"FAILED with exception: {e} ({process_time:.2f}ms)"
        )
        raise e

from app.api import (  # noqa: E402
    advisory,
    agents,
    agents_advanced,
    aqi,
    attribution,
    attribution_advanced,
    causal_impact,
    diagnostics,
    enforcement_advanced,
    forecast,
    forecast_advanced,
    health,
    reports,
    simulation,
    ws,
    forecast_models,
    citizen,
)

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(aqi.router, prefix="/api", tags=["AQI"])
app.include_router(forecast.router, prefix="/api", tags=["Forecast"])
app.include_router(attribution.router, prefix="/api", tags=["Attribution"])
app.include_router(advisory.router, prefix="/api", tags=["Advisory"])
app.include_router(agents.router, prefix="/api", tags=["Agents"])
app.include_router(diagnostics.router, prefix="/api", tags=["Diagnostics"])
app.include_router(simulation.router, prefix="/api", tags=["Simulation"])
app.include_router(reports.router, prefix="/api", tags=["Citizen Reports"])
app.include_router(ws.router, prefix="/api", tags=["WebSockets"])
app.include_router(citizen.router, prefix="/api", tags=["Citizen Alerts"])

# Advanced National Upgrade Routers
app.include_router(forecast_advanced.router, tags=["Forecast Advanced"])
app.include_router(forecast_models.router, tags=["Models"])
app.include_router(attribution_advanced.router, tags=["Attribution Advanced"])
app.include_router(causal_impact.router, tags=["Causal Impact"])
app.include_router(enforcement_advanced.router, tags=["Enforcement Advanced"])
app.include_router(agents_advanced.router, tags=["Agents Advanced"])




@app.get("/")
def root():
    return {
        "name": "AETHER",
        "tagline": "From measurement to intervention — intelligence that cleans the air.",
        "docs": "/docs",
        "version": "2.0.0",
    }

