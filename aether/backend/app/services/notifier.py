"""
AETHER — Multi-Channel Alert Notification Gateway
Dispatches real-time alerts via Twilio SMS with graceful mock fallback.
"""

from __future__ import annotations

import logging

import requests

from app.config import get_settings

logger = logging.getLogger(__name__)


def send_sms_notification(message: str, to_number: str | None = None) -> str:
    """
    Sends an SMS notification using Twilio if configured, otherwise falls back to simulation.
    """
    settings = get_settings()
    target_num = to_number or settings.twilio_to_number

    if not target_num:
        logger.info("[SMS Gateway] No target phone number specified. Skipping SMS.")
        return "no_recipient"

    if (
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_from_number
    ):
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
            auth = (settings.twilio_account_sid, settings.twilio_auth_token)
            data = {
                "From": settings.twilio_from_number,
                "To": target_num,
                "Body": message,
            }
            res = requests.post(url, auth=auth, data=data, timeout=10)
            if res.status_code == 201:
                sid = res.json().get("sid")
                logger.info(f"📲 Twilio SMS sent successfully. SID: {sid}")
                return f"sent_sms_sid_{sid}"
            else:
                logger.warning(
                    f"⚠️ Twilio API failed with status {res.status_code}: {res.text}"
                )
                return f"failed_http_{res.status_code}"
        except Exception as e:
            logger.error(f"❌ Error invoking Twilio API: {e}")
            return f"error_{str(e)}"

    # Mock fallback
    logger.info(f"📱 [SMS Simulated Dispatch] To: {target_num} | Message: {message}")
    return "simulated"
