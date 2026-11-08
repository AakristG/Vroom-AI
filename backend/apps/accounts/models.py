from django.db import models


class CustomerAccount(models.Model):
    """Login stored in SQLite. Passwords are hashed. Demo profiles are seeded from the data pack."""

    username = models.CharField(max_length=80, unique=True)
    password = models.CharField(max_length=256)
    token = models.CharField(max_length=128, unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    city = models.CharField(max_length=80, blank=True)
    state = models.CharField(max_length=8, default="TX")
    life_change = models.TextField(blank=True)
    preferences = models.TextField(blank=True)
    customer_id = models.CharField(max_length=16, unique=True)
    current_payment = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    vehicle_model = models.CharField(max_length=80, blank=True)
    vehicle_year = models.PositiveIntegerField(null=True, blank=True)
    recommendation_key = models.CharField(max_length=64, blank=True)
    recommendation = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.username} ({self.customer_id})"


class ToyotaSpec(models.Model):
    """CarsXE year/make/model snapshot so the catalog is not refetched on every page."""

    year = models.PositiveIntegerField()
    model_name = models.CharField(max_length=80)
    body = models.CharField(max_length=40, blank=True)
    seats = models.PositiveSmallIntegerField(null=True, blank=True)
    msrp = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    invoice = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    city_mpg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    highway_mpg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    image_url = models.URLField(max_length=1000, blank=True)
    style_name = models.CharField(max_length=240, blank=True)
    colors = models.JSONField(default=list, blank=True)
    features = models.JSONField(default=list, blank=True)

    class Meta:
        unique_together = [("year", "model_name")]

    def __str__(self) -> str:
        return f"{self.year} Toyota {self.model_name}"
