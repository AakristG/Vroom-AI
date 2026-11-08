from django.urls import path

from . import views

urlpatterns = [
    path("status/", views.status, name="vehicles-status"),
    path("years/", views.years, name="vehicles-years"),
    path("models/", views.models, name="vehicles-models"),
    path("trims/", views.trims, name="vehicles-trims"),
    path("catalog/", views.catalog, name="vehicles-catalog"),
    path("detail/", views.detail, name="vehicles-detail"),
    path("image/", views.image, name="vehicles-image"),
    path("compare/", views.compare, name="vehicles-compare"),
    path("safety/", views.safety, name="vehicles-safety"),
    path("recalls/", views.recalls, name="vehicles-recalls"),
    path("decode-vin/", views.decode_vin, name="vehicles-decode-vin"),
    path("value/", views.market_value, name="vehicles-market-value"),
]
