# Architecture notes

## Call flow (live voice call)

1. A call starts (phone or Retell's Web Call SDK on the frontend). Retell AI opens a WebSocket
   to our backend at `wss://<backend-host>/ws/llm/<call_id>/`
   (`backend/apps/voice/consumers.py`, `RetellLLMConsumer`).
2. Retell sends `interaction_type: "response_required"` events containing the live transcript.
   Our consumer forwards the transcript to NVIDIA NIM (`backend/apps/ai/nim_client.py`) and
   streams the generated text back to Retell as `response_type: "response"` events
   (`content`, `content_complete`), per the
   [Retell LLM WebSocket protocol](https://docs.retellai.com/api-references/llm-websocket).
3. Optionally, the consumer also writes a snapshot of call state (e.g. current turn, last
   intent, flags) into SpacetimeDB via a reducer call, so the dashboard can show the call live.
4. When the call ends, Retell POSTs a webhook (`call_started` / `call_ended` / `call_analyzed`)
   to `backend/apps/voice/webhooks.py`. We verify the signature, store the transcript/summary,
   and (optionally) call a SpacetimeDB reducer to finalize the session record.

## Why SpacetimeDB sits next to Django, not inside it

SpacetimeDB is its own database + compute runtime: you write **reducers** (functions) and
**tables** in a Rust (or C#) module, publish it to a SpacetimeDB instance, and clients talk to
it directly — either over its binary/JSON WebSocket protocol (official SDKs: Rust, C#,
TypeScript/JavaScript) or its HTTP API. There is no official first-party Python SDK today, so:

- **Frontend → SpacetimeDB:** uses the official TypeScript SDK
  (`frontend/src/spacetime/client.ts`) for live subscriptions — this is the primary, realtime
  path and what the UI should prefer.
- **Backend → SpacetimeDB:** uses plain HTTP calls (`backend/apps/spacetime/client.py`) via
  `requests`, specifically:
  - `POST /v1/database/:name_or_identity/call/:reducer` — invoke a reducer, body = JSON array
    of args, `Authorization: Bearer <token>`.
  - `POST /v1/database/:name_or_identity/sql` — ad-hoc SQL queries for debugging/admin use.
  - Full reference: <https://spacetimedb.com/docs/http/database>

This keeps Django as the "slow path" (auth, business logic, talking to NIM, talking to Retell's
REST API) while SpacetimeDB handles the "fast path" (realtime fan-out of state changes to every
connected browser) — no Django Channels + Redis pub/sub needed for that part.

## NVIDIA NIM (Nemotron)

NIM's cloud catalog (`https://integrate.api.nvidia.com/v1`) exposes an OpenAI-compatible
`/chat/completions` API, so `backend/apps/ai/nim_client.py` just uses the official `openai`
Python SDK with `base_url` overridden and `api_key=NVIDIA_NIM_API_KEY`. Pick your model slug
from [build.nvidia.com](https://build.nvidia.com) (catalog changes over time) and set it as
`NIM_MODEL` in `backend/.env`.

## Retell AI integration points

- **Custom LLM WebSocket** (live call): `backend/apps/voice/consumers.py`. Message shapes:
  - Retell → us: `interaction_type` ∈ `ping_pong | update_only | response_required | reminder_required`
  - Us → Retell: `response_type` ∈ `config | ping_pong | response | agent_interrupt | tool_call_invocation | tool_call_result | update_agent | metadata`
  - Full spec: <https://docs.retellai.com/api-references/llm-websocket>
- **Post-call webhook**: `backend/apps/voice/webhooks.py`, configured in the Retell dashboard
  (Agent → Webhook URL). Verify `X-Retell-Signature` before trusting the payload.
- **Web Call widget** (optional, for an in-browser demo instead of a phone call): the frontend
  can embed Retell's `retell-client-js-sdk` (`frontend/src/components/VoiceWidget.tsx`) using a
  public key + an access token your backend mints via Retell's REST API
  (`POST /v2/create-web-call`).

## Folder boundaries (so nobody steps on anybody)

- `backend/` only contains Python. Nothing in here should assume Node is installed.
- `frontend/` only contains the Vite/React app. It never imports from `backend/` or
  `spacetimedb/` — it only talks to them over HTTP/WebSocket using env vars.
- `spacetimedb/server/` only contains the Rust module + its own `Cargo.toml`/lockfile. It's
  published as a standalone artifact; Django and React both treat it as an external service.
- Shared knowledge (API shapes, env var names) lives in this `docs/` folder and each service's
  `.env.example`, not in code shared across folders.
