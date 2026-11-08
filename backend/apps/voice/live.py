"""In-memory bridge from a Retell call to the signed-in website.

The same events are written through SpacetimeDB when that module is reachable.
SpacetimeDB is not the source of truth for financing data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any

from apps.spacetime.client import try_reducer

_lock = Lock()
_calls: dict[str, dict[str, Any]] = {}
_appointments: list[dict[str, Any]] = []
_published: set[str] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def publish_session(call_id: str, status: str, *, agent_id: str = "", last_speaker: str = "") -> None:
    if not call_id:
        return
    try_reducer(
        "upsert_call_session",
        {
            "callId": call_id,
            "agentId": agent_id,
            "status": status,
            "lastSpeaker": last_speaker,
            "updatedAt": _now(),
        },
    )


def publish_turn(call_id: str, role: str, content: str, turn_id: str) -> None:
    text = (content or "").strip()
    if not call_id or not text or turn_id in _published:
        return
    if try_reducer(
        "append_call_message",
        {"callId": call_id, "role": role, "content": text, "createdAt": _now()},
    ):
        _published.add(turn_id)


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


def sync_transcript(customer_id: str | None, call_id: str, transcript: list[dict]) -> None:
    turns = []
    for index, turn in enumerate(transcript or []):
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        role = "user" if turn.get("role") == "user" else "agent"
        turns.append({"id": f"{call_id}-{index}", "role": role, "content": content})
    if customer_id:
        with _lock:
            _calls[customer_id] = {"call_id": call_id, "status": "live", "turns": turns}
    publish_session(call_id, "live", last_speaker=turns[-1]["role"] if turns else "")
    for turn in turns:
        publish_turn(call_id, turn["role"], turn["content"], turn["id"])


def append_agent(customer_id: str | None, call_id: str, content: str) -> None:
    if not content:
        return
    turn_id = f"{call_id}-reply"
    if customer_id:
        with _lock:
            session = _calls.setdefault(customer_id, {"call_id": call_id, "status": "live", "turns": []})
            turn_id = f"{call_id}-reply-{len(session['turns'])}"
            session["turns"].append({"id": turn_id, "role": "agent", "content": content})
            session["status"] = "live"
    publish_session(call_id, "live", last_speaker="agent")
    publish_turn(call_id, "agent", content, turn_id)


def snapshot(customer_id: str) -> dict[str, Any]:
    with _lock:
        session = _calls.get(customer_id)
        if not session:
            return {"status": "idle", "turns": []}
        return {"status": session["status"], "call_id": session["call_id"], "turns": list(session["turns"])}


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
