from django.urls import re_path

from . import consumers

# Retell opens a WebSocket at `{your-server-websocket-endpoint}/{call_id}`.
# See: https://docs.retellai.com/api-references/llm-websocket
# Authenticated browsers subscribe to `/ws/captions/<call_id>/` for live chat captions.
websocket_urlpatterns = [
    re_path(r"^ws/llm/(?P<call_id>[^/]+)/?$", consumers.RetellLLMConsumer.as_asgi()),
    re_path(r"^ws/captions/(?P<call_id>[^/]+)/?$", consumers.CaptionRelayConsumer.as_asgi()),
]
