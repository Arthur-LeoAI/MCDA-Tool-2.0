"""Turning scores into ranks, with explicit tie handling."""

from __future__ import annotations

import numpy as np

# Scores closer than this (relative to their magnitude) count as a tie, so
# floating-point noise cannot decide between equivalent alternatives.
DEFAULT_TIE_TOLERANCE = 1e-9


def scores_tied(a: float, b: float, tol: float = DEFAULT_TIE_TOLERANCE) -> bool:
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))


def rank_scores(scores: np.ndarray, higher_is_better: bool = True, tol: float = DEFAULT_TIE_TOLERANCE) -> np.ndarray:
    """Competition ranking ("1224"): tied alternatives share the best rank.

    Returns an int array aligned with ``scores``; rank 1 is the best.
    """
    scores = np.asarray(scores, dtype=float)
    order = np.argsort(-scores if higher_is_better else scores, kind="stable")
    ranks = np.empty(len(scores), dtype=int)
    group_score: float | None = None
    group_rank = 0
    for position, index in enumerate(order, start=1):
        if group_score is None or not scores_tied(float(scores[index]), group_score, tol):
            group_score = float(scores[index])
            group_rank = position
        ranks[index] = group_rank
    return ranks
