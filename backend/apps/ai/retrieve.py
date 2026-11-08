"""Retrieve the account passages that match a question.

Passages are embedded with input_type=passage. The question uses input_type=query.
Those modes are not interchangeable for this model. Float embeddings use cosine
similarity. Binary embeddings would need Hamming distance, so this path keeps float.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from . import nim_client, policy
from .account_context import CLOSING_RULE, _profiles, account_context

logger = logging.getLogger(__name__)


def _passages(profile: dict) -> list[str]:
    customer = profile.get("customer") or {}
    vehicle = profile.get("vehicle") or {}
    account = profile.get("account") or {}
    situation = profile.get("situation") or {}
    rows = [
        (
            f"{customer.get('first_name')} said: {situation.get('customer_says')}. "
            f"Context: {situation.get('context_summary') or situation.get('summary') or ''}."
        ),
        (
            f"Vehicle on the agreement: {vehicle.get('model_year')} Toyota {vehicle.get('model')} "
            f"{vehicle.get('trim')}. Odometer {vehicle.get('odometer_now')}. "
            f"Estimated value {vehicle.get('est_market_value_now')} is not a guaranteed offer. "
            f"Open recall: {vehicle.get('open_recall')}."
        ),
        (
            f"Contract: {account.get('contract_type')} with Toyota Financial Services. "
            f"Payment {account.get('monthly_payment')}. Balance {account.get('current_balance')}. "
            f"Months remaining {account.get('months_remaining')}. "
            f"Missed payments in 12 months: {account.get('missed_payments_12m')}."
        ),
    ]
    return [row.strip() for row in rows if row.strip()]


def _cosine(left: list[float], right: list[float]) -> float:
    dot = norm_left = norm_right = 0.0
    for a, b in zip(left, right):
        dot += a * b
        norm_left += a * a
        norm_right += b * b
    if norm_left == 0 or norm_right == 0:
        return 0.0
    return dot / ((norm_left ** 0.5) * (norm_right ** 0.5))


@lru_cache(maxsize=32)
def _indexed(customer_id: str) -> tuple[tuple[str, ...], tuple[tuple[float, ...], ...]]:
    profile = _profiles().get(customer_id) or {}
    texts = _passages(profile)
    vectors = nim_client.embed(texts, input_type="passage")
    return tuple(texts), tuple(tuple(vector) for vector in vectors)


def relevant_account_context(customer_id: str, question: str, *, limit: int = 4, conversation_text: str = "") -> str | None:
    """Account text for the model, with the closest passages first. Falls back to the full record.

    Allowed options and guardrails are always included, whatever the ranking returns.
    """
    full = account_context(customer_id, conversation_text)
    profile = _profiles().get(customer_id)
    if not full or not profile or not question.strip():
        return full
    try:
        texts, vectors = _indexed(customer_id)
        query = nim_client.embed([question.strip()], input_type="query")[0]
    except Exception:
        logger.warning("NeMo embedding lookup failed for %s; using the full account record", customer_id)
        return full
    if not texts or not vectors:
        return full
    ranked = sorted(
        ((_cosine(query, list(vector)), text) for text, vector in zip(texts, vectors)),
        key=lambda item: item[0],
        reverse=True,
    )
    chosen = [text for _score, text in ranked[:limit]]
    decision = policy.decide(profile, conversation_text)
    return "\n".join(
        [
            "Retrieved from the verified account with nvidia/nemotron-3-embed-1b. Explain only these figures.",
            *chosen,
            *policy.option_lines(decision),
            *policy.rule_lines(decision),
            CLOSING_RULE,
        ]
    )
