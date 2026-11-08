from django.urls import path

from . import views

urlpatterns = [
    path("signup/", views.signup, name="signup"),
    path("login/", views.login, name="login"),
    path("me/", views.me, name="me"),
    path("models/", views.models, name="models"),
    path("models/detail/", views.model_detail_view, name="model-detail"),
]
