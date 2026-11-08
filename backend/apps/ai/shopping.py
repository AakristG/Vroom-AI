"""Car-shopping suggestions for the assistant: budget, use, and count parsed from the question,
candidates ranked deterministically from the catalog plus the bundled starting-MSRP table.

Every price and payment the assistant quotes for a shopping question comes from here.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

from apps.vehicles.matching import canonical
from apps.vehicles.views import lookup

from . import finance

logger = logging.getLogger(__name__)

_MSRP = Path(__file__).resolve().parents[1] / "vehicles" / "msrp.json"

APR_ASSUMED = 6.9
TERM_ASSUMED = 60
MAX_SUGGESTIONS = 5

_SHOP_RE = re.compile(
    r"\b(buy|buying|purchase|shopping|shop for|looking for|in the market|get (?:a|my|me|him|her)|"
    r"recommend|suggest|suggestions?|options? for|which (?:car|toyota|vehicle|model)|what (?:car|toyota|vehicle|model)|"
    r"best (?:car|toyota|vehicle|suv|truck|sedan)|first car|new car|used car|next car|"
    r"under \$|below \$|less than \$|budget)\b",
    re.IGNORECASE,
)
_VEHICLE_WORD_RE = re.compile(r"\b(car|cars|toyota|vehicle|suv|truck|sedan|hatchback|minivan|van|hybrid|ev|electric|model)s?\b", re.I)
_ACCOUNT_RE = re.compile(r"\b(my (?:loan|lease|payment|balance|contract|account|apr|rate)|payoff|refinanc|extend|lease end)\b", re.I)
_BUDGET_RE = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?|(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|grand)\b|(\d{4,6})\s*(?:dollars|usd)\b", re.I)
_MONTHLY_RE = re.compile(r"(?:/\s*mo|a month|per month|monthly|each month|/month)", re.I)
_COUNT_RE = re.compile(r"\b(\d|one|two|three|four|five)\s+(?:suggestions?|options?|cars?|picks?|choices?|ideas?|vehicles?|models?|toyotas?)\b", re.I)
_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}

_USES = [
    ("new driver", re.compile(r"\b(son|daughter|teen|teenager|kid|child|grandson|granddaughter|student|first car|new driver|college)\b", re.I)),
    ("family", re.compile(r"\b(family|kids|baby|car seats?|carpool|seven|7 seats|third row|3rd row)\b", re.I)),
    ("commute", re.compile(r"\b(commute|commuting|mpg|gas|fuel|efficient|economy|highway miles)\b", re.I)),
    ("towing", re.compile(r"\b(tow|towing|haul|trailer|boat|work truck|bed)\b", re.I)),
    ("off-road", re.compile(r"\b(off[- ]?road|trail|camping|overland|snow|4x4)\b", re.I)),
    ("electric", re.compile(r"\b(electric|ev|plug[- ]?in|zero emissions|charge|charging)\b", re.I)),
    ("sporty", re.compile(r"\b(sport|sporty|fast|fun to drive|performance|coupe)\b", re.I)),
]
_CATEGORY_WORDS = {
    "SUV": re.compile(r"\bsuvs?\b|\bcrossovers?\b", re.I),
    "Truck": re.compile(r"\btrucks?\b|\bpickups?\b", re.I),
    "Sedan": re.compile(r"\bsedans?\b", re.I),
    "Minivan": re.compile(r"\bminivans?\b|\bvans?\b", re.I),
    "Hatchback": re.compile(r"\bhatchbacks?\b", re.I),
}


def is_shopping(question: str) -> bool:
    """A question about choosing or buying a vehicle, not about the customer's current agreement."""
    q = question or ""
    if _ACCOUNT_RE.search(q):
        return False
    return bool(_SHOP_RE.search(q) and (_VEHICLE_WORD_RE.search(q) or _BUDGET_RE.search(q)))


@lru_cache(maxsize=1)
def _prices() -> dict:
    data = json.loads(_MSRP.read_text(encoding="utf-8"))
    by_key = {canonical(name): (name, price) for name, price in data["models"].items()}
    for alias, target in data.get("aliases", {}).items():
        by_key[canonical(alias)] = (target, data["models"][target])
    return {"year": data["model_year"], "note": data["note"], "by_key": by_key}


