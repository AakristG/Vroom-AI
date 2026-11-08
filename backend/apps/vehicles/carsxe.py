"""CarsXE HTTP client: cached, deduplicated, and rate-limit aware.

The API key is sent only from this server. It is never logged and never returned to the browser.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from typing import TypeVar

import requests
from django.conf import settings
from django.core.cache import caches
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_COOLDOWN_KEY = "carsxe:cooldown"
_NOT_FOUND = {"__carsxe_not_found__": True}


class CarsXEError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class CarsXENotFound(CarsXEError):
    pass


class CarsXERateLimited(CarsXEError):
    pass


def is_configured() -> bool:
    return bool(settings.CARSXE_API_KEY)


class CarsXEClient:
    def __init__(self) -> None:
        self._session = requests.Session()
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    @property
    def _cache(self):
        return caches["carsxe"]

    def _lock_for(self, key: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(key, threading.Lock())

    @staticmethod
    def _cache_key(path: str, params: dict) -> str:
        blob = json.dumps({"p": path, "q": params}, sort_keys=True, default=str)
        return "carsxe:" + hashlib.sha256(blob.encode()).hexdigest()

    def get(self, path: str, params: dict, schema: type[T], *, ttl: int | None = None) -> T:
        """GET a CarsXE endpoint. Identical concurrent requests share one upstream call."""
        if not is_configured():
            raise CarsXEError("CarsXE is not configured.")
        clean = {k: v for k, v in params.items() if v not in (None, "")}
        key = self._cache_key(path, clean)

        body = self._cache.get(key)
        if body is None:
            with self._lock_for(key):
                body = self._cache.get(key)
                if body is None:
                    body = self._fetch(path, clean, key, ttl)
        if body == _NOT_FOUND:
            raise CarsXENotFound("No CarsXE match.", 404)
        try:
            return schema.model_validate(body)
        except ValidationError as exc:
            logger.warning("CarsXE %s returned an unexpected shape: %s", path, exc.error_count())
            raise CarsXEError("CarsXE returned data in an unexpected format.", 502) from exc

    def _fetch(self, path: str, params: dict, key: str, ttl: int | None) -> dict:
        if self._cache.get(_COOLDOWN_KEY):
            raise CarsXERateLimited("CarsXE usage limit reached. Try again shortly.", 429)
        try:
            response = self._session.get(
                f"{settings.CARSXE_BASE_URL}{path}",
                params={**params, "key": settings.CARSXE_API_KEY},
                timeout=12,
            )
        except requests.RequestException as exc:
            # The exception text contains the request URL, which includes the key.
            logger.warning("CarsXE %s request failed: %s", path, type(exc).__name__)
            raise CarsXEError("CarsXE did not respond.", 504) from None

        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After", "")
            self._cache.set(_COOLDOWN_KEY, True, int(retry_after) if retry_after.isdigit() else 60)
            raise CarsXERateLimited("CarsXE usage limit reached. Try again shortly.", 429)
        if response.status_code == 404:
            self._cache.set(key, _NOT_FOUND, 60 * 60 * 24)
            return _NOT_FOUND
        if response.status_code in (401, 402, 403):
            raise CarsXEError("CarsXE rejected the API key or plan for this endpoint.", response.status_code)
        if not response.ok:
            raise CarsXEError(f"CarsXE returned {response.status_code}.", response.status_code)

        try:
            body = response.json()
        except ValueError:
            raise CarsXEError("CarsXE returned a non-JSON response.", 502) from None
        if isinstance(body, dict) and body.get("success") is False:
            self._cache.set(key, _NOT_FOUND, 60 * 60 * 24)
            return _NOT_FOUND
        self._cache.set(key, body, ttl)
        return body


client = CarsXEClient()
