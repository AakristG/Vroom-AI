"""
Django settings for the Toyota Financial Services HackUTD backend.

Loads config from environment variables (see backend/.env.example).
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-secret-key")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 3rd party
    "rest_framework",
    "corsheaders",
    "channels",
    # local apps
    "apps.core",
    "apps.ai",
    "apps.voice",
    "apps.spacetime",
    "apps.vehicles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Channels: in-memory layer is fine for a single-process hackathon demo.
# Swap for channels_redis + REDIS_URL if you need multi-process/production.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}

# ---------------------------------------------------------------------------
# Database (sqlite for the hackathon; swap DATABASE_URL-style config for prod)
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# CORS (frontend dev server)
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

# ---------------------------------------------------------------------------
# Third-party integrations (see backend/.env.example)
# ---------------------------------------------------------------------------
NVIDIA_NIM_API_KEY = os.environ.get("NVIDIA_NIM_API_KEY", "")
NIM_BASE_URL = os.environ.get("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
NIM_MODEL = os.environ.get("NIM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
NIM_ENABLE_THINKING = env_bool("NIM_ENABLE_THINKING", False)
# Native OpenAI-style tool calls need the NIM container started with
# --enable-auto-tool-choice --tool-call-parser qwen3_coder. Without it, the assistant runs
# its backend tools first and grounds Nemotron in the results.
NIM_TOOL_CALLING = env_bool("NIM_TOOL_CALLING", False)

RETELL_API_KEY = os.environ.get("RETELL_API_KEY", "")
RETELL_AGENT_ID = os.environ.get("RETELL_AGENT_ID", "")
RETELL_FROM_NUMBER = os.environ.get("RETELL_FROM_NUMBER", "")

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER", "")

CARSXE_API_KEY = os.environ.get("CARSXE_API_KEY", "")
CARSXE_BASE_URL = os.environ.get("CARSXE_BASE_URL", "https://api.carsxe.com")
# CarsXE bills per call, so responses are kept on disk across restarts.
CARSXE_CACHE_SECONDS = int(os.environ.get("CARSXE_CACHE_SECONDS", str(60 * 60 * 24 * 7)))

CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "carsxe": {
        "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
        "LOCATION": BASE_DIR / ".cache" / "carsxe",
        "TIMEOUT": CARSXE_CACHE_SECONDS,
        "OPTIONS": {"MAX_ENTRIES": 5000},
    },
}

SPACETIMEDB_URL = os.environ.get("SPACETIMEDB_URL", "http://127.0.0.1:3000")
SPACETIMEDB_MODULE_NAME = os.environ.get("SPACETIMEDB_MODULE_NAME", "toyota-fs-dev")
SPACETIMEDB_TOKEN = os.environ.get("SPACETIMEDB_TOKEN", "")
