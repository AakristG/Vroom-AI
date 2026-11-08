"""Transactional notices. Never report success unless a provider accepted the message."""

from __future__ import annotations

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def send_appointment_notice(appointment) -> dict:
    """Email only after a real booking. Pending requests do not send confirmation mail."""
    if appointment.status != "confirmed":
        return {
            "status": "not_sent",
            "detail": "Email is sent only after a scheduling provider confirms the slot. This request is not confirmed.",
        }
    key = getattr(settings, "EMAIL_PROVIDER_API_KEY", "") or ""
    sender = getattr(settings, "EMAIL_FROM_ADDRESS", "") or ""
    if not key or not sender or not appointment.contact_email:
        return {"status": "not_configured", "detail": "No email provider is configured, or this account has no email."}
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "from": sender,
                "to": [appointment.contact_email],
                "subject": f"Toyota NextMove AI — {appointment.category} request {appointment.appointment_id}",
                "text": (
                    f"Toyota NextMove AI prototype\n\n"
                    f"Reference: {appointment.appointment_id}\n"
                    f"Purpose: {appointment.category}\n"
                    f"When: {appointment.preferred_when} ({appointment.customer_time_zone})\n"
                    f"Location: {appointment.location_label or 'To be assigned'}\n"
                    f"This is not a change to your financing agreement.\n"
                ),
            },
            timeout=15,
        )
    except requests.RequestException:
        logger.exception("Appointment email failed")
        return {"status": "failed", "detail": "The email provider did not accept the message."}
    if not response.ok:
        return {"status": "failed", "detail": f"Email provider returned {response.status_code}."}
    body = response.json() if response.content else {}
    return {"status": "sent", "id": body.get("id") or ""}


def send_continuation_sms(payload: dict) -> dict:
    sid = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    sender = settings.TWILIO_FROM_NUMBER
    phone = str(payload.get("phone") or "")
    link = str(payload.get("link") or "")
    if not (sid and token and sender and phone and link):
        return {"ok": False, "detail": "Twilio SMS is not configured, so no text was sent."}
    try:
        response = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data={
                "To": phone,
                "From": sender,
                "Body": f"Toyota NextMove AI: continue on the website (link expires soon): {link}",
            },
            auth=(sid, token),
            timeout=12,
        )
    except requests.RequestException:
        logger.exception("Continuation SMS failed")
        return {"ok": False, "detail": "Twilio did not accept the message."}
    if not response.ok:
        return {"ok": False, "detail": "Twilio rejected the message."}
    return {"ok": True, "detail": "A short continuation link was sent. It does not include account numbers."}
