"""In-memory bridge from a Retell phone call to the signed-in website."""

from __future__ import annotations

from threading import Lock
from typing import Any

_lock = Lock()
_calls: dict[str, dict[str, Any]] = {}
_appointments: list[dict[str, Any]] = []


def sync_transcript(customer_id: str | None, call_id: str, transcript: list[dict]) -> None:
    if not customer_id:
        return
    turns = []
    for index, turn in enumerate(transcript or []):
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        role = "user" if turn.get("role") == "user" else "agent"
        turns.append({"id": f"{call_id}-{index}", "role": role, "content": content})
    with _lock:
        _calls[customer_id] = {"call_id": call_id, "status": "live", "turns": turns}


def append_agent(customer_id: str | None, call_id: str, content: str) -> None:
    if not customer_id or not content:
        return
    with _lock:
        session = _calls.setdefault(customer_id, {"call_id": call_id, "status": "live", "turns": []})
        session["turns"].append({"id": f"{call_id}-reply-{len(session['turns'])}", "role": "agent", "content": content})
        session["status"] = "live"


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
    return record
