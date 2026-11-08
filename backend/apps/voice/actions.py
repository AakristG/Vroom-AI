"""Two-confirmation action state machine. Authorization is independent of Nemotron."""

from __future__ import annotations

import hashlib
import logging
import re
import secrets
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from . import notify, representatives
from .live import try_event
from .models import AppointmentRequest, CustomerEvent, PendingAction

logger = logging.getLogger(__name__)

TTL_MINUTES = 15
CATEGORIES = {
    "trade_in": "Trade-in consultation",
    "general": "General representative consultation",
    "financing": "Financing assistance",
    "lease_end": "Lease-end assistance",
    "comparison": "Vehicle comparison consultation",
    "hardship": "Payment difficulty or hardship assistance",
    "recall": "Maintenance or recall guidance",
    "callback": "Specialist callback",
}

_YES = re.compile(
    r"^\s*(yes|yeah|yep|yup|correct|that's right|that is right|right|go ahead|please do|confirm|book it|do it|i confirm)\b",
    re.I,
)
_NO = re.compile(r"^\s*(no|nope|cancel|stop|never mind|nevermind|don't|do not)\b", re.I)


def is_affirmative(text: str) -> bool:
    return bool(_YES.match((text or "").strip()))


def is_rejection(text: str) -> bool:
    return bool(_NO.match((text or "").strip()))


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(10)}"


def _idempotency(customer_id: str, action_type: str, payload: dict) -> str:
    raw = f"{customer_id}|{action_type}|{sorted((payload or {}).items())}"
    return hashlib.sha256(raw.encode()).hexdigest()[:40]


def record_event(
    customer_id: str,
    event_type: str,
    payload: dict,
    *,
    channel: str = "web",
    conversation_id: str = "",
    call_id: str = "",
) -> None:
    if not customer_id:
        return
    CustomerEvent.objects.create(
        event_id=_new_id("evt"),
        customer_id=customer_id,
        conversation_id=conversation_id,
        call_id=call_id,
        channel=channel,
        event_type=event_type,
        payload=payload,
    )
    try_event(customer_id, event_type, payload)


def public_action(row: PendingAction) -> dict:
    return {
        "action_id": row.action_id,
        "type": "pending_action",
        "action_type": row.action_type,
        "status": row.status,
        "summary": row.summary,
        "stage": "intent" if row.status == PendingAction.AWAIT_INTENT else "final" if row.status == PendingAction.AWAIT_FINAL else row.status,
        "label": "Confirm this request" if row.status == PendingAction.AWAIT_INTENT else "Go ahead now" if row.status == PendingAction.AWAIT_FINAL else row.status,
        "expires_at": row.expires_at.isoformat(),
        "result": row.result,
        "payload": row.payload,
    }


def open_action(customer_id: str) -> PendingAction | None:
    now = timezone.now()
    PendingAction.objects.filter(
        customer_id=customer_id,
        status__in=[PendingAction.AWAIT_INTENT, PendingAction.AWAIT_FINAL],
        expires_at__lt=now,
    ).update(status=PendingAction.EXPIRED)
    return (
        PendingAction.objects.filter(
            customer_id=customer_id,
            status__in=[PendingAction.AWAIT_INTENT, PendingAction.AWAIT_FINAL],
            expires_at__gte=now,
        )
        .order_by("-created_at")
        .first()
    )


def propose(
    *,
    customer_id: str,
    action_type: str,
    payload: dict,
    summary: str,
    channel: str = "web",
    conversation_id: str = "",
    call_id: str = "",
) -> PendingAction:
    key = _idempotency(customer_id, action_type, payload)
    existing = PendingAction.objects.filter(idempotency_key=key).first()
    if existing and existing.status in {PendingAction.AWAIT_INTENT, PendingAction.AWAIT_FINAL, PendingAction.COMPLETED}:
        return existing
    open_action(customer_id)  # expire stale
    PendingAction.objects.filter(
        customer_id=customer_id,
        status__in=[PendingAction.AWAIT_INTENT, PendingAction.AWAIT_FINAL, PendingAction.DRAFT],
    ).exclude(idempotency_key=key).update(status=PendingAction.CANCELLED)
    row = PendingAction.objects.create(
        action_id=_new_id("act"),
        customer_id=customer_id,
        conversation_id=conversation_id,
        call_id=call_id,
        channel=channel,
        action_type=action_type,
        payload=payload,
        status=PendingAction.AWAIT_INTENT,
        summary=summary,
        expires_at=timezone.now() + timedelta(minutes=TTL_MINUTES),
        idempotency_key=key,
    )
    record_event(
        customer_id,
        "action_proposed",
        {"action_id": row.action_id, "summary": summary, "action_type": action_type},
        channel=channel,
        conversation_id=conversation_id,
        call_id=call_id,
    )
    return row


