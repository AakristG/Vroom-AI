from django.urls import re_path

from . import consumers

# Retell opens a WebSocket at `{your-server-websocket-endpoint}/{call_id}`.
# See: https://docs.retellai.com/api-references/llm-websocket
websocket_urlpatterns = [
    re_path(r"^ws/llm/(?P<call_id>[^/]+)/?$", consumers.RetellLLMConsumer.as_asgi()),
]
