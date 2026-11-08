"""Connect a customer to a real specialist by phone.

When a customer confirms a specialist request on the website (or with the voice agent), the backend
asks Retell to call the customer's phone from our Retell number. When they answer, Vroom AI says it
is calling back about their request and transfers the live call to SPECIALIST_PHONE_NUMBER, so the
customer and the specialist end up on the same call.

Needs RETELL_API_KEY, RETELL_AGENT_ID, RETELL_FROM_NUMBER (a number bought in or imported into
Retell) and SPECIALIST_PHONE_NUMBER. Without them the request is still recorded, exactly as before.
"""

from __future__ import annotations

import logging
import re
import threading
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

RETELL_CREATE_CALL = "https://api.retellai.com/v2/create-phone-call"
PURPOSE = "specialist_connect"

# call_id -> what the outbound call is for. The Retell WebSocket for that call reads it when the
# customer answers. (Retell also echoes the same metadata in call_details, used as a fallback.)
_pending: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def normalize_phone(raw: str | None) -> str | None:
    """E.164, assuming US/Canada for bare 10-digit numbers. None when it is not a usable number."""
    digits = re.sub(r"\D", "", raw or "")
    if (raw or "").strip().startswith("+") and 8 <= len(digits) <= 15:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None


def configured() -> bool:
    return all(
        normalize_phone(v) if "NUMBER" in k else v
        for k, v in {
            "RETELL_API_KEY": settings.RETELL_API_KEY,
            "RETELL_AGENT_ID": settings.RETELL_AGENT_ID,
            "RETELL_FROM_NUMBER": settings.RETELL_FROM_NUMBER,
            "SPECIALIST_PHONE_NUMBER": settings.SPECIALIST_PHONE_NUMBER,
        }.items()
    )


def start_specialist_call(*, customer_id: str, customer_phone: str, topic: str, first_name: str = "",
                          appointment_id: str = "") -> dict[str, Any]:
    """Ask Retell to call the customer; the agent then transfers them to the specialist."""
    if not configured():
        return {"status": "not_configured"}
    to_number = normalize_phone(customer_phone)
    if not to_number:
        return {"status": "invalid_phone", "detail": "The phone number on the request is not a valid number."}
    specialist = normalize_phone(settings.SPECIALIST_PHONE_NUMBER)
    if to_number == specialist:
        return {"status": "invalid_phone", "detail": "The customer number is the specialist's own number."}
    meta = {
        "purpose": PURPOSE,
        "customer_id": customer_id,
        "topic": topic or "your request",
        "first_name": first_name or "",
        "appointment_id": appointment_id,
    }
    try:
        response = requests.post(
            RETELL_CREATE_CALL,
            headers={"Authorization": f"Bearer {settings.RETELL_API_KEY}", "Content-Type": "application/json"},
            json={
                "from_number": normalize_phone(settings.RETELL_FROM_NUMBER),
                "to_number": to_number,
                "override_agent_id": settings.RETELL_AGENT_ID,
                "metadata": meta,
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        logger.warning("Retell outbound call failed: %s", exc)
        return {"status": "failed", "detail": "The phone system could not be reached."}
    if not response.ok:
        logger.warning("Retell create-phone-call %s: %s", response.status_code, response.text[:300])
        return {"status": "failed", "detail": "The phone system did not accept the call."}
    call_id = (response.json() or {}).get("call_id") or ""
    if call_id:
        with _lock:
            _pending[call_id] = meta
    return {"status": "calling", "call_id": call_id, "to": _mask(to_number)}


def take(call_id: str, metadata: dict | None = None) -> dict[str, Any] | None:
    """The specialist-connect details for this call, once (None for any other call)."""
    with _lock:
        meta = _pending.pop(call_id, None)
    if meta:
        return meta
    if isinstance(metadata, dict) and metadata.get("purpose") == PURPOSE:
        return metadata
    return None


def specialist_number() -> str | None:
    return normalize_phone(settings.SPECIALIST_PHONE_NUMBER)


def connect_greeting(meta: dict[str, Any]) -> str:
    name = (meta.get("first_name") or "").strip()
    topic = (meta.get("topic") or "your request").strip().lower()
    hello = f"Hi {name}, this" if name else "Hi, this"
    return (
        f"{hello} is Toyota Vroom AI calling back about {topic}, as you asked on our website. "
        "I'm connecting you with a Toyota Financial Services specialist now. Please stay on the line."
    )


def _mask(number: str) -> str:
    return f"***-***-{number[-4:]}" if len(number) >= 4 else "***"
