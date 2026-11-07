from django.urls import path

from . import webhooks

urlpatterns = [
    path("webhook/", webhooks.post_call_webhook, name="retell-post-call-webhook"),
]
