"""Bridge from a Retell call (browser or phone) to the signed-in website.

Every call is written three ways:
- SpacetimeDB (`call_owner`, `call_session`, `call_message`) so every open browser for that
  customer sees the transcript live,
- the Django database (`CallLog`) so the conversation is saved durably, and
- a small in-memory snapshot for the polling endpoint /api/voice/live/ and authenticated
  caption WebSocket `/ws/captions/<call_id>/`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from apps.spacetime.client import try_reducer

logger = logging.getLogger(__name__)

_lock = Lock()
_calls: dict[str, dict[str, Any]] = {}
_calls_by_id: dict[str, dict[str, Any]] = {}
_appointments: list[dict[str, Any]] = []
_published: set[str] = set()
_owners: dict[str, str] = {}
# Agent replies already published by append_agent, waiting to be matched to their transcript turn.
_pending_agent: dict[str, list[str]] = {}
_seq: dict[str, int] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def caption_group(call_id: str) -> str:
    return f"captions_{call_id}"


def _broadcast(call_id: str, payload: dict[str, Any]) -> None:
    """Push a caption snapshot to browsers subscribed to this verified call."""
    if not call_id:
        return
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(caption_group(call_id), {"type": "caption.message", "payload": payload})
    except Exception:
        logger.exception("Could not broadcast captions for %s", call_id)


def _store_session(customer_id: str | None, call_id: str, *, status: str, turns: list[dict]) -> dict[str, Any]:
    seq = _seq.get(call_id, 0) + 1
    _seq[call_id] = seq
    session = {"call_id": call_id, "status": status, "turns": list(turns), "sequence": seq}
    if customer_id:
        _calls[customer_id] = session
    _calls_by_id[call_id] = session
    _broadcast(
        call_id,
        {
            "call_id": call_id,
            "status": status,
            "turns": session["turns"],
            "sequence": seq,
        },
    )
    return session


def set_owner(call_id: str, customer_id: str | None, *, channel: str, from_number: str = "") -> None:
    if not call_id:
        return
    if customer_id:
        _owners[call_id] = customer_id
    try_reducer(
        "set_call_owner",
        {"callId": call_id, "customerId": customer_id or "", "channel": channel, "fromNumber": from_number, "startedAt": _now()},
    )
    _save(call_id, customer_id=customer_id, channel=channel, from_number=from_number)


def publish_session(call_id: str, status: str, *, agent_id: str = "", last_speaker: str = "") -> None:
    if not call_id:
        return
    try_reducer(
        "upsert_call_session",
        {"callId": call_id, "agentId": agent_id, "status": status, "lastSpeaker": last_speaker, "updatedAt": _now()},
    )
    if status in ("ended", "analyzed"):
        _save(call_id, status=status)


def publish_turn(call_id: str, role: str, content: str, turn_id: str) -> None:
    text = (content or "").strip()
    if not call_id or not text or turn_id in _published:
        return
    pending = _pending_agent.get(call_id) or []
    if role == "agent" and text in pending:
        # This transcript turn is a reply we already published the moment it was generated.
        pending.remove(text)
        _published.add(turn_id)
        return
    if try_reducer("append_call_message", {"callId": call_id, "role": role, "content": text, "createdAt": _now()}):
        _published.add(turn_id)
        if role == "agent" and turn_id.endswith("-greeting"):
            # Retell echoes the greeting as transcript turn 0; don't publish it a second time.
            _pending_agent.setdefault(call_id, []).append(text)


def try_event(customer_id: str, event_type: str, payload: dict) -> None:
    try_reducer(
        "append_customer_event",
        {
            "customerId": customer_id,
            "eventType": event_type,
            "payload": str(payload)[:2000],
            "createdAt": _now(),
        },
    )


def _turns(call_id: str, transcript: list[dict]) -> list[dict]:
    turns = []
    for index, turn in enumerate(transcript or []):
        content = (turn.get("content") or "").strip()
        if content:
            turns.append({"id": f"{call_id}-{index}", "role": "user" if turn.get("role") == "user" else "agent", "content": content})
    return turns


def _with_pending_agent(call_id: str, turns: list[dict]) -> list[dict]:
    """Keep Nemotron replies visible before Retell echoes them into the transcript."""
    pending = list(_pending_agent.get(call_id) or [])
    if not pending:
        return turns
    merged = list(turns)
    for content in pending:
        if any(t["role"] == "agent" and t["content"] == content for t in merged):
            continue
        merged.append({"id": f"{call_id}-pending-{len(merged)}", "role": "agent", "content": content})
    return merged


def sync_transcript(customer_id: str | None, call_id: str, transcript: list[dict], *, settled: bool = False) -> None:
    """Retell sends the whole transcript so far. Publish turns not sent yet, and save the lot.
    `settled` means the caller finished speaking (a reply is due), so their last turn is final."""
    turns = _with_pending_agent(call_id, _turns(call_id, transcript))
    customer_id = customer_id or _owners.get(call_id)
    with _lock:
        _store_session(customer_id, call_id, status="live", turns=turns)
    publish_session(call_id, "live", last_speaker=turns[-1]["role"] if turns else "")
    for turn in turns:
        # Retell revises the last turn while the caller is still talking; only publish settled turns.
        if settled or turn is not turns[-1] or turn["role"] == "agent":
            publish_turn(call_id, turn["role"], turn["content"], turn["id"])
    _save(call_id, transcript=[{"role": t["role"], "content": t["content"]} for t in turns], status="ongoing")


def finish(customer_id: str | None, call_id: str, transcript: list[dict] | None = None) -> None:
    """The call hung up: publish the caller's last turn and mark the call ended."""
    turns = _with_pending_agent(call_id, _turns(call_id, transcript or []))
    for turn in turns:
        publish_turn(call_id, turn["role"], turn["content"], turn["id"])
    customer_id = customer_id or _owners.get(call_id)
    with _lock:
        _store_session(customer_id, call_id, status="ended", turns=turns)
    publish_session(call_id, "ended", last_speaker=turns[-1]["role"] if turns else "agent")
    if turns:
        _save(call_id, transcript=[{"role": t["role"], "content": t["content"]} for t in turns])


