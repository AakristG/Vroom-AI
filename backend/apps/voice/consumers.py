"""
Retell AI "Custom LLM" WebSocket consumer.

Protocol reference: https://docs.retellai.com/api-references/llm-websocket

Retell opens a WebSocket connection to `{server}/ws/llm/{call_id}/` when a call starts, and
sends/receives newline-delimited-less JSON text frames:

  Retell -> us: {"interaction_type": "ping_pong" | "update_only" | "response_required" | "reminder_required", ...}
  us -> Retell: {"response_type": "config" | "ping_pong" | "response" | "agent_interrupt" | ..., ...}

We keep this intentionally simple for a hackathon demo: on each `response_required` /
`reminder_required` event we send the whole transcript to NVIDIA NIM and reply with one
complete `response` event (no token-by-token streaming). See the TODO below if you want to
upgrade to real streaming for lower latency.
"""

from __future__ import annotations

import json
import time

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from apps.ai import nim_client
from apps.ai.retrieve import relevant_account_context
from apps.voice.live import append_agent, publish_session, publish_turn, sync_transcript

GREETING = "Hi, thanks for calling Toyota Financial Services. How can I help you today?"


class RetellLLMConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.call_id = self.scope["url_route"]["kwargs"]["call_id"]
        self.customer_id = None
        await self.accept()

        # Optional config event: ask Retell to send call_details and keep the socket alive.
        await self._send_json(
            {
                "response_type": "config",
                "config": {"auto_reconnect": True, "call_details": True},
            }
        )

        # Begin-of-call message. Set content="" instead if you want the agent to wait for the
        # caller to speak first.
        await self._send_json(
            {
                "response_type": "response",
                "response_id": 0,
                "content": GREETING,
                "content_complete": True,
            }
        )
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
            await self._send_json(
                {"response_type": "ping_pong", "timestamp": event.get("timestamp", int(time.time() * 1000))}
            )
            return

        if interaction_type == "call_details":
            call = event.get("call") or {}
            meta = call.get("metadata") or {}
            self.customer_id = meta.get("customer_id") or self.customer_id
            return

        if interaction_type == "update_only":
            sync_transcript(self.customer_id, self.call_id, event.get("transcript") or [])
            return

        if interaction_type in ("response_required", "reminder_required"):
            await self._handle_response_required(event)
            return

    async def _handle_response_required(self, event: dict):
        response_id = event.get("response_id")
        transcript = event.get("transcript", [])
        messages = nim_client.transcript_to_messages(transcript)
        sync_transcript(self.customer_id, self.call_id, transcript)

        # TODO(perf): nim_client.generate_reply is a blocking HTTP call. sync_to_async offloads
        # it to a worker thread so we don't block the event loop; for lower latency, switch to
        # nim_client.stream_reply and forward chunks as they arrive (content_complete=False
        # until the last chunk).
        extra = ""
        if self.customer_id:
            question = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
            extra = await sync_to_async(relevant_account_context)(self.customer_id, question) or ""
        reply = await sync_to_async(nim_client.generate_reply)(messages, extra_system=extra)
        append_agent(self.customer_id, self.call_id, reply)

        await self._send_json(
            {
                "response_type": "response",
                "response_id": response_id,
                "content": reply,
                "content_complete": True,
            }
        )

    async def _send_json(self, payload: dict):
        await self.send(text_data=json.dumps(payload))
