"""
AETHER — Live WebSocket Telemetry Route
Pushes real-time station AQI readings to connected clients.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import func

from app.api.aqi import aqi_to_category
from app.database import SessionLocal
from app.models import Reading, Station

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/live")
async def websocket_live_aqi(websocket: WebSocket, city: str = "Kolkata"):
    """
    WebSocket endpoint for real-time AQI telemetry updates.
    Periodically queries and pushes latest CPCB station readings to the client.
    """
    await websocket.accept()
    logger.info(f"🔌 WebSocket subscriber connected: city={city}")

    try:
        while True:
            db = SessionLocal()
            try:
                stations = db.query(Station).filter(Station.city == city, Station.active).all()
                station_ids = [s.id for s in stations]
                station_map = {s.id: s for s in stations}

                if station_ids:
                    # Query latest readings for active stations
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

                    points = []
                    for r in readings:
                        if r.station_id in station_map:
                            s = station_map[r.station_id]
                            points.append({
                                "station_id": s.id,
                                "station_code": s.station_code,
                                "name": s.name,
                                "lat": s.lat,
                                "lon": s.lon,
                                "city": s.city,
                                "aqi": r.aqi,
                                "category": aqi_to_category(r.aqi) if r.aqi is not None else None,
                                "pm25": r.pm25,
                                "pm10": r.pm10,
                                "measured_at": r.measured_at.isoformat() if r.measured_at else None,
                            })

                    # Push telemetry package
                    await websocket.send_json({
                        "type": "telemetry_update",
                        "city": city,
                        "station_count": len(points),
                        "readings": points
                    })
            except Exception as e:
                logger.error(f"Error preparing telemetry package inside WebSocket: {e}")
            finally:
                db.close()

            # Sleep for 10 seconds before broadcasting next tick
            await asyncio.sleep(10)

    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket subscriber disconnected: city={city}")
