"""Toyota vehicle catalog: one record shape for live CarsXE data and the labeled demo dataset.

Every numeric field is either read from the source or left as None. Nothing is estimated here.
"""

from __future__ import annotations

import datetime as dt
import json
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from typing import Any

from . import carsxe
from .schemas import FeatureGroup, ImagesResponse, YmmMatch, YmmOptionsResponse, YmmResponse

MAKE = "Toyota"
DEMO_NOTE = (
    "Demo reference data, compiled for this prototype. Not from CarsXE and not verified. "
    "Connect CARSXE_API_KEY for live specifications."
)
CARSXE_NOTE = "Specifications from CarsXE Year Make Model. MSRP is the original base MSRP for that model year."
IMAGE_LICENSE = "ModifyCommercially"

# Maintained body-style mapping for Toyota nameplates. Used only when CarsXE's style string
# doesn't name a body. Models missing here show as "Other" rather than a guess.
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


def vehicle_id(year: int, model: str, trim: str | None) -> str:
    return f"{year}|{model}|{trim or ''}"


def _empty_record(year: int, model: str, trim: str | None, source: str) -> dict[str, Any]:
    return {
        "id": vehicle_id(year, model, trim),
        "year": year,
        "make": MAKE,
        "model": model,
        "trim": trim or None,
        "style_name": None,
        "trim_id": None,
        "category": _body_from_mapping(model),
        "fuel_type": _fuel_from_mapping(model, year),
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
        "msrp": {"value": None, "kind": "historical_base_msrp"},
        "safety": [],
        "features": [],
        "spec_groups": [],
        "image": None,
        "source": source,
        "source_note": DEMO_NOTE if source == "demo" else CARSXE_NOTE,
    }


def _body_from_mapping(model: str) -> str:
    if model in BODY_BY_MODEL:
        return BODY_BY_MODEL[model]
    for name, body in BODY_BY_MODEL.items():
        if model.startswith(name + " "):
            return body
    return "Other"


def _fuel_from_mapping(model: str, year: int) -> str | None:
    lowered = model.lower()
    if "plug-in" in lowered or lowered.endswith(" prime"):
        return "Plug-in hybrid"
    if "hybrid" in lowered:
        return "Hybrid"
    for start, end, fuel in FUEL_BY_MODEL.get(model, []):
        if start <= year <= end:
            return fuel
    return None


# ---------------------------------------------------------------------------
# CarsXE feature extraction
# ---------------------------------------------------------------------------
_NUM = re.compile(r"-?\d[\d,]*\.?\d*")


def _num(value: str | None) -> float | None:
    if not value:
        return None
    match = _NUM.search(value)
    if not match:
        return None
    try:
        return float(match.group().replace(",", ""))
    except ValueError:
        return None


def _int(value: str | None) -> int | None:
    n = _num(value)
    return int(round(n)) if n is not None else None


def _body_from_style(style: str) -> str | None:
    s = style.lower()
    if "minivan" in s or "van" in s.split():
        return "Minivan"
    if " cab" in s or "pickup" in s:
        return "Truck"
    if "suv" in s or "sport utility" in s:
        return "SUV"
    if "hatchback" in s:
        return "Hatchback"
    if "sedan" in s:
        return "Sedan"
    return None


def _fuel_from_style(style: str) -> str | None:
    s = style.lower()
    if "plug-in" in s:
        return "Plug-in hybrid"
    if "hybrid" in s:
        return "Hybrid"
    if "fuel cell" in s or "hydrogen" in s:
        return "Hydrogen fuel cell"
    if "electric" in s or re.search(r"\bev\b", s):
        return "Electric"
    return None


def _flat(groups: list[FeatureGroup]) -> list[tuple[str, str, str | None]]:
    return [(g.category, f.name, f.value) for g in groups for f in g.features]


def _find(items, *needles: str, exclude: tuple[str, ...] = ()) -> str | None:
    """First feature value whose name contains every needle (case-insensitive)."""
    for _category, name, value in items:
        n = name.lower()
        if value and all(x in n for x in needles) and not any(x in n for x in exclude):
            return value
    return None


