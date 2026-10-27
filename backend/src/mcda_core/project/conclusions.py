"""Structured conclusion points from the weighted sum (S6, technical design §3.4, ADR 0007).

The client turns these points into sentences with fixed templates; nothing
here produces prose. Only the weighted sum is additive, so advantages and
disadvantages split exactly into criterion contributions.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..methods import MethodResult
from .pipeline import PreparedProject
from .weighting import CR_LIMIT, derive

TOP = 3


@dataclass(frozen=True)
class Placed:
    alternative_id: str
    score: float
    """Weighted sum on the 0-100 scale."""


@dataclass(frozen=True)
class Share:
    criterion_id: str
    points: float
    """Points on the 0-100 scale."""


@dataclass(frozen=True)
class Caveat:
    code: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Conclusion:
    winner: Placed
    runner_up: Placed
    score_gap: float
    tied: tuple[str, ...]
    """Alternatives tied with the winner (the winner itself not included)."""
    top_contributions: tuple[Share, ...]
    advantages: tuple[Share, ...]
    disadvantages: tuple[Share, ...]
    caveats: tuple[Caveat, ...]


def conclude(
    prepared: PreparedProject,
    weighted_sum: MethodResult,
    others: Sequence[tuple[str, MethodResult]] = (),
) -> Conclusion:
    """``others`` pairs a label with the result of every other method that was run."""
    project = prepared.project
    eligible = list(prepared.eligible)
    criterion_ids = [c.id for c in project.criteria]
    names = {a.id: a.name for a in project.alternatives} | {c.id: c.name for c in project.criteria}
    contributions = prepared.values * prepared.weights * 100  # [i, j]

    order = np.argsort(weighted_sum.ranks, kind="stable")
    best, second = int(order[0]), int(order[1])
    first_place = [i for i in order if weighted_sum.ranks[i] == 1]
    scores = contributions.sum(axis=1)

    def shares(row: np.ndarray, keep) -> tuple[Share, ...]:
        picked = [j for j in np.argsort(-np.abs(row), kind="stable") if keep(row[j])][:TOP]
        return tuple(Share(criterion_ids[j], float(row[j])) for j in picked)

    difference = contributions[best] - contributions[second]
    return Conclusion(
        winner=Placed(eligible[best], float(scores[best])),
        runner_up=Placed(eligible[second], float(scores[second])),
        score_gap=float(scores[best] - scores[second]),
        tied=tuple(eligible[i] for i in first_place if i != best),
        top_contributions=shares(contributions[best], lambda v: v > 1e-9),
        advantages=shares(difference, lambda v: v > 1e-9),
        disadvantages=shares(difference, lambda v: v < -1e-9),
        caveats=tuple(_caveats(prepared, eligible[best], first_place, others, names)),
    )


def _caveats(
    prepared: PreparedProject,
    winner: str,
    first_place: list[int],
    others: Sequence[tuple[str, MethodResult]],
    names: dict[str, str],
) -> list[Caveat]:
    project = prepared.project
    caveats: list[Caveat] = []
    if len(first_place) > 1:
        tied = ", ".join(names[prepared.eligible[i]] for i in first_place)
        caveats.append(Caveat("caveat_tied_first", {"alternatives": tied}))
    if prepared.excluded:
        caveats.append(Caveat("caveat_excluded", {"count": len(prepared.excluded)}))
    if prepared.imputed:
        criteria = list(dict.fromkeys(names[i.criterion_id] for i in prepared.imputed))
        params = {"count": len(prepared.imputed), "criteria": ", ".join(criteria)}
        caveats.append(Caveat("caveat_imputed", params))
    for j, criterion in enumerate(project.criteria):
        column = prepared.values[:, j]
        if prepared.weights[j] > 0 and np.ptp(column) <= 1e-12:
            caveats.append(Caveat("caveat_constant", {"criterion": criterion.name}))
    groups = {g.id: g.name for g in project.groups}
    for level in derive(project).levels:
        if level.ahp is None or level.ahp.cr <= CR_LIMIT:
            continue
        cr = round(level.ahp.cr, 3)
        key = level.key.removeprefix("within.")
        if level.key == "groups":
            caveats.append(Caveat("caveat_ahp_inconsistent_groups", {"cr": cr}))
        elif key in groups:
            caveats.append(Caveat("caveat_ahp_inconsistent", {"group": groups[key], "cr": cr}))
        else:  # the ungrouped criteria
            caveats.append(Caveat("caveat_ahp_inconsistent_criteria", {"cr": cr}))
    disagree = [label for label, result in others if winner not in _first(result, prepared.eligible)]
    if disagree:
        caveats.append(Caveat("caveat_methods_disagree", {"methods": ", ".join(disagree)}))
    return caveats


def _first(result: MethodResult, eligible: Sequence[str]) -> set[str]:
    return {eligible[int(i)] for i in np.flatnonzero(result.ranks == 1)}
