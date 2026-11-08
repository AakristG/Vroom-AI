from django.db import models


class CallLog(models.Model):
    """Local record of a Retell call, populated from webhook events.

    This mirrors (a subset of) what's also written into SpacetimeDB
    (apps/spacetime/client.py) so there's a durable copy in Postgres/sqlite
    even if the realtime store is wiped during the hackathon.
    """

    call_id = models.CharField(max_length=128, unique=True)
    agent_id = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=32, default="registered")
    transcript = models.JSONField(default=list, blank=True)
    summary = models.TextField(blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"CallLog({self.call_id}, {self.status})"


class PendingAction(models.Model):
    """Server-side two-confirmation gate. The LLM cannot execute this row by itself."""

    DRAFT = "draft"
    AWAIT_INTENT = "awaiting_intent_confirmation"
    AWAIT_FINAL = "awaiting_final_confirmation"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    STATUS_CHOICES = [
        (DRAFT, DRAFT),
        (AWAIT_INTENT, AWAIT_INTENT),
        (AWAIT_FINAL, AWAIT_FINAL),
        (EXECUTING, EXECUTING),
        (COMPLETED, COMPLETED),
        (FAILED, FAILED),
        (CANCELLED, CANCELLED),
        (EXPIRED, EXPIRED),
    ]

    action_id = models.CharField(max_length=40, unique=True)
    customer_id = models.CharField(max_length=16, db_index=True)
    conversation_id = models.CharField(max_length=80, blank=True)
    call_id = models.CharField(max_length=128, blank=True)
    channel = models.CharField(max_length=16, default="web")
    action_type = models.CharField(max_length=48)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=40, choices=STATUS_CHOICES, default=DRAFT, db_index=True)
    summary = models.TextField()
    intent_confirmed_at = models.DateTimeField(null=True, blank=True)
    intent_evidence = models.CharField(max_length=240, blank=True)
    final_confirmed_at = models.DateTimeField(null=True, blank=True)
    final_evidence = models.CharField(max_length=240, blank=True)
    expires_at = models.DateTimeField()
    idempotency_key = models.CharField(max_length=80, unique=True)
    result = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class AppointmentRequest(models.Model):
    """Customer appointment or specialist-request record. Confirmed only after a real scheduler books it."""

    REQUESTED = "requested"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"

    appointment_id = models.CharField(max_length=40, unique=True)
    customer_id = models.CharField(max_length=16, db_index=True)
    category = models.CharField(max_length=64)
    status = models.CharField(max_length=24, default=REQUESTED, db_index=True)
    source = models.CharField(max_length=16, default="web")
    preferred_when = models.CharField(max_length=80, blank=True)
    customer_time_zone = models.CharField(max_length=64, default="America/Chicago")
    contact_phone = models.CharField(max_length=40, blank=True)
    contact_email = models.EmailField(blank=True)
    location_label = models.CharField(max_length=160, blank=True)
    representative_label = models.CharField(max_length=160, blank=True)
    notes = models.TextField(blank=True)
    conversation_id = models.CharField(max_length=80, blank=True)
    scheduling_provider_id = models.CharField(max_length=80, blank=True)
    email_status = models.CharField(max_length=32, default="not_sent")
    email_provider_id = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class CustomerEvent(models.Model):
    """Durable per-customer timeline. SpacetimeDB is a fan-out copy, not the account source of truth."""

    event_id = models.CharField(max_length=40, unique=True)
    customer_id = models.CharField(max_length=16, db_index=True)
    conversation_id = models.CharField(max_length=80, blank=True)
    call_id = models.CharField(max_length=128, blank=True)
    channel = models.CharField(max_length=16, default="web")
    event_type = models.CharField(max_length=40)
    payload = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)


class ContinuationToken(models.Model):
    """One-time link from an unverified phone call to website sign-in. Not a session credential."""

    token = models.CharField(max_length=64, unique=True)
    call_id = models.CharField(max_length=128)
    customer_id = models.CharField(max_length=16, blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class VerifiedWebCall(models.Model):
    """Server-minted browser call binding. Retell metadata alone is not proof of account ownership."""

    call_id = models.CharField(max_length=128, unique=True)
    customer_id = models.CharField(max_length=16, db_index=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
