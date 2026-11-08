"""Per-model Toyota photos bundled with the frontend (frontend/public/media/models/).

Every photo comes from Wikimedia Commons under a free license; model_photos.json records the
author, license, and source page so the UI can credit it. Photos are matched by nameplate,
not model year, so the generation shown can differ from the year being browsed.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .matching import base_nameplate, canonical

PROVIDER = "Wikimedia Commons"
URL_PREFIX = "/media/models/"
_MANIFEST = Path(__file__).with_name("model_photos.json")


@lru_cache(maxsize=1)
def _index() -> tuple[dict[str, dict], dict[str, dict]]:
    entries = json.loads(_MANIFEST.read_text(encoding="utf-8"))
    exact: dict[str, dict] = {}
    base: dict[str, dict] = {}
    for entry in entries.values():
        for name in entry["names"]:
            exact.setdefault(canonical(name), entry)
            base.setdefault(base_nameplate(name), entry)
    return exact, base


def credit(entry: dict) -> str:
    return f"Photo: {entry['author']}, {entry['license']}, via {PROVIDER}."


def photo_for(model: str) -> dict | None:
    """Image payload for an NHTSA or account model name, or None when no photo covers it."""
    exact, base = _index()
    entry = exact.get(canonical(model)) or base.get(base_nameplate(model))
    if not entry:
        return None
    url = URL_PREFIX + entry["file"]
    return {
        "url": url,
        "thumbnail": url,
        "views": {"front34": url},
        "match": "generation",
        "matched_name": entry["names"][0],
        "provider": PROVIDER,
        "source_page": entry["source_page"],
        "author": entry["author"],
        "license": entry["license"],
        "license_url": entry.get("license_url"),
        "license_filter": None,
        "license_note": (
            f"{credit(entry)} Representative photo of the {entry['names'][0]}; "
            "the generation or trim shown may differ from the selected model year. "
            "Not an official Toyota photograph."
        ),
        "expires_at": None,
    }
