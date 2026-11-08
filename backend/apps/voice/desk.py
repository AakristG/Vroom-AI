"""Phone callback, appointments, live call snapshot, and NHTSA vehicle lookup."""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api
from apps.vehicles.http import ProviderError
from apps.vehicles.nhtsa import VIN_RE, nhtsa
from apps.vehicles.views import lookup

from . import actions, representatives
from .live import snapshot
from .models import ContinuationToken
from .verified_calls import register_verified_web_call

logger = logging.getLogger(__name__)

ALLOWED_TOPICS = {
    "Refinance": "financing",
    "Trade-in": "trade_in",
    "Vehicle information": "comparison",
    "Payment help": "hardship",
    "Lease end": "lease_end",
    "Financing assistance": "financing",
    "General consultation": "general",
}


@api_view(["GET"])
@login_required_api
def live_call(request):
    customer_id = request.account.customer_id
    data = snapshot(customer_id)
    pending = actions.open_action(customer_id)
    data["pending_action"] = actions.public_action(pending) if pending else None
    data["appointments"] = actions.list_appointments(customer_id)
    data["events"] = actions.list_events(customer_id)
    return Response(data)


@api_view(["GET"])
@login_required_api
def activity(request):
    customer_id = request.account.customer_id
    return Response(
        {
            "appointments": actions.list_appointments(customer_id),
            "events": actions.list_events(customer_id),
            "pending_action": actions.public_action(open_row) if (open_row := actions.open_action(customer_id)) else None,
            "representatives": representatives.find_local(
                zip_code=str(request.query_params.get("zip") or ""),
                city=request.account.city,
            ),
        }
    )


@api_view(["POST"])
@login_required_api
def book_appointment(request):
    """Create a pending specialist request. Execution requires two confirmations."""
    account = request.account
    topic = str(request.data.get("topic") or "").strip()
    when = str(request.data.get("when") or "").strip()
    phone = str(request.data.get("phone") or "").strip()
    name = str(request.data.get("name") or "").strip() or account.first_name
    customer_id = str(request.data.get("customer_id") or account.customer_id).strip()
    if topic not in ALLOWED_TOPICS or not when or not phone:
        return Response({"detail": "Choose a topic, a time, and a phone number."}, status=400)
    if customer_id != account.customer_id:
        return Response({"detail": "You can only book a call for your own account."}, status=403)
    category = actions.CATEGORIES.get(ALLOWED_TOPICS[topic], topic)
    summary = (
        f"Record a {category.lower()} request for {name} at {when}, callback {phone}. "
        "This is not a confirmed calendar booking and does not change the contract."
    )
    row = actions.propose(
        customer_id=customer_id,
        action_type="request_callback",
        payload={"category": category, "when": when, "phone": phone, "name": name, "email": account.email},
        summary=summary,
        channel="web",
        conversation_id=f"web:{customer_id}",
    )
    return Response({"action": actions.public_action(row), "appointment": None, "call": {"status": "awaiting_two_confirmations"}})


@api_view(["POST"])
@login_required_api
def confirm_action(request):
    action_id = str(request.data.get("action_id") or "").strip()
    stage = str(request.data.get("stage") or "").strip()
    customer_id = request.account.customer_id
    try:
        if stage == "intent":
            row = actions.confirm_intent(action_id, customer_id, "ui_confirm_intent")
        elif stage == "execute":
            row = actions.confirm_execution(action_id, customer_id, "ui_confirm_execute")
        elif stage == "cancel":
            row = actions.cancel(action_id, customer_id)
        else:
            return Response({"detail": "stage must be intent, execute, or cancel."}, status=400)
    except PermissionError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response({"action": actions.public_action(row)})


@api_view(["POST"])
@login_required_api
def create_web_call(request):
    """Mint a Retell web call from the backend so the secret API key never ships to the browser."""
    key = settings.RETELL_API_KEY
    agent = settings.RETELL_AGENT_ID
    if not key or not agent:
        return Response(
            {"detail": "Retell is not configured on the server (RETELL_API_KEY and RETELL_AGENT_ID).", "configured": False},
            status=503,
        )
    try:
        # Retell deprecated POST /v2/create-web-call; use v3.
        # https://docs.retellai.com/deprecation-notice/2026/09-30_create_web_call_v2
        response = requests.post(
            "https://api.retellai.com/v3/create-web-call",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "agent_id": agent,
                "metadata": {
                    "customer_id": request.account.customer_id,
                    "verified": True,
                    "channel": "web_voice",
                },
                "retell_llm_dynamic_variables": {
                    "customer_first_name": request.account.first_name or "there",
                    "customer_id": request.account.customer_id,
                },
            },
            timeout=15,
        )
    except requests.RequestException:
        logger.exception("Retell create-web-call failed")
        return Response({"detail": "Retell did not accept the web-call request."}, status=502)
    if not response.ok:
        return Response({"detail": "Retell rejected the web-call request.", "configured": True}, status=502)
    body = response.json()
    call_id = str(body.get("call_id") or "").strip()
    if not call_id or not body.get("access_token"):
        return Response({"detail": "Retell did not return a usable web-call token.", "configured": True}, status=502)
    # Authorize later Custom LLM turns from this server binding, not from Retell metadata alone.
    register_verified_web_call(call_id=call_id, customer_id=request.account.customer_id)
    return Response(
        {
            "access_token": body.get("access_token"),
            "call_id": call_id,
            "transport": body.get("transport"),
            "ice_servers": body.get("ice_servers"),
            "expires_at": body.get("expires_at"),
            "configured": True,
        }
    )


@api_view(["POST"])
@login_required_api
def continuation_link(request):
    """Issue a short-lived website continuation token. Sending SMS requires a second confirmation action."""
    call_id = str(request.data.get("call_id") or "").strip()
    if not call_id:
        return Response({"detail": "call_id is required."}, status=400)
    token = secrets.token_urlsafe(24)
    ContinuationToken.objects.create(
        token=token,
        call_id=call_id,
        customer_id=request.account.customer_id,
        expires_at=timezone.now() + timedelta(minutes=20),
    )
    base = getattr(settings, "APP_BASE_URL", "http://localhost:5173").rstrip("/")
    link = f"{base}/signin?continue={token}"
    return Response({"link": link, "expires_minutes": 20, "sms": "not_sent_until_confirmed"})


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
