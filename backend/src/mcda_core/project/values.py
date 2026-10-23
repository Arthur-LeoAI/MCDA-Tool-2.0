"""Value functions: raw criterion values to value scores in [0, 1] (technical design §3.1)."""

from __future__ import annotations

import numpy as np

from ..model import Direction
from .model import (
    LinearValueFunction,
    LogValueFunction,
    PiecewiseValueFunction,
    TargetValueFunction,
    ValueFunction,
)


def value_scores(vf: ValueFunction, x: np.ndarray, data_range: tuple[float, float] | None = None) -> np.ndarray:
    """Scores for raw values ``x`` (NaN stays NaN).

    ``data_range`` is (min, max) of the values of the eligible alternatives,
    used when a linear or log function has ``bounds="data"``.
    """
    x = np.asarray(x, dtype=float)
    if isinstance(vf, (LinearValueFunction, LogValueFunction)):
        low, high = _bounds(vf.bounds, data_range)
        if isinstance(vf, LogValueFunction):
            x, low, high = np.log1p(x), float(np.log1p(low)), float(np.log1p(high))
        if high == low:
            # Every alternative is equal on this criterion: it cannot discriminate.
            return np.where(np.isnan(x), np.nan, 1.0)
        scaled = (x - low) / (high - low)
        if vf.direction is Direction.COST:
            scaled = 1.0 - scaled
        return np.clip(scaled, 0.0, 1.0)
    if isinstance(vf, TargetValueFunction):
        return _target(vf, x)
    assert isinstance(vf, PiecewiseValueFunction)
    return _piecewise(vf.points, x)


def _bounds(bounds: object, data_range: tuple[float, float] | None) -> tuple[float, float]:
    if bounds == "data":
        if data_range is None:
            return (0.0, 0.0)
        return data_range
    low, high = bounds  # type: ignore[misc]
    return float(low), float(high)


def _target(vf: TargetValueFunction, x: np.ndarray) -> np.ndarray:
    """Trapezoid; a ramp of zero width (e.g. lower == ideal_low) is a step."""
    with np.errstate(divide="ignore", invalid="ignore"):
        rising = np.where(vf.ideal_low > vf.lower, (x - vf.lower) / (vf.ideal_low - vf.lower), 1.0)
        falling = np.where(vf.upper > vf.ideal_high, (vf.upper - x) / (vf.upper - vf.ideal_high), 1.0)
    result = np.where(x < vf.ideal_low, rising, np.where(x <= vf.ideal_high, 1.0, falling))
    result = np.where((x < vf.lower) | (x > vf.upper), 0.0, result)
    return np.where(np.isnan(x), np.nan, np.clip(result, 0.0, 1.0))


def _piecewise(points: list[tuple[float, float]], x: np.ndarray) -> np.ndarray:
    xs = np.array([p[0] for p in points], dtype=float)
    vs = np.array([p[1] for p in points], dtype=float)
    # x values are strictly increasing (validated); np.interp is constant beyond the end points.
    result = np.interp(x, xs, vs)
    return np.where(np.isnan(x), np.nan, np.clip(result, 0.0, 1.0))
