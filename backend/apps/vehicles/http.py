"""Shared HTTP helper for NHTSA and CarImagesAPI: timeouts, retries, and classified errors."""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 15
RETRYABLE = {429, 500, 502, 503, 504}
USER_AGENT = "ToyotaNextMoveAI/hackutd (educational prototype; server-side only)"


class ProviderError(Exception):
    def __init__(self, message: str, status: int = 502, code: str = "provider_error", retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.code = code
        self.retryable = retryable


class ProviderAuthError(ProviderError):
    def __init__(self, message: str = "The vehicle image service rejected the credentials.", status: int = 401):
        super().__init__(message, status=status, code="auth", retryable=False)


class ProviderRateLimit(ProviderError):
    def __init__(self, message: str = "The vehicle service asked us to slow down.", status: int = 429):
        super().__init__(message, status=status, code="rate_limit", retryable=True)


class ProviderNotFound(ProviderError):
    def __init__(self, message: str = "No matching vehicle was returned.", status: int = 404):
        super().__init__(message, status=status, code="not_found", retryable=False)


def request_json(
    method: str,
    url: str,
    *,
    params: dict | None = None,
    json: dict | None = None,
    headers: dict | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    retries: int = 2,
    provider: str = "provider",
) -> Any:
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})}
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            response = requests.request(
                method,
                url,
                params=params,
                json=json,
                headers=hdrs,
                timeout=timeout,
            )
        except requests.Timeout as exc:
            last_error = ProviderError(f"{provider} timed out.", status=504, code="timeout", retryable=True)
            logger.warning("%s timeout on %s %s", provider, method, url)
            _backoff(attempt)
            continue
        except requests.RequestException as exc:
            last_error = ProviderError(f"{provider} did not respond.", status=504, code="network", retryable=True)
            logger.warning("%s network error on %s %s: %s", provider, method, url, type(exc).__name__)
            _backoff(attempt)
            continue

        if response.status_code in (401, 403):
            logger.warning("%s auth failure %s on %s", provider, response.status_code, url)
            raise ProviderAuthError(status=response.status_code)
        if response.status_code == 404:
            raise ProviderNotFound()
        if response.status_code == 429:
            last_error = ProviderRateLimit()
            logger.warning("%s rate limited on %s", provider, url)
            _backoff(attempt, extra=1.5)
            continue
        if response.status_code == 400:
            raise ProviderError(f"{provider} rejected the request.", status=400, code="invalid", retryable=False)
        if response.status_code in RETRYABLE:
            last_error = ProviderError(
                f"{provider} returned {response.status_code}.",
                status=502,
                code="unavailable",
                retryable=True,
            )
            _backoff(attempt)
            continue
        if not response.ok:
            raise ProviderError(f"{provider} returned {response.status_code}.", status=502, code="unavailable")
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise ProviderError(f"{provider} returned a non-JSON response.", status=502, code="invalid") from exc

    raise last_error or ProviderError(f"{provider} did not respond.", status=504, code="network", retryable=True)


def _backoff(attempt: int, extra: float = 0.0) -> None:
    time.sleep(min(4.0, 0.4 * (2**attempt) + extra))