def _from_ymm(year: int, model: str, match: YmmMatch) -> dict[str, Any]:
    style = match.name or ""
    trim_short = style.split(" ")[0] if style else None
    record = _empty_record(year, model, trim_short, "carsxe")
    record["style_name"] = style or None
    record["trim_id"] = match.trim_id
    record["seating"] = match.total_seating
    record["msrp"]["value"] = match.base_msrp

    groups = (match.features.standard if match.features else []) or []
    items = _flat(groups)
    record["spec_groups"] = [
        {"category": g.category, "items": [{"name": f.name, "value": f.value} for f in g.features]} for g in groups
    ]

    record["category"] = _body_from_style(style) or record["category"]
    fuel = _find(items, "fuel type") or _find(items, "fuel", exclude=("economy", "capacity", "tank", "mpg"))
    record["fuel_type"] = _fuel_from_style(style) or _fuel_from_style(fuel or "") or record["fuel_type"]
    if record["fuel_type"] is None and fuel and "gas" in fuel.lower():
        record["fuel_type"] = "Gas"

    paren = re.search(r"\(([^)]+)\)", style)
    record["engine"] = _find(items, "engine", exclude=("immobilizer", "cover", "block", "oil")) or (
        paren.group(1) if paren else None
    )
    record["horsepower"] = _int(_find(items, "horsepower"))
    record["torque_lb_ft"] = _int(_find(items, "torque"))
    record["drivetrain"] = _find(items, "drive type") or _find(items, "drivetrain") or _drive_from_style(style)
    record["transmission"] = _find(items, "transmission")
    split = _find(items, "city", "highway", exclude=("mpge", "range"))
    pair = re.match(r"\s*(\d+)\s*/\s*(\d+)", split or "")
    record["mpg"] = {
        "city": int(pair.group(1)) if pair else _int(_find(items, "city", exclude=("mpge", "range", "highway"))),
        "highway": int(pair.group(2)) if pair else (
            _int(_find(items, "highway", exclude=("mpge", "range", "city"))) or _int(_find(items, "hwy", exclude=("mpge", "city")))
        ),
        "combined": _int(_find(items, "combined", exclude=("mpge", "range"))),
    }
    if record["fuel_type"] is None and re.search(r"\d\.\dL \d+cyl", style):
        record["fuel_type"] = "Gas"
    record["mpge"] = _int(_find(items, "mpge", "combined")) or _int(_find(items, "mpge"))
    record["ev_range_mi"] = _int(_find(items, "range", "electric")) or _int(_find(items, "ev range"))
    record["cargo_cu_ft"] = _num(_find(items, "cargo", "volume")) or _num(_find(items, "cargo", "capacity"))
    record["dimensions"] = {
        "length_in": _num(_find(items, "length", exclude=("bed", "leg", "cargo", "seat"))),
        "width_in": _num(_find(items, "width", exclude=("bed", "cargo", "shoulder", "hip", "mirror"))),
        "height_in": _num(_find(items, "height", exclude=("bed", "cargo", "step", "load"))),
        "wheelbase_in": _num(_find(items, "wheelbase")),
    }
    record["curb_weight_lb"] = _num(_find(items, "curb weight"))
    record["safety"] = [name for category, name, _ in items if "safety" in category.lower()][:10]
    record["features"] = [
        name
        for category, name, _ in items
        if any(k in category.lower() for k in ("comfort", "convenience", "entertainment", "technology", "power feature"))
    ][:12]
    return record


