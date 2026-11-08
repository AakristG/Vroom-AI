# SpacetimeDB module — real-time call/session state

This is a standalone SpacetimeDB module that both `frontend/` (TypeScript client SDK, direct
realtime subscriptions) and `backend/` (plain HTTP calls, see `backend/apps/spacetime/client.py`)
connect to. It is **not** imported by either — it's published to a SpacetimeDB instance and
talked to over the network, exactly like any other backend service.

SpacetimeDB modules can be written in TypeScript, Rust, C#, or C++. We use **TypeScript** here
since it's the fastest path for a hackathon (`spacetime dev`/`init --lang typescript`, no extra
toolchain) and keeps the whole team in one language for this piece. Official docs:
<https://spacetimedb.com/docs>.

## One-time setup (do this once per machine, not per teammate's turn)

```bash
# 1. Install the CLI (see https://spacetimedb.com/install for your OS)
curl -sSf https://install.spacetimedb.com | sh

# 2. Log in (GitHub or Google)
spacetime login

# 3. Scaffold the TypeScript module project files (package.json, tsconfig.json, spacetime
#    config) if `server/` doesn't already have them — this repo ships `server/src/index.ts`
#    (the actual schema/reducers) but not the generated scaffolding files, since those come
#    from the CLI and are easy to regenerate / keep in sync with your installed CLI version.
cd spacetimedb
spacetime init --lang typescript --project-path server toyota-fs
# then make sure server/src/index.ts matches (or replace it with) the file already committed
# here — it defines the actual tables/reducers for this project.
```

## Day-to-day usage

```bash
# Run a local SpacetimeDB instance (keep this running in its own terminal)
spacetime start

# From spacetimedb/server, publish/update the module
cd spacetimedb/server
spacetime publish toyota-nextmove

# Watch logs
spacetime logs toyota-nextmove

# Ad-hoc SQL against it
spacetime sql toyota-nextmove "SELECT * FROM call_session"
```

Set `SPACETIMEDB_URL=http://127.0.0.1:3000` and `SPACETIMEDB_MODULE_NAME=toyota-nextmove` in both
`backend/.env` and `frontend/.env` to point at this local instance.

## Schema (`server/src/index.ts`)

- **`call_owner`** — which customer a call belongs to (`call_id`, `customer_id`, `channel` web/phone,
  `from_number`). Written by the backend when a browser call starts or a phone caller is matched by
  number, so each signed-in browser only shows its own transcript.
- **`next_move`** — one row per step of a customer's AI-automated "Your next moves" plan (`status`
  working / done / needs_you, plus the suggested action as JSON). The backend writes progress as it
  runs each check; the Insights page fills in live.

- **`call_session`** — one row per Retell call: `call_id` (primary key), `agent_id`, `status`,
  `last_speaker`, `updated_at`. Upserted by `upsertCallSession`.
- **`call_message`** — one row per transcript turn: auto-incrementing `id`, `call_id` (indexed),
  `role`, `content`, `created_at`. Appended by `appendCallMessage`.

The dashboard (frontend) subscribes to `SELECT * FROM call_session` and
`SELECT * FROM call_message` to show calls updating live as they happen.

## Generating client bindings for the frontend

After you `spacetime publish`, generate the TypeScript bindings the frontend imports:

```bash
spacetime generate --lang typescript \
  --out-dir ../frontend/src/spacetime/module_bindings \
  --module-path server
```

Commit the generated `module_bindings/` folder so teammates without the `spacetime` CLI
installed can still build the frontend — regenerate it whenever `server/src/index.ts` changes.
