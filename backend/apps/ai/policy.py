"""Deterministic Next Move guardrails.

The model explains. This module decides which precomputed options it may see, which single next
move it recommends, and which next-step label the reply ends with.
"""

from __future__ import annotations

import csv
import re
from contextvars import ContextVar
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

# What the customer has typed in this request's conversation, for distress detection.
_conversation: ContextVar[str] = ContextVar("conversation", default="")


def bind_conversation(messages: list[dict]) -> str:
    text = "\n".join(m.get("content") or "" for m in messages if m.get("role") == "user")
    _conversation.set(text)
    return text

LABELS = ("Self-service", "Follow-up", "Eligible offer")

# Options that put the customer into a different (new) vehicle.
NEW_VEHICLE_OPTIONS = {"TRADE", "RENEW"}

_DISTRESS_RE = re.compile(
    r"can'?t (?:afford|pay|make)|cannot (?:afford|pay|make)|unable to pay|lost my job|laid off|"
    r"hours (?:were |got )?cut|fall(?:ing|en)? behind|behind on|struggl|overwhelm|desperate|"
    r"hardship|scared|terrified|panic|evict|medical bills?|divorce|no income|out of work|"
    r"missed (?:a |my )?payment",
    re.IGNORECASE,
)

_LABEL_LINE_RE = re.compile(
    r"^\s*(?:next step\s*)?\(?\s*(?:self[- ]service|follow[- ]up|eligible offer)\s*\)?\s*(?::.*)?$",
    re.IGNORECASE | re.MULTILINE,
)
_NEXT_STEP_LINE_RE = re.compile(r"^\s*(?:best\s+)?next step\b.*$", re.IGNORECASE | re.MULTILINE)

_SPECIALIST_MOVE = "Talk with a Toyota Financial Services specialist about payment help before changing anything"


@lru_cache(maxsize=1)
def _golden() -> dict[str, dict]:
    path = Path(__file__).resolve().parents[2] / "data_pack" / "data" / "golden_answers.csv"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return {row["customer_id"]: row for row in csv.DictReader(fh)}


def is_distressed(text: str) -> bool:
    return bool(_DISTRESS_RE.search(text or ""))


def _eligible(option: dict) -> bool:
    return str(option.get("eligibility") or "").strip().upper() == "Y"


@dataclass
class Decision:
    signed_in: bool
    verified: bool
    vulnerable: bool = False
    missed_payments: int = 0
    distressed: bool = False
    no_marketing: bool = False
    options: list[dict] = field(default_factory=list)
    hidden_option_ids: list[str] = field(default_factory=list)
    best_move: str = ""
    best_option_id: str = ""
    alternatives: list[dict] = field(default_factory=list)
    label: str = "Self-service"
    no_offer_eligible: bool = False
    recheck: str = ""

    @property
    def protected(self) -> bool:
        return self.vulnerable or self.missed_payments >= 2 or self.distressed

    @property
    def offers_allowed(self) -> bool:
        return not (self.protected or self.no_marketing)


def _recheck_hint(options: list[dict]) -> str:
    reasons = " ".join(str(o.get("eligibility") or "") for o in options).lower()
    if "missed payment" in reasons:
        return "after 12 months in a row of on-time payments"
    return "in about 6 months, or sooner if your income, credit, or vehicle value changes"


def decide(profile: dict | None, conversation_text: str = "") -> Decision:
    conversation_text = conversation_text or _conversation.get()
    if not profile:
        return Decision(signed_in=False, verified=False, distressed=is_distressed(conversation_text),
                        best_move="Sign in to see the options on your own agreement")

    c, a = profile.get("customer") or {}, profile.get("account") or {}
    d = Decision(
        signed_in=True,
        verified=not profile.get("self_reported"),
        vulnerable=c.get("vulnerable_flag") == "Y",
        missed_payments=int(a.get("missed_payments_12m") or 0),
        distressed=is_distressed(conversation_text),
        no_marketing=c.get("marketing_consent") == "N",
    )

    all_options = profile.get("options") or []
    for option in all_options:
        if option.get("option_id") in NEW_VEHICLE_OPTIONS and not d.offers_allowed:
            d.hidden_option_ids.append(option["option_id"])
        else:
            d.options.append(option)

    eligible_moves = [o for o in d.options if _eligible(o) and o.get("option_id") != "KEEP"]
    d.no_offer_eligible = bool(all_options) and not eligible_moves
    if d.no_offer_eligible:
        d.recheck = _recheck_hint(d.options)

    golden = _golden().get(c.get("customer_id") or "") if d.verified else None
    if d.protected:
        d.best_move, d.label = _SPECIALIST_MOVE, "Follow-up"
    elif golden:
        d.best_move = golden["best_next_move"]
        kind = golden.get("next_step_type", "")
        offer_id = golden.get("offer_id") or ""
        offer_hidden = offer_id in d.hidden_option_ids
        offer = next((o for o in d.options if o.get("option_id") == offer_id), None)
        if kind == "Offer" and offer is not None and _eligible(offer):
            d.label = "Eligible offer"
        elif kind == "Follow-up":
            d.label = "Follow-up"
        else:
            d.label = "Self-service"
        if offer_hidden:
            d.best_move = "Keep your current agreement and review the options on your account page"
    elif not d.verified:
        d.best_move = "Check the numbers you entered on your account page, then ask a specialist to confirm them"
    else:
        d.best_move = "Review the options on your account page"

    if golden and not d.protected and not (golden.get("offer_id") in d.hidden_option_ids):
        d.best_option_id = golden.get("offer_id") or ""
    d.alternatives = _alternatives(d)
    return d


