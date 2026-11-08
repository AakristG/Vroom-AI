"""Transactional notices. Never report success unless a provider accepted the message."""

from __future__ import annotations

import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

STATUS_LABELS = {
    "requested": "Pending request",
    "pending": "Awaiting confirmation",
    "confirmed": "Confirmed",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "failed": "Failed",
}

# Synthetic data-pack customers use IDs like C001. Never treat arbitrary production IDs as demo.
_SIMULATED_CUSTOMER_RE = re.compile(r"^C\d{3}$")


def resolve_notification_email(*, customer_id: str, contact_email: str) -> str:
    """Pick the outbound destination. Demo override applies only in DEBUG for simulated pack accounts."""
    override = (getattr(settings, "DEMO_NOTIFICATION_EMAIL_OVERRIDE", "") or "").strip()
    if (
        getattr(settings, "DEBUG", False)
        and override
        and _SIMULATED_CUSTOMER_RE.match((customer_id or "").strip())
    ):
        return override
    return (contact_email or "").strip()


def send_appointment_notice(appointment) -> dict:
    """Send a real Resend email for a saved specialist request or confirmed booking.

    Pending requests get an acknowledgment that clearly says they are not confirmed.
    Confirmed bookings get confirmation language. Never claim a pending request is booked.
    """
    if appointment.email_provider_id and appointment.email_status == "sent":
        return {
            "status": "sent",
            "id": appointment.email_provider_id,
            "detail": "Confirmation email was already accepted by the provider for this request.",
        }

    key = getattr(settings, "EMAIL_PROVIDER_API_KEY", "") or ""
    sender = getattr(settings, "EMAIL_FROM_ADDRESS", "") or ""
    to_addr = resolve_notification_email(
        customer_id=getattr(appointment, "customer_id", "") or "",
        contact_email=getattr(appointment, "contact_email", "") or "",
    )
    if not key or not sender:
        return {
            "status": "not_configured",
            "detail": "Email is not configured. Set EMAIL_PROVIDER_API_KEY and EMAIL_FROM_ADDRESS (Resend).",
        }
    if not to_addr:
        return {
            "status": "not_sent",
            "detail": "This account has no email address on file, so no confirmation email was sent.",
        }

    status = appointment.status or "requested"
    label = STATUS_LABELS.get(status, status)
    is_confirmed = status == "confirmed"
    when_line = appointment.preferred_when or "Not specified"
    tz = appointment.customer_time_zone or "America/Chicago"
    confirmed_line = (
        f"Confirmed time: {when_line} ({tz})\n"
        if is_confirmed
        else f"Requested time: {when_line} ({tz})\n"
        "Status note: This is a pending specialist request, not a confirmed calendar booking.\n"
    )
    rep = appointment.representative_label.strip() if appointment.representative_label else ""
    loc = appointment.location_label.strip() if appointment.location_label else ""
    phone = appointment.contact_phone.strip() if appointment.contact_phone else ""

    subject = (
        f"Vroom AI — confirmed {appointment.category} appointment {appointment.appointment_id}"
        if is_confirmed
        else f"Vroom AI — {appointment.category} request {appointment.appointment_id} received"
    )
    customer_name = ""
    try:
        from apps.accounts.models import CustomerAccount

        row = CustomerAccount.objects.filter(customer_id=appointment.customer_id).first()
        if row:
            customer_name = (row.first_name or "").strip()
    except Exception:
        customer_name = ""

    greeting = f"Hello {customer_name},\n\n" if customer_name else "Hello,\n\n"
    text = (
        "Vroom AI\n"
        "Toyota Financial Services customer prototype\n\n"
        f"{greeting}"
        f"We recorded the following on your account.\n\n"
        f"Reference: {appointment.appointment_id}\n"
        f"Customer ID on file: {appointment.customer_id}\n"
        f"Purpose: {appointment.category}\n"
        f"Status: {label}\n"
        f"{confirmed_line}"
        f"Representative: {rep or 'To be assigned when verified'}\n"
        f"Location: {loc or 'To be assigned when verified'}\n"
        f"Contact phone on the request: {phone or 'Not provided'}\n\n"
        "This notice does not change your financing agreement.\n"
        "Nothing on your contract changes until you authorize it with Toyota Financial Services.\n"
    )

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "from": sender,
                "to": [to_addr],
                "subject": subject,
                "text": text,
            },
            timeout=15,
        )
    except requests.RequestException:
        logger.exception("Appointment email failed")
        return {"status": "failed", "detail": "The email provider did not accept the message."}
    if not response.ok:
        return {"status": "failed", "detail": f"Email provider returned {response.status_code}."}
    body = response.json() if response.content else {}
    return {"status": "sent", "id": body.get("id") or "", "detail": "Email accepted by Resend."}


def send_specialist_alert(appointment, *, first_name: str = "", topic_detail: str = "") -> dict:
    """Email the specialist a callback task: who to call, at what number, and why.

    The specialist then calls the customer from their own phone, so no Retell or Twilio number is
    needed. Goes to SPECIALIST_EMAIL; nothing is sent when it (or Resend) is not configured.
    """
    key = getattr(settings, "EMAIL_PROVIDER_API_KEY", "") or ""
    sender = getattr(settings, "EMAIL_FROM_ADDRESS", "") or ""
    to_addr = (getattr(settings, "SPECIALIST_EMAIL", "") or "").strip()
    if not key or not sender or not to_addr:
        return {"status": "not_configured",
                "detail": "Set EMAIL_PROVIDER_API_KEY, EMAIL_FROM_ADDRESS and SPECIALIST_EMAIL to alert a specialist."}
    phone = (appointment.contact_phone or "").strip()
    if not phone:
        return {"status": "not_sent", "detail": "The request has no callback number."}

    name = first_name.strip()
    if not name:
        try:
            from apps.accounts.models import CustomerAccount

            row = CustomerAccount.objects.filter(customer_id=appointment.customer_id).first()
            name = (row.first_name or "").strip() if row else ""
        except Exception:
            name = ""
    who = name or f"Customer {appointment.customer_id}"
    when = appointment.preferred_when or "As soon as possible"
    tz = appointment.customer_time_zone or "America/Chicago"
    subject = f"Call back {who} at {phone} — {appointment.category} ({appointment.appointment_id})"
    text = (
        "Vroom AI — specialist callback request\n\n"
        f"Please call {who} back.\n\n"
        f"Callback number: {phone}\n"
        f"Topic: {appointment.category}\n"
        f"Preferred time: {when} ({tz})\n"
        f"Customer ID: {appointment.customer_id}\n"
        f"Reference: {appointment.appointment_id}\n"
        f"Requested through: {appointment.source or 'website'}\n"
        + (f"Notes: {appointment.notes}\n" if appointment.notes else "")
        + (f"Context: {topic_detail}\n" if topic_detail else "")
        + "\nThe customer confirmed this request and was told a specialist will call them.\n"
        "Nothing on their contract has changed.\n"
    )
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"from": sender, "to": [to_addr], "subject": subject, "text": text},
            timeout=15,
        )
    except requests.RequestException:
        logger.exception("Specialist alert email failed")
        return {"status": "failed", "detail": "The email provider could not be reached."}
    if not response.ok:
        logger.warning("Specialist alert rejected by Resend %s: %s", response.status_code, response.text[:300])
        return {"status": "failed", "detail": f"Email provider returned {response.status_code}."}
    body = response.json() if response.content else {}
    return {"status": "sent", "id": body.get("id") or "", "detail": "Specialist alert accepted by Resend."}
