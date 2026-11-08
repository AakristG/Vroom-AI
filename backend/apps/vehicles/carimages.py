"""CarImagesAPI client. Key and secret stay on the server. Images are HMAC-signed."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any
from urllib.parse import quote, urlencode

from django.conf import settings
from django.core.cache import caches

from .http import ProviderAuthError, ProviderError, ProviderNotFound, request_json
from .matching import match_model

logger = logging.getLogger(__name__)

TTL_CATALOG = 60 * 60 * 24 * 7
IMAGE_VIEWS = ("front34", "side", "front", "rear34", "rear")
MAX_BATCH = 50


class CarImagesService:
    def __init__(self) -> None:
        self.base = settings.CARIMAGES_BASE_URL.rstrip("/")
        self.key = (settings.CARIMAGES_API_KEY or "").strip()
        self.secret = (settings.CARIMAGES_API_SECRET or "").strip()
        self.cache = caches["vehicles"]

    def configured(self) -> bool:
        return bool(self.key and self.secret)

    def _headers(self) -> dict[str, str]:
        return {"X-Api-Secret": self.secret}

    def _params(self) -> dict[str, str]:
        return {"api_key": self.key}

    def _get(self, path: str, ttl: int, cache_key: str) -> Any:
        if not self.configured():
            raise ProviderAuthError("CarImagesAPI is not configured.")
        hit = self.cache.get(cache_key)
        if hit is not None:
            return hit
        url = f"{self.base}{path}"
        body = request_json("GET", url, params=self._params(), headers=self._headers(), provider="CarImagesAPI")
        self.cache.set(cache_key, body, ttl)
        return body

    def get_makes(self) -> list[dict]:
        body = self._get("/api/v1/makes", TTL_CATALOG, "ci:makes")
        return list(body.get("data") or [])

    def get_models_for_make(self, make: str = "toyota") -> list[dict]:
        slug = make.strip().lower()
        body = self._get(f"/api/v1/makes/{quote(slug, safe='')}/models", TTL_CATALOG, f"ci:models:{slug}")
        return list(body.get("data") or [])

    def get_model_details(self, make: str, model_slug: str) -> dict:
        make_slug = make.strip().lower()
        key = f"ci:model:{make_slug}:{model_slug}"
        body = self._get(
            f"/api/v1/makes/{quote(make_slug, safe='')}/models/{quote(model_slug, safe='')}",
            TTL_CATALOG,
            key,
        )
        return body if isinstance(body, dict) else {}

    def signed_url(self, make: str, model: str, year: int | str, view: str = "front34", width: int = 800) -> str:
        if not self.configured():
            raise ProviderAuthError("CarImagesAPI is not configured.")
        ttl = settings.CARIMAGES_SIGNED_URL_TTL
        expires = str(int(time.time()) + ttl)
        params = {
            "api_key": self.key,
            "expires": expires,
            "format": "webp",
            "make": make,
            "model": model,
            "type": "car",
            "view": view,
            "width": str(width),
            "year": str(year),
        }
        canonical = "&".join(f"{k}={quote(v, safe='')}" for k, v in sorted(params.items()))
        params["sig"] = hmac.new(self.secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
        return f"{self.base}/image?{urlencode(params)}"

    def signed_urls_batch(self, images: list[dict]) -> list[str]:
        """POST /api/v1/signed-urls. Used when HMAC self-sign is not preferred. Max 50."""
        if not self.configured():
            raise ProviderAuthError("CarImagesAPI is not configured.")
        if len(images) > MAX_BATCH:
            raise ProviderError("CarImagesAPI allows at most 50 images per batch.", status=400, code="invalid")
        url = f"{self.base}/api/v1/signed-urls"
        body = request_json(
            "POST",
            url,
            params=self._params(),
            json={"images": images},
            headers=self._headers(),
            provider="CarImagesAPI",
        )
        urls = body.get("urls") or []
        if not isinstance(urls, list):
            raise ProviderError("CarImagesAPI returned an unexpected signed-url payload.", status=502, code="invalid")
        return [str(u) for u in urls]

    def image_for(self, nhtsa_model: str, year: int) -> dict:
        """Match a NHTSA model to the CarImages catalog, then HMAC-sign view URLs."""
        empty = {
            "url": None,
            "thumbnail": None,
            "views": {},
            "match": "unavailable",
            "matched_name": None,
            "provider": "CarImagesAPI",
            "license_note": "Studio image from CarImagesAPI. Not an official Toyota photograph. Free-plan images may be watermarked.",
            "expires_at": None,
        }
        if not self.configured():
            return {**empty, "detail": "CarImagesAPI credentials are not configured."}
        try:
            catalog = self.get_models_for_make("toyota")
        except ProviderAuthError as exc:
            logger.warning("CarImagesAPI catalog auth failed")
            return {**empty, "detail": str(exc)}
        except ProviderError as exc:
            logger.warning("CarImagesAPI catalog failed: %s", exc)
            return {**empty, "detail": "Vehicle images are unavailable right now."}

        matched = match_model(nhtsa_model, catalog)
        if matched.confidence == "unavailable" or not matched.name:
            return empty

        ttl = settings.CARIMAGES_SIGNED_URL_TTL
        views = {}
        for view in IMAGE_VIEWS:
            views[view] = self.signed_url("Toyota", matched.name, year, view=view)
        expires_at = int(time.time()) + ttl
        return {
            "url": views.get("front34"),
            "thumbnail": self.signed_url("Toyota", matched.name, year, view="front34", width=400),
            "views": views,
            "match": matched.confidence,
            "matched_name": matched.name,
            "matched_slug": matched.slug,
            "provider": "CarImagesAPI",
            "source_page": None,
            "license_filter": None,
            "license_note": (
                "Studio image from CarImagesAPI. Not an official Toyota photograph. "
                + ("Closest generation match, not the exact configuration. " if matched.confidence == "generation" else "")
                + "Free-plan images may be watermarked."
            ),
            "expires_at": expires_at,
        }

    def generation_for(self, model_slug: str, year: int) -> dict | None:
        try:
            details = self.get_model_details("toyota", model_slug)
        except ProviderNotFound:
            return None
        except ProviderError:
            return None
        generations = details.get("generations") or []
        covering = [
            g
            for g in generations
            if _covers_year(g.get("year_start"), g.get("year_end"), year)
        ]
        if len(covering) == 1:
            return covering[0]
        return None


def _covers_year(start: Any, end: Any, year: int) -> bool:
    try:
        start_year = int(start) if start is not None else None
    except (TypeError, ValueError):
        start_year = None
    try:
        end_year = int(end) if end is not None else None
    except (TypeError, ValueError):
        end_year = None
    if start_year is None:
        return False
    if year < start_year:
        return False
    if end_year is None:
        return True
    return year <= end_year


carimages = CarImagesService()