def starting_msrp(model: str) -> int | None:
    hit = _prices()["by_key"].get(canonical(model))
    return hit[1] if hit else None


def parse_request(question: str) -> dict:
    q = question or ""
    budget = monthly = None
    m = _BUDGET_RE.search(q)
    if m:
        raw = m.group(1) or m.group(3) or m.group(5)
        amount = float(raw.replace(",", ""))
        if m.group(2) or (m.group(4) and m.group(4).lower() in ("k", "thousand", "grand")):
            amount *= 1000
        tail = q[m.end(): m.end() + 20]
        if _MONTHLY_RE.search(tail) or amount < 2000:
            monthly = amount
        else:
            budget = amount
    count = 3
    c = _COUNT_RE.search(q)
    if c:
        word = c.group(1).lower()
        count = int(word) if word.isdigit() else _WORDS[word]
    uses = [name for name, rx in _USES if rx.search(q)]
    categories = [cat for cat, rx in _CATEGORY_WORDS.items() if rx.search(q)]
    return {"budget": budget, "monthly_budget": monthly, "count": max(1, min(count, MAX_SUGGESTIONS)),
            "uses": uses, "categories": categories}


def _monthly(price: float, down: float = 0) -> float:
    return round(finance.payment(max(price - down, 0), APR_ASSUMED, TERM_ASSUMED), 2)


def _price_for_monthly(monthly: float) -> float:
    r = APR_ASSUMED / 100 / 12
    return monthly * (1 - (1 + r) ** -TERM_ASSUMED) / r


def _fit(record: dict, uses: list[str], categories: list[str]) -> float:
    """Higher is a better match. Ties fall back to lower price."""
    score = 0.0
    cat, fuel = record.get("category") or "", record.get("fuel_type") or ""
    combined = (record.get("mpg") or {}).get("combined") or 0
    rating = record.get("safety_rating") or 0
    model = record["model"].lower()
    if categories:
        score += 4 if cat in categories else -4
    if "new driver" in uses:
        score += rating * 1.5 + combined / 10
        score += 2 if cat in ("Sedan", "Hatchback", "SUV") else -2
        if record["model"].startswith("GR") or "supra" in model:
            score -= 6  # High-performance cars are a poor first car.
    if "family" in uses:
        score += 4 if cat in ("SUV", "Minivan") else 0
        score += 3 if any(k in model for k in ("sienna", "highlander", "grand highlander", "sequoia")) else 0
    if "commute" in uses:
        score += combined / 6
    if "towing" in uses:
        score += 5 if cat == "Truck" or any(k in model for k in ("sequoia", "4runner", "land cruiser")) else -3
    if "off-road" in uses:
        score += 4 if any(k in model for k in ("4runner", "tacoma", "land cruiser", "tundra", "woodland", "rav4")) else 0
    if "electric" in uses:
        score += 5 if fuel in ("Electric", "Plug-in hybrid") else (1 if "Hybrid" in fuel else -2)
    if "sporty" in uses:
        score += 5 if record["model"].startswith("GR") or "supra" in model else 0
    if not uses and not categories:
        score += rating + combined / 15
    return score


