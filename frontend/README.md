# Frontend — React + Vite

## Setup

```bash
npm install
cp .env.example .env     # set VITE_API_BASE_URL, VITE_RETELL_PUBLIC_KEY, VITE_RETELL_AGENT_ID, ...
npm run dev
```

Open <http://localhost:5173>.

## Project layout

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── .env.example
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── api/client.ts            Axios wrapper around the Django backend
    ├── components/VoiceWidget.tsx  Retell Web SDK (in-browser voice call)
    └── spacetime/
        ├── client.ts            SpacetimeDB TypeScript client connection
        └── module_bindings/     Generated bindings (placeholder until you run codegen)
```

## Realtime (SpacetimeDB)

`src/spacetime/client.ts` won't do anything useful until you generate real bindings — see
`src/spacetime/module_bindings/README.md` and `spacetimedb/README.md`. Nothing in `App.tsx`
calls it by default, so `npm run dev` works fine before you've done that.

```bash
npm run generate:bindings   # requires the spacetime CLI + a published module (see spacetimedb/)
```

## Voice (Retell AI Web Call)

`src/components/VoiceWidget.tsx` uses `retell-client-js-sdk`'s `RetellClient` (v3) to start an
in-browser call against your agent, as an alternative/complement to real phone calls hitting
the backend's Custom LLM WebSocket + webhook. Needs `VITE_RETELL_PUBLIC_KEY` (a *public* key —
never put your Retell API key in frontend code) and `VITE_RETELL_AGENT_ID`. See
<https://docs.retellai.com/deploy/web-call>.

## Boundaries

This folder never imports from `backend/` or `spacetimedb/` — only talks to them over HTTP /
WebSocket via the `VITE_*` env vars above. Keep it that way so teammates can run just this
folder without the rest of the stack installed.

## UI stack (Next Move redesign)

- **Tailwind CSS v4** via `@tailwindcss/vite`, design tokens live in `src/index.css` (`@theme`)
- **Motion** (`motion/react`) for the hero parallax, the incoming-call card, and transcript entry
- **lucide-react** icons; **clsx + tailwind-merge** (`cn()` in `src/lib/format.ts`)
- Fonts self-hosted with Fontsource: Bebas Neue (display), Inter Tight (body), JetBrains Mono (agent tool names)

Data: `src/data/profiles.json` is generated from the Toyota data pack (synthetic):

```bash
python3 scripts/build_profiles.py <path-to>/toyota_next_move_data_pack src/data/profiles.json
```

Live call: `src/hooks/useLiveCall.ts` subscribes to SpacetimeDB `call_session` / `call_message`
once real bindings are generated (`npm run generate:bindings`). Until then the console plays a
scripted demo call built from the selected customer's record. `call_message` must be
`public: true` in the SpacetimeDB module for the browser to subscribe to it.
