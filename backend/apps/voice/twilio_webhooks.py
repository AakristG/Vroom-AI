"""Twilio inbound webhooks. Signature-verified. Does not treat caller ID as account proof."""

from __future__ import annotations

import logging
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

logger = logging.getLogger(__name__)


def _valid_twilio(request) -> bool:
    token = settings.TWILIO_AUTH_TOKEN
    if not token:
        return False
    try:
        from twilio.request_validator import RequestValidator
    except ImportError:
        logger.warning("twilio package is not installed; inbound webhooks are rejected.")
        return False
    signature = request.headers.get("X-Twilio-Signature") or ""
    url = request.build_absolute_uri()
    params = request.POST.dict()
    return RequestValidator(token).validate(url, params, signature)


def _twiml(message: str) -> HttpResponse:
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Say>{message}</Say></Response>"
    )
    return HttpResponse(body, content_type="text/xml")


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def inbound_voice(request):
    if not _valid_twilio(request):
        return HttpResponse("Unauthorized", status=401)
    # Do not look up accounts by From. Point the caller at the website or a configured Retell SIP path.
    say = (
        "Thank you for calling Toyota Next Move A I. "
        "This number is connected for inbound events, but a telephone agent is only live "
        "after Retell and Twilio SIP are configured in the dashboards. "
        "Please sign in on the website to continue a private conversation."
    )
    return _twiml(say)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def inbound_sms(request):
    if not _valid_twilio(request):
        return HttpResponse("Unauthorized", status=401)
    body = (request.POST.get("Body") or "").strip().upper()
    if body in {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"}:
        xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You are unsubscribed from Toyota Vroom AI texts.</Message></Response>'
        return HttpResponse(xml, content_type="text/xml")
    xml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    return HttpResponse(xml, content_type="text/xml")
