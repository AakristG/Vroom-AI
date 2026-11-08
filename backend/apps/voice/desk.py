"""Phone callback, representative appointments, and CarsXE vehicle lookup."""

from __future__ import annotations

import logging

import requests
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .live import save_appointment, snapshot

logger = logging.getLogger(__name__)


@api_view(["GET"])
def live_call(request):
    customer_id = str(request.query_params.get("customer_id") or "").strip()
    if not customer_id:
        return Response({"detail": "customer_id is required."}, status=400)
    return Response(snapshot(customer_id))


@api_view(["POST"])
def book_appointment(request):
    customer_id = str(request.data.get("customer_id") or "").strip()
    topic = str(request.data.get("topic") or "").strip()
    when = str(request.data.get("when") or "").strip()
    phone = str(request.data.get("phone") or "").strip()
    name = str(request.data.get("name") or "").strip()
    allowed = {"Refinance", "Trade-in", "Vehicle information", "Payment help", "Lease end"}
    if topic not in allowed or not customer_id or not when or not phone:
        return Response({"detail": "Choose a topic, a time, and a phone number."}, status=400)

    record = save_appointment(
        {"customer_id": customer_id, "name": name, "topic": topic, "when": when, "phone": phone, "sms": "not_configured"}
    )
    record["sms"] = _maybe_text(phone, name, topic, when)
    call = _maybe_call(phone, customer_id, name)
    return Response({"appointment": record, "call": call})


@api_view(["GET"])
def vehicle_lookup(request):
    """Specs from CarsXE year/make/model. Trade-in value only when the customer supplies a VIN."""
    year = str(request.query_params.get("year") or "")
    model = str(request.query_params.get("model") or "")
    trim = str(request.query_params.get("trim") or "")
    vin = str(request.query_params.get("vin") or "").strip().upper()
    mileage = request.query_params.get("mileage") or ""
    state = str(request.query_params.get("state") or "TX")
    key = settings.CARSXE_API_KEY
    if not key:
        return Response({"source": "not_configured", "detail": "Add CARSXE_API_KEY to look up live vehicle data."})

    payload: dict = {"source": "carsxe"}
    try:
        specs = requests.get(
            "https://api.carsxe.com/v1/ymm",
            params={"key": key, "year": year, "make": "Toyota", "model": model, "trim": trim},
            timeout=12,
        )
        payload["specs_status"] = specs.status_code
        if specs.ok:
            body = specs.json()
            match = body.get("bestMatch") or {}
            payload["specs"] = {
                "name": match.get("name"),
                "base_msrp": match.get("base_msrp"),
                "seating": match.get("total_seating"),
                "city_mpg": (match.get("mpg") or {}).get("city") if isinstance(match.get("mpg"), dict) else None,
            }
        if len(vin) == 17:
            value = requests.get(
                "https://api.carsxe.com/v2/marketvalue",
                params={"key": key, "vin": vin, "mileage": mileage, "state": state, "condition": "clean"},
                timeout=12,
            )
            payload["value_status"] = value.status_code
            if value.ok:
                data = value.json()
                trade = data.get("trade_in_clean") or {}
                retail = data.get("retail_clean") or {}
                payload["trade_in"] = trade.get("adjusted_trade_in_clean") or trade.get("base_trade_in_clean")
                payload["retail"] = retail.get("adjusted_retail_clean") or retail.get("base_retail_clean")
        else:
            payload["trade_in_note"] = "CarsXE prices a trade-in from a 17-character VIN. Without one, use the estimate already on the account."
    except requests.RequestException:
        logger.exception("CarsXE lookup failed")
        return Response({"source": "carsxe", "detail": "CarsXE did not respond."}, status=502)
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
