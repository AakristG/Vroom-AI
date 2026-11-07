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
