"""Toyota vehicle catalog API. CarsXE when CARSXE_API_KEY is set, otherwise the labeled demo dataset."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import carsxe
from .catalog import CATEGORIES, FUEL_TYPES, DemoProvider, provider
from .schemas import MarketValueResponse

logger = logging.getLogger(__name__)


def _year(request) -> int | None:
    raw = str(request.query_params.get("year") or "").strip()
    return int(raw) if raw.isdigit() else None


def _with_fallback(fn: Callable[[Any], Any]) -> tuple[Any, str, str | None]:
    """Run against the active provider. Listing calls fall back to demo data, labeled, if CarsXE fails."""
    active = provider()
    try:
        return fn(active), active.source, None
    except carsxe.CarsXEError as exc:
        logger.warning("CarsXE listing failed (%s); serving demo data", exc.status)
        return fn(DemoProvider()), "demo", str(exc)


@api_view(["GET"])
def status(request):
    return Response(
        {
            "carsxe_configured": carsxe.is_configured(),
            "source": provider().source,
            "categories": CATEGORIES,
            "fuel_types": FUEL_TYPES,
        }
    )


@api_view(["GET"])
def years(request):
    data, source, fallback = _with_fallback(lambda p: p.years())
    return Response({"years": data, "source": source, "fallback_reason": fallback})


@api_view(["GET"])
def models(request):
    year = _year(request)
    if not year:
        return Response({"detail": "year is required."}, status=400)
    data, source, fallback = _with_fallback(lambda p: p.models(year))
    return Response({"year": year, "models": data, "source": source, "fallback_reason": fallback})


@api_view(["GET"])
def trims(request):
    year = _year(request)
    model = str(request.query_params.get("model") or "").strip()
    if not year or not model:
        return Response({"detail": "year and model are required."}, status=400)
    data, source, fallback = _with_fallback(lambda p: p.trims(year, model))
    return Response({"year": year, "model": model, "trims": data, "source": source, "fallback_reason": fallback})


@api_view(["GET"])
def catalog(request):
    year = _year(request)
    if not year:
        return Response({"detail": "year is required."}, status=400)
    data, source, fallback = _with_fallback(lambda p: p.catalog(year))
    return Response({"year": year, "vehicles": [_summary(v) for v in data], "source": source, "fallback_reason": fallback})


@api_view(["GET"])
def detail(request):
    year = _year(request)
    model = str(request.query_params.get("model") or "").strip()
    trim = str(request.query_params.get("trim") or "").strip() or None
    if not year or not model:
        return Response({"detail": "year and model are required."}, status=400)
    record, error = lookup(year, model, trim)
    if error:
        return Response({"detail": error["detail"]}, status=error["status"])
    return Response(record)


@api_view(["GET"])
def image(request):
    year = _year(request)
    model = str(request.query_params.get("model") or "").strip()
    trim = str(request.query_params.get("trim") or "").strip() or None
    if not year or not model:
        return Response({"detail": "year and model are required."}, status=400)
    try:
        found = provider().image(year, model, trim)
    except carsxe.CarsXEError as exc:
        return Response({"image": None, "detail": str(exc)}, status=200)
    return Response({"image": found})


@api_view(["GET"])
def compare(request):
    """?v=2025|Camry|LE&v=2025|RAV4|LE — up to three vehicles."""
    ids = request.query_params.getlist("v")[:3]
    out, errors = [], []
    for raw in ids:
        parts = raw.split("|")
        if len(parts) < 2 or not parts[0].isdigit():
            errors.append({"id": raw, "detail": "Use year|model|trim."})
            continue
        record, error = lookup(int(parts[0]), parts[1], parts[2] if len(parts) > 2 and parts[2] else None)
        if error:
            errors.append({"id": raw, "detail": error["detail"]})
        else:
            out.append(record)
    return Response({"vehicles": out, "errors": errors})


@api_view(["GET"])
def market_value(request):
    """VIN-based market value from CarsXE. Estimates only, never an offer."""
    vin = str(request.query_params.get("vin") or "").strip().upper()
    if len(vin) != 17:
        return Response({"detail": "A 17-character VIN is required."}, status=400)
    if not carsxe.is_configured():
        return Response({"available": False, "detail": "CarsXE is not configured on the server."})
    params = {
        "vin": vin,
        "mileage": request.query_params.get("mileage"),
        "state": request.query_params.get("state") or "TX",
        "condition": "clean",
    }
    try:
        body = carsxe.client.get("/v2/marketvalue", params, MarketValueResponse, ttl=60 * 60 * 24)
    except carsxe.CarsXENotFound:
        return Response({"available": False, "detail": "CarsXE has no market value for that VIN."})
    except carsxe.CarsXEError as exc:
        return Response({"available": False, "detail": str(exc)}, status=502)
    trade = (body.trade_in_clean.model_dump() if body.trade_in_clean else {}) or {}
    retail = (body.retail_clean.model_dump() if body.retail_clean else {}) or {}
    return Response(
        {
            "available": True,
            "kind": "estimated_market_value",
            "trade_in_clean": trade.get("adjusted_trade_in_clean") or trade.get("base_trade_in_clean"),
            "retail_clean": retail.get("adjusted_retail_clean") or retail.get("base_retail_clean"),
            "note": "CarsXE market estimate. Not a guaranteed trade-in offer from Toyota.",
        }
    )


def lookup(year: int, model: str, trim: str | None) -> tuple[dict | None, dict | None]:
    """Full record with image, shared by the API and the assistant tools."""
    active = provider()
    try:
        record = active.detail(year, model, trim)
    except carsxe.CarsXERateLimited as exc:
        return None, {"status": 429, "detail": str(exc)}
    except carsxe.CarsXEError as exc:
        return None, {"status": 502, "detail": str(exc)}
    if not record:
        return None, {"status": 404, "detail": f"No {year} Toyota {model} {trim or ''} in {active.source} data.".replace("  ", " ")}
    try:
        record["image"] = active.image(year, model, trim)
    except carsxe.CarsXEError:
        record["image"] = None
    return record, None


def _summary(record: dict) -> dict:
    return {k: v for k, v in record.items() if k not in ("spec_groups", "features", "safety")}
