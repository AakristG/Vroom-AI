# Dashboard steps the code cannot finish alone

## Retell (required for Nemotron-spoken voice)

1. Prefer a **Custom LLM** agent (Approach B). Conversation Flow agents keep Retell’s model as the speaker; custom functions only fetch data.
2. Set Custom LLM WebSocket URL to your public ASGI host, for example:
   `wss://<PUBLIC_HOST>/ws/llm/`
   Retell appends `/<call_id>`.
3. Point post-call webhook to:
   `https://<PUBLIC_HOST>/api/voice/webhook/`
4. Keep `RETELL_API_KEY` and `RETELL_AGENT_ID` in `backend/.env` only.
5. For local browser tests without a tunnel, either expose Daphne with HTTPS/ngrok, or temporarily use `VITE_RETELL_PUBLIC_KEY` + allowed domain `localhost` as a fallback. Server mint (`POST /api/voice/web-call/`) is preferred because it sets `metadata.verified=true`.

## Twilio ↔ Retell phone (required for PSTN)

1. Own a Twilio number.
2. Follow current Retell docs for Twilio Elastic SIP Trunking (do not hard-code SIP hosts from memory).
3. Origination: Twilio → Retell SIP; associate the Custom LLM agent.
4. Set Twilio voice webhook temporarily to `POST /api/voice/twilio/voice/` only for signature/health checks — live agent audio must go through the Retell SIP path, not our stub TwiML Say.
5. Fill `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in `backend/.env`.
6. SMS STOP is handled at `/api/voice/twilio/sms/`. Continuation SMS sends only after a confirmed `send_continuation_link` action.

## SpacetimeDB

1. Install CLI interactively: https://spacetimedb.com/install
2. `spacetime start`
3. `cd spacetimedb/server && spacetime publish toyota-fs-dev`
4. `npm run generate:bindings` from `frontend/`
5. Set `SPACETIMEDB_*` in backend and optional `VITE_SPACETIMEDB_*` in frontend.

Until bindings exist, PhoneDesk polls Django `/api/voice/live/` instead of live Spacetime subscribe.

## Email (appointment notices)

1. Create a Resend (or compatible) API key.
2. Set `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM_ADDRESS`.
3. Emails send **only** when an appointment row reaches `status=confirmed` via a real scheduler. Recorded specialist requests stay `requested` and do not pretend mail was delivered.

## Representative directory

No verified dealer/TFS employee feed is in-repo. `representatives.find_local` returns empty results on purpose. Do not invent names or numbers.