def shop_vehicles(question: str = "", budget: float | None = None, monthly_budget: float | None = None,
                  count: int | None = None, uses: list[str] | None = None, categories: list[str] | None = None) -> dict:
    """Ranked Toyota suggestions for a budget and use, with deterministic price and payment estimates."""
    req = parse_request(question)
    budget = budget if budget is not None else req["budget"]
    monthly_budget = monthly_budget if monthly_budget is not None else req["monthly_budget"]
    count = max(1, min(int(count or req["count"]), MAX_SUGGESTIONS))
    uses = uses if uses is not None else req["uses"]
    categories = categories if categories is not None else req["categories"]
    prices = _prices()
    year = prices["year"]
    price_cap = budget or (_price_for_monthly(monthly_budget) if monthly_budget else None)

    try:
        from apps.vehicles.catalog import provider
        listing = provider().catalog(year)
    except Exception:
        logger.exception("Catalog unavailable for shopping suggestions")
        return {"error": "The vehicle catalog is unavailable right now."}

    priced = [(r, starting_msrp(r["model"])) for r in listing]
    priced = [(r, p) for r, p in priced if p]
    pool = sorted(priced, key=lambda rp: rp[1])
    if price_cap:
        within = [rp for rp in pool if rp[1] <= price_cap]
        pool = within if within else pool[:6]
    # Pre-rank on category and use from the cheap listing, then fetch MPG and safety for the best few.
    pool = sorted(pool, key=lambda rp: (-_fit(rp[0], uses, categories), rp[1]))[:max(8, count * 2)]
    candidates = []
    for listed, price in pool:
        record, error = lookup(year, listed["model"], None)
        if error or not record:
            continue
        candidates.append((record, price))

    ranked = sorted(candidates, key=lambda rp: (-_fit(rp[0], uses, categories), rp[1]))
    if categories and any((r.get("category") in categories) for r, _ in ranked):
        ranked = [rp for rp in ranked if rp[0].get("category") in categories] + \
                 [rp for rp in ranked if rp[0].get("category") not in categories]
    picks = ranked[:count]
    fits_new = bool(price_cap) and any(price <= price_cap for _, price in picks)
    cheapest = min(((r["model"], p) for r, p in priced), key=lambda mp: mp[1]) if priced else None

    suggestions = []
    for record, price in picks:
        mpg = record.get("mpg") or {}
        suggestions.append({
            "id": record["id"],
            "vehicle": f"{year} Toyota {record['model']}",
            "category": record.get("category"),
            "fuel_type": record.get("fuel_type"),
            "starting_msrp_approx": price,
            "within_budget": (price <= price_cap) if price_cap else None,
            "over_budget_by": round(price - price_cap) if price_cap and price > price_cap else None,
            "est_monthly_payment": _monthly(price),
            "mpg_combined": mpg.get("combined"),
            "mpg_combined_high": mpg.get("combined_high"),
            "mpge": record.get("mpge"),
            "ev_range_mi": record.get("ev_range_mi"),
            "safety_rating_5_star": record.get("safety_rating"),
            "recall_campaigns": record.get("recall_count"),
        })

    out = {
        "request": {"budget": budget, "monthly_budget": monthly_budget, "price_cap_used": round(price_cap) if price_cap else None,
                    "count": count, "uses": uses, "categories": categories},
        "suggestions": suggestions,
        "pricing_note": f"{year} model year. {prices['note']}",
        "payment_assumptions": f"Estimated monthly payment assumes $0 down, {APR_ASSUMED}% APR, {TERM_ASSUMED} months, "
                               "before taxes, fees, and destination. Actual rate depends on credit and is not an offer.",
    }
    if price_cap and not fits_new and cheapest:
        out["no_new_vehicle_fits"] = (
            f"No new {year} Toyota starts at or under ${price_cap:,.0f}. The lowest starting price is the "
            f"{cheapest[0]} at about ${cheapest[1]:,}. The suggestions are the closest new models. A used or "
            "Toyota Certified Used version of the same models, a few model years old, is the usual way to fit this "
            "budget. This site has no used-car prices, so the customer should check listings or a dealer."
        )
    return out


def _fallback_reason(s: dict, uses: list[str]) -> str:
    bits = []
    if s.get("safety_rating_5_star") == 5:
        bits.append("a 5-star overall safety rating")
    if s.get("mpge"):
        bits.append(f"{s['mpge']} MPGe")
    elif s.get("mpg_combined"):
        high = s.get("mpg_combined_high")
        bits.append(f"{s['mpg_combined']}{f' to {high}' if high else ''} mpg combined")
    if not bits:
        return f"A {(s.get('category') or 'Toyota').lower()} worth a look."
    return "It has " + " and ".join(bits) + "."


def _vehicle_name(s: dict) -> str:
    return s["vehicle"]


