"""CarsXE HTTP client: cached, deduplicated, and rate-limit aware.

The API key is sent only from this server. It is never logged and never returned to the browser.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from pathlib import Path
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


def has_saved_catalog() -> bool:
    root = Path(settings.BASE_DIR) / "data" / "carsxe"
    return root.is_dir() and any(root.glob("*/*.json"))


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
        return hashlib.sha256(blob.encode()).hexdigest()

    @staticmethod
    def _store_path(key: str) -> Path:
        root = Path(settings.BASE_DIR) / "data" / "carsxe"
        return root / key[:2] / f"{key}.json"

    def _read_store(self, key: str) -> dict | None:
        path = self._store_path(key)
        if not path.is_file():
            return None
        try:
            body = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return body if isinstance(body, dict) else None

    def _write_store(self, key: str, body: dict) -> None:
        path = self._store_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(body), encoding="utf-8")
        temporary.replace(path)

    def get(self, path: str, params: dict, schema: type[T], *, ttl: int | None = None) -> T:
        """Return a saved CarsXE response. The API is called only when this query has never been stored."""
        del ttl  # Saved responses stay on disk. A new year, model, image, or VIN is a new query.
        clean = {k: v for k, v in params.items() if v not in (None, "")}
        key = self._cache_key(path, clean)

        body = self._saved(key)
        if body is None:
            with self._lock_for(key):
                body = self._saved(key)
                if body is None:
                    body = self._fetch(path, clean, key)
        if body == _NOT_FOUND:
            raise CarsXENotFound("No CarsXE match.", 404)
        try:
            return schema.model_validate(body)
        except ValidationError as exc:
            logger.warning("CarsXE %s returned an unexpected shape: %s", path, exc.error_count())
            raise CarsXEError("CarsXE returned data in an unexpected format.", 502) from exc

    def _saved(self, key: str) -> dict | None:
        body = self._read_store(key)
        if body is not None:
            return body
        legacy = self._cache.get("carsxe:" + key)
        if isinstance(legacy, dict) and legacy != _NOT_FOUND:
            self._write_store(key, legacy)
            return legacy
        return None

    def _fetch(self, path: str, params: dict, key: str) -> dict:
        if not is_configured():
            raise CarsXEError("CarsXE is not configured.")
        if self._cache.get(_COOLDOWN_KEY):
            raise CarsXERateLimited("CarsXE usage limit reached. Try again shortly.", 429)
        try:
            response = self._session.get(
                f"{settings.CARSXE_BASE_URL}{path}",
                params={**params, "key": settings.CARSXE_API_KEY},
                timeout=30,
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
            return _NOT_FOUND
        self._write_store(key, body)
        return body


client = CarsXEClient()
