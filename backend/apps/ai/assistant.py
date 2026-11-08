"""Toyota NextMove AI: context-aware assistant grounded in backend tool results."""

from __future__ import annotations

import json
import logging
import re

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api

from . import nim_client, tools
from .account_context import account_context, bind_signed_in
from .retrieve import relevant_account_context
from .prompts import ASSISTANT_PROMPT
from .serializers import ChatRequestSerializer

logger = logging.getLogger(__name__)

_TOOL_ROUNDS = 3


_SIGNED_OUT = (
    "The visitor is NOT signed in, so you have no account data. For questions about their own loan, "
    "lease, balance, or payments, tell them to use Sign in at the top of this site. Never ask for an "
    "account number, VIN, or any other identifier to look an account up."
)

_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+", re.MULTILINE)
_EMPHASIS_RE = re.compile(r"(\*\*|__|\*|`)")
_HEADING_RE = re.compile(r"^\s*#+\s*", re.MULTILINE)
# Sentence-joining dashes only: spaced dashes, or an unspaced em dash between words.
# Word hyphens (trade-in), ranges (2020–2024), and negative amounts (-$221) are left alone.
_DASH_RE = re.compile(r"\s+(?:--|[-\u2013\u2014])\s+|(?<=\w)\u2014(?=\w)")
_SEMICOLON_RE = re.compile(r";\s*(\w?)")


def _plain(reply: str) -> str:
    """The chat UI renders plain text; strip markdown the model sometimes adds anyway."""
    text = _EMPHASIS_RE.sub("", _HEADING_RE.sub("", _BULLET_RE.sub("", reply)))
    text = _DASH_RE.sub(", ", text)
    text = _SEMICOLON_RE.sub(lambda m: ". " + m.group(1).upper(), text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _context_text(context: dict, customer_id: str | None) -> str:
    page = context.get("page") or "unknown"
    parts = [f"The customer is on the '{page}' page of the Toyota Financial Services site."]
    if context.get("vehicles"):
        parts.append(f"Vehicles on screen: {', '.join(map(str, context['vehicles']))}.")
    if not customer_id:
        parts.append(_SIGNED_OUT)
    return " ".join(parts)


def _grounded(messages: list[dict], customer_id: str | None, context: dict) -> tuple[str, list[dict]]:
    question = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    results = []
    for name, args in tools.plan(question, context, customer_id):
        results.append({"name": name, "args": args, "result": tools.run_tool(name, args, customer_id)})
    extra = _context_text(context, customer_id)
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
    reply = nim_client.generate_reply(messages, extra_system=extra, base=ASSISTANT_PROMPT)
    return reply, results


def _native(messages: list[dict], customer_id: str | None, context: dict) -> tuple[str, list[dict]]:
    system = ASSISTANT_PROMPT + "\n\n" + _context_text(context, customer_id)
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


@api_view(["POST"])
@login_required_api
def assistant(request):
    """POST {"messages": [...], "customer_id": "C002"?, "context": {"page": "compare", "vehicles": ["2025|Camry|LE"]}}"""
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    messages = serializer.validated_data["messages"]
    account = request.account
    bind_signed_in(account)
    customer_id = account.customer_id
    context = request.data.get("context") if isinstance(request.data.get("context"), dict) else {}

    try:
        run = _native if settings.NIM_TOOL_CALLING else _grounded
        reply, results = run(messages, customer_id, context)
    except Exception:
        logger.exception("NextMove assistant failed")
        results = [
            {"name": n, "args": a, "result": tools.run_tool(n, a, customer_id)}
            for n, a in tools.plan(messages[-1]["content"] if messages else "", context, customer_id)
        ]
        return Response(
            {"detail": "Nemotron is not available right now.", "tools": results,
             "actions": tools.suggested_actions([r["name"] for r in results], customer_id, context)},
            status=503,
        )

    names = [r["name"] for r in results]
    ids = next((r["args"].get("ids") for r in results if r["args"].get("ids")), None)
    action_context = {**context, "vehicles": context.get("vehicles") or ids or []}
    return Response({"reply": _plain(reply), "tools": results, "actions": tools.suggested_actions(names, customer_id, action_context)})
