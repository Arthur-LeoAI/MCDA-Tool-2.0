"""Normalisation of the decision matrix to benefit-oriented scores.

After normalisation, higher is always better and (except for ``NONE``)
values lie in [0, 1], where 1 is the best value of the reference range.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import Enum

import numpy as np

from .model import Direction

Bounds = tuple[float, float] | Sequence[tuple[float, float]]


class Normalization(str, Enum):
    NONE = "none"
    """Use values as given; all criteria must be benefit criteria."""
    MIN_MAX = "min_max"
    """Linear scaling between the worst and best observed value."""
    FIXED_RANGE = "fixed_range"
    """Linear scaling between fixed bounds, e.g. 0-100 (the legacy scale)."""
    VECTOR = "vector"
    """x / ||x|| per criterion. Direction-neutral, so only TOPSIS uses it."""


def normalize(
    matrix: np.ndarray,
    directions: Sequence[Direction],
    method: Normalization = Normalization.MIN_MAX,
    bounds: Bounds = (0.0, 100.0),
) -> np.ndarray:
    matrix = np.asarray(matrix, dtype=float)
    is_cost = np.array([d is Direction.COST for d in directions])
    method = Normalization(method)

    if method is Normalization.NONE:
        if is_cost.any():
            raise ValueError("normalization 'none' needs benefit criteria only; use min_max or fixed_range for cost criteria")
        return matrix.copy()

    if method is Normalization.MIN_MAX:
        low, high = matrix.min(axis=0), matrix.max(axis=0)
    elif method is Normalization.FIXED_RANGE:
        low, high = _bounds_arrays(bounds, matrix.shape[1])
        outside = (matrix < low) | (matrix > high)
        if outside.any():
            i, j = np.argwhere(outside)[0]
            raise ValueError(
                f"{int(outside.sum())} value(s) lie outside the fixed range, "
                f"e.g. row {i}, column {j}: {matrix[i, j]} not in [{low[j]}, {high[j]}]"
            )
    else:
        raise ValueError("vector normalization does not orient cost criteria; it is only available through topsis()")

    span = high - low
    constant = span == 0
    with np.errstate(divide="ignore", invalid="ignore"):
        scaled = np.where(is_cost, high - matrix, matrix - low) / np.where(constant, 1.0, span)
    # A criterion on which every alternative is equal cannot discriminate;
    # give everyone the best score so it adds nothing to distances.
    scaled[:, constant] = 1.0
    return scaled


def _bounds_arrays(bounds: Bounds, n_criteria: int) -> tuple[np.ndarray, np.ndarray]:
    array = np.asarray(bounds, dtype=float)
    if array.shape == (2,):
        array = np.tile(array, (n_criteria, 1))
    if array.shape != (n_criteria, 2):
        raise ValueError(f"bounds must be (low, high) or one pair per criterion ({n_criteria})")
    low, high = array[:, 0], array[:, 1]
    if (high < low).any():
        raise ValueError("each bound needs low <= high")
    return low, high
