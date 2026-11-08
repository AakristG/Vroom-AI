"""Signed-in Toyota model listing, backed by the NHTSA catalog with Wikimedia Commons photos."""

from __future__ import annotations

import logging

from apps.vehicles import catalog as vehicles
from apps.vehicles.http import ProviderError

from .models import CustomerAccount

logger = logging.getLogger(__name__)

PAGE_SIZE = 9


def catalog_page(account: CustomerAccount, *, page: int, body: str, seats: str, sort: str) -> dict:
    year = vehicles.current_model_year()
    try:
        records = vehicles.catalog(year)
    except ProviderError as exc:
        logger.warning("Vehicle catalog failed: %s", exc)
        return {
            "source": "error",
            "detail": str(exc),
            "page": 1,
            "pages": 1,
            "total": 0,
            "models": [],
            "recommendations": _empty_recommendations(account),
        }

    filtered = records
    if body and body.lower() != "all":
        filtered = [item for item in filtered if (item.get("category") or "").lower() == body.lower()]
    if seats.isdigit():
        wanted = int(seats)
        filtered = [item for item in filtered if item.get("seating") == wanted]
    filtered = _sort_records(filtered, sort)
    total = len(filtered)
    pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    page = min(max(1, page), pages)
    start = (page - 1) * PAGE_SIZE
    window = filtered[start : start + PAGE_SIZE]
    return {
        "source": "nhtsa",
        "year": year,
        "page": page,
        "pages": pages,
        "total": total,
        "models": [_public(item) for item in window],
        "recommendations": _empty_recommendations(account),
        "pricing_note": "Verified pricing is not currently connected.",
    }


def model_detail(name: str) -> dict | None:
    year = vehicles.current_model_year()
    try:
        record = vehicles.detail(year, name, None)
    except ProviderError:
        logger.warning("Vehicle detail failed for %s", name)
        return None
    return _public(record) if record else None


def _sort_records(records: list[dict], sort: str) -> list[dict]:
    if sort == "name":
        return sorted(records, key=lambda item: str(item.get("model") or "").lower())
    if sort == "seats_desc":
        return sorted(records, key=lambda item: item.get("seating") or 0, reverse=True)
    if sort == "seats_asc":
        return sorted(records, key=lambda item: item.get("seating") or 0)
    return sorted(records, key=lambda item: str(item.get("model") or "").lower())


def _public(record: dict) -> dict:
    image = record.get("image") or {}
    return {
        "year": record.get("year"),
        "make": record.get("make") or "Toyota",
        "model": record.get("model"),
        "name": record.get("model"),
        "body": record.get("category"),
        "seats": record.get("seating"),
        "msrp": None,
        "invoice": None,
        "city_mpg": (record.get("mpg") or {}).get("city"),
        "highway_mpg": (record.get("mpg") or {}).get("highway"),
        "image": image.get("url"),
        "image_match": record.get("image_match"),
        "colors": [],
        "features": record.get("features") or [],
        "source": "nhtsa",
        "vehicle_type": record.get("vehicle_type"),
    }


def _empty_recommendations(account: CustomerAccount) -> dict:
    return {
        "life_change": account.life_change,
        "reason": "Verified pricing is not currently connected, so model recommendations that need MSRP are not shown.",
        "trade_in": None,
        "situation": None,
    }
