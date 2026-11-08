"""Toyota Vroom AI website chat — thin HTTP adapter over the shared orchestrator."""

from __future__ import annotations

from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api
from apps.spacetime import sync as live_sync

from .account_context import bind_signed_in
from .orchestrator import plain as _plain  # noqa: F401 — tests import _plain
from .orchestrator import run_turn
from .serializers import ChatRequestSerializer
from . import tools


@api_view(["POST"])
@login_required_api
def assistant(request):
    """POST {"messages": [...], "context": {"page": "compare", "vehicles": ["2025|Camry|LE"]}}"""
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    messages = serializer.validated_data["messages"]
    account = request.account
    bind_signed_in(account)
    customer_id = account.customer_id
    context = request.data.get("context") if isinstance(request.data.get("context"), dict) else {}
    result = run_turn(
        messages=messages,
        customer_id=customer_id,
        context=context,
        channel="web",
        conversation_id=f"web:{customer_id}",
        verified=True,
    )
    # Mirror the conversation into SpacetimeDB so every tab and device shows it live.
    user_turn_id = str(request.data.get("turn_id") or "")[:64] or None
    last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    user_turn_id = live_sync.assistant_turn(customer_id, role="user", content=last_user, turn_id=user_turn_id)
    if result.get("error") and not result.get("response"):
        actions = result["proposed_actions"] or tools.suggested_actions([], customer_id, context)
        reply_id = live_sync.assistant_turn(customer_id, role="assistant", content="", tools=result["tool_results"],
                                            actions=actions, offline=True)
        return Response(
            {
                "detail": result["error"],
                "tools": result["tool_results"],
                "actions": actions,
                "turn_id": reply_id,
                "user_turn_id": user_turn_id,
            },
            status=503,
        )
    reply_id = live_sync.assistant_turn(customer_id, role="assistant", content=result["response"],
                                        tools=result["tool_results"], actions=result["proposed_actions"])
    return Response({"reply": result["response"], "tools": result["tool_results"], "actions": result["proposed_actions"],
                     "turn_id": reply_id, "user_turn_id": user_turn_id,
                     "end_conversation": bool(result.get("end_conversation")), "end_reason": result.get("end_reason")})
