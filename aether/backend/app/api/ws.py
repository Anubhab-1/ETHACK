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
    subscribed_city = city
    logger.info(f"🔌 WebSocket subscriber connected: city={subscribed_city}")

    async def read_incoming():
        nonlocal subscribed_city
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "subscribe":
                    new_city = data.get("city")
                    if new_city:
                        subscribed_city = new_city
                        logger.info(
                            f"🔄 WebSocket subscription updated to: city={subscribed_city}"
                        )
        except (WebSocketDisconnect, RuntimeError):
            pass

    reader_task = asyncio.create_task(read_incoming())

    try:
        while True:
            db = SessionLocal()
            try:
                current_city = subscribed_city
                stations = (
                    db.query(Station)
                    .filter(Station.city == current_city, Station.active)
                    .all()
                )
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
                        .join(
                            latest_subq,
                            (Reading.station_id == latest_subq.c.station_id)
                            & (Reading.measured_at == latest_subq.c.max_ts),
                        )
                        .all()
                    )

                    points = []
                    for r in readings:
                        if r.station_id in station_map:
                            s = station_map[r.station_id]
                            points.append(
                                {
                                    "station_id": s.id,
                                    "station_code": s.station_code,
                                    "name": s.name,
                                    "lat": s.lat,
                                    "lon": s.lon,
                                    "city": s.city,
                                    "aqi": r.aqi,
                                    "category": aqi_to_category(r.aqi)
                                    if r.aqi is not None
                                    else None,
                                    "pm25": r.pm25,
                                    "pm10": r.pm10,
                                    "measured_at": r.measured_at.isoformat()
                                    if r.measured_at
                                    else None,
                                }
                            )

                    # Push telemetry package
                    await websocket.send_json(
                        {
                            "type": "telemetry_update",
                            "city": current_city,
                            "station_count": len(points),
                            "readings": points,
                        }
                    )

                    # Check for threshold spikes (AQI >= 300)
                    for p in points:
                        if p["aqi"] is not None and p["aqi"] >= 300:
                            await websocket.send_json(
                                {
                                    "type": "alert",
                                    "alert_type": "threshold_spike",
                                    "severity": "critical",
                                    "station_name": p["name"],
                                    "city": current_city,
                                    "aqi": p["aqi"],
                                    "message": f"🚨 CRITICAL ALERT: {p['name']} ({current_city}) AQI is severe ({p['aqi']}). Immediate abatement recommended.",
                                }
                            )

                    # Check for SLA breach targets (open enforcement actions in current city older than 2 hours)
                    from datetime import datetime, timedelta

                    from app.models import EnforcementAction

                    two_hours_ago = datetime.utcnow() - timedelta(hours=2)
                    overdue_actions = (
                        db.query(EnforcementAction)
                        .filter(
                            EnforcementAction.city == current_city,
                            EnforcementAction.status == "open",
                            EnforcementAction.created_at < two_hours_ago,
                        )
                        .all()
                    )

                    for action in overdue_actions:
                        await websocket.send_json(
                            {
                                "type": "alert",
                                "alert_type": "sla_breach",
                                "severity": "high",
                                "action_id": action.id,
                                "ward_id": action.ward_id,
                                "city": current_city,
                                "message": f"⏳ SLA BREACH: Enforcement action #{action.id} ('{action.action_text}') has been pending for over 2 hours without field deployment!",
                            }
                        )

            except WebSocketDisconnect:
                break
            except RuntimeError as e:
                if "close message has been sent" in str(e) or "send" in str(e):
                    break
                logger.error(f"Error sending telemetry package inside WebSocket: {e}")
            except Exception as e:
                logger.error(f"Error preparing telemetry package inside WebSocket: {e}")
            finally:
                db.close()

            # Sleep for 10 seconds before broadcasting next tick
            await asyncio.sleep(10)

    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        reader_task.cancel()
        logger.info(f"🔌 WebSocket subscriber disconnected: city={subscribed_city}")
