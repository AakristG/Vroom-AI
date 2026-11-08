"""Validated shapes for the CarsXE responses we read. Unknown fields are ignored.

Field names follow https://docs.carsxe.com (YMM Options, Year Make Model, Vehicle Images, Market Value).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class YmmOptionsResponse(_Loose):
    success: bool = False
    years: list[int | str] | None = None
    makes: list[str] | None = None
    models: list[str] | None = None
    variants: list[str] | None = None
    trims: list[str] | None = None
    message: str | None = None


class FeatureItem(_Loose):
    name: str
    value: str | None = None

    @field_validator("value", mode="before")
    @classmethod
    def _stringify(cls, v: Any) -> str | None:
        if v is None or v == "":
            return None
        return str(v)


class FeatureGroup(_Loose):
    category: str = ""
    features: list[FeatureItem] = []


class Features(_Loose):
    standard: list[FeatureGroup] = []


class YmmMatch(_Loose):
    make: str | None = None
    model: str | None = None
    year: int | str | None = None
    trim_id: str | None = None
    name: str | None = None
    base_msrp: float | None = None
    base_invoice: float | None = None
    total_seating: int | None = None
    features: Features | None = None

    @field_validator("base_msrp", "base_invoice", "total_seating", mode="before")
    @classmethod
    def _numberish(cls, v: Any) -> Any:
        if v in (None, "", "N/A"):
            return None
        return v


class YmmResponse(_Loose):
    success: bool = False
    bestMatch: YmmMatch | None = None
    trimOptions: list[YmmMatch] = []
    match_exact: bool | None = None


class ImageItem(_Loose):
    link: str
    contextLink: str | None = None
    thumbnailLink: str | None = None
    width: int | str | None = None
    height: int | str | None = None


class ImagesResponse(_Loose):
    success: bool = False
    images: list[ImageItem] = []


class _Priced(_Loose):
    model_config = ConfigDict(extra="allow")


class MarketValueResponse(_Loose):
    success: bool = False
    trade_in_clean: _Priced | None = None
    retail_clean: _Priced | None = None
