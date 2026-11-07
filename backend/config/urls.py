from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/ai/", include("apps.ai.urls")),
    path("api/voice/", include("apps.voice.urls")),
]
