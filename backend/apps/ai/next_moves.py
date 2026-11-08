"""AI-automated "Your next moves".

The assistant works through the customer's plan on its own: it reviews the agreement, checks
which options are eligible, runs the numbers for their contract, and looks for open recalls and
service. Those steps finish automatically. What is left is a short list of decisions only the
customer can make, each with one button. Nemotron writes the plain-language summary; every figure
comes from the backend tools and the policy guardrails.

Each step is written to SpacetimeDB (`next_move`) as it progresses, so the page fills in live and
every open browser for that customer stays in sync.
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, datetime, timezone

from apps.spacetime.client import try_reducer

from . import nim_client, policy, tools

logger = logging.getLogger(__name__)

_CALLBACK_TOPICS = {"Refinance", "Trade-in", "Vehicle information", "Payment help", "Lease end"}

SUMMARY_PROMPT = """\
You write the two-sentence summary at the top of a Toyota Financial Services customer's \
"next moves" plan. Use only the facts given. Plain words, 8th-grade reading level, no markdown, \
no semicolons, no dashes between sentences. Never promise approval. Speak to the customer as \
"you". If the facts say CAREFUL, be calm and kind and do not mention offers or new vehicles."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _money(value) -> str:
    return f"${float(value):,.0f}"


def _publish(customer_id: str, step: dict, position: int) -> None:
    try_reducer(
        "upsert_next_move",
        {
            "customerId": customer_id,
            "stepKey": step["key"],
            "position": position,
            "title": step["title"],
            "detail": step.get("detail") or "",
            "status": step["status"],
            "actionLabel": (step.get("action") or {}).get("label", ""),
            "actionJson": json.dumps(step["action"]) if step.get("action") else "",
            "updatedAt": _now(),
        },
    )


def _callback(topic: str, label: str) -> dict:
    return {"type": "confirm", "action": "request_callback", "topic": topic if topic in _CALLBACK_TOPICS else "Payment help", "label": label}


def _decision_action(decision: policy.Decision, profile: dict, golden: dict | None) -> dict:
    contract = profile["account"]["contract_type"]
    if decision.protected:
        return _callback("Payment help", "Ask a specialist to call me")
    offer = (golden or {}).get("offer_id") or ""
    if decision.label == "Eligible offer":
        if offer == "REFI":
            return _callback("Refinance", "Talk to a specialist about refinancing")
        if offer in ("TRADE", "RENEW"):
            return _callback("Trade-in", "Talk to a specialist about a trade-in")
        return {"type": "navigate", "to": "/my-toyota#options", "label": "Review this option"}
    if decision.label == "Follow-up":
        return _callback("Lease end" if contract == "lease" else "Payment help", "Ask a specialist to call me")
    return {"type": "navigate", "to": "/my-toyota#options", "label": "Review my options"}


