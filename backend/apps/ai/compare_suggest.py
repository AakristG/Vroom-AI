"""Three AI-picked Toyotas to add to the Compare page.

The backend narrows the catalog to real candidates (same model year, not already compared, with a
known starting price), ranks them by how close they are to what the customer is comparing, and then
asks Nemotron to choose three and give a one-line reason for each. Nemotron can only pick from the
candidate list, so it cannot invent a model or a price. If the model call fails, the top three ranked
candidates are returned with a plain reason.
"""

from __future__ import annotations

import json
import logging
import re

from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api
from apps.spacetime import sync as live_sync
from apps.vehicles.catalog import provider

from . import nim_client
from .account_context import bind_signed_in
from .shopping import starting_msrp
from .tools import _profile

logger = logging.getLogger(__name__)

SUGGESTION_COUNT = 3
DEFAULT_YEAR = 2026
CANDIDATE_POOL = 12
# Non-breaking/typographic dashes and quotes the model sometimes emits.
_PLAIN = str.maketrans({"‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', " ": " "})

PROMPT = (
    "You help a Toyota customer decide which models to add to a side-by-side comparison. "
    "Choose exactly three models from the CANDIDATES list only. Never name a model that is not in the list. "
    "Prefer a useful spread: one close alternative, one that is cheaper or more efficient, and one that offers something different. "
    "Reply with JSON only, no prose: "
    '[{"model": "<exact candidate name>", "reason": "<one sentence, at most 18 words, no prices or model years>"}, ...]'
)


def _parse_ids(raw: list[str]) -> list[tuple[int, str]]:
    out = []
    for item in raw:
        parts = str(item).split("|")
        if len(parts) >= 2 and parts[0].isdigit():
            out.append((int(parts[0]), parts[1]))
    return out


def _rank(candidates: list[dict], compared: list[dict], target_price: float | None) -> list[dict]:
    categories = {c.get("category") for c in compared if c.get("category")}
    fuels = {c.get("fuel_type") for c in compared if c.get("fuel_type")}

    def score(c: dict) -> tuple:
        same_cat = c.get("category") in categories
        same_fuel = c.get("fuel_type") in fuels
        gap = abs((c["price"] or 0) - target_price) if target_price else 0
        return (-(2 * same_cat + same_fuel), gap)

    return sorted(candidates, key=score)


def _fallback_reason(c: dict, compared: list[dict]) -> str:
    cats = {x.get("category") for x in compared}
    if c.get("category") in cats:
        return f"Another {(c.get('category') or 'Toyota').lower()} worth lining up against your picks."
    if c.get("fuel_type") in ("Hybrid", "Electric", "Plug-in hybrid"):
        return f"A {c['fuel_type'].lower()} option if fuel cost matters to you."
    return f"A different {(c.get('category') or 'type of Toyota').lower()} to widen the comparison."


def _ask_nemotron(candidates: list[dict], compared: list[dict], profile: dict | None) -> list[dict] | None:
    lines = [
        f"- {c['model']} | {c.get('category') or 'unknown type'} | {c.get('fuel_type') or 'unknown fuel'}"
        for c in candidates
    ]
    about = "No account on file."
    if profile:
        v = profile.get("vehicle") or {}
        about = (
            f"Currently drives a {v.get('model_year')} Toyota {v.get('model')}; "
            f"about {v.get('annual_miles_est') or 'unknown'} miles a year."
        )
    compared_txt = ", ".join(f"{c['year']} {c['model']}" for c in compared) or "nothing yet"
    user = f"Comparing: {compared_txt}.\nCustomer: {about}\nCANDIDATES:\n" + "\n".join(lines)
    try:
        text = nim_client.generate_reply([{"role": "user", "content": user}], base=PROMPT)
    except Exception:
        logger.exception("Nemotron compare suggestions failed")
        return None
    match = re.search(r"\[.*\]", text or "", re.S)
    if not match:
        return None
    try:
        picks = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    by_name = {c["model"].lower(): c for c in candidates}
    out, seen = [], set()
    for p in picks if isinstance(picks, list) else []:
        c = by_name.get(str(p.get("model", "")).strip().lower()) if isinstance(p, dict) else None
        if c and c["model"] not in seen:
            seen.add(c["model"])
            reason = str(p.get("reason") or "").translate(_PLAIN)
            reason = re.sub(r"\s+", " ", reason).strip()[:160]
            out.append({**c, "reason": reason or _fallback_reason(c, [])})
    return out or None


@api_view(["POST"])
@login_required_api
def compare_suggestions(request):
    """POST {"ids": ["2026|Camry|", ...]} -> {"suggestions": [{id, year, model, category, fuel_type, price, reason}], "source"}"""
    raw = request.data.get("ids") if isinstance(request.data.get("ids"), list) else []
    picked = _parse_ids(raw)
    year = picked[0][0] if picked else DEFAULT_YEAR
    account = request.account
    bind_signed_in(account)
    profile = _profile(account.customer_id)

    try:
        listing = provider().catalog(year)
    except Exception:
        logger.exception("Catalog unavailable for compare suggestions")
        return Response({"detail": "The vehicle catalog is unavailable right now.", "suggestions": []}, status=503)

    taken = {m.lower() for _, m in picked}
    compared = [r for r in listing if r["model"].lower() in taken]
    candidates = []
    for r in listing:
        if r["model"].lower() in taken:
            continue
        price = starting_msrp(r["model"])
        if not price:
            continue
        candidates.append({
            "id": r["id"], "year": r["year"], "model": r["model"],
            "category": r.get("category"), "fuel_type": r.get("fuel_type"), "price": price,
        })
    if not candidates:
        return Response({"suggestions": [], "source": "none"})

    prices = [starting_msrp(c["model"]) for c in compared]
    prices = [p for p in prices if p]
    target = sum(prices) / len(prices) if prices else None
    ranked = _rank(candidates, compared, target)[:CANDIDATE_POOL]

    picks = _ask_nemotron(ranked, compared, profile)
    source = "nemotron"
    if not picks:
        source = "ranked"
        picks = [{**c, "reason": _fallback_reason(c, compared)} for c in ranked]
    # Top up if the model returned fewer than three valid picks.
    for c in ranked:
        if len(picks) >= SUGGESTION_COUNT:
            break
        if all(p["model"] != c["model"] for p in picks):
            picks.append({**c, "reason": _fallback_reason(c, compared)})
    final = picks[:SUGGESTION_COUNT]
    live_sync.compare_suggestions(account.customer_id, ",".join(f"{y}|{m}" for y, m in picked), final, source)
    return Response({"suggestions": final, "source": source, "year": year})
