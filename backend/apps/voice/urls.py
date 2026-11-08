from django.urls import path

from . import desk, webhooks

urlpatterns = [
    path("webhook/", webhooks.post_call_webhook, name="retell-post-call-webhook"),
    path("live/", desk.live_call, name="live-call"),
    path("appointments/", desk.book_appointment, name="book-appointment"),
    path("vehicle/", desk.vehicle_lookup, name="vehicle-lookup"),
]