def append_agent(customer_id: str | None, call_id: str, content: str, response_id: Any = None) -> None:
    if not content:
        return
    turn_id = f"{call_id}-reply-{response_id}"
    text = content.strip()
    customer_id = customer_id or _owners.get(call_id)
    with _lock:
        session = _calls_by_id.get(call_id) or ( _calls.get(customer_id) if customer_id else None)
        turns = list(session["turns"]) if session and session.get("call_id") == call_id else []
        if not any(t.get("id") == turn_id or (t.get("role") == "agent" and t.get("content") == text) for t in turns):
            turns.append({"id": turn_id, "role": "agent", "content": text})
        _store_session(customer_id, call_id, status="live", turns=turns)
    publish_session(call_id, "live", last_speaker="agent")
    publish_turn(call_id, "agent", text, turn_id)
    if turn_id in _published:
        _pending_agent.setdefault(call_id, []).append(text)


def _save(call_id: str, *, transcript: list[dict] | None = None, status: str | None = None,
          customer_id: str | None = None, channel: str | None = None, from_number: str | None = None) -> None:
    """Durable copy in the Django database. Never breaks the live call."""
    try:
        from .models import CallLog

        log, _ = CallLog.objects.get_or_create(call_id=call_id)
        if transcript is not None and len(transcript) >= len(log.transcript or []):
            log.transcript = transcript
        if status and log.status not in ("ended", "analyzed"):
            log.status = status
        elif status == "analyzed":
            log.status = status
        if customer_id:
            log.customer_id = customer_id
        if channel:
            log.channel = channel
        if from_number:
            log.from_number = from_number
        log.save()
    except Exception:
        logger.exception("Could not save call %s", call_id)


def snapshot(customer_id: str) -> dict[str, Any]:
    with _lock:
        session = _calls.get(customer_id)
        if not session:
            return {"status": "idle", "turns": []}
        return {
            "status": session["status"],
            "call_id": session["call_id"],
            "turns": list(session["turns"]),
            "sequence": session.get("sequence", 0),
        }


def snapshot_for_call(call_id: str) -> dict[str, Any] | None:
    with _lock:
        session = _calls_by_id.get(call_id)
        if not session:
            return None
        return {
            "status": session["status"],
            "call_id": session["call_id"],
            "turns": list(session["turns"]),
            "sequence": session.get("sequence", 0),
        }


def save_appointment(record: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        _appointments.append(record)
        record["id"] = len(_appointments)
    try_reducer(
        "book_appointment",
        {
            "customerId": record.get("customer_id") or "",
            "name": record.get("name") or "",
            "topic": record.get("topic") or "",
            "whenText": record.get("when") or "",
            "phone": record.get("phone") or "",
            "status": record.get("status") or "requested",
        },
    )
    return record
