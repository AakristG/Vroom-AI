from django.urls import path

from . import assistant, compare_suggest, views

urlpatterns = [
    path("chat/", views.chat, name="ai-chat"),
    path("assistant/", assistant.assistant, name="ai-assistant"),
    path("next-moves/", views.next_moves, name="ai-next-moves"),
    path("compare-suggestions/", compare_suggest.compare_suggestions, name="ai-compare-suggestions"),
]
