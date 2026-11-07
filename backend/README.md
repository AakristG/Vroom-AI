# Backend — Django

REST API + WebSocket server for the Toyota Financial Services voice assistant.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # fill in real values
python manage.py makemigrations   # only needed if you change models.py
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

The dev server (`runserver`) supports the WebSocket route fine for local hackathon use. For a
deployed demo, run via Daphne/ASGI instead (see `Dockerfile`):

```bash
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

## Project layout

```
backend/
├── manage.py
├── requirements.txt
├── .env.example
├── config/              Django project: settings, urls, asgi, wsgi
└── apps/
    ├── core/            health check endpoint
    ├── ai/              NVIDIA NIM (Nemotron) client + /api/ai/chat/ test endpoint
    ├── voice/           Retell Custom LLM WebSocket consumer + post-call webhook
    └── spacetime/       HTTP client for SpacetimeDB reducers/SQL
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health/` | Liveness check |
| `POST` | `/api/ai/chat/` | Test NVIDIA NIM directly: `{"messages": [{"role": "user", "content": "..."}]}` |
| `WS` | `/ws/llm/<call_id>/` | Retell Custom LLM WebSocket (set this as your agent's "Custom LLM" URL, Retell appends `/<call_id>`) |
| `POST` | `/api/voice/webhook/` | Retell post-call webhook (set in Retell dashboard → Agent → Webhook URL) |

## Notes

- `apps/voice/consumers.py` implements the exact message shapes from
  <https://docs.retellai.com/api-references/llm-websocket> (`interaction_type` /
  `response_type`). It currently does a non-streaming NIM call per `response_required` event —
  see the `TODO(perf)` comment there if you want real token streaming for lower latency.
- `apps/voice/webhooks.py` verifies `X-Retell-Signature` exactly as documented in
  <https://docs.retellai.com/features/secure-webhook>, using `RETELL_API_KEY` as the HMAC key
  (must be an API key with the "webhook" badge in the Retell dashboard).
- `apps/spacetime/client.py` is a plain `requests`-based client (no official Python SDK exists
  for SpacetimeDB yet). The frontend should prefer the TypeScript SDK for realtime subscriptions
  — this client is for the backend's occasional writes/reads only.
