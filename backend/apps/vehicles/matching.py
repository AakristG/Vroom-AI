"""Deterministic Toyota model-name matching between NHTSA and the bundled photo manifest.

Never silently attach a Camry image to a Corolla. Powertrain suffixes (Hybrid, Prime)
are treated as a generation-level match of the same nameplate, not an exact trim match.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Literal

ImageMatch = Literal["exact", "generation", "unavailable"]

# Spelling / punctuation only. Not powertrain or body-style guesses.
SPELLING_ALIASES = {
    "gr86": "86",
    "gr 86": "86",
    "toyota 86": "86",
    "gt86": "86",
    "grsupra": "supra",
    "gr supra": "supra",
    "bz4x": "bz4x",
    "bz 4x": "bz4x",
    "b z 4 x": "bz4x",
    "c-hr": "chr",
    "c hr": "chr",
    "chr": "chr",
    "c-hr+": "chr",
    "rav 4": "rav4",
    "rav-4": "rav4",
    "4 runner": "4runner",
    "landcruiser": "land cruiser",
    "land cruiser": "land cruiser",
    "corolla cross": "corolla cross",
    "grand highlander": "grand highlander",
    "crown signia": "crown signia",
    "prius prime": "prius prime",
    "prius plug in hybrid": "prius prime",
    "prius plug-in hybrid": "prius prime",
    "prius plugin hybrid": "prius prime",
    "rav4 prime": "rav4 prime",
    "rav4 plug in hybrid": "rav4 prime",
    "rav4 plug-in hybrid": "rav4 prime",
}

_POWERTRAIN = re.compile(
    r"\b(hybrid|hev|phev|plug[- ]?in(?: hybrid)?|prime|awd|4wd|fwd|rwd|le|xle|se|xse|limited|platinum|trd|pro|sr5|nightshade)\b"
)
_STRIP = re.compile(r"[^a-z0-9+]+")


def normalize(name: str) -> str:
    text = (name or "").strip().lower()
    text = text.replace("toyota", " ")
    text = text.replace("&", " and ")
    text = _STRIP.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def canonical(name: str) -> str:
    key = normalize(name)
    return SPELLING_ALIASES.get(key, key)


def base_nameplate(name: str) -> str:
    """Drop powertrain/trim tokens after spelling aliases. Used only for generation matching."""
    text = canonical(name)
    text = _POWERTRAIN.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass(frozen=True)
class Match:
    slug: str | None
    name: str | None
    confidence: ImageMatch


def match_model(nhtsa_name: str, catalog: Iterable[dict]) -> Match:
    """catalog items are {slug, name} entries."""
    wanted = canonical(nhtsa_name)
    if not wanted:
        return Match(None, None, "unavailable")

    entries = [(canonical(item.get("name") or ""), str(item.get("slug") or ""), str(item.get("name") or "")) for item in catalog]
    for key, slug, name in entries:
        if key == wanted:
            return Match(slug, name, "exact")

    wanted_base = base_nameplate(nhtsa_name)
    generation_hits = [(slug, name) for key, slug, name in entries if base_nameplate(name) == wanted_base and wanted_base]
    if len(generation_hits) == 1:
        slug, name = generation_hits[0]
        return Match(slug, name, "generation")
    return Match(None, None, "unavailable")