def _steps(customer_id: str, profile: dict, decision: policy.Decision) -> list[dict]:
    a, v = profile["account"], profile["vehicle"]
    contract = a["contract_type"]
    golden = policy._golden().get(customer_id) if decision.verified else None
    steps: list[dict] = [
        {
            "key": "review",
            "title": "Reviewed your agreement",
            "detail": f"{contract.title()} with Toyota Financial Services: {_money(a['monthly_payment'])} a month, "
                      f"{round(float(a['months_remaining']))} months left.",
            "status": "done",
            "run": lambda: tools.customer_profile(customer_id),
        }
    ]

    eligible = [o for o in decision.options if str(o.get("eligibility", "")).upper() == "Y" and o.get("option_id") != "KEEP"]
    if decision.no_offer_eligible:
        options_detail = f"No change is available right now. Check again {decision.recheck}."
    elif eligible:
        names = ", ".join(o["option_name"] for o in eligible[:3])
        options_detail = f"{len(eligible)} option{'s' if len(eligible) != 1 else ''} look{'s' if len(eligible) == 1 else ''} available: {names}. Toyota Financial Services confirms final approval."
    else:
        options_detail = "Keeping your agreement as it is looks like the right call for now."
    steps.append({"key": "options", "title": "Checked what you qualify for", "detail": options_detail, "status": "done",
                  "run": lambda: tools.next_actions(customer_id)})

    if contract == "loan" and a.get("apr") is not None and a.get("current_balance"):
        extra = tools.extra_payment_scenario(customer_id, 100)
        if not extra.get("error"):
            steps.append({
                "key": "numbers",
                "title": "Ran your payoff numbers",
                "detail": f"Paying $100 more a month would finish {extra['months_saved']} months sooner and save about "
                          f"{_money(extra['interest_saved'])} in interest.",
                "status": "done",
                "action": {"type": "navigate", "to": "/insights#scenarios", "label": "Try other amounts"},
            })
    elif contract == "lease":
        lease = tools.lease_end_options(customer_id)
        gap = lease.get("estimated_value_minus_residual")
        if gap is not None:
            steps.append({
                "key": "numbers",
                "title": "Priced your lease end",
                "detail": f"Your car is estimated at {_money(abs(gap))} {'above' if gap >= 0 else 'below'} the buyout price. "
                          "That is an estimate, not an offer.",
                "status": "done",
                "action": {"type": "navigate", "to": "/my-toyota#options", "label": "Compare lease-end choices"},
            })

    if v.get("open_recall") == "Y":
        steps.append({
            "key": "recall",
            "title": "Found an open recall",
            "detail": f"Your {v['model_year']} {v['model']} has an open recall. The repair is free at a Toyota dealer.",
            "status": "needs_you",
            "action": _callback("Vehicle information", "Ask someone to help schedule it"),
        })
    due = v.get("next_service_due")
    if due:
        try:
            days = (date.fromisoformat(str(due)) - date.today()).days
        except ValueError:
            days = None
        if days is not None and days <= 45:
            steps.append({
                "key": "service",
                "title": "Service coming up" if days >= 0 else "Service is overdue",
                "detail": f"Your next service is due {due}.",
                "status": "needs_you",
                "action": {"type": "navigate", "to": "/my-toyota", "label": "See service details"},
            })

    move = decision.best_move.rstrip(".")
    steps.append({
        "key": "decide",
        "title": move,
        "detail": (golden or {}).get("plain_language_message") or "This is the move that fits your agreement best right now.",
        "status": "needs_you",
        "action": _decision_action(decision, profile, golden),
    })
    return steps


def _summary(profile: dict, decision: policy.Decision, steps: list[dict]) -> str:
    facts = [f"Customer first name: {profile['customer'].get('first_name')}."]
    facts += [f"{s['title']}: {s['detail']}" for s in steps]
    facts.append(f"Recommended next move: {decision.best_move}.")
    if decision.protected:
        facts.append("CAREFUL: this customer needs extra care with money right now.")
    try:
        text = nim_client.generate_reply([{"role": "user", "content": "\n".join(facts)}], base=SUMMARY_PROMPT)
        sentences = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
        text = " ".join(sentences[:3])
        source = "\n".join(facts)
        # Every dollar amount in the summary must appear in the facts; otherwise it was invented.
        if text and all(amount in source for amount in re.findall(r"\$[\d,]+(?:\.\d+)?", text)):
            return text
    except Exception:
        logger.warning("Nemotron summary failed; using the plan text", exc_info=True)
    done = sum(1 for s in steps if s["status"] == "done")
    return f"I went through your agreement and finished {done} checks. The one thing left for you: {decision.best_move.rstrip('.').lower()}."


def run(customer_id: str, *, live: bool = True, pace: float = 0.35) -> dict:
    """Build and run the plan. With `live`, each step is published to SpacetimeDB as it runs."""
    profile = tools._profile(customer_id)
    if not profile:
        return {"error": "No account found.", "steps": [], "summary": ""}
    decision = policy.decide(profile)
    steps = _steps(customer_id, profile, decision)
    if live:
        try_reducer("clear_next_moves", {"customerId": customer_id})
    for position, step in enumerate(steps):
        final = step["status"]
        if live and final == "done":
            _publish(customer_id, {**step, "status": "working"}, position)
            time.sleep(pace)  # Let the page show the assistant working through each check.
        runner = step.pop("run", None)
        if runner:
            try:
                runner()
            except Exception:
                logger.warning("Next-move step %s failed", step["key"], exc_info=True)
        if live:
            _publish(customer_id, step, position)
    for step in steps:
        step.pop("run", None)
    summary = _summary(profile, decision, steps)
    return {"summary": summary, "steps": steps, "label": decision.label, "protected": decision.protected}
