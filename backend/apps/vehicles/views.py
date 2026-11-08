"""Toyota vehicle catalog API. NHTSA + bundled Wikimedia Commons photos. Authentication required."""

from __future__ import annotations

import logging

from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api

from . import catalog as catalog_service
from .http import ProviderError
from .nhtsa import VIN_RE, nhtsa

logger = logging.getLogger(__name__)


def _year(request) -> int | None:
    raw = str(request.query_params.get("year") or "").strip()
    return int(raw) if raw.isdigit() else None


@api_view(["GET"])
@login_required_api
def status(request):
    return Response(
        {
            "images": "Wikimedia Commons",
            "source": "nhtsa",
            "categories": catalog_service.CATEGORIES,
            "fuel_types": catalog_service.FUEL_TYPES,
            "default_year": catalog_service.current_model_year(),
            "pricing": "unavailable",
            "pricing_note": "Verified pricing is not currently connected.",
        }
    )


@api_view(["GET"])
@login_required_api
def years(request):
    try:
        data = catalog_service.years()
    except ProviderError as exc:
        return Response({"detail": str(exc), "years": [], "source": "nhtsa"}, status=exc.status)
    return Response({"years": data, "source": "nhtsa", "fallback_reason": None, "default_year": catalog_service.current_model_year()})


@api_view(["GET"])
@login_required_api
def models(request):
    year = _year(request)
    if not year:
        return Response({"detail": "year is required."}, status=400)
    try:
        data = catalog_service.models(year)
    except ProviderError as exc:
        return Response({"detail": str(exc)}, status=exc.status)
    return Response({"year": year, "models": data, "source": "nhtsa", "fallback_reason": None})


@api_view(["GET"])
@login_required_api
def trims(request):
    year = _year(request)
    model = str(request.query_params.get("model") or "").strip()
    if not year or not model:
        return Response({"detail": "year and model are required."}, status=400)
    return Response(
        {
            "year": year,
            "model": model,
            "trims": catalog_service.trims(year, model),
            "source": "nhtsa",
            "fallback_reason": None,
            "note": "NHTSA vPIC does not publish trim lines for this listing.",
        }
    )


@api_view(["GET"])
@login_required_api
def catalog(request):
    year = _year(request)
    if not year:
        return Response({"detail": "year is required."}, status=400)
    category = str(request.query_params.get("category") or "").strip()
    try:
        data = catalog_service.catalog(year)
    except ProviderError as exc:
        logger.warning("Catalog failed for %s: %s", year, exc)
        return Response({"detail": str(exc), "vehicles": [], "source": "nhtsa"}, status=exc.status)
    if category:
        data = [v for v in data if (v.get("category") or "") == category]
    if not data:
        return Response(
            {
                "year": year,
                "vehicles": [],
                "source": "nhtsa",
                "fallback_reason": None,
                "detail": "No matching Toyota models were found for this selection.",
            }
        )
    return Response({"year": year, "vehicles": [_summary(v) for v in data], "source": "nhtsa", "fallback_reason": None})


@api_view(["GET"])
@login_required_api
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
@login_required_api
def image(request):
    year = _year(request)
    model = str(request.query_params.get("model") or "").strip()
    trim = str(request.query_params.get("trim") or "").strip() or None
    if not year or not model:
        return Response({"detail": "year and model are required."}, status=400)
    try:
        found = catalog_service.image(year, model, trim)
    except ProviderError as exc:
        return Response({"image": None, "detail": str(exc)})
    return Response({"image": found})


@api_view(["GET"])
@login_required_api
def compare(request):
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
@login_required_api
def safety(request):
    year = _year(request)
    model = str(request.query_params.get("model") or "").strip()
    if not year or not model:
        return Response({"detail": "year and model are required."}, status=400)
    try:
        return Response(nhtsa.safety(model, year))
    except ProviderError as exc:
        return Response({"detail": str(exc), "available": False, "overall_rating": None}, status=exc.status)


@api_view(["GET"])
@login_required_api
def recalls(request):
    year = _year(request)
    model = str(request.query_params.get("model") or "").strip()
    if not year or not model:
        return Response({"detail": "year and model are required."}, status=400)
    try:
        return Response(nhtsa.recalls(model, year))
    except ProviderError as exc:
        return Response({"detail": str(exc), "count": None, "campaigns": []}, status=exc.status)


@api_view(["POST"])
@login_required_api
def decode_vin(request):
    vin = str(request.data.get("vin") or "").strip().upper()
    year = request.data.get("year")
    model_year = int(year) if str(year or "").isdigit() else None
    if not VIN_RE.match(vin):
        return Response({"detail": "Enter a 17-character VIN. Letters I, O, and Q are not used."}, status=400)
    try:
        return Response(nhtsa.decode_vin(vin, model_year))
    except ProviderError as exc:
        logger.warning("VIN decode failed")
        return Response({"detail": str(exc)}, status=exc.status)


@api_view(["GET"])
@login_required_api
def market_value(request):
    return Response(
        {
            "available": False,
            "detail": "Verified pricing is not currently connected. NHTSA does not provide market values.",
        }
    )


def lookup(year: int, model: str, trim: str | None) -> tuple[dict | None, dict | None]:
    try:
        record = catalog_service.detail(year, model, trim)
        # Leftover trim IDs from the old CarsXE catalog still resolve at model level.
        if not record and trim:
            record = catalog_service.detail(year, model, None)
    except ProviderError as exc:
        return None, {"status": exc.status, "detail": str(exc)}
    if not record:
        return None, {"status": 404, "detail": f"No {year} Toyota {model} in NHTSA data."}
    return record, None


def _summary(record: dict) -> dict:
    skip = {"spec_groups", "features", "safety", "recalls"}
    return {k: v for k, v in record.items() if k not in skip}
