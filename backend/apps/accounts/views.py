"""Sign-up, sign-in, and the signed-in Toyota catalog. Passwords stay hashed in SQLite."""

from __future__ import annotations

import secrets
from decimal import Decimal

from django.contrib.auth.hashers import check_password, make_password
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .authz import (
    account_from_request,
    attach_session_cookie,
    clear_login_attempts,
    clear_session,
    clear_session_cookie,
    issue_session,
    login_rate_limited,
    login_required_api,
    record_login_attempt,
)
from .catalog import catalog_page, model_detail
from .models import CustomerAccount
from .seed import seed_demo_accounts

_EXAMPLE = (
    "I'm starting a new job, but my monthly expenses are increasing by $400. "
    "What should I do about my $580 Toyota payment?"
)


def public_account(account: CustomerAccount) -> dict:
    payment = account.current_payment
    return {
        "token": account.token,
        "username": account.username,
        "first_name": account.first_name,
        "last_name": account.last_name,
        "email": account.email,
        "phone": account.phone,
        "city": account.city,
        "state": account.state,
        "life_change": account.life_change,
        "preferences": account.preferences,
        "customer_id": account.customer_id,
        "current_payment": float(payment) if payment is not None else None,
        "vehicle_model": account.vehicle_model,
        "vehicle_year": account.vehicle_year,
        "agreement": account.agreement or {},
        "example_life_change": _EXAMPLE,
    }


def _password_ok(account: CustomerAccount, raw: str) -> bool:
    return check_password(raw.strip(), account.password)


@api_view(["POST"])
def signup(request):
    seed_demo_accounts()
    first = str(request.data.get("first_name") or "").strip()
    last = str(request.data.get("last_name") or "").strip()
    username = str(request.data.get("username") or "").strip().lower()
    password = str(request.data.get("password") or "")
    life = str(request.data.get("life_change") or "").strip()
    city = str(request.data.get("city") or "").strip()
    if not first or not username or not password.strip() or not city or not life:
        return Response(
            {"detail": "Add your name, a username, a password, your city, and what changed in your life."},
            status=400,
        )
    if CustomerAccount.objects.filter(username=username).exists():
        return Response({"detail": "That username is already in use. Sign in instead."}, status=400)

    payment = _decimal(request.data.get("current_payment"))
    year = _year(request.data.get("vehicle_year"))
    account = CustomerAccount.objects.create(
        username=username,
        password=make_password(password.strip()),
        first_name=first,
        last_name=last,
        email=str(request.data.get("email") or "").strip(),
        phone=str(request.data.get("phone") or "").strip(),
        city=city,
        state=str(request.data.get("state") or "TX").strip() or "TX",
        life_change=life,
        customer_id=f"pending-{secrets.token_hex(4)}",
        current_payment=payment,
        vehicle_model=str(request.data.get("vehicle_model") or "").strip(),
        vehicle_year=year,
    )
    account.customer_id = f"N{account.id:03d}"
    account.save(update_fields=["customer_id"])
    issue_session(account)
    return attach_session_cookie(Response(public_account(account)), account)


@api_view(["POST"])
def login(request):
    seed_demo_accounts()
    if login_rate_limited(request):
        return Response({"detail": "Too many sign-in attempts. Wait a few minutes and try again."}, status=429)
    username = str(request.data.get("username") or "").strip().lower()
    password = str(request.data.get("password") or "")
    account = CustomerAccount.objects.filter(username=username).first()
    record_login_attempt(request)
    if not account or not _password_ok(account, password):
        return Response({"detail": "That sign-in doesn't match an account."}, status=400)
    clear_login_attempts(request)
    issue_session(account)
    return attach_session_cookie(Response(public_account(account)), account)


@api_view(["POST"])
def logout(request):
    account = account_from_request(request)
    clear_session(account)
    return clear_session_cookie(Response({"ok": True}))


