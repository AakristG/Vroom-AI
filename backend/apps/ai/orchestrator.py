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

from . import nim_client, policy, shopping, tools
from .prompts import ASSISTANT_PROMPT, SHOPPING_PROMPT, SYSTEM_PROMPT
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
    "Never paste JSON, action_id, pending_action, payload, expires_at, or internal status names to the customer. "
    "Speak only natural English. Do not say a request was submitted, booked, or emailed unless told the backend completed it."
)

_INTERNAL_KEYS = (
    "action_id",
    "pending_action",
    "action_type",
    "expires_at",
    "awaiting_intent_confirmation",
    "awaiting_final_confirmation",
    "idempotency",
    '"payload"',
    '"result"',
    '"type": "pending_action"',
)

_NUMBERED_RE = re.compile(r"^\s*(\d+)[.)]\s+", re.MULTILINE)
_FENCE_RE = re.compile(r"```[\s\S]*?```")


def plain(reply: str, keep_numbers: bool = False) -> str:
    """The chat UI renders plain text; strip markdown the model sometimes adds anyway."""
    if keep_numbers:  # Numbered lists stay numbered; shield "1. " from the bullet strip.
        reply = _NUMBERED_RE.sub(lambda m: f"{m.group(1)}\u2063", reply)
    text = _EMPHASIS_RE.sub("", _HEADING_RE.sub("", _BULLET_RE.sub("", reply)))
    if keep_numbers:
        text = text.replace("\u2063", ". ")
    text = _DASH_RE.sub(", ", text)
    text = _SEMICOLON_RE.sub(lambda m: ". " + m.group(1).upper(), text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _contains_internal_keys(chunk: str) -> bool:
    lower = chunk.lower()
    return any(key.lower() in lower for key in _INTERNAL_KEYS)


def sanitize_customer_reply(reply: str) -> str:
    """Remove leaked tool/action JSON so customers never see internal structures."""
    text = _FENCE_RE.sub(" ", reply or "")
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] == "{":
            depth = 0
            j = i
            while j < n:
                if text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                    if depth == 0:
                        chunk = text[i : j + 1]
                        if not _contains_internal_keys(chunk):
                            out.append(chunk)
                        i = j + 1
                        break
                j += 1
            else:
                out.append(text[i])
                i += 1
        elif text[i] == "[":
            depth = 0
            j = i
            while j < n:
                if text[j] == "[":
                    depth += 1
                elif text[j] == "]":
                    depth -= 1
                    if depth == 0:
                        chunk = text[i : j + 1]
                        if not _contains_internal_keys(chunk):
                            out.append(chunk)
                        i = j + 1
                        break
                j += 1
            else:
                out.append(text[i])
                i += 1
        else:
            out.append(text[i])
            i += 1
    cleaned = re.sub(r"[ \t]{2,}", " ", "".join(out))
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip(" \n\t,;:")
    if _contains_internal_keys(cleaned):
        return ""
    return cleaned


def _action_brief(payload: dict | None, summary: str = "") -> str:
    data = payload or {}
    category = str(data.get("category") or "specialist consultation").strip()
    zip_code = str(data.get("zip") or "").strip()
    when = str(data.get("when") or "").strip()
    bits = [f"a {category.lower()}"]
    if when:
        bits.append(f"for {when}")
    if zip_code:
        bits.append(f"in ZIP code {zip_code}")
    phone = re.sub(r"\D", "", str(data.get("phone") or ""))
    if len(phone) >= 4:
        bits.append(f"at the number ending in {phone[-4:]}")
    phrase = " ".join(bits)
    if summary and "ZIP" in summary and not zip_code:
        return summary.rstrip(".")
    return phrase


def confirmation_reply(pending: Any | None = None, *, proposed: dict | None = None) -> str | None:
    """Deterministic natural-language confirmation copy. Never includes action JSON."""
    if proposed:
        result = proposed.get("result") or {}
        payload = result.get("payload") if isinstance(result, dict) else {}
        brief = _action_brief(payload if isinstance(payload, dict) else {}, str(result.get("summary") or ""))
        return f"I can help you request {brief}. Are those details correct?"
    if pending is None:
        return None
    status = getattr(pending, "status", "")
    payload = getattr(pending, "payload", None) or {}
    brief = _action_brief(payload if isinstance(payload, dict) else {}, getattr(pending, "summary", "") or "")
    if status == actions.PendingAction.AWAIT_INTENT:
        return f"I can help you request {brief}. Are those details correct?"
    if status == actions.PendingAction.AWAIT_FINAL:
        return "Thanks. Before I submit your request, I need your final confirmation. Would you like me to go ahead?"
    if status == actions.PendingAction.COMPLETED:
        result = getattr(pending, "result", None) or {}
        if isinstance(result, dict) and result.get("ok"):
            if result.get("call_status") == "calling" or result.get("specialist_alert") == "sent":
                return str(result.get("detail"))
            return (
                "Your consultation request has been submitted. It is currently pending review. "
                "This is not a confirmed appointment yet."
            )
        detail = result.get("detail") if isinstance(result, dict) else None
        return str(detail or "I could not finish that request. Nothing on your account was changed.")
    if status == actions.PendingAction.CANCELLED:
        return "Okay, I cancelled that request. Nothing on your account was changed."
    if status == actions.PendingAction.FAILED:
        return "I could not finish that request. Nothing on your account was changed."
    return None


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
        extra += "\nDo not invent MSRP, horsepower, MPG, or payments. If a field is null, say it is unavailable."
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


