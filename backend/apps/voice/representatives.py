"""Local representative lookup.

There is no verified dealer or TFS employee directory in this repository.
This adapter never invents names, phone numbers, or availability.
"""

from __future__ import annotations

from typing import Any


def find_local(*, zip_code: str = "", city: str = "", category: str = "") -> dict[str, Any]:
    del category
    place = (zip_code or city or "").strip()
    return {
        "configured": False,
        "query": place or None,
        "results": [],
        "note": (
            "No verified Toyota Financial Services branch or dealership directory is connected. "
            "A specialist request can be recorded, but it will not be labeled as a booked visit "
            "with a named representative."
        ),
    }


def describe(place: str | None) -> dict[str, str]:
    text = (place or "").strip()
    if not text:
        return {"label": "", "organization": ""}
    return {
        "label": f"Preferred area: {text} (unverified — customer stated)",
        "organization": "Toyota Financial Services specialist review (not a named local employee)",
    }