@api_view(["GET", "PATCH"])
@login_required_api
def me(request):
    account = request.account
    if request.method == "PATCH":
        if "life_change" in request.data:
            account.life_change = str(request.data.get("life_change") or "").strip()
        if "preferences" in request.data:
            account.preferences = str(request.data.get("preferences") or "").strip()
        if "city" in request.data:
            account.city = str(request.data.get("city") or "").strip()
        if "phone" in request.data:
            account.phone = str(request.data.get("phone") or "").strip()
        if "current_payment" in request.data:
            account.current_payment = _decimal(request.data.get("current_payment"))
        if "agreement" in request.data:
            agreement, error = clean_agreement(request.data.get("agreement"), account.current_payment)
            if error:
                return Response({"detail": error}, status=400)
            account.agreement = agreement
        account.save()
    return Response(public_account(account))


def _number(raw: dict, key: str, label: str, low: float, high: float, required: bool) -> tuple[float | None, str | None]:
    value = _decimal(raw.get(key))
    if value is None:
        return None, (f"Add your {label}." if required else None)
    if not low <= float(value) <= high:
        return None, f"Your {label} should be between {low:,.0f} and {high:,.0f}."
    return float(value), None


def clean_agreement(raw, monthly_payment: Decimal | None) -> tuple[dict, str | None]:
    """Validate self-reported loan or lease terms. An empty value clears them."""
    if not raw:
        return {}, None
    if not isinstance(raw, dict):
        return {}, "Those agreement details could not be read."
    kind = raw.get("contract_type")
    if kind not in ("loan", "lease"):
        return {}, "Choose loan or lease."
    payment = float(monthly_payment or 0)
    if payment <= 0:
        return {}, "Add your monthly payment."

    due, error = _number(raw, "payment_due_day", "payment due day", 1, 28, False)
    if error:
        return {}, error
    out: dict = {"contract_type": kind, "payment_due_day": int(due or 1)}

    if kind == "loan":
        fields = [("current_balance", "loan balance", 1, 500_000, True), ("apr", "APR", 0, 40, True)]
    else:
        fields = [
            ("months_remaining", "months left on the lease", 1, 72, True),
            ("residual_value", "residual (buyout) value", 0, 500_000, False),
            ("mileage_allowance_total", "total mileage allowance", 0, 300_000, False),
            ("odometer_now", "odometer reading", 0, 500_000, False),
        ]
    for key, label, low, high, required in fields:
        value, error = _number(raw, key, label, low, high, required)
        if error:
            return {}, error
        if value is not None:
            out[key] = int(value) if key in ("months_remaining", "mileage_allowance_total", "odometer_now") else round(value, 2)

    if kind == "loan" and payment <= out["current_balance"] * out["apr"] / 1200:
        return {}, "That payment doesn't cover the monthly interest at this APR. Check the balance, APR, and payment."
    return out, None


@api_view(["GET"])
@login_required_api
def models(request):
    account = request.account
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except ValueError:
        page = 1
    payload = catalog_page(
        account,
        page=page,
        body=str(request.query_params.get("body") or "").strip(),
        seats=str(request.query_params.get("seats") or "").strip(),
        sort=str(request.query_params.get("sort") or "price_asc").strip(),
    )
    status = 200 if payload.get("source") != "error" else 502
    return Response(payload, status=status)


@api_view(["GET"])
@login_required_api
def model_detail_view(request):
    name = str(request.query_params.get("model") or "").strip()
    if not name:
        return Response({"detail": "Choose a model."}, status=400)
    payload = model_detail(name)
    if payload is None:
        return Response({"detail": "That model is not in the NHTSA catalog for the current year."}, status=404)
    return Response(payload)


def _decimal(value) -> Decimal | None:
    text = str(value or "").replace("$", "").replace(",", "").strip()
    if not text:
        return None
    try:
        return Decimal(text)
    except Exception:
        return None


def _year(value) -> int | None:
    try:
        year = int(value)
    except (TypeError, ValueError):
        return None
    return year if 1980 <= year <= 2030 else None