def _owned(action_id: str, customer_id: str) -> PendingAction:
    row = PendingAction.objects.filter(action_id=action_id, customer_id=customer_id).first()
    if not row:
        raise PermissionError("That request is not on this account.")
    if row.status == PendingAction.EXPIRED or row.expires_at <= timezone.now():
        if row.status not in {PendingAction.COMPLETED, PendingAction.FAILED, PendingAction.CANCELLED}:
            row.status = PendingAction.EXPIRED
            row.save(update_fields=["status", "updated_at"])
        raise PermissionError("That confirmation expired. Ask again to start over.")
    return row


def confirm_intent(action_id: str, customer_id: str, evidence: str) -> PendingAction:
    if not is_affirmative(evidence) and evidence not in {"ui_confirm_intent", "yes"}:
        raise PermissionError("Say yes to confirm those details, or cancel.")
    row = _owned(action_id, customer_id)
    if row.status != PendingAction.AWAIT_INTENT:
        raise PermissionError("This request is not waiting for the first confirmation.")
    row.status = PendingAction.AWAIT_FINAL
    row.intent_confirmed_at = timezone.now()
    row.intent_evidence = (evidence or "")[:240]
    row.save()
    record_event(customer_id, "confirmation_received", {"action_id": action_id, "stage": "intent"}, channel=row.channel, conversation_id=row.conversation_id, call_id=row.call_id)
    return row


def confirm_execution(action_id: str, customer_id: str, evidence: str) -> PendingAction:
    if not is_affirmative(evidence) and evidence not in {"ui_confirm_execute", "yes"}:
        raise PermissionError("Say yes to go ahead, or cancel.")
    row = _owned(action_id, customer_id)
    if row.status != PendingAction.AWAIT_FINAL:
        raise PermissionError("The first confirmation is still needed, or this request already finished.")
    return execute(row, evidence)


def cancel(action_id: str, customer_id: str) -> PendingAction:
    row = _owned(action_id, customer_id)
    if row.status in {PendingAction.COMPLETED, PendingAction.EXECUTING}:
        raise PermissionError("That request already finished.")
    row.status = PendingAction.CANCELLED
    row.save(update_fields=["status", "updated_at"])
    return row


def maybe_advance_from_utterance(customer_id: str, text: str) -> PendingAction | None:
    """Voice/chat: apply an explicit yes/no to the open action. Does not invent intent."""
    row = open_action(customer_id)
    if not row:
        return None
    if is_rejection(text):
        row.status = PendingAction.CANCELLED
        row.save(update_fields=["status", "updated_at"])
        return row
    if not is_affirmative(text):
        return row
    if row.status == PendingAction.AWAIT_INTENT:
        return confirm_intent(row.action_id, customer_id, text)
    if row.status == PendingAction.AWAIT_FINAL:
        return confirm_execution(row.action_id, customer_id, text)
    return row


@transaction.atomic
def execute(row: PendingAction, evidence: str) -> PendingAction:
    locked = PendingAction.objects.select_for_update().get(pk=row.pk)
    if locked.status == PendingAction.COMPLETED:
        return locked
    if locked.status != PendingAction.AWAIT_FINAL:
        raise PermissionError("Final confirmation is required before anything is submitted.")
    locked.status = PendingAction.EXECUTING
    locked.final_confirmed_at = timezone.now()
    locked.final_evidence = (evidence or "")[:240]
    locked.save(update_fields=["status", "final_confirmed_at", "final_evidence", "updated_at"])
    try:
        result = _run(locked)
        locked.result = result
        locked.status = PendingAction.COMPLETED if result.get("ok") else PendingAction.FAILED
        locked.save(update_fields=["result", "status", "updated_at"])
    except Exception:
        logger.exception("Action %s failed", locked.action_id)
        locked.status = PendingAction.FAILED
        locked.result = {"ok": False, "detail": "The request could not be completed."}
        locked.save(update_fields=["result", "status", "updated_at"])
    record_event(
        locked.customer_id,
        "action_completed" if locked.status == PendingAction.COMPLETED else "action_failed",
        {"action_id": locked.action_id, "result": locked.result},
        channel=locked.channel,
        conversation_id=locked.conversation_id,
        call_id=locked.call_id,
    )
    return locked


def _run(row: PendingAction) -> dict[str, Any]:
    kind = row.action_type
    payload = row.payload or {}
    if kind in {"book_appointment", "request_callback", "request_deferral_review", "request_human_transfer"}:
        return _persist_appointment(row, payload)
    if kind == "send_continuation_link":
        return notify.send_continuation_sms(payload)
    return {"ok": False, "detail": f"Unknown action type {kind}."}


