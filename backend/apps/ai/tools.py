"""Backend tools for Toyota NextMove AI. Each tool returns verified or deterministically computed data.

The same functions back both the native tool-calling path (NIM_TOOL_CALLING=true) and the
default path, where the backend picks tools from the page context and the question.
"""

from __future__ import annotations

import csv
import logging
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from apps.vehicles.catalog import provider
from apps.vehicles.views import lookup

from . import finance
from .account_context import _profiles, self_reported_profile

logger = logging.getLogger(__name__)

GAS_PRICE_DEFAULT = 3.25
KWH_PRICE_DEFAULT = 0.16
KWH_PER_GALLON_EQUIVALENT = 33.7


def _profile(customer_id: str | None) -> dict | None:
    return _profiles().get(customer_id or "") or self_reported_profile(customer_id)


def customer_profile(customer_id: str) -> dict:
    p = _profile(customer_id)
    if not p:
        return {"error": f"No account found for {customer_id}."}
    c, v, a = p["customer"], p["vehicle"], p["account"]
    return {
        **({"source": "Entered by the customer. Not a verified Toyota Financial Services agreement."} if p.get("self_reported") else {}),
        "customer": {"first_name": c["first_name"], "city": c["city"], "annual_miles_est": v.get("annual_miles_est")},
        "vehicle": f"{v['model_year']} Toyota {v['model']} {v['trim']}",
        "estimated_vehicle_value": v.get("est_market_value_now"),
        "next_service_due": v.get("next_service_due"),
        "open_recall": v.get("open_recall") == "Y",
        "contract_type": a["contract_type"],
        "monthly_payment": a["monthly_payment"],
        "apr": a.get("apr"),
        "current_balance": a.get("current_balance"),
        "payoff_quote": a.get("payoff_quote"),
        "residual_value": a.get("residual_value"),
        "months_remaining": math.ceil(a["months_remaining"]),
        "term_months": math.ceil(a["term_months"]),
        "contract_end": a["contract_end"],
        "payment_due_day": a["payment_due_day"],
        "missed_payments_12m": a["missed_payments_12m"],
    }


def _loan(customer_id: str) -> tuple[dict | None, str | None]:
    p = _profile(customer_id)
    if not p:
        return None, "No account on file."
    a = p["account"]
    if a["contract_type"] != "loan" or a.get("apr") is None or not a.get("current_balance"):
        return None, "This is a lease, so loan amortization doesn't apply."
    return a, None


def payment_breakdown(customer_id: str) -> dict:
    a, error = _loan(customer_id)
    if error:
        return {"error": error}
    split = finance.this_month(a["current_balance"], a["apr"], a["monthly_payment"])
    keep = finance.keep_as_is(a["current_balance"], a["apr"], a["months_remaining"])
    return {
        "monthly_payment": a["monthly_payment"],
        "next_payment_interest": split["interest"],
        "next_payment_principal": split["principal"],
        "remaining_interest_if_kept": keep["total_interest"],
        "months_remaining": math.ceil(a["months_remaining"]),
    }


def extra_payment_scenario(customer_id: str, extra_per_month: float = 100) -> dict:
    a, error = _loan(customer_id)
    if error:
        return {"error": error}
    return finance.extra_payment(a["current_balance"], a["apr"], a["months_remaining"], float(extra_per_month))


def term_extension_scenario(customer_id: str, extra_months: int = 12) -> dict:
    a, error = _loan(customer_id)
    if error:
        return {"error": error}
    return finance.extend_term(a["current_balance"], a["apr"], a["months_remaining"], int(extra_months))


def lease_end_options(customer_id: str) -> dict:
    p = _profile(customer_id)
    if not p or p["account"]["contract_type"] != "lease":
        return {"error": "There is no lease on this account."}
    a, v = p["account"], p["vehicle"]
    residual, value = a.get("residual_value"), v.get("est_market_value_now")
    return {
        "months_remaining": a["months_remaining"],
        "contract_end": a["contract_end"],
        "residual_value": residual,
        "estimated_vehicle_value": value,
        "estimated_value_minus_residual": round(value - residual, 2) if residual and value else None,
        "mileage_allowance_total": a.get("mileage_allowance_total"),
        "odometer_now": v.get("odometer_now"),
        "note": "Vehicle value is an estimate, not a guaranteed offer. Buyout price is set by the lease agreement.",
        "options_on_file": [o["option_name"] for o in p.get("options") or []],
    }


@lru_cache(maxsize=1)
def _golden_answers() -> dict[str, dict]:
    path = Path(__file__).resolve().parents[2] / "data_pack" / "data" / "golden_answers.csv"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return {row["customer_id"]: row for row in csv.DictReader(fh)}


def next_actions(customer_id: str) -> dict:
    p = _profile(customer_id)
    g = _golden_answers().get(customer_id)
    if not p or not g:
        return {"error": "No recommended next step on file."}
    return {
        "best_next_move": g["best_next_move"],
        "next_step_type": g["next_step_type"],
        "why": g["plain_language_message"],
        "guardrails": g["guardrail_notes"],
        "options_on_file": [
            {"name": o["option_name"], "eligibility": o["eligibility"], "summary": o["plain_language_summary"]}
            for o in p.get("options") or []
        ],
    }


