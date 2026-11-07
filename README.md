# Toyota Financial Services — HackUTD 2026

A voice-enabled AI assistant for Toyota Financial Services. A caller talks to a Retell AI voice
agent, which is powered by an NVIDIA NIM (Nemotron) LLM running behind our Django backend. Live
session/call state is kept in SpacetimeDB so the React dashboard updates in real time while the
call is happening.

## Repo layout

This is a **monorepo**. Each top-level folder is independently runnable and has its own
dependencies, env file, and README — **no shared `node_modules`/`venv`, no cross-imports.**
Work in your own folder and you won't conflict with teammates working in the others.

```
.
├── backend/        Django + DRF + Channels REST/WebSocket API (Python, pip)
├── frontend/        React + Vite dashboard/UI (TypeScript, npm)
├── spacetimedb/     SpacetimeDB module (Rust) for real-time shared state
├── docs/            Architecture notes
└── README.md        You are here
```

## Architecture

```
                 ┌─────────────────────┐
  Phone / Web    │     Retell AI        │
  Caller  ────────▶  (voice agent)      │
                 └────────┬─────┬──────┘
                 WS (live call) │  POST (post-call webhook:
                 custom LLM     │   call_started/ended/analyzed)
                          ▼     ▼
                 ┌─────────────────────────────┐
                 │   backend/ (Django)          │
                 │  - apps/voice  (Channels WS  │
                 │    consumer + webhook views) │
                 │  - apps/ai     (NVIDIA NIM   │
                 │    client, Nemotron models)  │
                 │  - apps/spacetime (HTTP      │
                 │    client → SpacetimeDB)     │
                 └───────┬───────────┬──────────┘
                         │           │
              REST API   │           │ POST /v1/database/.../call/:reducer
                         │           ▼
                         │   ┌─────────────────────┐
                         │   │ spacetimedb/server    │
                         │   │ (Rust module: tables  │
                         │   │ + reducers for live   │
                         │   │ call/session state)   │
                         │   └──────────┬───────────┘
                         │              │ WS subscribe (SpacetimeDB SDK)
                         ▼              ▼
                 ┌─────────────────────────────┐
                 │   frontend/ (React + Vite)   │
                 │  - REST calls → backend      │
                 │  - direct realtime subscribe │
                 │    → spacetimedb             │
                 │  - Retell Web Call widget     │
                 └─────────────────────────────┘
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details on each integration and exact
protocol references.

## Quick start (for teammates)

Clone the repo, then set each service up **independently**, in three separate terminals:

### 1. Backend (Django)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # fill in NVIDIA_NIM_API_KEY, RETELL_API_KEY, SPACETIMEDB_URL, etc.
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
# For local WebSocket support (Retell custom LLM), Django's dev server (ASGI via `runserver`)
# is fine for a hackathon demo. See backend/README.md for details.
```

### 2. Frontend (React)

```bash
cd frontend
npm install
cp .env.example .env         # set VITE_API_BASE_URL, VITE_SPACETIMEDB_URL, VITE_RETELL_PUBLIC_KEY
npm run dev
```

### 3. SpacetimeDB module

```bash
# Install the CLI once: https://spacetimedb.com/install
cd spacetimedb/server
spacetime start                           # run a local SpacetimeDB instance (separate terminal)
spacetime build
spacetime publish --project-path . toyota-fs-dev
```

See each folder's own `README.md` for full details, env vars, and troubleshooting.

## Environment variables you'll need

| Variable | Where | Purpose |
| --- | --- | --- |
| `NVIDIA_NIM_API_KEY` | `backend/.env` | Auth for `https://integrate.api.nvidia.com/v1` (Nemotron models) |
| `NIM_MODEL` | `backend/.env` | Model slug from [build.nvidia.com](https://build.nvidia.com), e.g. `nvidia/llama-3.1-nemotron-70b-instruct` |
| `RETELL_API_KEY` | `backend/.env` | Retell dashboard → API Keys (must have the "webhook" badge); used both to call Retell's REST API and to verify the `X-Retell-Signature` header on incoming webhooks |
| `SPACETIMEDB_URL` | `backend/.env`, `frontend/.env` | e.g. `http://127.0.0.1:3000` for local, or your cloud URL |
| `SPACETIMEDB_MODULE_NAME` | `backend/.env`, `frontend/.env` | e.g. `toyota-fs-dev` |
| `SPACETIMEDB_TOKEN` | `backend/.env` | Bearer token for server-side reducer calls |
| `VITE_API_BASE_URL` | `frontend/.env` | Django backend URL, e.g. `http://localhost:8000` |
| `VITE_RETELL_PUBLIC_KEY` | `frontend/.env` | For the Retell Web Call widget (browser-based calls) |

Never commit a real `.env` — only `.env.example` files are tracked (see root `.gitignore`).

## Getting the code

```bash
git clone https://github.com/AakristG/HackUTD-2026.git
cd HackUTD-2026
git checkout -b <your-name>    # work on your own branch, open a PR into main
```

## Tech stack

- **Backend:** Django 5 + Django REST Framework + Django Channels (ASGI, for the Retell
  WebSocket) + `openai` SDK (pointed at NVIDIA NIM's OpenAI-compatible endpoint)
- **Frontend:** React 18 + Vite + TypeScript
- **Realtime state:** SpacetimeDB (Rust module, TypeScript client SDK on the frontend, HTTP API
  from the backend)
- **AI inference:** NVIDIA NIM cloud API — Nemotron models
- **Voice:** Retell AI (Custom LLM WebSocket during the call + post-call webhook)
