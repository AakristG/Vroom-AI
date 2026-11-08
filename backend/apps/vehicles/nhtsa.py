"""NHTSA vPIC, recalls, and safety ratings. Public APIs — no API key is used or required."""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote

from django.conf import settings
from django.core.cache import caches

from .http import ProviderError, ProviderNotFound, request_json

logger = logging.getLogger(__name__)

MAKE = "toyota"
VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")

# Cache TTLs. Recalls stay shorter so newly published campaigns can appear.
TTL_MODELS = 60 * 60 * 24
TTL_TYPES = 60 * 60 * 24 * 7
TTL_SAFETY = 60 * 60 * 12
TTL_RECALLS = 60 * 60 * 6
TTL_VIN = 60 * 60 * 24


class NhtsaService:
    def __init__(self) -> None:
        self.vpic = settings.NHTSA_VPIC_BASE_URL.rstrip("/")
        self.data = settings.NHTSA_DATA_BASE_URL.rstrip("/")
        self.cache = caches["vehicles"]

    def models_for_year(self, year: int) -> list[dict]:
        _validate_year(year)
        key = f"nhtsa:models:{year}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        path = f"{self.vpic}/vehicles/GetModelsForMakeYear/make/{MAKE}/modelyear/{year}"
        body = request_json("GET", path, params={"format": "json"}, provider="NHTSA vPIC")
        rows = []
        for item in body.get("Results") or []:
            name = str(item.get("Model_Name") or "").strip()
            if not name or _skip_model(name):
                continue
            rows.append(
                {
                    "make_id": item.get("Make_ID"),
                    "make": str(item.get("Make_Name") or "TOYOTA").title(),
                    "model_id": item.get("Model_ID"),
                    "model": name,
                    "year": year,
                }
            )
        rows.sort(key=lambda r: r["model"].lower())
        self.cache.set(key, rows, TTL_MODELS)
        return rows

    def vehicle_types(self) -> list[str]:
        key = "nhtsa:types"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        path = f"{self.vpic}/vehicles/GetVehicleTypesForMake/{MAKE}"
        body = request_json("GET", path, params={"format": "json"}, provider="NHTSA vPIC")
        names = sorted(
            {str(item.get("VehicleTypeName") or "").strip() for item in body.get("Results") or [] if item.get("VehicleTypeName")}
        )
        self.cache.set(key, names, TTL_TYPES)
        return names

    def models_for_year_and_type(self, year: int, vehicle_type: str) -> list[str]:
        _validate_year(year)
        slug = quote(vehicle_type, safe="")
        key = f"nhtsa:models-type:{year}:{vehicle_type.lower()}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        path = f"{self.vpic}/vehicles/GetModelsForMakeYear/make/{MAKE}/modelyear/{year}/vehicletype/{slug}"
        try:
            body = request_json("GET", path, params={"format": "json"}, provider="NHTSA vPIC")
        except ProviderError:
            logger.warning("NHTSA vehicle-type listing failed for %s %s", year, vehicle_type)
            return []
        names = sorted({str(item.get("Model_Name") or "").strip() for item in body.get("Results") or [] if item.get("Model_Name")})
        self.cache.set(key, names, TTL_MODELS)
        return names

    def type_index(self, year: int) -> dict[str, str]:
        """Map model name -> NHTSA VehicleTypeName for this year. First match wins."""
        key = f"nhtsa:type-index:{year}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        index: dict[str, str] = {}
        for vehicle_type in self.vehicle_types():
            for name in self.models_for_year_and_type(year, vehicle_type):
                index.setdefault(name.lower(), vehicle_type)
        self.cache.set(key, index, TTL_MODELS)
        return index

    def decode_vin(self, vin: str, model_year: int | None = None) -> dict:
        vin = vin.strip().upper()
        if not VIN_RE.match(vin):
            raise ProviderError("Enter a 17-character VIN. I, O, and Q are not used.", status=400, code="invalid")
        if model_year is not None:
            _validate_year(model_year)
        cache_key = f"nhtsa:vin:{vin}:{model_year or ''}"
        hit = self.cache.get(cache_key)
        if hit is not None:
            return hit
        path = f"{self.vpic}/vehicles/DecodeVinValues/{vin}"
        params: dict[str, Any] = {"format": "json"}
        if model_year:
            params["modelyear"] = model_year
        body = request_json("GET", path, params=params, provider="NHTSA vPIC")
        rows = body.get("Results") or []
        row = rows[0] if rows else {}
        error_code = str(row.get("ErrorCode") or "")
        error_text = str(row.get("ErrorText") or "")
        decoded = {
            "vin_last4": vin[-4:],
            "make": _present(row.get("Make")),
            "model": _present(row.get("Model")),
            "model_year": _intish(row.get("ModelYear")),
            "body_class": _present(row.get("BodyClass")),
            "vehicle_type": _present(row.get("VehicleType")),
            "drive_type": _present(row.get("DriveType")),
            "fuel": _present(row.get("FuelTypePrimary")),
            "engine": _present(row.get("EngineModel")) or _present(row.get("DisplacementL")),
            "plant": _present(row.get("PlantCity")),
            "error_code": error_code or None,
            "error_text": error_text or None,
            "source": "NHTSA",
        }
        if error_code and error_code not in ("0", "0,0"):
            decoded["decode_ok"] = False
        else:
            decoded["decode_ok"] = True
        self.cache.set(cache_key, decoded, TTL_VIN)
        return decoded

    def recalls(self, model: str, year: int) -> dict:
        _validate_year(year)
        key = f"nhtsa:recalls:{year}:{model.lower()}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        url = f"{self.data}/recalls/recallsByVehicle"
        try:
            body = request_json(
                "GET",
                url,
                params={"make": "toyota", "model": model, "modelYear": year},
                provider="NHTSA recalls",
            )
        except ProviderNotFound:
            payload = _empty_recalls(model, year)
            self.cache.set(key, payload, TTL_RECALLS)
            return payload
        except ProviderError as exc:
            # The recalls API answers HTTP 400 with an empty result list when a model has no campaigns.
            if exc.status != 400:
                raise
            payload = _empty_recalls(model, year)
            self.cache.set(key, payload, TTL_RECALLS)
            return payload
        results = body.get("results") or body.get("Results") or []
        campaigns = []
        for item in results:
            campaigns.append(
                {
                    "campaign_number": item.get("NHTSACampaignNumber") or item.get("nhtsaCampaignNumber"),
                    "component": item.get("Component") or item.get("component"),
                    "summary": item.get("Summary") or item.get("summary"),
                    "consequence": item.get("Consequence") or item.get("consequence"),
                    "remedy": item.get("Remedy") or item.get("remedy"),
                    "report_date": item.get("ReportReceivedDate") or item.get("reportReceivedDate"),
                    "source": "NHTSA",
                }
            )
        payload = {
            "make": "Toyota",
            "model": model,
            "year": year,
            "count": len(campaigns),
            "campaigns": campaigns,
            "note": (
                "These are published federal recall campaigns for this make, model, and year. "
                "They do not prove that a specific VIN has an open recall."
                if campaigns
                else "No recall campaigns are published for this make, model, and year. That is not a guarantee the vehicle is recall-free."
            ),
            "source": "NHTSA",
        }
        self.cache.set(key, payload, TTL_RECALLS)
        return payload

    def safety(self, model: str, year: int) -> dict:
        _validate_year(year)
        key = f"nhtsa:safety:{year}:{model.lower()}"
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        variants_url = f"{self.data}/SafetyRatings/modelyear/{year}/make/Toyota/model/{quote(model, safe='')}"
        try:
            body = request_json("GET", variants_url, provider="NHTSA safety")
        except ProviderNotFound:
            payload = _unavailable_safety(model, year, "No crash-test results are published for this model year.")
            self.cache.set(key, payload, TTL_SAFETY)
            return payload
        variants = body.get("Results") or body.get("results") or []
        if not variants:
            payload = _unavailable_safety(model, year, "No crash-test results are published for this model year.")
            self.cache.set(key, payload, TTL_SAFETY)
            return payload
        listed = [
            {
                "vehicle_id": item.get("VehicleId") or item.get("vehicleId"),
                "description": item.get("VehicleDescription") or item.get("vehicleDescription"),
            }
            for item in variants
            if item.get("VehicleId") or item.get("vehicleId")
        ]
        if len(listed) != 1:
            payload = {
                "available": False,
                "overall_rating": None,
                "reason": "More than one crash-tested variant is listed. A rating is not shown until a specific variant is selected.",
                "variants": listed,
                "source": "NHTSA",
                "model": model,
                "year": year,
            }
            self.cache.set(key, payload, TTL_SAFETY)
            return payload
        vehicle_id = listed[0]["vehicle_id"]
        detail = request_json("GET", f"{self.data}/SafetyRatings/VehicleId/{vehicle_id}", provider="NHTSA safety")
        rows = detail.get("Results") or detail.get("results") or []
        row = rows[0] if rows else {}
        overall = _rating(row.get("OverallRating"))
        payload = {
            "available": overall is not None,
            "overall_rating": overall,
            "front_crash": _rating(row.get("OverallFrontCrashRating")),
            "side_crash": _rating(row.get("OverallSideCrashRating")),
            "rollover": _rating(row.get("RolloverRating")),
            "nhtsa_vehicle_id": vehicle_id,
            "variant": listed[0]["description"],
            "source": "NHTSA",
            "model": model,
            "year": year,
            "reason": None if overall is not None else "Safety rating unavailable",
        }
        self.cache.set(key, payload, TTL_SAFETY)
        return payload


def _validate_year(year: int) -> None:
    if not isinstance(year, int) or year < 1995 or year > 2100:
        raise ProviderError("Choose a model year from 1995 or later.", status=400, code="invalid")


def _skip_model(name: str) -> bool:
    lowered = name.lower()
    return "incomplete" in lowered or "chassis" in lowered


def _present(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text or text in ("", "Not Applicable", "N/A", "NA"):
        return None
    return text


def _intish(value: Any) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _rating(value: Any) -> int | None:
    try:
        number = int(str(value).strip()[0])
    except (TypeError, ValueError, IndexError):
        return None
    return number if 1 <= number <= 5 else None


def _empty_recalls(model: str, year: int) -> dict:
    return {
        "make": "Toyota",
        "model": model,
        "year": year,
        "count": 0,
        "campaigns": [],
        "note": "No recall campaigns are published for this make, model, and year. That is not a guarantee the vehicle is recall-free.",
        "source": "NHTSA",
    }


def _unavailable_safety(model: str, year: int, reason: str) -> dict:
    return {
        "available": False,
        "overall_rating": None,
        "reason": reason,
        "variants": [],
        "source": "NHTSA",
        "model": model,
        "year": year,
    }


nhtsa = NhtsaService()
