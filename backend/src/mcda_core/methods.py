"""MCDA scoring methods: weighted sum, TOPSIS and compromise programming."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .model import DecisionProblem, Direction
from .normalization import Bounds, Normalization, normalize
from .ranking import rank_scores


@dataclass(frozen=True)
class MethodResult:
    method: str
    alternatives: tuple[str, ...]
    scores: np.ndarray
    higher_is_better: bool
    ranks: np.ndarray
    contributions: np.ndarray | None = None
    """Additive methods only: [i, j] is criterion j's share of alternative i's score."""

    @classmethod
    def from_scores(
        cls,
        method: str,
        problem: DecisionProblem,
        scores: np.ndarray,
        higher_is_better: bool,
        contributions: np.ndarray | None = None,
    ) -> MethodResult:
        ranks = rank_scores(scores, higher_is_better)
        return cls(method, problem.alternatives, scores, higher_is_better, ranks, contributions)

    @property
    def order(self) -> tuple[str, ...]:
        """Alternatives best first; ties keep their input order."""
        return tuple(self.alternatives[i] for i in np.argsort(self.ranks, kind="stable"))

    def score_of(self, alternative: str) -> float:
        return float(self.scores[self.alternatives.index(alternative)])

    def rank_of(self, alternative: str) -> int:
        return int(self.ranks[self.alternatives.index(alternative)])


def weighted_sum(
    problem: DecisionProblem,
    normalization: Normalization = Normalization.MIN_MAX,
    bounds: Bounds = (0.0, 100.0),
) -> MethodResult:
    """Simple additive weighting: sum of weight x normalised value. Higher is better."""
    normalized = normalize(problem.matrix, problem.directions, normalization, bounds)
    contributions = normalized * problem.normalized_weights
    scores = contributions.sum(axis=1)
    return MethodResult.from_scores("weighted_sum", problem, scores, higher_is_better=True, contributions=contributions)


def topsis(
    problem: DecisionProblem,
    normalization: Normalization = Normalization.VECTOR,
    bounds: Bounds = (0.0, 100.0),
) -> MethodResult:
    """TOPSIS (Hwang & Yoon): relative closeness to the ideal solution, in [0, 1].

    The ideal and anti-ideal points are the best and worst weighted values
    observed per criterion. With ``FIXED_RANGE`` they are the bounds instead,
    so scores do not depend on which other alternatives are present.
    Higher is better.
    """
    weights = problem.normalized_weights
    normalization = Normalization(normalization)
    if normalization is Normalization.VECTOR:
        norms = np.linalg.norm(problem.matrix, axis=0)
        weighted = np.divide(problem.matrix, norms, out=np.zeros_like(problem.matrix), where=norms > 0) * weights
        is_cost = np.array([d is Direction.COST for d in problem.directions])
        ideal = np.where(is_cost, weighted.min(axis=0), weighted.max(axis=0))
        anti_ideal = np.where(is_cost, weighted.max(axis=0), weighted.min(axis=0))
    else:
        weighted = normalize(problem.matrix, problem.directions, normalization, bounds) * weights
        if normalization is Normalization.FIXED_RANGE:
            ideal, anti_ideal = weights, np.zeros_like(weights)
        else:
            ideal, anti_ideal = weighted.max(axis=0), weighted.min(axis=0)

    to_ideal = np.linalg.norm(weighted - ideal, axis=1)
    to_anti_ideal = np.linalg.norm(weighted - anti_ideal, axis=1)
    total = to_ideal + to_anti_ideal
    # total == 0 only when ideal == anti-ideal, i.e. every alternative is
    # identical on all weighted criteria: call them all equally close.
    scores = np.divide(to_anti_ideal, total, out=np.full_like(total, 0.5), where=total > 0)
    return MethodResult.from_scores("topsis", problem, scores, higher_is_better=True)


def compromise_programming(
    problem: DecisionProblem,
    p: float = 2.0,
    normalization: Normalization = Normalization.MIN_MAX,
    bounds: Bounds = (0.0, 100.0),
) -> MethodResult:
    """Compromise programming (Zeleny): weighted L_p distance to the ideal point.

    L_p = (sum_j (w_j * d_j)^p)^(1/p), where d_j = (best_j - x_j) / (best_j - worst_j)
    is the normalised regret on criterion j. ``p = math.inf`` gives the
    largest weighted regret (Chebyshev). Lower is better.
    """
    normalization = Normalization(normalization)
    if normalization not in (Normalization.MIN_MAX, Normalization.FIXED_RANGE):
        raise ValueError("compromise programming needs min_max or fixed_range normalization")
    if not p >= 1:
        raise ValueError(f"p must be >= 1 (or math.inf), got {p}")
    regret = 1.0 - normalize(problem.matrix, problem.directions, normalization, bounds)
    weighted = regret * problem.normalized_weights
    scores = weighted.max(axis=1) if math.isinf(p) else (weighted**p).sum(axis=1) ** (1.0 / p)
    return MethodResult.from_scores("compromise_programming", problem, scores, higher_is_better=False)