def compose(result: dict, reasons: dict[int, str], careful: bool = False) -> str:
    """The shopping reply: deterministic figures and structure, with model-written reasons per vehicle."""
    if result.get("error"):
        return f"I couldn't pull vehicle suggestions right now. {result['error']} Try again in a moment, or browse all Toyotas."
    req, picks = result["request"], result["suggestions"]
    if not picks:
        return "I couldn't find a Toyota that matches that yet. Try a different budget or type of vehicle."
    lines = []
    cap = req.get("price_cap_used")
    if result.get("no_new_vehicle_fits"):
        cheapest = min(p["starting_msrp_approx"] for p in picks)
        lines.append(
            f"No new Toyota starts under ${cap:,}, so the closest new models start at about ${cheapest:,}. "
            "A used or Toyota Certified Used version of these, a few years old, is the usual way to stay in budget."
        )
    else:
        who = " for a new driver" if "new driver" in req.get("uses", []) else (" for a family" if "family" in req.get("uses", []) else "")
        within = f" under about ${round(cap, -2):,.0f}" if req.get("budget") else ""
        lines.append(f"Here are {len(picks)} Toyotas{who}{within} to look at.")
    if req.get("monthly_budget"):
        lines[-1] += f" A ${req['monthly_budget']:,.0f} monthly budget covers a price of about ${round(cap, -2):,.0f} with the assumptions below."
    lines.append("")
    for i, p in enumerate(picks, 1):
        reason = (reasons.get(i) or "").strip() or _fallback_reason(p, req.get("uses", []))
        if reason and reason[-1] not in ".!?":
            reason += "."
        lines.append(
            f"{i}. {_vehicle_name(p)}: about ${p['starting_msrp_approx']:,}, around ${p['est_monthly_payment']:,.0f}/month. {reason}"
        )
    lines.append("")
    lines.append(
        f"Prices are approximate {result['pricing_note'].split('.')[0]} starting prices before destination, taxes, and fees. "
        f"Payments assume $0 down, {APR_ASSUMED}% APR, and {TERM_ASSUMED} months, and are not an offer."
    )
    if careful:
        lines.append("If money is tight right now, a Toyota Financial Services specialist can talk it through with you before you decide.")
    else:
        lines.append("Compare them side by side below, then book a test drive at a dealer.")
    return "\n".join(lines)


_REASON_RE = re.compile(r"^\s*(\d+)\s*[.):\-]\s*(.+?)\s*$", re.MULTILINE)


# A reason may not make money or budget claims; those figures belong to the backend.
_MONEY_CLAIM_RE = re.compile(r"\$|\bbudget\b|\b\d+\s?k\b|\bprice[ds]?\b|\bcheap|\bafford|\bpayment", re.I)


def parse_reasons(text: str, count: int, names: list[str] | None = None) -> dict[int, str]:
    out: dict[int, str] = {}
    names = names or [""] * count
    for m in _REASON_RE.finditer(text or ""):
        i = int(m.group(1))
        if not (1 <= i <= count) or i in out:
            continue
        reason = re.sub(r"\s+", " ", m.group(2)).strip()
        name = names[i - 1] if i - 1 < len(names) else ""
        for prefix in filter(None, [name, name.replace("Toyota ", ""), name.split(" ", 1)[-1]]):
            if reason.lower().startswith(prefix.lower()):
                reason = reason[len(prefix):].lstrip(" :,-")
        if reason and not _MONEY_CLAIM_RE.search(reason):
            out[i] = reason[0].upper() + reason[1:]
    return out


def reason_brief(result: dict, question: str) -> str:
    """The facts the model may use to write one reason per vehicle."""
    rows = []
    for i, p in enumerate(result.get("suggestions") or [], 1):
        facts = {k: p.get(k) for k in ("vehicle", "category", "fuel_type", "mpg_combined", "mpg_combined_high", "mpge",
                                       "ev_range_mi", "safety_rating_5_star")}
        rows.append(f"{i}. {json.dumps({k: v for k, v in facts.items() if v is not None})}")
    needs = ", ".join(result.get("request", {}).get("uses") or []) or "not stated"
    return f"Customer asked: {question}\nCustomer needs: {needs}\nVehicles:\n" + "\n".join(rows)
