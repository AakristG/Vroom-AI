"""
Minimal Python client for talking to SpacetimeDB's HTTP API from Django.

SpacetimeDB does not (yet) have an official first-party Python SDK -- the official realtime
clients are Rust, C#, and TypeScript/JavaScript (used by frontend/src/spacetime/client.ts).
From the backend we only need occasional, non-realtime calls (invoke a reducer, run a SQL
query), so plain HTTP is enough.

Full reference: https://spacetimedb.com/docs/http/database

Reducer names match spacetimedb/server/src/index.ts, converted to snake_case (SpacetimeDB
calls a TS export like `upsertCallSession` via the external name `upsert_call_session` -- see
that file + spacetimedb/README.md for the full schema).

Example:
    from apps.spacetime.client import call_reducer
    call_reducer("upsert_call_session", [call_id, agent_id, "ongoing", "agent", iso_timestamp])
"""

from __future__ import annotations

from typing import Any

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class SpacetimeDBError(RuntimeError):
    pass


_token_rejected = False


def _base_url() -> str:
    return settings.SPACETIMEDB_URL.rstrip("/")


def _headers() -> dict:
    headers = {"Content-Type": "application/json"}
    if settings.SPACETIMEDB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.SPACETIMEDB_TOKEN}"
    return headers


def call_reducer(reducer_name: str, args: list[Any] | dict[str, Any], *, module_name: str | None = None) -> None:
    """POST /v1/database/:name_or_identity/call/:reducer

    A dict is sent as positional arguments in key order, which is how this server
    accepts the TypeScript reducer parameters.
    """
    module = module_name or settings.SPACETIMEDB_MODULE_NAME
    url = f"{_base_url()}/v1/database/{module}/call/{reducer_name}"
    body = list(args.values()) if isinstance(args, dict) else args

    global _token_rejected
    headers = _headers()
    if _token_rejected:
        headers.pop("Authorization", None)
    response = requests.post(url, json=body, headers=headers, timeout=10)
    if response.status_code == 401 and "Authorization" in headers:
        # A token issued by a different SpacetimeDB server is rejected outright. These reducers are
        # public, so fall back to an anonymous identity instead of losing the write.
        logger.warning("SpacetimeDB rejected SPACETIMEDB_TOKEN (%s); calling reducers anonymously.", response.text[:80])
        _token_rejected = True
        headers.pop("Authorization")
        response = requests.post(url, json=body, headers=headers, timeout=10)
    if not response.ok:
        raise SpacetimeDBError(
            f"SpacetimeDB reducer '{reducer_name}' failed ({response.status_code}): {response.text}"
        )


def try_reducer(reducer_name: str, args: list[Any] | dict[str, Any]) -> bool:
    """Live paths keep working when SpacetimeDB is down. The failure is logged, not raised."""
    try:
        call_reducer(reducer_name, args)
        return True
    except (SpacetimeDBError, requests.RequestException) as exc:
        logger.warning("SpacetimeDB %s skipped: %s", reducer_name, exc)
        return False


def run_sql(query: str, *, module_name: str | None = None) -> list[dict]:
    """POST /v1/database/:name_or_identity/sql -- handy for debugging/admin, not for hot paths."""
    module = module_name or settings.SPACETIMEDB_MODULE_NAME
    url = f"{_base_url()}/v1/database/{module}/sql"

    response = requests.post(url, data=query, headers=_headers(), timeout=10)
    if not response.ok:
        raise SpacetimeDBError(f"SpacetimeDB SQL query failed ({response.status_code}): {response.text}")
    return response.json()
