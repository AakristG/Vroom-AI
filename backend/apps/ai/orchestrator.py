"""Shared Nemotron turn for website chat and Retell voice.

Authorization and tool execution happen here, not in the model.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.conf import settings

from apps.voice import actions, representatives

from . import nim_client, tools
from .prompts import ASSISTANT_PROMPT, SYSTEM_PROMPT
from .retrieve import relevant_account_context

logger = logging.getLogger(__name__)

_TOOL_ROUNDS = 3
_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+", re.MULTILINE)
_EMPHASIS_RE = re.compile(r"(\*\*|__|\*|`)")
_HEADING_RE = re.compile(r"^\s*#+\s*", re.MULTILINE)
_DASH_RE = re.compile(r"\s+(?:--|[-\u2013\u2014])\s+|(?<=\w)\u2014(?=\w)")
_SEMICOLON_RE = re.compile(r";\s*(\w?)")

_SIGNED_OUT = (
    "The visitor is NOT signed in, so you have no account data. For questions about their own loan, "
    "lease, balance, or payments, tell them to use Sign in at the top of this site. Never ask for an "
    "account number, VIN, or any other identifier to look an account up."
)

_CONFIRM_RULES = (
    "SIDE-EFFECT RULES: You cannot book appointments, send messages, transfer calls, or change a contract. "
    "If TOOL RESULTS include a pending_action, explain those details and ask only the confirmation question "
    "for that stage. Do not say a request was submitted, booked, or emailed unless the tool result status is completed."
)


def plain(reply: str) -> str:
    text = _EMPHASIS_RE.sub("", _HEADING_RE.sub("", _BULLET_RE.sub("", reply)))
    text = _DASH_RE.sub(", ", text)
    text = _SEMICOLON_RE.sub(lambda m: ". " + m.group(1).upper(), text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _context_text(context: dict, customer_id: str | None, channel: str) -> str:
    page = context.get("page") or "unknown"
    parts = [f"The customer is on the '{page}' page of the Toyota Financial Services site." if channel == "web" else "This is a live voice call."]
    if context.get("vehicles"):
        parts.append(f"Vehicles on screen: {', '.join(map(str, context['vehicles']))}.")
    if not customer_id:
        parts.append(_SIGNED_OUT)
        parts.append("Caller ID does not identify an account. Do not read private figures.")
    parts.append(_CONFIRM_RULES)
    return " ".join(parts)


def _grounded(messages: list[dict], customer_id: str | None, context: dict, extra_note: str, base: str) -> tuple[str, list[dict]]:
    question = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    results = []
    for name, args in tools.plan(question, context, customer_id):
        results.append({"name": name, "args": args, "result": tools.run_tool(name, args, customer_id)})
    extra = extra_note
    if customer_id:
        extra += "\n" + (relevant_account_context(customer_id, question) or f"No record was found for {customer_id}. Say so.")
    if results:
        extra += "\nTOOL RESULTS (computed by the backend; quote these figures, do not change them):\n"
        extra += "\n".join(f"- {r['name']}: {json.dumps(r['result'], default=str)}" for r in results)
        if '"source": "nhtsa"' in extra:
            extra += (
                "\nVehicle figures come from NHTSA (photos are representative Wikimedia Commons images). "
                "Do not invent MSRP, horsepower, MPG, or payments. If a field is null, say it is unavailable."
            )
    reply = nim_client.generate_reply(messages, extra_system=extra, base=base)
    return reply, results


def _native(messages: list[dict], customer_id: str | None, extra_note: str, base: str) -> tuple[str, list[dict]]:
    system = base + "\n\n" + extra_note
    if customer_id:
        question = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        system += "\nVERIFIED ACCOUNT:\n" + (relevant_account_context(customer_id, question) or "No record found.")
    convo: list[dict] = [{"role": "system", "content": system}, *[m for m in messages if m["role"] != "system"]]
    results: list[dict] = []
    for _ in range(_TOOL_ROUNDS):
        message = nim_client.complete(convo, tools=tools.TOOL_SCHEMAS).choices[0].message
        if not message.tool_calls:
            return nim_client.clean(message.content), results
        convo.append(message.model_dump(exclude_none=True))
        for call in message.tool_calls:
            try:
                args = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            result = tools.run_tool(call.function.name, args, customer_id)
            results.append({"name": call.function.name, "args": args, "result": result})
            convo.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, default=str)})
    return nim_client.clean(nim_client.complete(convo).choices[0].message.content), results


def _maybe_propose(question: str, customer_id: str | None, channel: str, conversation_id: str, call_id: str) -> dict | None:
    if not customer_id:
        return None
    q = question.lower()
    if not any(k in q for k in ("appointment", "schedule", "book", "trade-in", "trade in", "call me", "speak to", "talk to someone", "representative", "deferral", "hardship")):
        return None
    if actions.open_action(customer_id):
        return None
    if any(k in q for k in ("deferral", "defer", "hardship", "can't pay", "cannot pay")):
        action_type, category = "request_deferral_review", "Payment difficulty or hardship assistance"
    elif any(k in q for k in ("trade-in", "trade in")):
        action_type, category = "book_appointment", "Trade-in consultation"
    elif any(k in q for k in ("lease end", "lease-end", "turn in")):
        action_type, category = "book_appointment", "Lease-end assistance"
    else:
        action_type, category = "request_callback", "Specialist callback"
    zip_code = ""
    m = re.search(r"\b(\d{5})\b", question)
    if m:
        zip_code = m.group(1)
    loc = representatives.find_local(zip_code=zip_code)
    summary = (
        f"Record a {category.lower()} request on this account"
        + (f" for ZIP {zip_code}" if zip_code else "")
        + ". This will not change the contract and is not a confirmed calendar booking."
    )
    row = actions.propose(
        customer_id=customer_id,
        action_type=action_type,
        payload={"category": category, "zip": zip_code, "notes": question[:400]},
        summary=summary,
        channel=channel,
        conversation_id=conversation_id,
        call_id=call_id,
    )
    return {"name": "propose_action", "args": {"action_type": action_type}, "result": {**actions.public_action(row), "directory": loc}}


def run_turn(
    *,
    messages: list[dict],
    customer_id: str | None,
    context: dict | None = None,
    channel: str = "web",
    conversation_id: str = "",
    call_id: str = "",
    verified: bool = False,
) -> dict[str, Any]:
    context = context or {}
    if not verified:
        customer_id = None
    user_text = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    pending = None
    if customer_id and user_text:
        try:
            pending = actions.maybe_advance_from_utterance(customer_id, user_text)
        except PermissionError:
            pending = actions.open_action(customer_id)

    extra = _context_text(context, customer_id, channel)
    if pending:
        extra += "\nPENDING ACTION: " + json.dumps(actions.public_action(pending), default=str)
        if pending.status == actions.PendingAction.AWAIT_INTENT:
            extra += "\nAsk only: are those details correct?"
        elif pending.status == actions.PendingAction.AWAIT_FINAL:
            extra += "\nAsk only: everything is ready. Should I record this request now? Do not claim it is already submitted."
        elif pending.status == actions.PendingAction.COMPLETED:
            extra += "\nThe backend recorded the request. Quote the result.detail field. Do not say booked or approved."
        elif pending.status == actions.PendingAction.CANCELLED:
            extra += "\nThe customer cancelled. Acknowledge and do not resubmit."

    proposed_tool = None
    if customer_id and not pending:
        proposed_tool = _maybe_propose(user_text, customer_id, channel, conversation_id, call_id)
        if proposed_tool:
            extra += "\nPENDING ACTION: " + json.dumps(proposed_tool["result"], default=str)
            extra += "\nAsk only whether those details are correct. Do not record anything yet."

    base = SYSTEM_PROMPT if channel in {"voice", "phone"} else ASSISTANT_PROMPT
    try:
        if settings.NIM_TOOL_CALLING:
            reply, results = _native(messages, customer_id, extra, base)
        else:
            reply, results = _grounded(messages, customer_id, context, extra, base)
    except Exception:
        logger.exception("Shared assistant turn failed")
        results = [
            {"name": n, "args": a, "result": tools.run_tool(n, a, customer_id)}
            for n, a in tools.plan(user_text, context, customer_id)
        ]
        return {
            "response": "",
            "conversation_id": conversation_id,
            "tool_results": results,
            "proposed_actions": tools.suggested_actions([r["name"] for r in results], customer_id, context),
            "requires_confirmation": False,
            "error": "Nemotron is not available right now.",
        }

    if proposed_tool:
        results = [proposed_tool, *results]
    names = [r["name"] for r in results]
    suggested = tools.suggested_actions(names, customer_id, context)
    open_row = actions.open_action(customer_id) if customer_id else None
    if open_row:
        suggested = [actions.public_action(open_row), *suggested]
    if pending and pending.status == actions.PendingAction.COMPLETED:
        suggested = [{"type": "navigate", "label": "See this request on My Toyota", "to": "/my-toyota#appointments"}, *suggested]

    text = plain(reply)
    if channel in {"voice", "phone"}:
        text = " ".join(text.split())
    return {
        "response": text,
        "conversation_id": conversation_id,
        "tool_results": results,
        "proposed_actions": suggested[:4],
        "requires_confirmation": bool(open_row and open_row.status in {actions.PendingAction.AWAIT_INTENT, actions.PendingAction.AWAIT_FINAL}),
        "error": None,
    }
