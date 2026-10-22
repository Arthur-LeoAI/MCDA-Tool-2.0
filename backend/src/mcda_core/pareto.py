"""Pareto dominance between alternatives (independent of weights)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from .model import DecisionProblem, Direction


@dataclass(frozen=True)
class DominanceInfo:
    alternative: str
    dominates: tuple[str, ...]
    dominated_by: tuple[str, ...]

    @property
    def is_pareto_optimal(self) -> bool:
        return not self.dominated_by


def pareto_analysis(problem: DecisionProblem, criteria: Sequence[str] | None = None) -> list[DominanceInfo]:
    """A dominates B when A is at least as good on every criterion and
    strictly better on at least one. ``criteria`` limits the comparison to
    a subset (default: all criteria)."""
    names = problem.criterion_names
    selected = list(range(len(names))) if criteria is None else [names.index(c) for c in criteria]
    sign = np.array([-1.0 if problem.directions[j] is Direction.COST else 1.0 for j in selected])
    oriented = problem.matrix[:, selected] * sign  # higher is better everywhere

    n = len(problem.alternatives)
    dominates = [
        [k for k in range(n) if k != i and (oriented[i] >= oriented[k]).all() and (oriented[i] > oriented[k]).any()]
        for i in range(n)
    ]
    return [
        DominanceInfo(
            alternative=problem.alternatives[i],
            dominates=tuple(problem.alternatives[k] for k in dominates[i]),
            dominated_by=tuple(problem.alternatives[k] for k in range(n) if i in dominates[k]),
        )
        for i in range(n)
    ]


def pareto_front(problem: DecisionProblem, criteria: Sequence[str] | None = None) -> tuple[str, ...]:
    return tuple(info.alternative for info in pareto_analysis(problem, criteria) if info.is_pareto_optimal)
