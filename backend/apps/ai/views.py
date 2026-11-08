import logging

from openai import AuthenticationError, PermissionDeniedError
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import nim_client
from .account_context import account_context
from .serializers import ChatRequestSerializer

logger = logging.getLogger(__name__)


@api_view(["POST"])
def chat(request):
    """Nemotron chat for the signed-in customer. POST
    {"customer_id": "C002", "messages": [{"role": "user", "content": "..."}]}.
    customer_id is optional; when present, the reply is grounded in that account.
    """
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    customer_id = str(request.data.get("customer_id") or "").strip()
    extra = ""
    if customer_id:
        extra = account_context(customer_id) or (
            f"No Toyota Financial Services record was found for {customer_id}. "
            "Say so. Do not invent an account."
        )

    try:
        reply = nim_client.generate_reply(serializer.validated_data["messages"], extra_system=extra)
    except (AuthenticationError, PermissionDeniedError):
        logger.warning("NVIDIA refused Nemotron inference for %s", customer_id or "anonymous")
        return Response(
            {
                "detail": (
                    "NVIDIA accepted the API key but refused Nemotron inference (403). "
                    "Enable this model for the key at build.nvidia.com."
                )
            },
            status=503,
        )
    except Exception:
        logger.exception("Nemotron chat failed for %s", customer_id or "anonymous")
        return Response({"detail": "Nemotron is not available right now."}, status=503)

    return Response({"reply": reply})
