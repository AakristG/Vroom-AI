"""Deterministic loan math. Every figure the assistant quotes about payments comes from here
or from the account record, never from the language model."""

from __future__ import annotations

# Payments on file are rounded to the cent; a leftover under $1 is settled with the final payment.
ROUNDING_RESIDUE = 1.0


def _rate(apr: float) -> float:
    return apr / 100 / 12


def payment(principal: float, apr: float, months: int) -> float:
    if months <= 0:
        return 0.0
    r = _rate(apr)
    if r == 0:
        return principal / months
    return principal * r / (1 - (1 + r) ** -months)


def schedule(balance: float, apr: float, monthly: float, max_months: int = 600) -> list[dict]:
    rows, r, month = [], _rate(apr), 0
    while balance > 0.005 and month < max_months:
        month += 1
        interest = balance * r
        principal = min(monthly - interest, balance)
        if principal <= 0:
            break
        if balance - principal < ROUNDING_RESIDUE:
            principal = balance
        balance -= principal
        rows.append({"month": month, "interest": interest, "principal": principal, "balance": max(balance, 0.0)})
    return rows


def _totals(rows: list[dict]) -> dict:
    return {"months": len(rows), "total_interest": round(sum(r["interest"] for r in rows), 2)}


def keep_as_is(balance: float, apr: float, months_remaining: int) -> dict:
    monthly = payment(balance, apr, months_remaining)
    totals = _totals(schedule(balance, apr, monthly))
    return {"monthly_payment": round(monthly, 2), **totals, "total_paid": round(balance + totals["total_interest"], 2)}


def extend_term(balance: float, apr: float, months_remaining: int, extra_months: int) -> dict:
    base = keep_as_is(balance, apr, months_remaining)
    longer = keep_as_is(balance, apr, months_remaining + extra_months)
    return {
        "illustrative_only": True,
        "assumption": f"Same {apr}% APR, {extra_months} more months. Not an approved Toyota offer.",
        "keep": base,
        "extended": longer,
        "monthly_change": round(longer["monthly_payment"] - base["monthly_payment"], 2),
        "extra_interest": round(longer["total_interest"] - base["total_interest"], 2),
    }


def extra_payment(balance: float, apr: float, months_remaining: int, extra: float) -> dict:
    monthly = payment(balance, apr, months_remaining)
    base = _totals(schedule(balance, apr, monthly))
    faster = _totals(schedule(balance, apr, monthly + extra))
    return {
        "assumption": f"${extra:,.0f} more toward principal every month at {apr}% APR. Confirm your agreement has no prepayment terms that change this.",
        "monthly_payment_with_extra": round(monthly + extra, 2),
        "months_saved": base["months"] - faster["months"],
        "interest_saved": round(base["total_interest"] - faster["total_interest"], 2),
        "new_payoff_months": faster["months"],
    }


def this_month(balance: float, apr: float, monthly: float) -> dict:
    interest = balance * _rate(apr)
    return {"interest": round(interest, 2), "principal": round(monthly - interest, 2)}
