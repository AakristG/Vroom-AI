"""
Django settings for the Toyota Financial Services HackUTD backend.

Loads config from environment variables (see backend/.env.example).
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# override=True so a newly pasted key in .env wins after restart.
load_dotenv(BASE_DIR / ".env", override=True)


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    items: list[str] = []
    for item in raw.split(","):
        value = item.strip()
        if not value:
            continue
        # django-cors-headers rejects origins that include a path, including a trailing slash.
        if "://" in value:
            value = value.rstrip("/")
        items.append(value)
    return items


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-secret-key")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# If a public tunnel/webhook base URL is configured (e.g. ngrok), allow that host only.
# Needed so Retell's Custom LLM WebSocket handshake is not rejected with DisallowedHost 400.
_PUBLIC_WEBHOOK_BASE_URL = (os.environ.get("PUBLIC_WEBHOOK_BASE_URL") or "").strip().rstrip("/")
if _PUBLIC_WEBHOOK_BASE_URL:
    from urllib.parse import urlparse

    _public_host = (urlparse(_PUBLIC_WEBHOOK_BASE_URL).hostname or "").strip()
    if _public_host and _public_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_public_host)

INSTALLED_APPS = [
    # Must be first: makes `manage.py runserver` an ASGI server, so the Retell voice WebSocket
    # (/ws/llm/<call_id>) works in development, not only under `daphne config.asgi:application`.
    "daphne",
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
    "apps.accounts",
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
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
# Dev servers are often opened as either localhost or 127.0.0.1 — allow both.
for _origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
    if _origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(_origin)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
for _origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
    if _origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_origin)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
AUTH_TOKEN_TTL_SECONDS = int(os.environ.get("AUTH_TOKEN_TTL_SECONDS", str(60 * 60 * 12)))
AUTH_COOKIE_NAME = "tfs_session"

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
}

# ---------------------------------------------------------------------------
# Third-party integrations (see backend/.env.example)
# ---------------------------------------------------------------------------
NVIDIA_NIM_API_KEY = os.environ.get("NVIDIA_NIM_API_KEY") or os.environ.get("NVIDIA_API_KEY") or ""
# Chat completions. The Brev instance serves Nemotron 3 Nano NVFP4 through vLLM
# as the model name "nemotron" on port 5000. After `brev port-forward` maps that
# port, set this to http://127.0.0.1:5000/v1 and NIM_MODEL to nemotron.
NIM_BASE_URL = os.environ.get("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
NIM_MODEL = os.environ.get("NIM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
# Embeddings stay on the cloud Retriever NIM. vLLM on the GPU box is chat only.
NIM_EMBED_BASE_URL = os.environ.get("NIM_EMBED_BASE_URL", "https://integrate.api.nvidia.com/v1")
# NeMo Retriever Embedding NIM. Native size is 2048. Do not combine a reduced
# dimension with embedding_type; this model rejects every dimension except 2048.
NIM_EMBED_MODEL = os.environ.get("NIM_EMBED_MODEL", "nvidia/nemotron-3-embed-1b")
NIM_EMBED_TYPE = os.environ.get("NIM_EMBED_TYPE", "float")
NIM_ENABLE_THINKING = env_bool("NIM_ENABLE_THINKING", False)
NIM_TEMPERATURE = float(os.environ.get("NIM_TEMPERATURE", "0.2"))
# Native OpenAI-style tool calls need the NIM container started with
# --enable-auto-tool-choice --tool-call-parser qwen3_coder. Without it, the assistant runs
# its backend tools first and grounds Nemotron in the results.
NIM_TOOL_CALLING = env_bool("NIM_TOOL_CALLING", False)

RETELL_API_KEY = os.environ.get("RETELL_API_KEY", "")
RETELL_AGENT_ID = os.environ.get("RETELL_AGENT_ID", "")
RETELL_FROM_NUMBER = os.environ.get("RETELL_FROM_NUMBER", "")
# Where "connect me with a specialist" calls are transferred (apps/voice/connect.py). E.164 or 10-digit US.
SPECIALIST_PHONE_NUMBER = os.environ.get("SPECIALIST_PHONE_NUMBER", "")

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "") or os.environ.get("TWILIO_FROM_NUMBER", "")

APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:5173")
PUBLIC_WEBHOOK_BASE_URL = os.environ.get("PUBLIC_WEBHOOK_BASE_URL", "http://127.0.0.1:8000")
EMAIL_PROVIDER_API_KEY = os.environ.get("EMAIL_PROVIDER_API_KEY", "")
EMAIL_FROM_ADDRESS = os.environ.get("EMAIL_FROM_ADDRESS", "")
# Inbox that gets "call this customer back" alerts when a specialist request is confirmed.
SPECIALIST_EMAIL = os.environ.get("SPECIALIST_EMAIL", "")
# Local/demo only: route simulated pack customer notifications (C###) to one test inbox.
# Ignored when DJANGO_DEBUG is false so production never uses the shared override.
DEMO_NOTIFICATION_EMAIL_OVERRIDE = os.environ.get("DEMO_NOTIFICATION_EMAIL_OVERRIDE", "")

NHTSA_VPIC_BASE_URL = os.environ.get("NHTSA_VPIC_BASE_URL", "https://vpic.nhtsa.dot.gov/api")
NHTSA_DATA_BASE_URL = os.environ.get("NHTSA_DATA_BASE_URL", "https://api.nhtsa.gov")
EPA_FUELECONOMY_BASE_URL = os.environ.get("EPA_FUELECONOMY_BASE_URL", "https://www.fueleconomy.gov/ws/rest")

CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "vehicles": {
        "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
        "LOCATION": BASE_DIR / ".cache" / "vehicles",
        "TIMEOUT": 60 * 60 * 24,
        "OPTIONS": {"MAX_ENTRIES": 8000},
    },
}

SPACETIMEDB_URL = os.environ.get("SPACETIMEDB_URL", "http://127.0.0.1:3000")
SPACETIMEDB_MODULE_NAME = os.environ.get("SPACETIMEDB_MODULE_NAME", "toyota-nextmove")
SPACETIMEDB_TOKEN = os.environ.get("SPACETIMEDB_TOKEN", "")
# Live-state mirroring to SpacetimeDB (apps/spacetime/sync.py). Off under `manage.py test` so tests
# never write into a real database.
SPACETIMEDB_SYNC = env_bool("SPACETIMEDB_SYNC", True) and not (len(sys.argv) > 1 and sys.argv[1] == "test")