def _shopping_reply(question: str, customer_id: str | None, context: dict, decision: policy.Decision) -> tuple[str, list[dict]]:
    """Car-shopping answer. Prices, payments, and structure come from the shop_vehicles tool;
    Nemotron only writes one short reason per vehicle."""
    results = [{"name": n, "args": a, "result": tools.run_tool(n, a, customer_id)}
               for n, a in tools.plan(question, context, customer_id, "shopping")]
    result = next((r["result"] for r in results if r["name"] == "shop_vehicles"), {"error": "No suggestions."})
    picks = result.get("suggestions") or []
    reasons: dict[int, str] = {}
    if picks:
        try:
            text = nim_client.generate_reply(
                [{"role": "user", "content": shopping.reason_brief(result, question)}], base=SHOPPING_PROMPT
            )
            reasons = shopping.parse_reasons(plain(text, keep_numbers=True), len(picks), [p["vehicle"] for p in picks])
        except Exception:
            logger.warning("Nemotron reasons failed; using data-only reasons", exc_info=True)
    return shopping.compose(result, reasons, careful=decision.protected), results


_PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)")
_WHEN_RE = re.compile(
    r"\b(?:(?:today|tomorrow|tonight|this|next|on)\s+)?"
    r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|morning|afternoon|evening|weekend)"
    r"(?:\s+(?:morning|afternoon|evening|night))?"
    r"(?:\s+(?:at|around|after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)?"
    r"|\b(?:at|around|after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)"
    r"|\b(?:as soon as possible|asap|any ?time|right away)\b",
    re.I,
)


def _extract_phone(text: str) -> str:
    m = None
    for m in _PHONE_RE.finditer(text or ""):
        pass  # the most recently stated number wins
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else ""


def _extract_when(text: str) -> str:
    m = None
    for m in _WHEN_RE.finditer(text or ""):
        pass
    return m.group(0).strip() if m else ""


def _maybe_propose(question: str, customer_id: str | None, channel: str, conversation_id: str, call_id: str,
                   history: str = "") -> dict | None:
    if not customer_id:
        return None
    q = question.lower()
    if not any(k in q for k in ("appointment", "schedule", "book", "trade-in", "trade in", "call me", "speak to",
                                "talk to someone", "representative", "deferral", "hardship", "specialist",
                                "callback", "call back")):
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
        payload={
            "category": category,
            "zip": zip_code,
            "notes": question[:400],
            # Callback details the customer stated in this conversation (shown back to them to confirm).
            "phone": _extract_phone(question) or _extract_phone(history),
            "when": _extract_when(question) or _extract_when(history),
            "name": ((tools._profile(customer_id) or {}).get("customer") or {}).get("first_name") or "",
        },
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
    result = _run_turn(messages=messages, customer_id=customer_id, context=context, channel=channel,
                       conversation_id=conversation_id, call_id=call_id, verified=verified)
    _decide_end(result, channel)
    if verified and customer_id:
        from apps.spacetime import sync as live_sync

        for action in result.get("proposed_actions") or []:
            live_sync.dashboard(customer_id, action, channel)
    return result


# Requests that put a specialist callback on the books (and email the specialist).
CALLBACK_ACTIONS = {"request_callback", "request_human_transfer", "request_deferral_review", "book_appointment"}
_FAREWELL = re.compile(
    r"\bhave an? (?:wonderful|great|good|nice|lovely|fantastic) (?:day|evening|night|weekend|afternoon|morning|one)\b"
    r"|\bgood ?bye\b|\btake care\b[.!]?\s*$",
    re.I,
)
_CALLBACK_CLAIM = re.compile(
    r"\b(?:i|we)(?:'ve| have)? (?:just )?(?:scheduled|arranged|booked|set up|requested|submitted)\b[^.]*\b(?:call ?back|specialist|call you)\b"
    r"|\b(?:a |the )?specialist (?:will|is going to) (?:call|reach out to|contact) you\b",
    re.I,
)
VOICE_SIGNOFF = "Thank you for calling Toyota Financial Services. Have a wonderful day."


def _decide_end(result: dict[str, Any], channel: str) -> None:
    """Decide whether this reply ends the conversation, and keep "says it" and "did it" in step.

    * A specialist callback just went through (the email went out): confirm, sign off, end.
    * The agent said goodbye ("have a wonderful day"): end after saying it.
    * The agent claimed a callback that did not happen: replace the claim with an offer, so a
      customer is never told a specialist will call when nobody was notified.
    """
    text = result.get("response") or ""
    completed = result.get("action_completed") in CALLBACK_ACTIONS
    if completed:
        if channel in {"voice", "phone"} and not _FAREWELL.search(text):
            text = f"{text.rstrip()} {VOICE_SIGNOFF}"
        result["response"] = text
        result["end_conversation"] = True
        result["end_reason"] = "callback_scheduled"
        return
    if text and _CALLBACK_CLAIM.search(text):
        result["response"] = (
            "I can set up a callback with a Toyota Financial Services specialist. "
            "What phone number should they call, and when is a good time?"
        )
        result["end_conversation"] = False
        return
    if text and _FAREWELL.search(text):
        result["end_conversation"] = True
        result["end_reason"] = "farewell"
        return
    result["end_conversation"] = False