def _vehicle_brief(record: dict) -> dict:
    keys = ("id", "year", "model", "trim", "category", "fuel_type", "engine", "horsepower", "drivetrain",
            "mpg", "mpge", "ev_range_mi", "seating", "cargo_cu_ft", "source")
    brief = {k: record.get(k) for k in keys}
    brief["historical_base_msrp"] = None
    brief["msrp_note"] = "Verified pricing is not currently connected."
    brief["safety_rating"] = record.get("safety_rating")
    brief["recall_count"] = record.get("recall_count")
    brief["image_match"] = record.get("image_match")
    return brief


def vehicle_lookup(year: int, model: str, trim: str | None = None) -> dict:
    record, error = lookup(int(year), model, trim or None)
    if error:
        return {"error": error["detail"]}
    return _vehicle_brief(record)


def compare_vehicles(ids: list[str]) -> dict:
    out = []
    for raw in ids[:3]:
        parts = raw.split("|")
        if len(parts) >= 2 and parts[0].isdigit():
            out.append(vehicle_lookup(int(parts[0]), parts[1], parts[2] if len(parts) > 2 else None))
    return {"vehicles": out}


def ownership_cost(ids: list[str], annual_miles: float = 12000, gas_price: float = GAS_PRICE_DEFAULT,
                   kwh_price: float = KWH_PRICE_DEFAULT) -> dict:
    rows = []
    for v in compare_vehicles(ids)["vehicles"]:
        if v.get("error"):
            rows.append(v)
            continue
        combined = (v.get("mpg") or {}).get("combined")
        name = f"{v['year']} {v['model']} {v.get('trim') or ''}".strip()
        if v.get("fuel_type") == "Electric" and v.get("mpge"):
            annual = annual_miles * KWH_PER_GALLON_EQUIVALENT / v["mpge"] * kwh_price
            basis = f"{v['mpge']} MPGe at ${kwh_price}/kWh"
        elif combined:
            annual = annual_miles / combined * gas_price
            basis = f"{combined} mpg combined at ${gas_price}/gal"
        else:
            rows.append({"vehicle": name, "annual_fuel_cost": None, "missing": "combined fuel economy"})
            continue
        msrp = v.get("historical_base_msrp")
        rows.append({
            "vehicle": name,
            "annual_fuel_cost": round(annual),
            "basis": basis,
            "five_year_fuel_cost": round(annual * 5),
            "five_year_msrp_plus_fuel": round(msrp + annual * 5) if msrp else None,
            "source": v.get("source"),
        })
    return {"annual_miles": annual_miles, "estimates": rows,
            "note": "Fuel only. Excludes insurance, maintenance, taxes, and financing."}


TOOL_FUNCTIONS = {
    "customer_profile": customer_profile,
    "payment_breakdown": payment_breakdown,
    "extra_payment_scenario": extra_payment_scenario,
    "term_extension_scenario": term_extension_scenario,
    "lease_end_options": lease_end_options,
    "next_actions": next_actions,
    "vehicle_lookup": vehicle_lookup,
    "compare_vehicles": compare_vehicles,
    "ownership_cost": ownership_cost,
}

_CUSTOMER_TOOLS = {"customer_profile", "payment_breakdown", "extra_payment_scenario",
                   "term_extension_scenario", "lease_end_options", "next_actions"}


