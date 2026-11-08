from django.urls import path

from . import assistant, views

urlpatterns = [
    path("chat/", views.chat, name="ai-chat"),
    path("assistant/", assistant.assistant, name="ai-assistant"),
    path("next-moves/", views.next_moves, name="ai-next-moves"),
]