def _run_turn(
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
    proposed_tool = None
    if customer_id and not pending:
        history = " ".join(m["content"] for m in messages if m.get("role") == "user")
        proposed_tool = _maybe_propose(user_text, customer_id, channel, conversation_id, call_id, history)

    # Never dump public_action JSON into the model prompt — that is the root cause of spoken/chat leaks.
    safe_confirm = confirmation_reply(pending, proposed=proposed_tool)
    if safe_confirm:
        extra += (
            "\nCONFIRMATION STATE (internal; do not quote as JSON): "
            + safe_confirm
            + " Reply with that meaning in natural English only."
        )

    policy.bind_conversation(messages)
    decision = policy.decide(tools._profile(customer_id))

    # Confirmation turns use deterministic customer-facing copy so Retell/chat cannot speak raw actions.
    if safe_confirm and (proposed_tool or (pending and pending.status in {
        actions.PendingAction.AWAIT_INTENT,
        actions.PendingAction.AWAIT_FINAL,
        actions.PendingAction.COMPLETED,
        actions.PendingAction.CANCELLED,
        actions.PendingAction.FAILED,
    })):
        results = [proposed_tool] if proposed_tool else []
        # Keep financial tools available in the response metadata only when no confirmation is active.
        names = [r["name"] for r in results]
        suggested = tools.suggested_actions(names, customer_id, context)
        open_row = actions.open_action(customer_id) if customer_id else None
        if open_row:
            suggested = [actions.public_action(open_row), *suggested]
        if pending and pending.status == actions.PendingAction.COMPLETED:
            suggested = [{"type": "navigate", "label": "See this request on My Toyota", "to": "/my-toyota#appointments"}, *suggested]
        text = safe_confirm
        if channel in {"voice", "phone"}:
            text = " ".join(text.split())
        return {
            "response": text,
            "conversation_id": conversation_id,
            "tool_results": [r for r in results if r and r.get("name") != "propose_action"],
            "proposed_actions": suggested[:4],
            "requires_confirmation": bool(
                open_row and open_row.status in {actions.PendingAction.AWAIT_INTENT, actions.PendingAction.AWAIT_FINAL}
            ),
            "error": None,
            # Set only on the turn the request actually finished (an old completed action is never "open").
            "action_completed": (
                pending.action_type
                if pending and pending.status == actions.PendingAction.COMPLETED and (pending.result or {}).get("ok")
                else None
            ),
        }

    if not pending and not proposed_tool and not decision.distressed and shopping.is_shopping(user_text):
        reply, results = _shopping_reply(user_text, customer_id, context, decision)
        picks = [s["id"] for r in results for s in (r["result"].get("suggestions") or [])][:3]
        return {
            "response": reply if channel == "web" else " ".join(reply.split()),
            "conversation_id": conversation_id,
            "tool_results": results,
            "proposed_actions": tools.suggested_actions([r["name"] for r in results], customer_id, {**context, "vehicles": picks}),
            "requires_confirmation": False,
            "error": None,
        }

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
            "proposed_actions": [*tools.dashboard_actions(results, user_text),
                                 *tools.suggested_actions([r["name"] for r in results], customer_id, context)][:4],
            "requires_confirmation": False,
            "error": "Nemotron is not available right now.",
        }

    if proposed_tool:
        results = [proposed_tool, *results]
    names = [r["name"] for r in results]
    suggested = [*tools.dashboard_actions(results, user_text), *tools.suggested_actions(names, customer_id, context)]
    open_row = actions.open_action(customer_id) if customer_id else None
    if open_row:
        suggested = [actions.public_action(open_row), *suggested]
    if pending and pending.status == actions.PendingAction.COMPLETED:
        suggested = [{"type": "navigate", "label": "See this request on My Toyota", "to": "/my-toyota#appointments"}, *suggested]

    text = sanitize_customer_reply(plain(reply)) or (
        "I can help with that. Ask me about your account or vehicles, and I will keep the answer in plain language."
    )
    if channel in {"voice", "phone"}:
        text = " ".join(text.split())
    elif customer_id and not pending and not proposed_tool:
        # Website account answers end with exactly one labeled next step, decided by policy, not the model.
        text = policy.finalize(text, decision)
    return {
        "response": text,
        "conversation_id": conversation_id,
        "tool_results": [r for r in results if r.get("name") != "propose_action"],
        "proposed_actions": suggested[:4],
        "requires_confirmation": bool(open_row and open_row.status in {actions.PendingAction.AWAIT_INTENT, actions.PendingAction.AWAIT_FINAL}),
        "error": None,
    }
