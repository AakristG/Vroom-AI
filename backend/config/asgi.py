"""
ASGI config. Routes plain HTTP to Django as usual, and routes the Retell
Custom LLM WebSocket connections to apps/voice/consumers.py.
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Must be imported after Django settings are configured.
django_asgi_app = get_asgi_application()

from apps.voice.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(websocket_urlpatterns),
    }
)