def _persist_appointment(row: PendingAction, payload: dict) -> dict[str, Any]:
    category = payload.get("category") or CATEGORIES.get(row.action_type, row.action_type)
    loc = representatives.describe(payload.get("zip") or payload.get("city"))
    # Idempotent: a repeated final confirmation must not create a second appointment row.
    existing_id = (row.result or {}).get("appointment_id") if isinstance(row.result, dict) else None
    if existing_id:
        appt = AppointmentRequest.objects.filter(appointment_id=existing_id, customer_id=row.customer_id).first()
        if appt:
            return {
                "ok": True,
                "appointment_id": appt.appointment_id,
                "status": appt.status,
                "email_status": appt.email_status,
                "email_detail": "",
                "detail": (
                    "This specialist request was already recorded. It is not a confirmed calendar booking "
                    "unless a scheduling provider later confirms it. Nothing on your contract changed."
                ),
                "location": loc,
            }

    appt = AppointmentRequest.objects.create(
        appointment_id=_new_id("apt"),
        customer_id=row.customer_id,
        category=category,
        status=AppointmentRequest.REQUESTED,
        source=row.channel,
        preferred_when=str(payload.get("when") or ""),
        customer_time_zone=str(payload.get("time_zone") or "America/Chicago"),
        contact_phone=str(payload.get("phone") or ""),
        contact_email=str(payload.get("email") or ""),
        location_label=loc.get("label") or str(payload.get("location") or ""),
        representative_label=loc.get("organization") or "",
        notes=str(payload.get("notes") or ""),
        conversation_id=row.conversation_id,
        scheduling_provider_id="",
        email_status="not_sent",
    )
    email = notify.send_appointment_notice(appt)
    appt.email_status = email.get("status") or "not_sent"
    appt.email_provider_id = email.get("id") or ""
    appt.save(update_fields=["email_status", "email_provider_id", "updated_at"])
    from .live import save_appointment

    save_appointment(
        {
            "customer_id": row.customer_id,
            "name": payload.get("name") or "",
            "topic": category,
            "when": appt.preferred_when,
            "phone": appt.contact_phone,
            "sms": "not_configured",
            "status": appt.status,
        }
    )
    email_status = appt.email_status
    email_detail = str(email.get("detail") or "")
    if email_status == "sent":
        detail = (
            "A specialist request was recorded on your account and a confirmation email was accepted by the mail provider. "
            "It is not a confirmed calendar booking because no live scheduling provider is connected. "
            "Nothing on your contract changed."
        )
    elif email_status == "not_configured":
        detail = (
            "A specialist request was recorded on your account, but the confirmation email could not be sent "
            "(email provider is not configured). It is not a confirmed calendar booking. Nothing on your contract changed."
        )
    elif email_status in {"failed", "not_sent"}:
        detail = (
            "Your request was saved, but the confirmation email could not be sent. "
            "It is not a confirmed calendar booking. Nothing on your contract changed."
        )
    else:
        detail = (
            "A specialist request was recorded on your account. It is not a confirmed calendar booking "
            "because no live scheduling provider is connected. Nothing on your contract changed."
        )
    return {
        "ok": True,
        "appointment_id": appt.appointment_id,
        "status": appt.status,
        "email_status": email_status,
        "email_detail": email_detail,
        "detail": detail,
        "location": loc,
    }


STATUS_RANK = {
    AppointmentRequest.CONFIRMED: 0,
    AppointmentRequest.PENDING: 1,
    AppointmentRequest.REQUESTED: 2,
    AppointmentRequest.COMPLETED: 3,
    AppointmentRequest.CANCELLED: 4,
    AppointmentRequest.FAILED: 5,
}

STATUS_LABELS = {
    AppointmentRequest.REQUESTED: "Pending request",
    AppointmentRequest.PENDING: "Awaiting confirmation",
    AppointmentRequest.CONFIRMED: "Confirmed",
    AppointmentRequest.COMPLETED: "Completed",
    AppointmentRequest.CANCELLED: "Cancelled",
    AppointmentRequest.FAILED: "Failed",
}


def list_appointments(customer_id: str) -> list[dict]:
    rows = list(AppointmentRequest.objects.filter(customer_id=customer_id).order_by("-created_at")[:40])
    rows.sort(key=lambda r: (STATUS_RANK.get(r.status, 9), -(r.created_at.timestamp() if r.created_at else 0)))
    return [
        {
            "appointment_id": r.appointment_id,
            "category": r.category,
            "status": r.status,
            "status_label": STATUS_LABELS.get(r.status, r.status),
            "preferred_when": r.preferred_when,
            "confirmed_when": r.preferred_when if r.status == AppointmentRequest.CONFIRMED else "",
            "customer_time_zone": r.customer_time_zone,
            "contact_phone": r.contact_phone,
            "contact_email": r.contact_email,
            "contact_method": "phone" if r.contact_phone else ("email" if r.contact_email else ""),
            "location_label": r.location_label,
            "representative_label": r.representative_label,
            "email_status": r.email_status,
            "email_provider_id": r.email_provider_id,
            "source": r.source,
            "created_at": r.created_at.isoformat(),
            "is_confirmed_booking": r.status == AppointmentRequest.CONFIRMED,
        }
        for r in rows
    ]


def list_events(customer_id: str) -> list[dict]:
    rows = CustomerEvent.objects.filter(customer_id=customer_id).order_by("-occurred_at")[:40]
    return [
        {
            "event_id": r.event_id,
            "type": r.event_type,
            "channel": r.channel,
            "payload": r.payload,
            "occurred_at": r.occurred_at.isoformat(),
        }
        for r in rows
    ]
