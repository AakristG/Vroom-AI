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
_embed_client: OpenAI | None = None

# Reasoning models may emit their chain of thought inline; it must never be spoken to a caller.
_THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def get_client() -> OpenAI:
<<<<<<< HEAD
=======
    """Chat client. This is the Brev vLLM server once NIM_BASE_URL points at it."""
>>>>>>> 18a21bf495cf20a645a9bf0406a319cfe878595c
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=settings.NIM_BASE_URL,
            api_key=settings.NVIDIA_NIM_API_KEY or "not-set",
        )
    return _client


def get_embed_client() -> OpenAI:
    """Embedding client. Always the cloud Retriever NIM, never the chat GPU."""
    global _embed_client
    if _embed_client is None:
        _embed_client = OpenAI(
            base_url=settings.NIM_EMBED_BASE_URL,
            api_key=settings.NVIDIA_NIM_API_KEY or "not-set",
        )
    return _embed_client


def _extra_body() -> dict:
    # Nemotron 3.x thinks by default; for voice we want an immediate spoken answer instead.
    return {"chat_template_kwargs": {"enable_thinking": settings.NIM_ENABLE_THINKING}}


def with_system_prompt(messages: Iterable[dict], extra_system: str = "", base: str = SYSTEM_PROMPT) -> list[dict]:
    messages = [m for m in messages if m.get("role") != "system"]
    content = base
    if extra_system:
        content = (
            f"{base}\n\n"
            "VERIFIED ACCOUNT. These figures come from the customer's Toyota Financial Services record. "
            "Do not replace them with estimates of your own.\n"
            f"{extra_system}"
        )
    return [{"role": "system", "content": content}, *messages]


<<<<<<< HEAD
=======
_EMBED_TYPES = {"float", "int8", "uint8", "binary", "ubinary"}
_NATIVE_DIMENSIONS = 2048


def embed(
    texts: list[str],
    *,
    input_type: str = "query",
    embedding_type: str | None = None,
    dimensions: int | None = None,
) -> list[list[float] | list[int]]:
    """POST /v1/embeddings for nvidia/nemotron-3-embed-1b.

    `query` is for a question. `passage` is for text being indexed. The OpenAI
    embeddings call has no input_type field, so it is sent in extra_body, which
    this NIM accepts. Modality is text only for this model.
    """
    if input_type not in ("query", "passage"):
        raise ValueError("input_type must be 'query' or 'passage'.")
    if not texts:
        return []
    kind = embedding_type if embedding_type is not None else settings.NIM_EMBED_TYPE
    if kind not in _EMBED_TYPES:
        raise ValueError("embedding_type must be float, int8, uint8, binary, or ubinary.")
    if dimensions not in (None, _NATIVE_DIMENSIONS):
        raise ValueError("nvidia/nemotron-3-embed-1b only accepts 2048 dimensions.")
    if dimensions is not None and kind != "float":
        raise ValueError("dimensions cannot be combined with embedding_type.")

    extra: dict = {"input_type": input_type, "modality": "text"}
    kwargs: dict = {}
    if kind != "float":
        extra["embedding_type"] = kind
    elif dimensions == _NATIVE_DIMENSIONS:
        kwargs["dimensions"] = _NATIVE_DIMENSIONS

    response = get_embed_client().embeddings.create(
        input=texts,
        model=settings.NIM_EMBED_MODEL,
        extra_body=extra,
        **kwargs,
    )
    ordered = sorted(response.data, key=lambda item: item.index)
    return [list(item.embedding) for item in ordered]


>>>>>>> 18a21bf495cf20a645a9bf0406a319cfe878595c
def clean(content: str | None) -> str:
    return _THINK_BLOCK_RE.sub("", content or "").strip()


def generate_reply(
    messages: Iterable[dict], *, model: str | None = None, extra_system: str = "", base: str = SYSTEM_PROMPT
) -> str:
    """Non-streaming completion. `messages` is OpenAI chat-format: [{"role": "user", "content": "..."}, ...]."""
    client = get_client()
    completion = client.chat.completions.create(
        model=model or settings.NIM_MODEL,
        messages=with_system_prompt(messages, extra_system, base),
        extra_body=_extra_body(),
    )
    return clean(completion.choices[0].message.content)


def complete(messages: list[dict], *, tools: list[dict] | None = None):
    """Raw completion for the tool-calling loop. Caller supplies the system message."""
    kwargs = {"tools": tools, "tool_choice": "auto"} if tools else {}
    return get_client().chat.completions.create(
        model=settings.NIM_MODEL, messages=messages, extra_body=_extra_body(), **kwargs
    )


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
