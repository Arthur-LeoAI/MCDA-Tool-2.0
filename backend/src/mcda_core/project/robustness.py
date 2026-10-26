"""Robustness of the weighted-sum ranking under uncertain weights (S5, technical design §3.3).

The value matrix stays fixed; only the global criterion weights are sampled,
either around the current weights (log-normal noise) or uniformly over all
weight combinations (Dirichlet(1, ..., 1)). Criteria weighted 0 stay at 0.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from ..errors import McdaError
from ..ranking import DEFAULT_TIE_TOLERANCE, rank_scores
from .model import RobustnessSettings
from .pipeline import PreparedProject

# Comparisons per batch (samples x alternatives x alternatives), to bound memory.
BATCH_CELLS = 2_000_000
HIGH, MEDIUM = 0.8, 0.5

Level = Literal["high", "medium", "low"]


@dataclass(frozen=True)
class Confidence:
    alternative_id: str
    """The alternative ranked first with the current weights."""
    p_best: float
    level: Level


@dataclass(frozen=True)
class Robustness:
    settings: RobustnessSettings
    alternative_ids: tuple[str, ...]
    """Eligible alternatives, best mean rank first."""
    rank_probabilities: np.ndarray
    """[i, r]: share of samples in which alternative i has rank r + 1."""
    p_best: np.ndarray
    mean_rank: np.ndarray
    wins: np.ndarray
    """[i, j]: share of samples in which i scores clearly higher than j."""
    confidence: Confidence


def sample_weights(weights: np.ndarray, settings: RobustnessSettings, rng: np.random.Generator) -> np.ndarray:
    """``settings.samples`` weight vectors (rows sum to 1); zero weights stay zero."""
    active = weights > 0
    n = int(active.sum())
    samples = np.zeros((settings.samples, len(weights)))
    if settings.mode == "unknown":
        samples[:, active] = rng.dirichlet(np.ones(n), size=settings.samples)
    else:
        noise = np.exp(settings.spread * rng.standard_normal((settings.samples, n)))
        drawn = weights[active] * noise
        samples[:, active] = drawn / drawn.sum(axis=1, keepdims=True)
    return samples


def robustness(prepared: PreparedProject) -> Robustness:
    settings = prepared.project.analysis.robustness
    weights = prepared.weights
    if not (weights > 0).any():
        raise McdaError("no_positive_weight")
    values = prepared.values
    m = values.shape[0]
    rng = np.random.default_rng(settings.seed)
    samples = sample_weights(weights, settings, rng)

    rank_counts = np.zeros((m, m), dtype=np.int64)
    win_counts = np.zeros((m, m), dtype=np.int64)
    batch = max(1, BATCH_CELLS // (m * m))
    rows = np.arange(m)
    for start in range(0, len(samples), batch):
        scores = samples[start : start + batch] @ values.T  # (b, m)
        # Scores lie in [0, 1], so the relative tie tolerance is an absolute one here.
        beats = scores[:, :, None] > scores[:, None, :] + DEFAULT_TIE_TOLERANCE  # [b, i, j]: i beats j
        win_counts += beats.sum(axis=0)
        ranks = 1 + beats.sum(axis=1)  # [b, j]: how many beat j
        rank_counts += np.bincount((rows * m + ranks - 1).ravel(), minlength=m * m).reshape(m, m)

    total = len(samples)
    probabilities = rank_counts / total
    mean_rank = probabilities @ np.arange(1, m + 1)
    order = np.argsort(mean_rank, kind="stable")
    eligible = np.array(prepared.eligible)

    current = rank_scores(values @ (weights / weights.sum()))
    winner = int(np.flatnonzero(current == 1)[0])
    p_winner = float(probabilities[winner, 0])
    level: Level = "high" if p_winner >= HIGH else "medium" if p_winner >= MEDIUM else "low"
    return Robustness(
        settings=settings,
        alternative_ids=tuple(str(i) for i in eligible[order]),
        rank_probabilities=probabilities[order],
        p_best=probabilities[order, 0],
        mean_rank=mean_rank[order],
        wins=(win_counts / total)[np.ix_(order, order)],
        confidence=Confidence(str(eligible[winner]), p_winner, level),
    )
