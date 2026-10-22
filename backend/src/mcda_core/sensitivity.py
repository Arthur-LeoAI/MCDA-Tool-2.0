"""One-at-a-time weight stability intervals for the weighted sum.

For criterion j, its weight t = w_j is varied while all other weights stay
fixed (not renormalised). Each score is then linear in t:

    S_i(t) = a_i + t * b_i,   a_i = sum_{k != j} w_k x_ik,   b_i = x_ij

The stability interval is the range of t around the current weight in
which the ranking does not change: every alternative pair (full order) or
every pair involving the current winner (top 1). It ends at the nearest
weight where two such score lines cross, and never goes below 0.

As a share of the total weight, t corresponds to t / (t + sum_{k != j} w_k);
that is the "normalised" interval. This matches the "Stability Interval"
sheets of the legacy V7 workbooks.

Tied alternatives whose lines are not parallel are separated by any change
of weight, so a tie collapses the interval to the current weight.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np

from .model import DecisionProblem
from .normalization import Bounds, Normalization, normalize
from .ranking import DEFAULT_TIE_TOLERANCE, rank_scores, scores_tied


class StabilityScope(str, Enum):
    FULL_ORDER = "full_order"
    TOP1 = "top1"


@dataclass(frozen=True)
class WeightInterval:
    criterion: str
    weight: float
    lower: float
    upper: float  # math.inf when the weight can grow without bound
    lower_normalized: float
    upper_normalized: float


def weight_stability_intervals(
    problem: DecisionProblem,
    scope: StabilityScope = StabilityScope.FULL_ORDER,
    normalization: Normalization = Normalization.MIN_MAX,
    bounds: Bounds = (0.0, 100.0),
    tol: float = DEFAULT_TIE_TOLERANCE,
) -> list[WeightInterval]:
    scope = StabilityScope(scope)
    values = normalize(problem.matrix, problem.directions, normalization, bounds)
    weights = problem.weights
    scores = values @ weights
    n = len(problem.alternatives)

    if scope is StabilityScope.FULL_ORDER:
        pairs = [(i, k) for i in range(n) for k in range(i + 1, n)]
    else:
        winners = np.flatnonzero(rank_scores(scores, tol=tol) == 1)
        pairs = [(int(i), k) for i in winners for k in range(n) if k != i and not (k in winners and k < i)]

    intervals = []
    for j, criterion in enumerate(problem.criteria):
        current = weights[j]
        slope = values[:, j]
        intercept = scores - current * slope
        lower, upper = 0.0, math.inf
        for i, k in pairs:
            slope_gap = slope[i] - slope[k]
            if slope_gap == 0:
                continue  # parallel lines never cross
            if scores_tied(scores[i], scores[k], tol):
                lower, upper = current, current
                break
            crossing = (intercept[k] - intercept[i]) / slope_gap
            if crossing > current:
                upper = min(upper, crossing)
            else:
                lower = max(lower, crossing)

        rest = weights.sum() - current
        intervals.append(WeightInterval(
            criterion=criterion.name,
            weight=float(current),
            lower=float(lower),
            upper=float(upper),
            lower_normalized=_share(lower, rest),
            upper_normalized=_share(upper, rest),
        ))
    return intervals


def _share(weight: float, rest: float) -> float:
    if math.isinf(weight) or weight + rest == 0:
        return 1.0
    return float(weight / (weight + rest))
