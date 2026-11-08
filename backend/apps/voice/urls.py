from django.urls import path

from . import desk, twilio_webhooks, webhooks

urlpatterns = [
    path("webhook/", webhooks.post_call_webhook, name="retell-post-call-webhook"),
    path("twilio/voice/", twilio_webhooks.inbound_voice, name="twilio-inbound-voice"),
    path("twilio/sms/", twilio_webhooks.inbound_sms, name="twilio-inbound-sms"),
    path("live/", desk.live_call, name="live-call"),
    path("activity/", desk.activity, name="customer-activity"),
    path("appointments/", desk.book_appointment, name="book-appointment"),
    path("actions/confirm/", desk.confirm_action, name="confirm-action"),
    path("web-call/", desk.create_web_call, name="create-web-call"),
    path("continuation/", desk.continuation_link, name="continuation-link"),
    path("vehicle/", desk.vehicle_lookup, name="vehicle-lookup"),
]
