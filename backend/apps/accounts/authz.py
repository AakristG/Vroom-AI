"""Server-side session helpers. Tokens live in an HttpOnly cookie and/or the Authorization header."""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta
from functools import wraps

from django.conf import settings
from django.core.cache import caches
from django.utils import timezone
from rest_framework.response import Response

from .models import CustomerAccount

logger = logging.getLogger(__name__)

COOKIE_NAME = "tfs_session"
LOGIN_WINDOW = 15 * 60
LOGIN_MAX_ATTEMPTS = 8


def account_from_token(token: str | None) -> CustomerAccount | None:
    value = (token or "").strip()
    if not value:
        return None
    account = CustomerAccount.objects.filter(token=value).first()
    if not account:
        return None
    expires = account.token_expires_at
    if expires is not None and expires <= timezone.now():
        account.token = None
        account.token_expires_at = None
        account.save(update_fields=["token", "token_expires_at"])
        return None
    return account


def account_from_request(request) -> CustomerAccount | None:
    return account_from_token(_token_from_request(request))


def _token_from_request(request) -> str:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        if token:
            return token
    return (request.COOKIES.get(COOKIE_NAME) or "").strip()


def issue_session(account: CustomerAccount) -> None:
    account.token = secrets.token_urlsafe(32)
    account.token_expires_at = timezone.now() + timedelta(seconds=settings.AUTH_TOKEN_TTL_SECONDS)
    account.save(update_fields=["token", "token_expires_at"])


def clear_session(account: CustomerAccount | None) -> None:
    if not account:
        return
    account.token = None
    account.token_expires_at = None
    account.save(update_fields=["token", "token_expires_at"])


def attach_session_cookie(response: Response, account: CustomerAccount) -> Response:
    response.set_cookie(
        COOKIE_NAME,
        account.token or "",
        max_age=settings.AUTH_TOKEN_TTL_SECONDS,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path="/",
    )
    return response


def clear_session_cookie(response: Response) -> Response:
    response.delete_cookie(COOKIE_NAME, path="/", samesite="Lax")
    return response


def login_required_api(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        account = account_from_request(request)
        if account is None:
            return Response({"detail": "Sign in to continue."}, status=401)
        request.account = account
        return view(request, *args, **kwargs)

    return wrapped


def login_rate_limited(request) -> bool:
    key = _login_key(request)
    count = int(caches["default"].get(key) or 0)
    return count >= LOGIN_MAX_ATTEMPTS


def record_login_attempt(request) -> None:
    key = _login_key(request)
    cache = caches["default"]
    cache.set(key, int(cache.get(key) or 0) + 1, LOGIN_WINDOW)


def clear_login_attempts(request) -> None:
    caches["default"].delete(_login_key(request))


def _login_key(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR") or "unknown"
    return f"login-attempts:{ip}"
