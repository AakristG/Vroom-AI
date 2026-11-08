"""
Retell Custom LLM WebSocket (Django Channels). Spoken answers come from the shared Nemotron
orchestrator, the same one the website chat uses.

The Retell agent's LLM URL points here: `wss://<public host>/ws/llm` (Retell appends `/{call_id}`).
Protocol: https://docs.retellai.com/api-references/llm-websocket

Account context is only used for browser calls minted by our backend (VerifiedWebCall). A phone
caller is treated as unverified: caller ID is not proof of account ownership.

Every turn is published to SpacetimeDB (live transcript in the customer's chat box) and saved to
the CallLog table.
"""

from __future__ import annotations

import json
import time

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from apps.ai.orchestrator import run_turn
from apps.voice import live
from apps.voice.verified_calls import resolve_verified_customer

GREETING = "Hi, thanks for calling Toyota Financial Services. How can I help you today?"


def _first_name(customer_id: str) -> str | None:
    from apps.ai.account_context import _profiles, self_reported_profile

    profile = _profiles().get(customer_id) or self_reported_profile(customer_id) or {}
    return (profile.get("customer") or {}).get("first_name")


class RetellLLMConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.call_id = self.scope["url_route"]["kwargs"]["call_id"]
        self.customer_id: str | None = None
        self.verified = False
        self.transcript: list[dict] = []
        self.owner_published = False
        await self.accept()
        await self._send_json({"response_type": "config", "config": {"auto_reconnect": True, "call_details": True}})
        # Prefer the server-minted binding immediately; call_details may arrive later.
        await self._apply_verified_binding()
        name = await sync_to_async(_first_name)(self.customer_id) if self.customer_id else None
        greeting = f"Hi {name}, thanks for calling Toyota Financial Services. How can I help you today?" if name else GREETING
        await self._send_json({"response_type": "response", "response_id": 0, "content": greeting, "content_complete": True})
        await sync_to_async(live.publish_session)(self.call_id, "ongoing", last_speaker="agent")
        # Seed the in-memory caption snapshot so the browser can show the greeting immediately.
        await sync_to_async(live.append_agent)(self.customer_id, self.call_id, greeting, 0)

    async def disconnect(self, close_code):
        await sync_to_async(live.finish)(self.customer_id, self.call_id, self.transcript)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            event = json.loads(text_data)
        except json.JSONDecodeError:
            return
        interaction_type = event.get("interaction_type")
        if interaction_type == "ping_pong":
            await self._send_json({"response_type": "ping_pong", "timestamp": event.get("timestamp", int(time.time() * 1000))})
        elif interaction_type == "call_details":
            # Retell metadata / caller ID is not proof of ownership. Only our mint table authorizes account context.
            await self._apply_verified_binding()
            await self._publish_owner(event.get("call") or {})
        elif interaction_type == "update_only":
            self.transcript = event.get("transcript") or []
            await sync_to_async(live.sync_transcript)(self.customer_id, self.call_id, self.transcript)
        elif interaction_type in ("response_required", "reminder_required"):
            await self._handle_response_required(event)

    async def _apply_verified_binding(self):
        customer_id = await sync_to_async(resolve_verified_customer)(self.call_id)
        self.customer_id = customer_id or None
        self.verified = bool(customer_id)

    async def _publish_owner(self, call: dict):
        """Record the call's channel (and, for verified browser calls, its customer) in SpacetimeDB."""
        if self.owner_published:
            return
        self.owner_published = True
        phone = call.get("call_type") == "phone_call" or bool(call.get("from_number"))
        await sync_to_async(live.set_owner)(
            self.call_id, self.customer_id, channel="phone" if phone else "web", from_number=call.get("from_number") or ""
        )

    async def _handle_response_required(self, event: dict):
        response_id = event.get("response_id")
        self.transcript = event.get("transcript", []) or []
        messages = []
        for turn in self.transcript:
            role = "user" if turn.get("role") == "user" else "assistant"
            content = (turn.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content})
        # The caller finished speaking, so their last turn is final and can be published.
        await sync_to_async(live.sync_transcript)(self.customer_id, self.call_id, self.transcript, settled=True)
        try:
            result = await sync_to_async(run_turn)(
                messages=messages,
                customer_id=self.customer_id,
                context={"page": "voice"},
                channel="voice" if self.verified else "phone",
                conversation_id=self.call_id,
                call_id=self.call_id,
                verified=self.verified,
            )
            reply = result.get("response")
        except Exception:
            reply = None
        reply = reply or "I could not reach the assistant just now. Nothing on any account was changed."
        await sync_to_async(live.append_agent)(self.customer_id, self.call_id, reply, response_id)
        await self._send_json({"response_type": "response", "response_id": response_id, "content": reply, "content_complete": True})

    async def _send_json(self, payload: dict):
        await self.send(text_data=json.dumps(payload))


class CaptionRelayConsumer(AsyncWebsocketConsumer):
    """Authenticated live captions for the customer who owns a VerifiedWebCall."""

    async def connect(self):
        self.call_id = self.scope["url_route"]["kwargs"]["call_id"]
        self.group = live.caption_group(self.call_id)
        account = await sync_to_async(self._account_for_scope)()
        owner = await sync_to_async(resolve_verified_customer)(self.call_id)
        if account is None or not owner or account.customer_id != owner:
            await self.close(code=4403)
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        snapshot = await sync_to_async(live.snapshot_for_call)(self.call_id)
        if snapshot:
            await self.send(text_data=json.dumps({"type": "caption_snapshot", **snapshot}))

    async def disconnect(self, close_code):
        if getattr(self, "group", None):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def caption_message(self, event):
        payload = event.get("payload") or {}
        await self.send(text_data=json.dumps({"type": "caption_snapshot", **payload}))

    def _account_for_scope(self):
        from urllib.parse import parse_qs

        from apps.accounts.authz import COOKIE_NAME, account_from_token

        query = parse_qs((self.scope.get("query_string") or b"").decode())
        token = (query.get("token") or [""])[0]
        if not token:
            headers = {k.decode().lower(): v.decode() for k, v in (self.scope.get("headers") or [])}
            auth = headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:].strip()
            if not token:
                cookies = {}
                for part in headers.get("cookie", "").split(";"):
                    if "=" in part:
                        name, value = part.split("=", 1)
                        cookies[name.strip()] = value.strip()
                token = cookies.get(COOKIE_NAME, "")
        return account_from_token(token)
