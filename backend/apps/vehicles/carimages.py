"""CarImagesAPI client. Key and secret stay on the server. Images are provider-signed."""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import quote

from django.conf import settings
from django.core.cache import caches

from .http import ProviderAuthError, ProviderError, ProviderNotFound, request_json
from .matching import match_model

logger = logging.getLogger(__name__)

TTL_CATALOG = 60 * 60 * 24 * 7
IMAGE_VIEWS = ("front34", "side", "front", "rear34", "rear")
MAX_BATCH = 50


class CarImagesService:
    """Credentials are read from Django settings on each use so a restart picks up .env."""

    def __init__(self) -> None:
        self.cache = caches["vehicles"]

    @property
    def base(self) -> str:
        return (settings.CARIMAGES_BASE_URL or "https://carimagesapi.com").rstrip("/")

    @property
    def key(self) -> str:
        return (settings.CARIMAGES_API_KEY or "").strip()

    @property
    def secret(self) -> str:
        return (settings.CARIMAGES_API_SECRET or "").strip()

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
        """Mint one URL through the official signed-url endpoint (secret stays server-side)."""
        urls = self.signed_urls_batch(
            [{"make": make, "model": model, "year": str(year), "view": view, "width": str(width), "format": "webp"}]
        )
        if not urls:
            raise ProviderError("CarImagesAPI did not return a signed URL.", status=502, code="invalid")
        return urls[0]

    def signed_urls_batch(self, images: list[dict]) -> list[str]:
        """POST /api/v1/signed-urls. Max 50. Uses X-Api-Secret so the browser never sees the secret."""
        if not self.configured():
            raise ProviderAuthError("CarImagesAPI is not configured.")
        if not images:
            return []
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
        urls = body.get("urls") if isinstance(body, dict) else None
        if not isinstance(urls, list):
            # Some responses return a single `url` for a one-item batch.
            if isinstance(body, dict) and body.get("url"):
                return [str(body["url"])]
            logger.warning("CarImagesAPI signed-urls payload keys: %s", sorted(body.keys()) if isinstance(body, dict) else type(body).__name__)
            raise ProviderError("CarImagesAPI returned an unexpected signed-url payload.", status=502, code="invalid")
        return [str(u) for u in urls if u]

    def images_for(self, nhtsa_models: list[str], year: int) -> dict[str, dict]:
        if not self.configured():
            logger.warning("CarImagesAPI skipped: credentials not loaded.")
            return {}
        try:
            catalog = self.get_models_for_make("toyota")
        except ProviderAuthError:
            logger.warning("CarImagesAPI catalog auth failed — check CARIMAGES_API_KEY / CARIMAGES_API_SECRET.")
            return {}
        except ProviderError as exc:
            logger.warning("CarImagesAPI catalog failed: %s", exc)
            return {}
        logger.info("CarImagesAPI Toyota catalog: %s models", len(catalog))

        wanted: list[tuple[str, str, str]] = []  # nhtsa name, matched name, confidence
        for name in nhtsa_models:
            matched = match_model(name, catalog)
            if matched.confidence == "unavailable" or not matched.name:
                continue
            wanted.append((name, matched.name, matched.confidence))
        if not wanted:
            logger.warning("CarImagesAPI matched 0/%s NHTSA models.", len(nhtsa_models))
            return {}

        payloads: list[dict] = [
            {"make": "Toyota", "model": matched_name, "year": str(year), "view": "front34", "width": "800", "format": "webp"}
            for _, matched_name, _ in wanted
        ]
        thumbs: list[dict] = [
            {"make": "Toyota", "model": matched_name, "year": str(year), "view": "front34", "width": "400", "format": "webp"}
            for _, matched_name, _ in wanted
        ]
        try:
            urls = self._batched(payloads)
            thumb_urls = self._batched(thumbs)
        except ProviderError as exc:
            logger.warning("CarImagesAPI signed-url batch failed: %s", exc)
            return {}

        ttl = settings.CARIMAGES_SIGNED_URL_TTL
        expires_at = int(time.time()) + ttl
        out: dict[str, dict] = {}
        for i, (nhtsa_name, matched_name, confidence) in enumerate(wanted):
            url = urls[i] if i < len(urls) else None
            if not url:
                continue
            out[nhtsa_name] = {
                "url": url,
                "thumbnail": thumb_urls[i] if i < len(thumb_urls) else url,
                "views": {"front34": url},
                "match": confidence,
                "matched_name": matched_name,
                "provider": "CarImagesAPI",
                "source_page": None,
                "license_filter": None,
                "license_note": (
                    "Studio image from CarImagesAPI. Not an official Toyota photograph. "
                    + ("Closest generation match, not the exact configuration. " if confidence == "generation" else "")
                    + "Free-plan images may be watermarked."
                ),
                "expires_at": expires_at,
            }
        logger.info("CarImagesAPI signed %s/%s vehicle images for %s", len(out), len(nhtsa_models), year)
        return out

    def image_for(self, nhtsa_model: str, year: int) -> dict:
        found = self.images_for([nhtsa_model], year)
        if found.get(nhtsa_model):
            payload = dict(found[nhtsa_model])
            # Detail pages ask for extra camera angles.
            try:
                views = self._views_for(payload["matched_name"], year)
                if views.get("front34"):
                    payload["views"] = views
                    payload["url"] = views["front34"]
            except ProviderError as exc:
                logger.warning("CarImagesAPI extra views failed for %s: %s", nhtsa_model, exc)
            return payload
        return {
            "url": None,
            "thumbnail": None,
            "views": {},
            "match": "unavailable",
            "matched_name": None,
            "provider": "CarImagesAPI",
            "license_note": "Studio image from CarImagesAPI. Not an official Toyota photograph. Free-plan images may be watermarked.",
            "expires_at": None,
            "detail": "No CarImagesAPI match for this model.",
        }

    def _views_for(self, matched_name: str, year: int) -> dict[str, str]:
        req = [
            {"make": "Toyota", "model": matched_name, "year": str(year), "view": view, "width": "800", "format": "webp"}
            for view in IMAGE_VIEWS
        ]
        urls = self._batched(req)
        return {view: urls[i] for i, view in enumerate(IMAGE_VIEWS) if i < len(urls) and urls[i]}

    def _batched(self, images: list[dict]) -> list[str]:
        out: list[str] = []
        for i in range(0, len(images), MAX_BATCH):
            out.extend(self.signed_urls_batch(images[i : i + MAX_BATCH]))
        return out

    def generation_for(self, model_slug: str, year: int) -> dict | None:
        try:
            details = self.get_model_details("toyota", model_slug)
        except ProviderNotFound:
            return None
        except ProviderError:
            return None
        generations = details.get("generations") or []
        covering = [g for g in generations if _covers_year(g.get("year_start"), g.get("year_end"), year)]
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
