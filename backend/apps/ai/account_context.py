"""Verified account text for Nemotron.

The model may explain these figures. It must not invent payments, eligibility, or approvals.
Loaded from the synthetic Toyota data pack, the same records the customer page shows.
"""

from __future__ import annotations

import json
import math
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path

from . import finance, policy

# The account behind this request's bearer token. Self-registered data is only read for its owner.
_signed_in: ContextVar = ContextVar("signed_in", default=None)


def bind_signed_in(account) -> None:
    _signed_in.set(account)


def _own_account(customer_id: str | None):
    account = _signed_in.get()
    return account if account is not None and customer_id and account.customer_id == customer_id else None


def _months_left(balance: float, apr: float, monthly: float) -> float:
    """Exact (fractional) term at which finance.payment() reproduces the customer's own payment."""
    r = apr / 100 / 12
    return balance / monthly if r == 0 else -math.log(1 - balance * r / monthly) / math.log(1 + r)


def self_reported_profile(customer_id: str | None) -> dict | None:
    """A data-pack-shaped profile built from terms the signed-in customer typed. Never verified."""
    account = _own_account(customer_id)
    ag = (account.agreement or {}) if account else {}
    if not ag:
        return None
    pay = float(account.current_payment or 0)
    loan = ag["contract_type"] == "loan"
    months = _months_left(ag["current_balance"], ag["apr"], pay) if loan else ag["months_remaining"]
    return {
        "self_reported": True,
        "customer": {
            "customer_id": customer_id,
            "first_name": account.first_name,
            "city": account.city,
            "state": account.state,
            "vulnerable_flag": "N",
            "marketing_consent": "N",
        },
        "vehicle": {
            "model_year": account.vehicle_year or "",
            "model": account.vehicle_model or "(model not given)",
            "trim": "",
            "odometer_now": ag.get("odometer_now"),
            "est_market_value_now": None,
            "annual_miles_est": None,
            "next_service_due": None,
            "open_recall": "unknown",
        },
        "account": {
            "contract_type": ag["contract_type"],
            "monthly_payment": pay,
            "apr": ag.get("apr"),
            "current_balance": ag.get("current_balance"),
            "payoff_quote": None,
            "residual_value": ag.get("residual_value"),
            "mileage_allowance_total": ag.get("mileage_allowance_total"),
            "months_remaining": months,
            "term_months": months,
            "contract_end": "",
            "payment_due_day": ag.get("payment_due_day", 1),
            "missed_payments_12m": 0,
        },
        "situation": {"customer_says": account.life_change},
        "options": [],
    }


def _self_registered_context(customer_id: str) -> str | None:
    account = _own_account(customer_id)
    if account is None:
        return None
    lines = [
        f"Signed-in customer: {account.first_name} ({customer_id}), {account.city}, {account.state}. "
        "This customer registered on the site. There is NO verified Toyota Financial Services record for them.",
        f"Vehicle they named: {account.vehicle_year or ''} Toyota {account.vehicle_model or '(not given)'}.",
        f"What the customer said: {account.life_change}",
    ]
    profile = self_reported_profile(customer_id)
    if profile:
        a = profile["account"]
        lines.append(
            f"SELF-REPORTED, UNVERIFIED terms: {a['contract_type']}, payment {_money(a['monthly_payment'])}, "
            f"APR {a['apr'] if a['apr'] is not None else 'not given'}, balance {_money(a['current_balance'])}, "
            f"residual {_money(a['residual_value'])}, about {math.ceil(a['months_remaining'])} months remaining."
        )
        lines.append(
            "Tools may compute scenarios from these numbers. Always say the figures are based on what the customer entered, "
            "not on their actual agreement. Never state eligibility, approval, or an offer."
        )
    else:
        lines.append("They have not entered loan or lease terms. Do not estimate a balance, APR, or payoff.")
    lines.append("You cannot change any contract from this conversation.")
    return "\n".join(lines)


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


def account_facts(profile: dict) -> list[str]:
    c = profile.get("customer") or {}
    v = profile.get("vehicle") or {}
    a = profile.get("account") or {}
    s = profile.get("situation") or {}
    lines = [
        f"Signed-in customer: {c.get('first_name')} ({c.get('customer_id')}), {c.get('city')}, {c.get('state')}.",
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
    ]
    return lines


CLOSING_RULE = (
    "You cannot change the contract from this conversation. "
    "Tell the customer a next step starts only after they authorize it on their account page. "
    "If a dollar amount they just said matters, repeat it before relying on it."
)


def account_context(customer_id: str, conversation_text: str = "") -> str | None:
    profile = _profiles().get(customer_id)
    if not profile:
        own = _self_registered_context(customer_id)
        if own is None:
            return None
        decision = policy.decide(self_reported_profile(customer_id), conversation_text)
        return "\n".join([own, *policy.rule_lines(decision)])

    decision = policy.decide(profile, conversation_text)
    return "\n".join([*account_facts(profile), *policy.option_lines(decision), *policy.rule_lines(decision), CLOSING_RULE])
