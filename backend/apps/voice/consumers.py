"""
Retell Custom LLM WebSocket. Spoken answers come from the shared Nemotron orchestrator.

Protocol: https://docs.retellai.com/api-references/llm-websocket
"""

from __future__ import annotations

import json
import time

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from apps.ai.orchestrator import run_turn
from apps.voice.live import append_agent, publish_session, publish_turn, sync_transcript
from apps.voice.verified_calls import resolve_verified_customer

GREETING = "Hi, thanks for calling Toyota Financial Services. How can I help you today?"


class RetellLLMConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.call_id = self.scope["url_route"]["kwargs"]["call_id"]
        self.customer_id = None
        self.verified = False
        await self.accept()
        await self._send_json({"response_type": "config", "config": {"auto_reconnect": True, "call_details": True}})
        await self._send_json(
            {"response_type": "response", "response_id": 0, "content": GREETING, "content_complete": True}
        )
        # Prefer the server-minted binding immediately; call_details may arrive later.
        await self._apply_verified_binding()
        await sync_to_async(publish_session)(self.call_id, "ongoing", last_speaker="agent")
        await sync_to_async(publish_turn)(self.call_id, "agent", GREETING, f"{self.call_id}-greeting")

    async def disconnect(self, close_code):
        await sync_to_async(publish_session)(self.call_id, "ended", last_speaker="agent")

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
            return
        if interaction_type == "call_details":
            # Retell metadata / caller ID is not proof of ownership. Only our mint table authorizes account context.
            await self._apply_verified_binding()
            return
        if interaction_type == "update_only":
            sync_transcript(self.customer_id, self.call_id, event.get("transcript") or [])
            return
        if interaction_type in ("response_required", "reminder_required"):
            await self._handle_response_required(event)

    async def _apply_verified_binding(self):
        customer_id = await sync_to_async(resolve_verified_customer)(self.call_id)
        if customer_id:
            self.customer_id = customer_id
            self.verified = True
        else:
            self.customer_id = None
            self.verified = False

    async def _handle_response_required(self, event: dict):
        response_id = event.get("response_id")
        transcript = event.get("transcript", [])
        messages = []
        for turn in transcript or []:
            role = "user" if turn.get("role") == "user" else "assistant"
            content = (turn.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content})
        sync_transcript(self.customer_id, self.call_id, transcript)
        result = await sync_to_async(run_turn)(
            messages=messages,
            customer_id=self.customer_id,
            context={"page": "voice"},
            channel="phone" if not self.verified else "voice",
            conversation_id=self.call_id,
            call_id=self.call_id,
            verified=self.verified,
        )
        reply = result.get("response") or "I could not reach the assistant just now. Nothing on any account was changed."
        append_agent(self.customer_id, self.call_id, reply)
        await self._send_json(
            {"response_type": "response", "response_id": response_id, "content": reply, "content_complete": True}
        )

    async def _send_json(self, payload: dict):
        await self.send(text_data=json.dumps(payload))
