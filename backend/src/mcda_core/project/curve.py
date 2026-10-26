"""Points to draw a criterion's value function, with the alternatives on it (S3)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..errors import McdaError
from .model import (
    LinearValueFunction,
    LogValueFunction,
    PiecewiseValueFunction,
    Project,
    TargetValueFunction,
)
from .pipeline import number_or_nan, prepare
from .values import value_scores

SAMPLES = 101
PADDING = 0.05


@dataclass(frozen=True)
class CurvePoint:
    alternative_id: str
    x: float
    value: float | None
    """None for excluded alternatives (they are not scored)."""


@dataclass(frozen=True)
class ValueCurve:
    criterion_id: str
    low: float
    high: float
    points: list[tuple[float, float]]
    alternatives: list[CurvePoint]


def value_curve(project: Project, criterion_id: str) -> ValueCurve:
    criterion = next((c for c in project.criteria if c.id == criterion_id), None)
    if criterion is None:
        raise McdaError("unknown_reference", target="criterion", id=criterion_id)
    vf = criterion.value_function
    if criterion.type != "numeric" or vf is None:
        raise McdaError("curve_needs_numeric")

    prepared = prepare(project)
    j = [c.id for c in project.criteria].index(criterion_id)
    eligible = {alternative_id: i for i, alternative_id in enumerate(prepared.eligible)}
    positions: list[CurvePoint] = []
    for alternative in project.alternatives:
        x = number_or_nan(project.raw(criterion_id, alternative.id))
        if np.isnan(x):
            continue  # nothing to place on the axis
        row = eligible.get(alternative.id)
        positions.append(CurvePoint(alternative.id, x, None if row is None else float(prepared.values[row, j])))

    eligible_xs = [p.x for p in positions if p.value is not None]
    data_range = (min(eligible_xs), max(eligible_xs)) if eligible_xs else None
    anchors = [p.x for p in positions] + _parameters(vf)
    low, high = (min(anchors), max(anchors)) if anchors else (0.0, 1.0)
    if high == low:
        low, high = low - 1.0, high + 1.0
    pad = (high - low) * PADDING
    low, high = low - pad, high + pad
    if isinstance(vf, LogValueFunction):
        low = max(low, 0.0)  # ln(1 + x) needs x >= 0
    xs = np.linspace(low, high, SAMPLES)
    values = value_scores(vf, xs, data_range)
    return ValueCurve(
        criterion_id=criterion_id,
        low=float(low),
        high=float(high),
        points=[(float(x), float(v)) for x, v in zip(xs, values, strict=True)],
        alternatives=positions,
    )


def _parameters(vf: object) -> list[float]:
    """x positions the function itself defines, so that they are always in view."""
    if isinstance(vf, (LinearValueFunction, LogValueFunction)) and vf.bounds != "data":
        return [float(b) for b in vf.bounds]
    if isinstance(vf, TargetValueFunction):
        return [vf.lower, vf.ideal_low, vf.ideal_high, vf.upper]
    if isinstance(vf, PiecewiseValueFunction):
        return [x for x, _ in vf.points]
    return []
