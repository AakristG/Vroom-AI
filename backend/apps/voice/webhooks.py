"""
Retell AI post-call webhook endpoint.

Configure this URL (e.g. https://<your-domain>/api/voice/webhook/) in the Retell dashboard
under Agent -> Webhook URL. Retell POSTs `call_started`, `call_ended`, and `call_analyzed`
events here.

Signature verification follows:
https://docs.retellai.com/features/secure-webhook

  X-Retell-Signature: "v={timestamp_ms},d={hex_hmac_sha256}"
  digest = HMAC-SHA256(key=RETELL_API_KEY, msg=raw_body + timestamp_ms)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time

from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import CallLog

_SIGNATURE_RE = re.compile(r"v=(\d+),d=(.*)")
_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000


def verify_retell_signature(raw_body: bytes, signature_header: str | None, api_key: str) -> bool:
    if not signature_header or not api_key:
        return False

    match = _SIGNATURE_RE.match(signature_header)
    if not match:
        return False

    timestamp_str, digest = match.group(1), match.group(2)

    now_ms = int(time.time() * 1000)
    if abs(now_ms - int(timestamp_str)) > _MAX_CLOCK_SKEW_MS:
        return False

    expected = hmac.new(
        api_key.encode("utf-8"),
        raw_body + timestamp_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, digest)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def post_call_webhook(request):
    raw_body = request.body
    signature = request.headers.get("X-Retell-Signature")

    if not verify_retell_signature(raw_body, signature, settings.RETELL_API_KEY):
        return Response({"message": "Unauthorized"}, status=401)

    payload = json.loads(raw_body.decode("utf-8"))
    event = payload.get("event")
    call = payload.get("call", {})
    call_id = call.get("call_id")

    if not call_id:
        return Response({"message": "Missing call_id"}, status=400)

    log, _ = CallLog.objects.get_or_create(call_id=call_id)
    log.agent_id = call.get("agent_id", log.agent_id)
    log.status = call.get("call_status", log.status)
    log.transcript = call.get("transcript_object", log.transcript)
    log.summary = (call.get("call_analysis") or {}).get("call_summary", log.summary)
    log.raw_payload = payload
    log.save()

    # TODO: also mirror this into SpacetimeDB so the live dashboard updates, e.g.:
    #   from apps.spacetime.client import call_reducer
    #   call_reducer("upsert_call_session", [call_id, log.agent_id, log.status, "", now_iso])

    return Response(status=204)
