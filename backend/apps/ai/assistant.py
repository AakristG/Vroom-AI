"""Toyota NextMove AI website chat — thin HTTP adapter over the shared orchestrator."""

from __future__ import annotations

from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api

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
    if result.get("error") and not result.get("response"):
        return Response(
            {
                "detail": result["error"],
                "tools": result["tool_results"],
                "actions": result["proposed_actions"] or tools.suggested_actions([], customer_id, context),
            },
            status=503,
        )
    return Response({"reply": result["response"], "tools": result["tool_results"], "actions": result["proposed_actions"]})
