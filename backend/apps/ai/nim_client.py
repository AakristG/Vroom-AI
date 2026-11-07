"""
Thin wrapper around NVIDIA NIM's OpenAI-compatible chat completions API.

NIM's cloud catalog (https://build.nvidia.com) exposes Nemotron and other models through an
OpenAI-compatible endpoint, so we just point the official `openai` SDK at it. Pick a model slug
from build.nvidia.com and set it as NIM_MODEL in backend/.env (catalog + slugs change over time,
so double check there if a model 404s).
"""

from __future__ import annotations

from typing import Iterable, Iterator

from django.conf import settings
from openai import OpenAI

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_NIM_API_KEY or "not-set",
        )
    return _client


def generate_reply(messages: Iterable[dict], *, model: str | None = None) -> str:
    """Non-streaming completion. `messages` is OpenAI chat-format: [{"role": "user", "content": "..."}, ...]."""
    client = get_client()
    completion = client.chat.completions.create(
        model=model or settings.NIM_MODEL,
        messages=list(messages),
    )
    return completion.choices[0].message.content or ""


def stream_reply(messages: Iterable[dict], *, model: str | None = None) -> Iterator[str]:
    """Streaming completion — yields text chunks as they arrive. Used by the Retell WS consumer
    so the agent can start speaking before the full response is generated (lower latency)."""
    client = get_client()
    stream = client.chat.completions.create(
        model=model or settings.NIM_MODEL,
        messages=list(messages),
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


def transcript_to_messages(transcript: list[dict]) -> list[dict]:
    """Convert Retell's transcript format ([{role: 'agent'|'user', content: '...'}]) into
    OpenAI chat message format ([{role: 'assistant'|'user', content: '...'}])."""
    role_map = {"agent": "assistant", "user": "user"}
    return [
        {"role": role_map.get(turn.get("role"), "user"), "content": turn.get("content", "")}
        for turn in transcript
    ]
