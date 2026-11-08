"""Phone callback, representative appointments, and NHTSA vehicle lookup."""

from __future__ import annotations

import logging

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api
from apps.vehicles.http import ProviderError
from apps.vehicles.nhtsa import VIN_RE, nhtsa
from apps.vehicles.views import lookup

from .live import save_appointment, snapshot

logger = logging.getLogger(__name__)


@api_view(["GET"])
@login_required_api
def live_call(request):
    customer_id = str(request.query_params.get("customer_id") or "").strip()
    if not customer_id:
        return Response({"detail": "customer_id is required."}, status=400)
    return Response(snapshot(customer_id))


@api_view(["POST"])
@login_required_api
def book_appointment(request):
    customer_id = str(request.data.get("customer_id") or "").strip()
    topic = str(request.data.get("topic") or "").strip()
    when = str(request.data.get("when") or "").strip()
    phone = str(request.data.get("phone") or "").strip()
    name = str(request.data.get("name") or "").strip()
    allowed = {"Refinance", "Trade-in", "Vehicle information", "Payment help", "Lease end"}
    if topic not in allowed or not customer_id or not when or not phone:
        return Response({"detail": "Choose a topic, a time, and a phone number."}, status=400)
    if customer_id != request.account.customer_id:
        return Response({"detail": "You can only book a call for your own account."}, status=403)

    record = save_appointment(
        {"customer_id": customer_id, "name": name, "topic": topic, "when": when, "phone": phone, "sms": "not_configured"}
    )
    record["sms"] = _maybe_text(phone, name, topic, when)
    call = _maybe_call(phone, customer_id, name)
    return Response({"appointment": record, "call": call})


@api_view(["GET"])
@login_required_api
def vehicle_lookup(request):
    """NHTSA model record, plus VIN decode when a VIN is supplied. No market value."""
    year_raw = str(request.query_params.get("year") or "")
    model = str(request.query_params.get("model") or "").strip()
    trim = str(request.query_params.get("trim") or "").strip() or None
    vin = str(request.query_params.get("vin") or "").strip().upper()
    if not year_raw.isdigit() or not model:
        return Response({"detail": "year and model are required."}, status=400)
    year = int(year_raw)
    record, error = lookup(year, model, trim)
    if error:
        return Response({"source": "nhtsa", "detail": error["detail"]}, status=error["status"])
    payload: dict = {
        "source": "nhtsa",
        "specs": {
            "name": f"{year} Toyota {record['model']}",
            "base_msrp": None,
            "vehicle_type": record.get("vehicle_type"),
            "category": record.get("category"),
            "fuel_type": record.get("fuel_type"),
        },
        "trade_in_note": "Verified pricing is not currently connected. NHTSA does not provide trade-in values.",
    }
    if VIN_RE.match(vin):
        try:
            payload["vin_decode"] = nhtsa.decode_vin(vin, year)
        except ProviderError as exc:
            payload["vin_decode_detail"] = str(exc)
    return Response(payload)


def _maybe_text(phone: str, name: str, topic: str, when: str) -> str:
    sid = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    sender = settings.TWILIO_FROM_NUMBER
    if not (sid and token and sender):
        return "not_configured"
    try:
        response = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data={
                "To": phone,
                "From": sender,
                "Body": f"Toyota Financial: {name or 'You'} asked for a {topic.lower()} conversation on {when}. A representative will call this number.",
            },
            auth=(sid, token),
            timeout=12,
        )
        return "sent" if response.ok else "failed"
    except requests.RequestException:
        logger.exception("Twilio message failed")
        return "failed"


def _maybe_call(phone: str, customer_id: str, name: str) -> dict:
    key = settings.RETELL_API_KEY
    agent = settings.RETELL_AGENT_ID
    origin = settings.RETELL_FROM_NUMBER
    if not (key and agent and origin):
        return {"status": "not_configured"}
    try:
        response = requests.post(
            "https://api.retellai.com/v2/create-phone-call",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "from_number": origin,
                "to_number": phone,
                "override_agent_id": agent,
                "metadata": {"customer_id": customer_id, "customer_name": name},
            },
            timeout=15,
        )
        if not response.ok:
            return {"status": "failed"}
        body = response.json()
        return {"status": "calling", "call_id": body.get("call_id")}
    except requests.RequestException:
        logger.exception("Retell outbound call failed")
        return {"status": "failed"}