def _fn(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {"type": "function", "function": {"name": name, "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required}}}


_IDS = {"type": "array", "items": {"type": "string"}, "description": "Vehicle ids like 2025|Camry|LE"}
TOOL_SCHEMAS = [
    _fn("payment_breakdown", "Interest vs principal in the signed-in customer's next loan payment.", {}, []),
    _fn("extra_payment_scenario", "Months and interest saved by paying extra each month.",
        {"extra_per_month": {"type": "number"}}, ["extra_per_month"]),
    _fn("term_extension_scenario", "Illustrative lower payment from a longer term, and the added interest.",
        {"extra_months": {"type": "integer"}}, ["extra_months"]),
    _fn("lease_end_options", "Residual, estimated value, and options for a lease that is ending.", {}, []),
    _fn("next_actions", "The recommended next step and options on file for this customer.", {}, []),
    _fn("vehicle_lookup", "Specs for one Toyota by year, model, optional trim.",
        {"year": {"type": "integer"}, "model": {"type": "string"}, "trim": {"type": "string"}}, ["year", "model"]),
    _fn("compare_vehicles", "Side-by-side specs for up to three Toyotas.", {"ids": _IDS}, ["ids"]),
    _fn("ownership_cost", "Annual and five-year fuel cost estimates.",
        {"ids": _IDS, "annual_miles": {"type": "number"}, "gas_price": {"type": "number"}}, ["ids"]),
]


def run_tool(name: str, args: dict, customer_id: str | None) -> dict:
    fn = TOOL_FUNCTIONS.get(name)
    if not fn:
        return {"error": f"Unknown tool {name}."}
    if name in _CUSTOMER_TOOLS:
        if not customer_id:
            return {"error": "The customer is not signed in, so account tools are unavailable."}
        args = {**args, "customer_id": customer_id}
    try:
        return fn(**args)
    except (TypeError, ValueError) as exc:
        return {"error": f"Bad arguments for {name}: {exc}"}
    except Exception:
        logger.exception("Assistant tool %s failed", name)
        return {"error": f"{name} is unavailable right now."}


# ---------------------------------------------------------------------------
# Default planner: pick tools from page context + the question.
# ---------------------------------------------------------------------------
_MONEY = re.compile(r"\$\s?(\d[\d,]*)")
_MONTHS = re.compile(r"(\d{1,2})\s*(?:more\s*)?months?")


def _mentioned_vehicles(text: str, year: int) -> list[str]:
    try:
        models = provider().models(year)
    except Exception:
        return []
    lowered = text.lower()
    hits = sorted((m for m in models if re.search(rf"\b{re.escape(m.lower())}\b", lowered)), key=len, reverse=True)
    chosen: list[str] = []
    for m in hits:
        if not any(m.lower() in c.lower() for c in chosen):
            chosen.append(m)
    return [f"{year}|{m}|" for m in chosen[:3]]


def plan(question: str, context: dict, customer_id: str | None) -> list[tuple[str, dict]]:
    q = question.lower()
    calls: list[tuple[str, dict]] = []
    profile = _profile(customer_id)
    contract = profile["account"]["contract_type"] if profile else None
    page_vehicles = [str(v) for v in (context.get("vehicles") or [])][:3]
    year = int(context.get("year") or 2025)
    vehicles = page_vehicles or _mentioned_vehicles(question, year)

    if profile:
        calls.append(("customer_profile", {}))
        if contract == "loan":
            if any(k in q for k in ("extra", "pay more", "pay off", "payoff early", "faster")):
                amount = _MONEY.search(question)
                calls.append(("extra_payment_scenario", {"extra_per_month": float(amount.group(1).replace(",", "")) if amount else 100}))
            if any(k in q for k in ("lower", "extend", "stretch", "afford", "smaller", "reduce", "tight", "hard")):
                months = _MONTHS.search(q)
                calls.append(("term_extension_scenario", {"extra_months": int(months.group(1)) if months else 12}))
            if any(k in q for k in ("monthly payment", "my payment", "interest", "principal", "understand")):
                calls.append(("payment_breakdown", {}))
        if contract == "lease" and any(k in q for k in ("lease", "end", "buy", "return", "options")):
            calls.append(("lease_end_options", {}))
        if any(k in q for k in ("next", "should i", "what do", "option", "recommend", "help", "smartest")):
            calls.append(("next_actions", {}))

    if vehicles:
        if any(k in q for k in ("fuel", "gas", "commute", "cost", "spend", "electric", "charge")):
            miles = (profile or {}).get("vehicle", {}).get("annual_miles_est") or 12000
            calls.append(("ownership_cost", {"ids": vehicles, "annual_miles": float(miles)}))
        calls.append(("compare_vehicles", {"ids": vehicles}) if len(vehicles) > 1 else
                     ("vehicle_lookup", dict(zip(("year", "model", "trim"), vehicles[0].split("|")))))

    seen, unique = set(), []
    for name, args in calls:
        key = (name, repr(sorted(args.items())))
        if key not in seen:
            seen.add(key)
            unique.append((name, args))
    return unique


def suggested_actions(tool_names: list[str], customer_id: str | None, context: dict) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    names = set(tool_names)
    if names & {"term_extension_scenario", "extra_payment_scenario", "payment_breakdown"}:
        actions.append({"type": "navigate", "label": "Open payment scenarios", "to": "/insights#scenarios"})
    if "lease_end_options" in names:
        actions.append({"type": "navigate", "label": "Compare lease-end choices", "to": "/my-toyota#options"})
    if names & {"compare_vehicles", "ownership_cost"} and context.get("page") != "compare":
        ids = "&".join(f"v={i}" for i in (context.get("vehicles") or []))
        actions.append({"type": "navigate", "label": "Open the comparison", "to": f"/compare?{ids}" if ids else "/compare"})
    p = _profile(customer_id)
    if p and (p["customer"]["vulnerable_flag"] == "Y" or p["account"]["missed_payments_12m"] >= 1):
        actions.append({"type": "confirm", "action": "request_callback", "topic": "Payment help",
                        "label": "Ask a specialist to call me about payment help"})
    elif "lease_end_options" in names:
        actions.append({"type": "confirm", "action": "request_callback", "topic": "Lease end",
                        "label": "Ask a specialist to call me about lease end"})
    if not customer_id and not actions:
        actions.append({"type": "navigate", "label": "Sign in to use your account", "to": "/signin"})
    return actions[:3]
