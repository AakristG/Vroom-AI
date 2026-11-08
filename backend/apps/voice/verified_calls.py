"""Bind Retell web call IDs to authenticated customers. Do not trust Retell metadata alone."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from .models import VerifiedWebCall

# Retell web-call access tokens are short-lived; keep our binding slightly longer than a typical call.
_TTL = timedelta(hours=2)


def register_verified_web_call(*, call_id: str, customer_id: str) -> VerifiedWebCall:
    call_id = (call_id or "").strip()
    customer_id = (customer_id or "").strip()
    if not call_id or not customer_id:
        raise ValueError("call_id and customer_id are required")
    row, _ = VerifiedWebCall.objects.update_or_create(
        call_id=call_id,
        defaults={
            "customer_id": customer_id,
            "expires_at": timezone.now() + _TTL,
        },
    )
    return row


def resolve_verified_customer(call_id: str) -> str | None:
    call_id = (call_id or "").strip()
    if not call_id:
        return None
    row = VerifiedWebCall.objects.filter(call_id=call_id).first()
    if not row:
        return None
    if row.expires_at <= timezone.now():
        return None
    return row.customer_id
