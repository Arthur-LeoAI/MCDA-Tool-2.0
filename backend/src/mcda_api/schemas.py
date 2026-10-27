"""Shared response models for the HTTP API: method descriptions and the error shape."""

from __future__ import annotations

import math
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from mcda_core import WeightInterval
from mcda_core.errors import LocationKind

MAX_CRITERIA = 200

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
BoundsIn = (
    tuple[FiniteFloat, FiniteFloat] | Annotated[list[tuple[FiniteFloat, FiniteFloat]], Field(max_length=MAX_CRITERIA)]
)


# --- Methods -----------------------------------------------------------------


class WeightedSumSpec(BaseModel):
    method: Literal["weighted_sum"] = "weighted_sum"
    normalization: Literal["min_max", "fixed_range", "none"] = "min_max"
    bounds: BoundsIn = (0.0, 100.0)


class TopsisSpec(BaseModel):
    method: Literal["topsis"] = "topsis"
    normalization: Literal["vector", "min_max", "fixed_range", "none"] = "vector"
    bounds: BoundsIn = (0.0, 100.0)


class CompromiseProgrammingSpec(BaseModel):
    method: Literal["compromise_programming"] = "compromise_programming"
    p: Annotated[float, Field(ge=1, allow_inf_nan=False)] | Literal["inf"] = 2.0
    normalization: Literal["min_max", "fixed_range"] = "min_max"
    bounds: BoundsIn = (0.0, 100.0)


METHOD_SPECS = (WeightedSumSpec, TopsisSpec, CompromiseProgrammingSpec)
"""Described by ``GET /methods``: each method's normalisation options and default parameters."""


class MethodInfo(BaseModel):
    method: str
    higher_is_better: bool
    normalizations: list[str]
    default_normalization: str
    parameters: dict[str, object]


# --- Sensitivity -------------------------------------------------------------


class IntervalModel(BaseModel):
    criterion: str
    weight: float
    lower: float
    upper: float | None
    """None when the weight can grow without changing the ranking."""
    lower_share: float
    upper_share: float
    """Bounds as a share of the total weight (0-1)."""

    @classmethod
    def build(cls, interval: WeightInterval) -> IntervalModel:
        return cls(
            criterion=interval.criterion,
            weight=interval.weight,
            lower=interval.lower,
            upper=None if math.isinf(interval.upper) else interval.upper,
            lower_share=interval.lower_normalized,
            upper_share=interval.upper_normalized,
        )


# --- Errors ------------------------------------------------------------------


class LocationModel(BaseModel):
    """Where an issue is; which fields are set depends on ``kind``.

    cell: ``ref`` ("B4") · alternative/criterion/group: ``name`` or 1-based ``index`` ·
    constraint: id in ``ref`` ·
    value: ``alternative`` + ``criterion`` · row: 1-based ``index`` ·
    field: request path in ``ref`` ("data.c1.a1")
    """

    kind: LocationKind
    ref: str | None = None
    name: str | None = None
    index: int | None = None
    alternative: str | None = None
    criterion: str | None = None


class IssueModel(BaseModel):
    code: str
    params: dict[str, Any] = {}
    location: LocationModel | None
    message: str
    """English fallback; clients should translate ``code`` with ``params``."""


class ErrorResponse(BaseModel):
    code: str
    detail: str
    """English fallback; clients should translate ``code`` with ``params``."""
    params: dict[str, Any] = {}
    issues: list[IssueModel] = []
    request_id: str | None = None
