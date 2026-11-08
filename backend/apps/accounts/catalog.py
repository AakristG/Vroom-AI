"""Toyota model catalog from CarsXE, plus recommendations that follow the signed-in life change."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from decimal import Decimal

import requests
from django.conf import settings

from apps.ai import nim_client
from apps.ai.account_context import account_context
from apps.vehicles import carsxe

from .models import CustomerAccount, ToyotaSpec

logger = logging.getLogger(__name__)

CATALOG_YEAR = 2026
PAGE_SIZE = 9
_SUV = ("rav4", "highlander", "4runner", "sequoia", "venza", "bz", "land cruiser", "corolla cross", "grand highlander", "crown signia", "c-hr")
_TRUCK = ("tundra", "tacoma", "truck")
_VAN = ("sienna", "van")
_HATCH = ("hatch", "prius", "yaris")
_COUPE = ("supra", "gr86", "86", "coupe")


def catalog_page(account: CustomerAccount, *, page: int, body: str, seats: str, sort: str) -> dict:
    key = settings.CARSXE_API_KEY
    if not key:
        return {
            "source": "not_configured",
            "detail": "Add CARSXE_API_KEY to load Toyota models, prices, seats, and photos.",
            "page": 1,
            "pages": 1,
            "total": 0,
            "models": [],
            "recommendations": _empty_recommendations(account),
        }
    try:
        specs = _ensure_catalog(key)
    except (requests.RequestException, carsxe.CarsXEError):
        logger.exception("CarsXE catalog failed")
        return {"source": "error", "detail": "CarsXE did not respond.", "page": 1, "pages": 1, "total": 0, "models": [], "recommendations": _empty_recommendations(account)}

    filtered = specs
    if body and body.lower() != "all":
        filtered = [item for item in filtered if item.body.lower() == body.lower()]
    if seats.isdigit():
        wanted = int(seats)
        filtered = [item for item in filtered if item.seats == wanted]
    filtered = _sort_specs(filtered, sort)
    total = len(filtered)
    pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    page = min(page, pages)
    start = (page - 1) * PAGE_SIZE
    window = filtered[start : start + PAGE_SIZE]
    return {
        "source": "carsxe",
        "year": CATALOG_YEAR,
        "page": page,
        "pages": pages,
        "total": total,
        "models": [_public(item) for item in window],
        "recommendations": _recommendations(account, specs),
    }


def model_detail(name: str) -> dict | None:
    spec = ToyotaSpec.objects.filter(year=CATALOG_YEAR, model_name__iexact=name).first()
    if not spec and settings.CARSXE_API_KEY:
        try:
            _ensure_catalog(settings.CARSXE_API_KEY)
        except (requests.RequestException, carsxe.CarsXEError):
            logger.exception("CarsXE detail refresh failed")
        spec = ToyotaSpec.objects.filter(year=CATALOG_YEAR, model_name__iexact=name).first()
    if not spec:
        return None
    payload = _public(spec)
    payload["source"] = "carsxe" if settings.CARSXE_API_KEY else "not_configured"
    return payload


def _ensure_catalog(key: str) -> list[ToyotaSpec]:
    del key  # The shared CarsXE client reads the saved catalog and only calls the API for a missing model.
    existing = list(ToyotaSpec.objects.filter(year=CATALOG_YEAR))
    if existing:
        return existing
    names = _model_names()
    if not names:
        return []
    for name in names:
        _fetch_one(name)
    return list(ToyotaSpec.objects.filter(year=CATALOG_YEAR))


def _model_names() -> list[str]:
    from apps.vehicles import carsxe
    from apps.vehicles.schemas import YmmOptionsResponse

    body = carsxe.client.get(
        "/v1/ymm-options", {"year": CATALOG_YEAR, "make": "Toyota"}, YmmOptionsResponse
    )
    return list(dict.fromkeys(body.models or []))


def _fetch_one(model: str) -> None:
    from apps.vehicles import carsxe
    from apps.vehicles.schemas import ImagesResponse, YmmResponse

    match: dict = {}
    try:
        specs = carsxe.client.get(
            "/v1/ymm", {"year": CATALOG_YEAR, "make": "Toyota", "model": model}, YmmResponse
        )
        if specs.bestMatch:
            match = specs.bestMatch.model_dump()
    except carsxe.CarsXEError:
        logger.warning("CarsXE specs unavailable for %s", model)
    image = ""
    try:
        photos = carsxe.client.get(
            "/images",
            {"make": "Toyota", "model": model, "year": CATALOG_YEAR, "angle": "side", "license": "ModifyCommercially"},
            ImagesResponse,
        )
        if photos.images:
            image = photos.images[0].link or photos.images[0].thumbnailLink or ""
    except carsxe.CarsXEError:
        logger.warning("CarsXE image unavailable for %s", model)

    mpg = match.get("mpg") if isinstance(match.get("mpg"), dict) else {}
    colors = []
    color_block = match.get("color") if isinstance(match.get("color"), dict) else {}
    for swatch in (color_block.get("exterior") or [])[:6]:
        if isinstance(swatch, dict) and swatch.get("name"):
            colors.append(swatch["name"])
    features = []
    feature_block = match.get("features") if isinstance(match.get("features"), dict) else {}
    for group in feature_block.get("standard") or []:
        if not isinstance(group, dict):
            continue
        for feature in (group.get("features") or [])[:4]:
            if feature and len(features) < 12:
                features.append(str(feature))
    style = str(match.get("name") or model)
    ToyotaSpec.objects.update_or_create(
        year=CATALOG_YEAR,
        model_name=model,
        defaults={
            "body": _body(model, style, match.get("body_type") or match.get("style")),
            "seats": _int(match.get("total_seating")),
            "msrp": _money(match.get("base_msrp")),
            "invoice": _money(match.get("base_invoice")),
            "city_mpg": _money(mpg.get("city")),
            "highway_mpg": _money(mpg.get("highway")),
            "image_url": image[:1000],
            "style_name": style[:240],
            "colors": colors,
            "features": features,
        },
    )


def _recommendations(account: CustomerAccount, specs: list[ToyotaSpec]) -> dict:
    key = hashlib.sha256(f"{account.life_change}|{account.preferences}|{account.current_payment}|{account.customer_id}".encode()).hexdigest()[:32]
    cached = account.recommendation if isinstance(account.recommendation, dict) else {}
    if account.recommendation_key == key and cached.get("trade_in_model"):
        return _recommendation_payload(account, specs, cached)

    picked = _ask_nemotron(account, specs) or _heuristic(account, specs)
    account.recommendation_key = key
    account.recommendation = picked
    account.save(update_fields=["recommendation_key", "recommendation"])
    return _recommendation_payload(account, specs, picked)


def _ask_nemotron(account: CustomerAccount, specs: list[ToyotaSpec]) -> dict | None:
    names = [item.model_name for item in specs]
    if not names or not settings.NVIDIA_NIM_API_KEY:
        return None
    lines = [
        f"{item.model_name}: body {item.body or 'unknown'}, seats {item.seats or 'unknown'}, base MSRP {item.msrp or 'unknown'}"
        for item in specs
    ]
    finances = account_context(account.customer_id) or (
        f"No Toyota contract is on file. Payment they entered: {account.current_payment or 'not given'}. "
        f"Vehicle they entered: {account.vehicle_year or ''} {account.vehicle_model}."
    )
    question = (
        "Choose two model names that appear in the catalog list. "
        "trade_in_model is the best next Toyota if they put their trade-in estimate toward another vehicle. "
        "situation_model is the best fit for the life change they described and their payment. "
        "If the life change is empty, base situation_model on the finances on file. "
        "Do not invent a model or a price. Reply with JSON only: "
        '{"trade_in_model":"", "situation_model":"", "reason":""}\n\n'
        f"Life change, unverified, in their words: {account.life_change or 'not provided'}\n"
        f"Vehicle preferences they added: {account.preferences or 'none'}\n"
        f"City: {account.city}\n"
        f"{finances}\n\nCatalog:\n" + "\n".join(lines)
    )
    try:
        reply = nim_client.generate_reply([{"role": "user", "content": question}], extra_system="Reply with JSON only.")
    except Exception:
        logger.exception("Nemotron model recommendation failed")
        return None
    match = re.search(r"\{.*\}", reply, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    trade = _known(data.get("trade_in_model"), names)
    situation = _known(data.get("situation_model"), names)
    if not trade or not situation:
        return None
    return {"trade_in_model": trade, "situation_model": situation, "reason": str(data.get("reason") or "")[:500]}


def _heuristic(account: CustomerAccount, specs: list[ToyotaSpec]) -> dict:
    priced = [item for item in specs if item.msrp is not None] or specs
    priced.sort(key=lambda item: item.msrp or Decimal("999999"))
    trade = priced[0]
    text = f"{account.life_change} {account.preferences}".lower()
    if any(word in text for word in ("child", "baby", "family", "married", "kid")):
        seated = sorted(specs, key=lambda item: (-(item.seats or 0), item.msrp or Decimal("999999")))
        situation = seated[0]
    elif any(word in text for word in ("expense", "lost", "job", "hard", "fell", "cut", "payment", "budget")):
        situation = priced[0]
    else:
        situation = priced[len(priced) // 2]
    return {
        "trade_in_model": trade.model_name,
        "situation_model": situation.model_name,
        "reason": "Chosen from CarsXE prices and seats because a Nemotron pick was not available. It is not a financing offer.",
    }


def _recommendation_payload(account: CustomerAccount, specs: list[ToyotaSpec], picked: dict) -> dict:
    by_name = {item.model_name.lower(): item for item in specs}
    trade = by_name.get(str(picked.get("trade_in_model") or "").lower())
    situation = by_name.get(str(picked.get("situation_model") or "").lower())
    return {
        "life_change": account.life_change,
        "reason": picked.get("reason") or "",
        "trade_in": _public(trade) if trade else None,
        "situation": _public(situation) if situation else None,
    }


def _empty_recommendations(account: CustomerAccount) -> dict:
    return {"life_change": account.life_change, "reason": "", "trade_in": None, "situation": None}


def _public(spec: ToyotaSpec) -> dict:
    return {
        "year": spec.year,
        "make": "Toyota",
        "model": spec.model_name,
        "name": spec.style_name or spec.model_name,
        "body": spec.body,
        "seats": spec.seats,
        "msrp": float(spec.msrp) if spec.msrp is not None else None,
        "invoice": float(spec.invoice) if spec.invoice is not None else None,
        "city_mpg": float(spec.city_mpg) if spec.city_mpg is not None else None,
        "highway_mpg": float(spec.highway_mpg) if spec.highway_mpg is not None else None,
        "image": spec.image_url or None,
        "colors": spec.colors or [],
        "features": spec.features or [],
    }


def _sort_specs(specs: list[ToyotaSpec], sort: str) -> list[ToyotaSpec]:
    if sort == "price_desc":
        return sorted(specs, key=lambda item: item.msrp or Decimal("0"), reverse=True)
    if sort == "seats_asc":
        return sorted(specs, key=lambda item: item.seats or 0)
    if sort == "seats_desc":
        return sorted(specs, key=lambda item: item.seats or 0, reverse=True)
    if sort == "name":
        return sorted(specs, key=lambda item: item.model_name.lower())
    return sorted(specs, key=lambda item: (item.msrp is None, item.msrp or Decimal("0")))


def _body(model: str, style: str, explicit) -> str:
    text = f"{explicit or ''} {model} {style}".lower()
    if any(token in text for token in _TRUCK):
        return "Truck"
    if any(token in text for token in _VAN):
        return "Minivan"
    if any(token in text for token in _SUV) or "suv" in text:
        return "SUV"
    if any(token in text for token in _HATCH):
        return "Hatchback"
    if any(token in text for token in _COUPE):
        return "Coupe"
    return "Sedan"


def _known(value, names: list[str]) -> str | None:
    text = str(value or "").strip().lower()
    for name in names:
        if name.lower() == text:
            return name
    return None


def _int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _money(value) -> Decimal | None:
    try:
        if value is None or value == "":
            return None
        return Decimal(str(value))
    except Exception:
        return None
