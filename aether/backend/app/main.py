from __future__ import annotations
"""
AETHER — FastAPI Main Application
Urban Air Quality Intelligence Platform
"""
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


def scheduled_refresh():
    """Trigger data refresh on schedule."""
    from app.database import SessionLocal
    from app.scripts.refresh_data import refresh_all
    logger.info("⏰ Background job: Starting automated hourly data refresh...")
    db = SessionLocal()
    try:
        refresh_all(db)
        logger.info("⏰ Background job: Automated data refresh complete.")
    except Exception as e:
        logger.error(f"⏰ Background job failed: {e}")
    finally:
        db.close()


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
            from app.models import Station, CitizenReport, Ward
            from datetime import datetime
            if db.query(Station).count() == 0:
                logger.info("First run detected — seeding stations and wards...")
                from app.scripts.seed_stations import seed_all_stations
                from app.scripts.seed_wards import seed_kolkata_wards, seed_delhi_wards, seed_mumbai_wards
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

            # Fetch fresh AQI data in background so uvicorn binds and listens immediately
            import asyncio
            async def run_initial_data_fetch():
                # Let the server fully bind first
                await asyncio.sleep(0.5)
                logger.info("📡 Starting initial database CPCB/weather refresh in background...")
                from app.database import SessionLocal
                bg_db = SessionLocal()
                try:
                    from app.scripts.refresh_data import refresh_all
                    refresh_all(bg_db)
                    logger.info("📡 Initial database refresh complete.")
                except Exception as e:
                    logger.error(f"Background startup data error: {e}")
                finally:
                    bg_db.close()
            
            asyncio.create_task(run_initial_data_fetch())
        except Exception as e:
            logger.error(f"Startup database/seeding error: {e}")
        finally:
            db.close()

        # Seed Knowledge Graph (in-memory graph of industries, violations, outcomes)
        try:
            from app.services.knowledge_graph import seed_knowledge_graph
            from app.database import SessionLocal as KGSession
            kg_db = KGSession()
            seed_knowledge_graph(db=kg_db, city="Kolkata")
            kg_db.close()
            logger.info("🕸️  AETHER Knowledge Graph seeded (NetworkX — Neo4j-swappable)")
        except Exception as e:
            logger.warning(f"Knowledge graph seed failed (non-critical): {e}")

        # Start APScheduler background scheduler
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        scheduler.add_job(scheduled_refresh, "interval", hours=1, id="cpcb_refresh")
        scheduler.start()
        logger.info("⏰ Background scheduler started (running every 1 hour)")
    else:
        logger.info("🧪 Running in testing mode — skipping DB migrations, seeds, external API syncs, and scheduler.")

    logger.info("✅ AETHER National v2.0 ready — 5-agent constitutional intelligence online!")
    yield

    if not is_testing:
        logger.info("AETHER shutting down background scheduler...")
        scheduler.shutdown()
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
    # Restricted to only the HTTP methods this API actually uses
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID", "Accept"],
)

from app.api import health, aqi, forecast, attribution, advisory, agents, diagnostics, simulation, reports
from app.api import forecast_advanced, attribution_advanced, causal_impact, enforcement_advanced, agents_advanced

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(aqi.router, prefix="/api", tags=["AQI"])
app.include_router(forecast.router, prefix="/api", tags=["Forecast"])
app.include_router(attribution.router, prefix="/api", tags=["Attribution"])
app.include_router(advisory.router, prefix="/api", tags=["Advisory"])
app.include_router(agents.router, prefix="/api", tags=["Agents"])
app.include_router(diagnostics.router, prefix="/api", tags=["Diagnostics"])
app.include_router(simulation.router, prefix="/api", tags=["Simulation"])
app.include_router(reports.router, prefix="/api", tags=["Citizen Reports"])

# Advanced National Upgrade Routers
app.include_router(forecast_advanced.router, tags=["Forecast Advanced"])
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

