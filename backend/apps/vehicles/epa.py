"""EPA FuelEconomy.gov — public, no API key.

Used for MPG, fuel type, drive, transmission, and engine displacement.
Does not publish horsepower, seating, or exterior dimensions.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from django.conf import settings
from django.core.cache import caches

from .http import ProviderError, ProviderNotFound, request_json
from .matching import base_nameplate

logger = logging.getLogger(__name__)

TTL_MENU = 60 * 60 * 24
TTL_VEHICLE = 60 * 60 * 24
MAX_CONFIGS = 12


class FuelEconomyService:
    def __init__(self) -> None:
        self.base = settings.EPA_FUELECONOMY_BASE_URL.rstrip("/")
        self.cache = caches["vehicles"]

    def for_model(self, year: int, nhtsa_model: str) -> dict | None:
        names = self._toyota_models(year)
        matched = [name for name in names if base_nameplate(name) == base_nameplate(nhtsa_model)]
        if not matched:
            return None
        configs: list[dict] = []
        for name in matched:
            for option in self._options(year, name):
                detail = self._vehicle(option["id"])
                if detail:
                    configs.append({**option, **detail, "epa_model": name})
                if len(configs) >= MAX_CONFIGS:
                    break
            if len(configs) >= MAX_CONFIGS:
                break
        if not configs:
            return None
        return _aggregate(year, nhtsa_model, matched, configs)

    def _toyota_models(self, year: int) -> list[str]:
        key = f"epa:models:{year}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        url = f"{self.base}/vehicle/menu/model"
        body = request_json("GET", url, params={"year": year, "make": "Toyota"}, provider="EPA FuelEconomy")
        names = [item["value"] for item in _menu_items(body) if item.get("value")]
        self.cache.set(key, names, TTL_MENU)
        return names

    def _options(self, year: int, model: str) -> list[dict]:
        key = f"epa:options:{year}:{_cache_token(model)}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        url = f"{self.base}/vehicle/menu/options"
        try:
            body = request_json(
                "GET",
                url,
                params={"year": year, "make": "Toyota", "model": model},
                provider="EPA FuelEconomy",
            )
        except (ProviderNotFound, ProviderError):
            self.cache.set(key, [], TTL_MENU)
            return []
        rows = [{"label": item.get("text") or "", "id": str(item.get("value") or "")} for item in _menu_items(body)]
        rows = [row for row in rows if row["id"]]
        self.cache.set(key, rows, TTL_MENU)
        return rows

    def _vehicle(self, vehicle_id: str) -> dict | None:
        key = f"epa:veh:v2:{vehicle_id}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        url = f"{self.base}/vehicle/{quote(vehicle_id, safe='')}"
        try:
            body = request_json("GET", url, provider="EPA FuelEconomy")
        except ProviderError:
            return None
        if not isinstance(body, dict):
            return None
        payload = _normalize_vehicle(body)
        self.cache.set(key, payload, TTL_VEHICLE)
        return payload


def _cache_token(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")


def _menu_items(body: Any) -> list[dict]:
    if not isinstance(body, dict):
        return []
    items = body.get("menuItem")
    if items is None:
        return []
    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    return []


def _normalize_vehicle(row: dict) -> dict:
    if "city08" not in row and isinstance(row.get("vehicle"), dict):
        row = row["vehicle"]
    city, hwy, comb = _mpg(row.get("city08")), _mpg(row.get("highway08")), _mpg(row.get("comb08"))
    mpge = _mpg(row.get("combE"))  # kWh/100mi when set; treat 0 as missing
    range_mi = _mpg(row.get("range")) or _mpg(row.get("rangeA"))
    displ = _float(row.get("displ"))
    cyl = _int(row.get("cylinders"))
    engine_bits = []
    if displ:
        engine_bits.append(f"{displ:g} L")
    if cyl:
        engine_bits.append(f"{cyl}-cyl")
    dscr = _text(row.get("eng_dscr"))
    if dscr:
        cleaned = "; ".join(
            part.strip()
            for part in dscr.split(";")
            if part.strip() and part.strip().lower() not in {"hybrid", "hev", "phev"}
        )
        if cleaned:
            engine_bits.append(cleaned)
    luggage = _int(row.get("lv4")) or _int(row.get("hlv"))
    fuel = _text(row.get("atvType")) or _text(row.get("fuelType1"))
    return {
        "city": city,
        "highway": hwy,
        "combined": comb,
        "mpge": mpge if mpge and mpge > 0 else None,
        "ev_range_mi": range_mi if range_mi and range_mi > 0 else None,
        "engine": ", ".join(engine_bits) or None,
        "drivetrain": _text(row.get("drive")),
        "transmission": _text(row.get("trany")),
        "fuel": fuel,
        "vclass": _text(row.get("VClass")),
        "luggage_cu_ft": luggage if luggage and luggage > 0 else None,
    }


def _aggregate(year: int, nhtsa_model: str, matched_names: list[str], configs: list[dict]) -> dict:
    city = _span([c.get("city") for c in configs])
    hwy = _span([c.get("highway") for c in configs])
    comb = _span([c.get("combined") for c in configs])
    engines = _unique([c.get("engine") for c in configs])
    drives = _unique([c.get("drivetrain") for c in configs])
    trans = _unique([c.get("transmission") for c in configs])
    fuels = _unique([c.get("fuel") for c in configs])
    luggage = _span([c.get("luggage_cu_ft") for c in configs])
    mpge = _span([c.get("mpge") for c in configs])
    ev_range = _span([c.get("ev_range_mi") for c in configs])
    listed = [
        {
            "name": c.get("epa_model") or nhtsa_model,
            "label": c.get("label") or "",
            "city": c.get("city"),
            "highway": c.get("highway"),
            "combined": c.get("combined"),
            "engine": c.get("engine"),
            "drivetrain": c.get("drivetrain"),
        }
        for c in configs
    ]
    varies = any(span[1] is not None for span in (city, hwy, comb))
    return {
        "year": year,
        "matched_names": matched_names,
        "config_count": len(configs),
        "varies": varies,
        "city": city[0],
        "city_high": city[1],
        "highway": hwy[0],
        "highway_high": hwy[1],
        "combined": comb[0],
        "combined_high": comb[1],
        "engine": "; ".join(engines) if engines else None,
        "drivetrain": "; ".join(drives) if drives else None,
        "transmission": "; ".join(trans) if trans else None,
        "fuel": fuels[0] if len(fuels) == 1 else ("Hybrid" if any("hybrid" in (f or "").lower() for f in fuels) and len(fuels) > 1 else None),
        "luggage_cu_ft": luggage[0] if luggage[1] is None else None,
        "mpge": mpge[0],
        "mpge_high": mpge[1],
        "ev_range_mi": ev_range[0],
        "ev_range_high": ev_range[1],
        "configurations": listed,
        "note": (
            f"EPA lists {len(configs)} tested configurations for {year} Toyota {nhtsa_model}. "
            + ("Figures are ranges across those tests, not a single trim." if varies else "Every listed configuration shares these figures.")
        ),
        "source": "EPA",
    }


def _span(values: list[Any]) -> tuple[int | None, int | None]:
    nums = [int(v) for v in values if isinstance(v, (int, float))]
    if not nums:
        return None, None
    lo, hi = min(nums), max(nums)
    return lo, (hi if hi != lo else None)


def _unique(values: list[Any]) -> list[str]:
    out: list[str] = []
    for value in values:
        text = str(value).strip() if value else ""
        if text and text not in out:
            out.append(text)
    return out


def _mpg(value: Any) -> int | None:
    number = _float(value)
    if number is None or number <= 0:
        return None
    return int(round(number))


def _float(value: Any) -> float | None:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def _text(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text or text in ("-1", "0", "0.0", "N/A", "NA", "None"):
        return None
    return text


fueleconomy = FuelEconomyService()
