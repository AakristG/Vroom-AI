from django.contrib import admin

from .models import CustomerAccount, ToyotaSpec


@admin.register(CustomerAccount)
class CustomerAccountAdmin(admin.ModelAdmin):
    list_display = ("username", "customer_id", "first_name", "city", "created_at")
    search_fields = ("username", "customer_id", "first_name", "city")
    exclude = ("password", "token")


@admin.register(ToyotaSpec)
class ToyotaSpecAdmin(admin.ModelAdmin):
    list_display = ("year", "model_name", "body", "seats", "msrp")
