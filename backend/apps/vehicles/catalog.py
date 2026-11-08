"""Unified Toyota catalog: NHTSA for models, CarImagesAPI for pictures.

Every numeric specification is either returned by a provider or left null.
MSRP and monthly payment are never filled — neither provider supplies them.
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any

from .carimages import carimages
from .http import ProviderError
from .matching import canonical
from .nhtsa import nhtsa

logger = logging.getLogger(__name__)

MAKE = "Toyota"
SOURCE_NOTE = (
    "Model list from NHTSA vPIC. Images from CarImagesAPI when a catalog match exists. "
    "Neither source provides verified retail pricing or financing terms."
)

# Maintained body-style mapping for Toyota nameplates. Used when NHTSA's vehicle
# type is too broad (Passenger Car, MPV) to choose sedan vs hatch vs SUV.
# Models missing here stay unclassified rather than guessed.
BODY_BY_MODEL = {
    "86": "Sports car", "GR86": "Sports car", "Supra": "Sports car", "GR Supra": "Sports car",
    "GR Corolla": "Sports car", "Celica": "Sports car", "MR2": "Sports car",
    "Corolla": "Sedan", "Corolla Hybrid": "Sedan", "Camry": "Sedan", "Camry Hybrid": "Sedan",
    "Avalon": "Sedan", "Avalon Hybrid": "Sedan", "Crown": "Sedan", "Mirai": "Sedan", "Yaris": "Sedan",
    "Prius": "Hatchback", "Prius Prime": "Hatchback", "Prius Plug-in Hybrid": "Hatchback",
    "Prius c": "Hatchback", "Prius v": "Hatchback", "Corolla Hatchback": "Hatchback", "Corolla iM": "Hatchback",
    "C-HR": "SUV", "Corolla Cross": "SUV", "Corolla Cross Hybrid": "SUV", "RAV4": "SUV",
    "RAV4 Hybrid": "SUV", "RAV4 Prime": "SUV", "RAV4 Plug-in Hybrid": "SUV", "bZ4X": "SUV", "bZ": "SUV",
    "Venza": "SUV", "Highlander": "SUV", "Highlander Hybrid": "SUV", "Grand Highlander": "SUV",
    "Grand Highlander Hybrid": "SUV", "4Runner": "SUV", "Land Cruiser": "SUV", "Sequoia": "SUV",
    "Crown Signia": "SUV", "FJ Cruiser": "SUV", "bZ Woodland": "SUV", "C-HR+": "SUV",
    "Tacoma": "Truck", "Tacoma Hybrid": "Truck", "Tundra": "Truck", "Tundra Hybrid": "Truck",
    "Sienna": "Minivan",
}

# Powertrains that are fixed for a nameplate in a range of model years (inclusive).
# Applied only when the NHTSA model name itself does not already name the powertrain.
FUEL_BY_MODEL: dict[str, list[tuple[int, int, str]]] = {
    "bZ4X": [(2022, 2100, "Electric")], "bZ": [(2026, 2100, "Electric")],
    "bZ Woodland": [(2026, 2100, "Electric")], "C-HR+": [(2026, 2100, "Electric")],
    "Mirai": [(2016, 2100, "Hydrogen fuel cell")],
    "Prius": [(2001, 2100, "Hybrid")], "Prius c": [(2012, 2019, "Hybrid")], "Prius v": [(2012, 2017, "Hybrid")],
    "Prius Prime": [(2017, 2100, "Plug-in hybrid")], "Prius Plug-in Hybrid": [(2012, 2100, "Plug-in hybrid")],
    "RAV4 Prime": [(2021, 2100, "Plug-in hybrid")], "RAV4 Plug-in Hybrid": [(2021, 2100, "Plug-in hybrid")],
    "Camry": [(2025, 2100, "Hybrid")], "Crown": [(2023, 2100, "Hybrid")], "Crown Signia": [(2025, 2100, "Hybrid")],
    "Sienna": [(2021, 2100, "Hybrid")], "Venza": [(2021, 2024, "Hybrid")], "Sequoia": [(2023, 2100, "Hybrid")],
    "Land Cruiser": [(2024, 2100, "Hybrid")],
}

CATEGORIES = ["Sedan", "Hatchback", "SUV", "Truck", "Minivan", "Sports car"]
FUEL_TYPES = ["Gas", "Hybrid", "Plug-in hybrid", "Electric", "Hydrogen fuel cell"]

_NHTSA_TRUCK = {"truck", "incomplete vehicle"}


def vehicle_id(year: int, model: str, trim: str | None) -> str:
    return f"{year}|{model}|{trim or ''}"


def current_model_year() -> int:
    return dt.date.today().year


def years() -> list[int]:
    """Recent model years. NHTSA supports 1995+. Default selection is the current calendar year."""
    today = current_model_year()
    return list(range(today + 1, today - 11, -1))


def models(year: int) -> list[str]:
    return [row["model"] for row in nhtsa.models_for_year(year)]


def trims(year: int, model: str) -> list[str]:
    """NHTSA vPIC model lists do not include trim lines."""
    del year, model
    return []


def catalog(year: int) -> list[dict]:
    rows = nhtsa.models_for_year(year)
    # Vehicle-type index is fetched on the detail page so the listing stays one vPIC call.
    return [_record(row, {}, include_image=True) for row in rows]


def detail(year: int, model: str, trim: str | None = None) -> dict | None:
    del trim  # NHTSA catalog is model-level; trim is accepted for URL compatibility.
    rows = nhtsa.models_for_year(year)
    row = _find_model(rows, model)
    if not row:
        return None
    type_index = {}
    try:
        type_index = nhtsa.type_index(year)
    except ProviderError:
        logger.warning("NHTSA vehicle types unavailable for %s", year)
    record = _record(row, type_index, include_image=True)
    try:
        safety = nhtsa.safety(row["model"], year)
    except ProviderError as exc:
        logger.warning("NHTSA safety failed for %s %s: %s", year, model, exc)
        safety = {"available": False, "overall_rating": None, "reason": "Safety rating unavailable", "source": "NHTSA"}
    try:
        recalls = nhtsa.recalls(row["model"], year)
    except ProviderError as exc:
        logger.warning("NHTSA recalls failed for %s %s: %s", year, model, exc)
        recalls = {"count": None, "campaigns": [], "note": "Recall data is unavailable right now.", "source": "NHTSA"}
    record["safety_rating"] = safety.get("overall_rating")
    record["safety_rating_available"] = bool(safety.get("available"))
    record["safety"] = safety
    record["recall_count"] = recalls.get("count")
    record["recalls"] = recalls
    record["sources"]["safety"] = "NHTSA" if safety.get("source") == "NHTSA" else None
    record["sources"]["recalls"] = "NHTSA" if recalls.get("source") == "NHTSA" else None
    return record


def image(year: int, model: str, trim: str | None = None) -> dict | None:
    del trim
    rows = nhtsa.models_for_year(year)
    row = _find_model(rows, model)
    name = row["model"] if row else model
    payload = carimages.image_for(name, year)
    if not payload.get("url"):
        return None
    return payload


def _find_model(rows: list[dict], model: str) -> dict | None:
    wanted = canonical(model)
    for row in rows:
        if canonical(row["model"]) == wanted:
            return row
    lowered = model.strip().lower()
    for row in rows:
        if row["model"].lower() == lowered:
            return row
    return None


def _record(row: dict, type_index: dict[str, str], include_image: bool) -> dict[str, Any]:
    year = int(row["year"])
    model = row["model"]
    nhtsa_type = type_index.get(model.lower())
    image_payload = None
    if include_image:
        try:
            image_payload = carimages.image_for(model, year)
            if not image_payload.get("url"):
                image_payload = None
        except Exception:
            logger.warning("CarImagesAPI image failed for %s %s", year, model)
            image_payload = None
    match = (image_payload or {}).get("match") or "unavailable"
    return {
        "id": vehicle_id(year, model, None),
        "year": year,
        "make": row.get("make") or MAKE,
        "model": model,
        "make_id": row.get("make_id"),
        "model_id": row.get("model_id"),
        "trim": None,
        "style_name": None,
        "trim_id": None,
        "category": _category(model, nhtsa_type),
        "vehicle_type": nhtsa_type,
        "fuel_type": _fuel(model, year),
        "engine": None,
        "horsepower": None,
        "torque_lb_ft": None,
        "drivetrain": None,
        "transmission": None,
        "mpg": {"city": None, "highway": None, "combined": None},
        "mpge": None,
        "ev_range_mi": None,
        "seating": None,
        "cargo_cu_ft": None,
        "dimensions": {"length_in": None, "width_in": None, "height_in": None, "wheelbase_in": None},
        "curb_weight_lb": None,
        "msrp": {"value": None, "kind": "unavailable"},
        "monthly_payment": None,
        "safety": [],
        "features": [],
        "spec_groups": [],
        "image": image_payload,
        "image_match": match,
        "image_views": (image_payload or {}).get("views") or {},
        "safety_rating": None,
        "safety_rating_available": False,
        "recall_count": None,
        "source": "nhtsa",
        "source_note": SOURCE_NOTE,
        "sources": {
            "vehicleData": "NHTSA",
            "images": "CarImagesAPI" if image_payload else None,
            "safety": None,
            "recalls": None,
        },
    }


def _category(model: str, nhtsa_type: str | None) -> str | None:
    if nhtsa_type and nhtsa_type.strip().lower() in _NHTSA_TRUCK:
        return "Truck"
    mapped = _body_from_mapping(model)
    return mapped


def _body_from_mapping(model: str) -> str | None:
    if model in BODY_BY_MODEL:
        return BODY_BY_MODEL[model]
    for name, body in BODY_BY_MODEL.items():
        if model.lower() == name.lower() or model.lower().startswith(name.lower() + " "):
            return body
    return None


def _fuel(model: str, year: int) -> str | None:
    lowered = model.lower()
    if "plug-in" in lowered or lowered.endswith(" prime"):
        return "Plug-in hybrid"
    if "hybrid" in lowered:
        return "Hybrid"
    for start, end, fuel in FUEL_BY_MODEL.get(model, []):
        if start <= year <= end:
            return fuel
    for name, ranges in FUEL_BY_MODEL.items():
        if model.lower() == name.lower():
            for start, end, fuel in ranges:
                if start <= year <= end:
                    return fuel
    return None


class CatalogProvider:
    """Drop-in shape used by assistant tools that still call provider()."""

    source = "nhtsa"

    def years(self) -> list[int]:
        return years()

    def models(self, year: int) -> list[str]:
        return models(year)

    def trims(self, year: int, model: str) -> list[str]:
        return trims(year, model)

    def catalog(self, year: int) -> list[dict]:
        return catalog(year)

    def detail(self, year: int, model: str, trim: str | None) -> dict | None:
        return detail(year, model, trim)

    def image(self, year: int, model: str, trim: str | None) -> dict | None:
        return image(year, model, trim)


def provider() -> CatalogProvider:
    return CatalogProvider()
