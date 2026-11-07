"""Verified account text for Nemotron.

The model may explain these figures. It must not invent payments, eligibility, or approvals.
Loaded from the synthetic Toyota data pack, the same records the customer page shows.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_PACK = Path(__file__).resolve().parents[2] / "data_pack" / "customer_profiles.json"


@lru_cache(maxsize=1)
def _profiles() -> dict[str, dict]:
    if not _PACK.exists():
        return {}
    raw = json.loads(_PACK.read_text(encoding="utf-8"))
    profiles = raw if isinstance(raw, list) else raw.get("profiles", [])
    out: dict[str, dict] = {}
    for profile in profiles:
        customer = profile.get("customer") or {}
        cid = customer.get("customer_id")
        if cid:
            out[cid] = profile
    return out


def _money(value) -> str:
    if value is None or value == "":
        return "not on this agreement"
    try:
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return str(value)


def account_context(customer_id: str) -> str | None:
    profile = _profiles().get(customer_id)
    if not profile:
        return None

    c = profile.get("customer") or {}
    v = profile.get("vehicle") or {}
    a = profile.get("account") or {}
    s = profile.get("situation") or {}
    lines = [
        f"Signed-in customer: {c.get('first_name')} ({customer_id}), {c.get('city')}, {c.get('state')}.",
        f"Occupation on file: {c.get('occupation')}. Annual income on file: {_money(c.get('annual_income'))}.",
        "Income on file may be out of date. If the customer states a new income, treat it as unverified and say so.",
        (
            f"Vehicle: {v.get('model_year')} Toyota {v.get('model')} {v.get('trim')}. "
            f"Odometer {v.get('odometer_now')} miles. Estimated value {_money(v.get('est_market_value_now'))} "
            "(an estimate, not a guaranteed offer). "
            f"Open recall: {v.get('open_recall')}."
        ),
        (
            f"Financing institution: Toyota Financial Services. Contract type: {a.get('contract_type')}. "
            f"Monthly payment {_money(a.get('monthly_payment'))}. APR: {a.get('apr') if a.get('apr') is not None else 'not on this agreement'}. "
            f"Money factor: {a.get('money_factor') if a.get('money_factor') is not None else 'not on this agreement'}. "
            f"Balance {_money(a.get('current_balance'))}. Payoff {_money(a.get('payoff_quote'))}. "
            f"Residual {_money(a.get('residual_value'))}. "
            f"Months remaining: {a.get('months_remaining')} of {a.get('term_months')}. "
            f"Contract ends {a.get('contract_end')}. Payment due day {a.get('payment_due_day')}. "
            f"Missed payments in 12 months: {a.get('missed_payments_12m')}."
        ),
        f"What the customer already said: {s.get('customer_says')}",
        "Precomputed options. Explain only these. Do not add a program that is not listed.",
    ]
    for option in profile.get("options") or []:
        lines.append(
            f"- {option.get('option_id')} {option.get('option_name')}: eligibility {option.get('eligibility')}. "
            f"{option.get('plain_language_summary')} Trade-off: {option.get('tradeoff')} "
            f"Assumption: {option.get('key_assumption')}"
        )
    if c.get("vulnerable_flag") == "Y" or int(a.get("missed_payments_12m") or 0) >= 2:
        lines.append("Hardship on this account must be reviewed by a person. Do not promise approval and do not upsell.")
    if c.get("marketing_consent") == "N":
        lines.append("This customer has not given marketing consent. Do not pitch a new vehicle.")
    lines.append(
        "You cannot change the contract from this conversation. "
        "Tell the customer a next step starts only after they authorize it on their account page. "
        "If a dollar amount they just said matters, repeat it before relying on it."
    )
    return "\n".join(lines)
