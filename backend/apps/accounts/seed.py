"""Create SQLite logins for the synthetic data-pack customers. Username and password are the first name."""

from __future__ import annotations

import json
from pathlib import Path

from django.contrib.auth.hashers import make_password
from django.db.utils import OperationalError, ProgrammingError

_PACK = Path(__file__).resolve().parents[2] / "data_pack" / "customer_profiles.json"
_done = False


def seed_demo_accounts() -> None:
    global _done
    if _done:
        return
    try:
        from .models import CustomerAccount

        if not _PACK.exists():
            _done = True
            return
        raw = json.loads(_PACK.read_text(encoding="utf-8"))
        profiles = raw if isinstance(raw, list) else raw.get("profiles", [])
        for profile in profiles:
            customer = profile.get("customer") or {}
            vehicle = profile.get("vehicle") or {}
            account = profile.get("account") or {}
            first = str(customer.get("first_name") or "").strip()
            cid = str(customer.get("customer_id") or "").strip()
            if not first or not cid:
                continue
            CustomerAccount.objects.get_or_create(
                username=first.lower(),
                defaults={
                    "password": make_password(first.lower()),
                    "first_name": first,
                    "city": customer.get("city") or "",
                    "state": customer.get("state") or "TX",
                    "customer_id": cid,
                    "current_payment": account.get("monthly_payment"),
                    "vehicle_model": vehicle.get("model") or "",
                    "vehicle_year": vehicle.get("model_year"),
                },
            )
    except (OperationalError, ProgrammingError):
        return
    _done = True
