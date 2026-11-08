"""Simple chat endpoint — same shared orchestrator as the assistant dock and Retell voice."""

from __future__ import annotations

import logging

from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.authz import login_required_api

from . import policy
from .account_context import bind_signed_in
from .orchestrator import run_turn
from .serializers import ChatRequestSerializer

logger = logging.getLogger(__name__)


@api_view(["POST"])
@login_required_api
def chat(request):
    """Nemotron chat for the signed-in customer via the shared orchestrator.

    POST {"messages": [{"role": "user", "content": "..."}], "customer_id": "C002"?}
    customer_id in the body is ignored for authorization — the session account wins.
    """
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    account = request.account
    bind_signed_in(account)
    policy.bind_conversation(serializer.validated_data["messages"])
    customer_id = account.customer_id
    result = run_turn(
        messages=serializer.validated_data["messages"],
        customer_id=customer_id,
        context={"page": "chat"},
        channel="web",
        conversation_id=f"web-chat:{customer_id}",
        verified=True,
    )
    if result.get("error") and not result.get("response"):
        return Response({"detail": result["error"], "tools": result.get("tool_results") or []}, status=503)
    return Response({"reply": result["response"], "tools": result.get("tool_results") or [], "actions": result.get("proposed_actions") or []})


@api_view(["POST"])
@login_required_api
def next_moves(request):
    """Run the signed-in customer's AI-automated next-moves plan. Steps stream to SpacetimeDB
    (`next_move`) as they finish; the full plan is also returned for browsers without it."""
    from . import next_moves as plan

    bind_signed_in(request.account)
    policy.bind_conversation([])
    customer_id = request.account.customer_id
    if not customer_id:
        return Response({"detail": "Sign in to see your next moves."}, status=400)
    return Response(plan.run(customer_id))
