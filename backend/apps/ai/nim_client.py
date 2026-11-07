"""
Thin wrapper around NVIDIA NIM's OpenAI-compatible chat completions API.

NIM's cloud catalog (https://build.nvidia.com) exposes Nemotron and other models through an
OpenAI-compatible endpoint, so we just point the official `openai` SDK at it. Pick a model slug
from build.nvidia.com and set it as NIM_MODEL in backend/.env (catalog + slugs change over time,
so double check there if a model 404s).
"""

from __future__ import annotations

import re
from typing import Iterable, Iterator

from django.conf import settings
from openai import OpenAI

from .prompts import SYSTEM_PROMPT

_client: OpenAI | None = None

# Reasoning models may emit their chain of thought inline; it must never be spoken to a caller.
_THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_NIM_API_KEY or "not-set",
        )
    return _client


def _extra_body() -> dict:
    # Nemotron 3.x thinks by default; for voice we want an immediate spoken answer instead.
    return {"chat_template_kwargs": {"enable_thinking": settings.NIM_ENABLE_THINKING}}


def with_system_prompt(messages: Iterable[dict], extra_system: str = "") -> list[dict]:
    messages = [m for m in messages if m.get("role") != "system"]
    content = SYSTEM_PROMPT
    if extra_system:
        content = (
            f"{SYSTEM_PROMPT}\n\n"
            "VERIFIED ACCOUNT. These figures come from the customer's Toyota Financial Services record. "
            "Do not replace them with estimates of your own.\n"
            f"{extra_system}"
        )
    return [{"role": "system", "content": content}, *messages]


def generate_reply(messages: Iterable[dict], *, model: str | None = None, extra_system: str = "") -> str:
    """Non-streaming completion. `messages` is OpenAI chat-format: [{"role": "user", "content": "..."}, ...]."""
    client = get_client()
    completion = client.chat.completions.create(
        model=model or settings.NIM_MODEL,
        messages=with_system_prompt(messages, extra_system),
        extra_body=_extra_body(),
    )
    content = completion.choices[0].message.content or ""
    return _THINK_BLOCK_RE.sub("", content).strip()


def stream_reply(messages: Iterable[dict], *, model: str | None = None) -> Iterator[str]:
    """Streaming completion — yields text chunks as they arrive. Used by the Retell WS consumer
    so the agent can start speaking before the full response is generated (lower latency)."""
    client = get_client()
    stream = client.chat.completions.create(
        model=model or settings.NIM_MODEL,
        messages=with_system_prompt(messages),
        extra_body=_extra_body(),
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
