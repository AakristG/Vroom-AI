# Vroom AI — Toyota Financial Services assistant (HackUTD 2026)

Vroom AI is a customer console and AI assistant for Toyota Financial Services customers. A signed-in
customer can explore and compare Toyotas, see their loan or lease in **Financial Insights**, manage
their agreement in **My Toyota**, and talk to **Toyota Vroom AI** by text or voice.

- **AI:** NVIDIA **Nemotron**, served by vLLM on a Brev GPU (or NVIDIA's hosted NIM API). Every figure
  the assistant states comes from backend tools, not from the model.
- **Voice:** **Retell AI** custom-LLM agent. The browser voice button and phone calls both reach the
  same Nemotron orchestrator.
- **Live state:** **SpacetimeDB** pushes chat history, the agent's What-if dashboard changes, Compare
  selections and AI suggestions, voice captions, call transcripts, and next moves to every open tab.
- **Specialist callbacks:** when a customer confirms a callback, the specialist gets an email
  (via **Resend**) with the customer's name, number and topic, and the call ends automatically.

## What's in the app

| Page | What it does |
| --- | --- |
| Explore vehicles | Toyota catalog from NHTSA + EPA data, filtered by year (defaults to 2026) |
| Compare models | Up to 8 models side by side, plus three Nemotron suggestions to add |
| Financial Insights | Loan/lease dashboard, amortization, What-if simulator, term scenarios, equity |
| My Toyota | Vehicle, financing and customer record, options on the agreement, AI agent, appointments |
| Toyota Vroom AI | Full-page chat and voice with the assistant |

The assistant can **drive the dashboards**: ask "What if I paid $200 more a month?" or "Could a
24-month extension lower my payment?" and the Insights sliders move to match — on every device
signed in as that customer.

## Repo layout

A monorepo: each folder runs on its own with its own dependencies and env file.

```
.
├── backend/       Django 5 + DRF + Channels (REST, Retell WebSocket, AI orchestrator)
├── frontend/      React 19 + Vite + TypeScript + Tailwind CSS 4
├── spacetimedb/   SpacetimeDB module (TypeScript) — tables + reducers for live state
├── docs/          Architecture notes
└── README.md
```

## Architecture

```
 Browser (React)                       Phone caller
   │  REST + voice button                   │
   │                                        ▼
   │                              ┌───────────────────┐
   │                              │   Retell AI        │  voice agent (custom LLM)
   │                              └─────────┬─────────┘
   │                                        │ wss://<ngrok>/ws/llm/<call_id>
   ▼                                        ▼
 ┌──────────────────────────────────────────────────────┐
 │ backend/ (Django + Channels)                          │
 │  apps/ai        Nemotron orchestrator, tools, policy  │──► Nemotron (vLLM on Brev, or NIM API)
 │  apps/voice     Retell consumer, callbacks, email     │──► Resend (specialist emails)
 │  apps/vehicles  NHTSA + EPA catalog                   │
 │  apps/spacetime live-state sync (background worker)   │
 └──────────────┬───────────────────────────────────────┘
                │ HTTP reducer calls
                ▼
 ┌──────────────────────────────┐   WebSocket subscription
 │ SpacetimeDB (module vroom-live) ├──────────────────────► Browser
 └──────────────────────────────┘
```

Django is the source of truth for accounts and data. SpacetimeDB is the live layer; if it is down,
every feature falls back to plain HTTP.

## Running it locally

You need **Python 3.12**, **Node 20+**, and **Docker** (for SpacetimeDB). Voice also needs
**ngrok**; the self-hosted model needs a **Brev** GPU instance.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # then fill it in (see "Environment variables")
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Health check: <http://localhost:8000/api/health/> (shows whether Nemotron is configured — never the key).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                       # http://localhost:5173
```

### 3. SpacetimeDB (live updates)

Run the server in Docker, then build and publish the module **from inside the container**, which has
the `spacetime` CLI:

```bash
docker run -d --name spacetimedb -p 3000:3000 -v spacetimedb-data:/data clockworklabs/spacetime start
docker cp spacetimedb/server spacetimedb:/tmp/vroom-module
docker exec spacetimedb sh -c "cd /tmp/vroom-module && npm install && spacetime publish --server local vroom-live"
```

After changing `spacetimedb/server/src/index.ts`, republish the same way and regenerate the frontend
bindings:

```bash
docker exec spacetimedb sh -c "cd /tmp/vroom-module && spacetime generate --lang typescript --out-dir /tmp/bindings --module-path ."
docker cp spacetimedb:/tmp/bindings/. frontend/src/spacetime/module_bindings/
```

Point both env files at the module (`SPACETIMEDB_MODULE_NAME` / `VITE_SPACETIMEDB_MODULE_NAME=vroom-live`).
A token for `SPACETIMEDB_TOKEN` can be minted with `curl -X POST http://127.0.0.1:3000/v1/identity`.

### 4. Nemotron

**Option A — NVIDIA hosted API (simplest):** set `NVIDIA_NIM_API_KEY` in `backend/.env` and leave
`NIM_BASE_URL=https://integrate.api.nvidia.com/v1`.

**Option B — your own GPU on Brev (vLLM):** with the [Brev CLI](https://docs.nvidia.com/brev/) (Linux,
macOS, or WSL on Windows) and a running instance serving `nemotron` on port 5000, open a tunnel and
point the backend at it:

```bash
brev login
ssh -N -L 127.0.0.1:8001:localhost:5000 <your-instance-name>
```

```env
NIM_BASE_URL=http://127.0.0.1:8001/v1
NIM_MODEL=nemotron
```

Embeddings still use NVIDIA's hosted API, so keep `NVIDIA_NIM_API_KEY` set. Brev bills while the
instance runs — stop it when you are done.

### 5. Voice (Retell + ngrok)

Retell's servers must reach the backend's WebSocket, so expose port 8000:

```bash
ngrok config add-authtoken <your-ngrok-token>
ngrok http --url=<your-domain>.ngrok-free.dev 8000
```

Then set `PUBLIC_WEBHOOK_BASE_URL=https://<your-domain>.ngrok-free.dev` (its host is added to
`ALLOWED_HOSTS` automatically) and set your Retell agent's **LLM WebSocket URL** to
`wss://<your-domain>.ngrok-free.dev/ws/llm`. Each ngrok account has its own free static domain.

### 6. Specialist callback emails (Resend)

Create a key at [resend.com](https://resend.com) and set `EMAIL_PROVIDER_API_KEY`,
`EMAIL_FROM_ADDRESS` and `SPECIALIST_EMAIL`. Resend only sends from verified domains; for testing use
`EMAIL_FROM_ADDRESS=onboarding@resend.dev`, which delivers only to the address that owns the Resend
account.

## Environment variables

Real values go in `backend/.env` and `frontend/.env`, which are git-ignored. **Never put a real key in
`.env.example`, the README, or code** — the frontend in particular is public, so no secret belongs in
any `VITE_` variable.

**backend/.env**

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Long random value (50+ characters for anything beyond local use) |
| `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Hosts/origins allowed to reach the API |
| `NVIDIA_NIM_API_KEY` | NVIDIA API key (server-side only) |
| `NIM_BASE_URL`, `NIM_MODEL` | Chat model endpoint and name (NIM API, or `http://127.0.0.1:8001/v1` + `nemotron` for Brev) |
| `NIM_EMBED_BASE_URL`, `NIM_EMBED_MODEL` | Embedding model (NVIDIA hosted) |
| `RETELL_API_KEY`, `RETELL_AGENT_ID` | Retell voice agent |
| `PUBLIC_WEBHOOK_BASE_URL` | Public HTTPS origin (your ngrok URL) |
| `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS` | Resend |
| `SPECIALIST_EMAIL` | Inbox that receives "call this customer back" emails |
| `SPECIALIST_PHONE_NUMBER`, `RETELL_FROM_NUMBER` | Optional: live call transfer, needs a Retell phone number |
| `SPACETIMEDB_URL`, `SPACETIMEDB_MODULE_NAME`, `SPACETIMEDB_TOKEN` | Live layer (`vroom-live`) |
| `SPACETIMEDB_SYNC` | `false` to stop mirroring live state (it is always off under `manage.py test`) |
| `DEMO_NOTIFICATION_EMAIL_OVERRIDE` | Local demo: send customer notices for sample accounts to this address |

**frontend/.env**

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Backend URL, e.g. `http://localhost:8000` |
| `VITE_SPACETIMEDB_URL`, `VITE_SPACETIMEDB_MODULE_NAME` | Live layer, e.g. `http://127.0.0.1:3000` and `vroom-live` |

## Tests

```bash
cd backend && python manage.py test
cd frontend && npx vitest run && npm run build
```

## Getting the code

```bash
git clone https://github.com/AakristG/Vroom-AI.git
cd Vroom-AI
git checkout -b <your-name>       # work on a branch and open a PR into main
```

## Tech stack

- **Backend:** Django 5, Django REST Framework, Django Channels + Daphne (ASGI), `openai` SDK against
  Nemotron's OpenAI-compatible endpoint
- **Frontend:** React 19, Vite 6, TypeScript, Tailwind CSS 4, Recharts, Motion
- **Live state:** SpacetimeDB 2.14 (TypeScript module, TypeScript client SDK, HTTP reducers from Django)
- **AI:** NVIDIA Nemotron via vLLM on Brev or the NVIDIA NIM API
- **Voice:** Retell AI (custom-LLM WebSocket, post-call webhook)
- **Email:** Resend
- **Data:** synthetic Toyota Financial Services data pack, NHTSA vPIC/recalls, EPA FuelEconomy.gov
