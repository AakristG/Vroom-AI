from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["GET"])
def health(request):
    """Liveness check plus which Nemotron endpoint this process is configured to use."""
    return Response(
        {
            "status": "ok",
            "service": "toyota-fs-backend",
            "nemotron": {
                "configured": bool(settings.NVIDIA_NIM_API_KEY) or settings.NIM_BASE_URL.startswith("http://127.0.0.1"),
                "base_url": settings.NIM_BASE_URL,
                "model": settings.NIM_MODEL,
                "embed_model": settings.NIM_EMBED_MODEL,
                "thinking": settings.NIM_ENABLE_THINKING,
                "tool_calling": settings.NIM_TOOL_CALLING,
            },
        }
    )
