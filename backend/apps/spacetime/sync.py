"""Publishes the site's live state to SpacetimeDB.

Every browser subscribes to these tables, so chat history, the agent's What-if dashboard commands,
Compare selections and suggestions, and voice captions stay in sync across tabs and devices.

Writes go through one background worker so a slow or missing SpacetimeDB never delays a chat reply
or a voice turn, and so writes for the same customer land in the order they were made. Django stays
the source of truth; if SpacetimeDB is down these calls are dropped and logged.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from django.conf import settings

from .client import try_reducer

logger = logging.getLogger(__name__)

_jobs: "queue.Queue[tuple[str, dict[str, Any]]]" = queue.Queue(maxsize=2000)
_worker: threading.Thread | None = None
_worker_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run() -> None:
    while True:
        reducer, args = _jobs.get()
        try:
            try_reducer(reducer, args)
        except Exception:  # never let the worker die
            logger.exception("SpacetimeDB %s failed", reducer)
        finally:
            _jobs.task_done()


def _enqueue(reducer: str, args: dict[str, Any]) -> None:
    global _worker
    if not getattr(settings, "SPACETIMEDB_SYNC", True):
        return
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run, name="spacetime-sync", daemon=True)
            _worker.start()
    try:
        _jobs.put_nowait((reducer, args))
    except queue.Full:
        logger.warning("SpacetimeDB queue full; dropped %s", reducer)


def flush(timeout: float = 5.0) -> None:
    """Wait for queued writes (tests and management commands)."""
    done = threading.Event()

    def waiter() -> None:
        _jobs.join()
        done.set()

    threading.Thread(target=waiter, daemon=True).start()
    done.wait(timeout)


def _dumps(value: Any) -> str:
    if value in (None, "", [], {}):
        return ""
    return json.dumps(value, default=str)


# Argument dicts are sent positionally, so keys must follow the reducer's parameter order.

def assistant_turn(customer_id: str, *, role: str, content: str, turn_id: str | None = None,
                   tools: Any = None, actions: Any = None, offline: bool = False) -> str:
    turn_id = turn_id or f"{role[0]}-{uuid.uuid4().hex[:16]}"
    if customer_id:
        _enqueue("append_assistant_turn", {
            "customerId": customer_id, "turnId": turn_id, "role": role, "content": content or "",
            "toolsJson": _dumps(tools), "actionsJson": _dumps(actions), "offline": bool(offline), "createdAt": _now(),
        })
    return turn_id


def dashboard(customer_id: str, action: dict[str, Any], source: str) -> None:
    if not customer_id or action.get("type") != "set_dashboard":
        return
    _enqueue("set_dashboard", {
        "customerId": customer_id,
        "simulatorJson": _dumps(action.get("simulator")),
        "scenarioJson": _dumps(action.get("scenario")),
        "source": source,
        "updatedAt": _now(),
    })


def compare_suggestions(customer_id: str, selection_key: str, suggestions: list[dict], source: str) -> None:
    if not customer_id:
        return
    _enqueue("set_compare_suggestions", {
        "customerId": customer_id, "selectionKey": selection_key,
        "suggestionsJson": json.dumps(suggestions, default=str), "source": source, "updatedAt": _now(),
    })


def voice_caption(call_id: str, customer_id: str | None, payload: dict[str, Any]) -> None:
    if not call_id:
        return
    _enqueue("upsert_voice_caption", {
        "callId": call_id, "customerId": customer_id or "", "status": str(payload.get("status") or ""),
        "turnsJson": json.dumps(payload.get("turns") or [], default=str),
        "sequence": int(payload.get("sequence") or 0), "updatedAt": _now(),
    })