def _drive_from_style(style: str) -> str | None:
    for token in ("AWD", "4WD", "FWD", "RWD"):
        if token in style:
            return token
    return None


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
class DemoProvider:
    source = "demo"

    @staticmethod
    @lru_cache(maxsize=1)
    def _data() -> dict:
        return json.loads((Path(__file__).with_name("demo_catalog.json")).read_text(encoding="utf-8"))

    def _records(self) -> list[dict]:
        data = self._data()
        out = []
        for row in data["vehicles"]:
            record = _empty_record(data["year"], row["model"], row["trim"], "demo")
            for key in ("category", "fuel_type", "engine", "horsepower", "drivetrain", "seating", "mpge", "ev_range_mi"):
                if row.get(key) is not None:
                    record[key] = row[key]
            record["mpg"] = {**record["mpg"], **row.get("mpg", {})}
            record["msrp"]["value"] = row.get("msrp")
            out.append(record)
        return out

    def years(self) -> list[int]:
        return [self._data()["year"]]

    def models(self, year: int) -> list[str]:
        return sorted({r["model"] for r in self._records() if r["year"] == year})

    def trims(self, year: int, model: str) -> list[str]:
        return [r["trim"] for r in self._records() if r["year"] == year and r["model"] == model]

    def catalog(self, year: int) -> list[dict]:
        return [r for r in self._records() if r["year"] == year]

    def detail(self, year: int, model: str, trim: str | None) -> dict | None:
        for r in self._records():
            if r["year"] == year and r["model"] == model and (not trim or r["trim"] == trim):
                return r
        return None

    def image(self, year: int, model: str, trim: str | None) -> dict | None:
        return None


class CarsXEProvider:
    source = "carsxe"

    def years(self) -> list[int]:
        body = carsxe.client.get("/v1/ymm-options", {"dimension": "years"}, YmmOptionsResponse)
        newest = dt.date.today().year + 1
        years = sorted({int(y) for y in body.years or [] if str(y).isdigit() and int(y) <= newest}, reverse=True)
        return years[:12]

    def models(self, year: int) -> list[str]:
        body = carsxe.client.get("/v1/ymm-options", {"year": year, "make": MAKE}, YmmOptionsResponse)
        return sorted(set(body.models or []))

    def trims(self, year: int, model: str) -> list[str]:
        body = carsxe.client.get("/v1/ymm-options", {"year": year, "make": MAKE, "model": model}, YmmOptionsResponse)
        prefix = model + " "
        trims = [v[len(prefix):] if v.startswith(prefix) else v for v in body.variants or []]
        return sorted({t for t in trims if t})

    def detail(self, year: int, model: str, trim: str | None) -> dict | None:
        try:
            body = carsxe.client.get(
                "/v1/ymm", {"year": year, "make": MAKE, "model": model, "trim": trim}, YmmResponse
            )
        except carsxe.CarsXENotFound:
            return None
        if not body.bestMatch:
            return None
        record = _from_ymm(year, model, body.bestMatch)
        record["id"] = vehicle_id(year, model, trim or record["trim"])
        record["trim"] = trim or record["trim"]
        record["match_exact"] = body.match_exact
        return record

    def catalog(self, year: int) -> list[dict]:
        models = self.models(year)

        def one(model: str) -> dict:
            try:
                return self.detail(year, model, None) or _empty_record(year, model, None, "carsxe")
            except carsxe.CarsXEError:
                return _empty_record(year, model, None, "carsxe")

        with ThreadPoolExecutor(max_workers=4) as pool:
            return list(pool.map(one, models))

    def image(self, year: int, model: str, trim: str | None) -> dict | None:
        try:
            body = carsxe.client.get(
                "/images",
                {"make": MAKE, "model": model, "year": year, "trim": trim, "angle": "side", "license": IMAGE_LICENSE},
                ImagesResponse,
            )
        except carsxe.CarsXENotFound:
            return None
        if not body.images:
            return None
        best = body.images[0]
        return {
            "url": best.link,
            "thumbnail": best.thumbnailLink,
            "source_page": best.contextLink,
            "provider": "CarsXE Vehicle Images",
            "license_filter": IMAGE_LICENSE,
            "license_note": "Filtered to Creative Commons labels that allow commercial use. Confirm the license on the source page before publishing.",
        }


def provider():
    # Saved responses answer without the API key. The key is used only for a vehicle we have never stored.
    return CarsXEProvider() if carsxe.is_configured() or carsxe.has_saved_catalog() else DemoProvider()
