import logging

from django.apps import AppConfig
from django.conf import settings

logger = logging.getLogger(__name__)


class VehiclesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.vehicles"
    label = "vehicles"

    def ready(self) -> None:
        if "vpic.nhtsa.dot.gov" not in settings.NHTSA_VPIC_BASE_URL:
            logger.warning("NHTSA_VPIC_BASE_URL is not the official vPIC host.")
