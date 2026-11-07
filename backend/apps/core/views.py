from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["GET"])
def health(request):
    """Simple liveness check for the frontend / teammates to confirm the backend is up."""
    return Response({"status": "ok", "service": "toyota-fs-backend"})