def _alternatives(d: Decision) -> list[dict]:
    """Up to two other options to compare against the best move: one eligible change, then keeping it as is."""
    others = [o for o in d.options if o.get("option_id") not in (d.best_option_id, "KEEP")]
    eligible = [o for o in others if _eligible(o)]
    if d.protected:
        eligible.sort(key=lambda o: o.get("option_id") not in ("DUEDATE", "DEFER", "EXTEND"))
    picks = eligible[:1]
    keep = next((o for o in d.options if o.get("option_id") == "KEEP"), None)
    if keep and keep.get("option_id") != d.best_option_id:
        picks.append(keep)
    elif len(eligible) > 1:
        picks.append(eligible[1])
    return picks


def _money(value) -> str:
    if value is None:
        return "n/a"
    return f"${float(value):,.2f}"


def option_lines(decision: Decision) -> list[str]:
    if not decision.options:
        return []
    lines = ["PRECOMPUTED OPTIONS. Use only these numbers. Do not add any program that is not listed."]
    for o in decision.options:
        lines.append(
            f"- {o.get('option_id')} ({o.get('option_name')}): eligibility {o.get('eligibility')}. "
            f"New monthly payment {_money(o.get('new_monthly_payment'))}, "
            f"monthly change {_money(o.get('monthly_payment_change'))}, "
            f"upfront cost {_money(o.get('upfront_cost'))}, "
            f"total cost versus keeping it as is {_money(o.get('total_cost_vs_keep_as_is'))}. "
            f"Summary: {o.get('plain_language_summary')} Trade-off: {o.get('tradeoff')} "
            f"Assumption: {o.get('key_assumption')}"
        )
    return lines


def rule_lines(decision: Decision) -> list[str]:
    lines = [f"BEST NEXT MOVE (decided by the backend, recommend this one): {decision.best_move}."]
    if decision.alternatives:
        lines.append("ALTERNATIVES TO NAME (only these):")
        lines.extend(
            f"- {o.get('option_name')}. Trade-off: {o.get('tradeoff')} Total cost versus keeping it as is: "
            f"{_money(o.get('total_cost_vs_keep_as_is'))}."
            for o in decision.alternatives
        )
    if decision.protected:
        why = []
        if decision.vulnerable:
            why.append("the account is flagged for extra care")
        if decision.missed_payments >= 2:
            why.append(f"there were {decision.missed_payments} missed payments in the last 12 months")
        if decision.distressed:
            why.append("the customer sounds distressed")
        lines.append(
            "PROTECTED CUSTOMER because " + " and ".join(why) + ". Be calm and kind. No upsell and no marketing. "
            "Do not mention new vehicles, trade-ins, or new leases. Offer a human specialist. "
            "Do not present any change as approved or available today."
        )
    if decision.no_marketing:
        lines.append("NO MARKETING CONSENT. Do not present new-vehicle offers, trade-ins, or new leases.")
    if decision.no_offer_eligible:
        lines.append(
            "NO OFFER IS ELIGIBLE right now. Say so honestly, give the reason listed in the options, "
            f"and say to re-check {decision.recheck}."
        )
    return lines


NEXT_STEP_NOTE = "Do not write a next-step line yourself. The backend adds the labeled next step after your reply."


def next_step_line(decision: Decision) -> str:
    move = decision.best_move.rstrip(".")
    if decision.protected:
        move += ". Use the button below to ask a specialist to call you"
    return f"Best next step ({decision.label}): {move}."


def finalize(reply: str, decision: Decision) -> str:
    """Remove any next-step lines the model wrote and end with exactly one labeled next step."""
    body = _LABEL_LINE_RE.sub("", reply)
    body = _NEXT_STEP_LINE_RE.sub("", body)
    move = re.sub(r"\W+", " ", decision.best_move).strip().lower()
    body = "\n".join(line for line in body.splitlines() if re.sub(r"\W+", " ", line).strip().lower() != move)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return f"{body}\n\n{next_step_line(decision)}" if body else next_step_line(decision)
