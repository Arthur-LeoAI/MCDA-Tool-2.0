"""Weights from groups and the three weighting methods (S4, technical design §3.2).

Each level (the groups, or the criteria of one group) turns its inputs into
local weights that sum to 1; a criterion's global weight is its group's
weight times its local weight. With groups, ungrouped criteria form an
implicit group whose id on the upper level is ``_root``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np

from ..errors import Location, ProblemValidationError, ValidationIssue
from .model import ROOT_LEVEL, LevelWeighting, Project

AHP_MAX_ITEMS = 10
AHP_MIN_VALUE, AHP_MAX_VALUE = 1 / 9, 9.0
CR_LIMIT = 0.1
# Saaty's random consistency index for n = 1 .. 10.
RANDOM_INDEX = (0.0, 0.0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49)
WORST_PAIRS = 3


@dataclass(frozen=True)
class AhpPair:
    i: str
    j: str
    given: float
    """How much more important i was judged than j."""
    implied: float
    """The ratio w_i / w_j of the resulting weights."""


@dataclass(frozen=True)
class AhpDiagnostics:
    cr: float
    lambda_max: float
    consistent: bool
    worst_pairs: tuple[AhpPair, ...]
    """Only when inconsistent: the judgements furthest from the weights."""


@dataclass(frozen=True)
class Level:
    key: str
    """"groups" or "within.<group id>"."""
    method: Literal["direct", "rank", "ahp"]
    items: tuple[str, ...]
    weights: tuple[float, ...]
    """Local weights aligned with ``items``; sum 1, or all 0 for an all-zero direct level."""
    ahp: AhpDiagnostics | None = None


@dataclass(frozen=True)
class Weights:
    levels: tuple[Level, ...]
    global_weights: dict[str, float]
    """Keyed by criterion id, in project order."""


def structure(project: Project) -> tuple[list[str] | None, dict[str, list[str]]]:
    """Upper-level items (None without groups) and the criteria of each lower level."""
    if not project.groups:
        return None, {ROOT_LEVEL: [c.id for c in project.criteria]}
    members: dict[str, list[str]] = {g.id: [] for g in project.groups}
    members[ROOT_LEVEL] = []
    for criterion in project.criteria:
        members[criterion.group_id if criterion.group_id in members else ROOT_LEVEL].append(criterion.id)
    members = {key: ids for key, ids in members.items() if ids}
    return list(members), members


def weighting_issues(project: Project) -> list[ValidationIssue]:
    """Problems with the methods' inputs (references are checked in validate.py)."""
    upper, lower = structure(project)
    issues: list[ValidationIssue] = []
    for key, items, level in _levels(project, upper, lower):
        issues += _level_issues(key, items, level, _names(project))
    return issues


def derive(project: Project) -> Weights:
    """Local and global weights. Raises ProblemValidationError for invalid inputs."""
    issues = weighting_issues(project)
    if issues:
        raise ProblemValidationError(issues)
    upper, lower = structure(project)
    levels = [_resolve(key, items, level) for key, items, level in _levels(project, upper, lower)]
    group_weight = dict(zip(levels[0].items, levels[0].weights, strict=True)) if upper is not None else {}
    global_weights: dict[str, float] = {}
    for level in levels[1:] if upper is not None else levels:
        factor = group_weight[level.key.removeprefix("within.")] if upper is not None else 1.0
        for item, weight in zip(level.items, level.weights, strict=True):
            global_weights[item] = factor * weight
    return Weights(tuple(levels), {c.id: global_weights.get(c.id, 0.0) for c in project.criteria})


def _levels(project: Project, upper: list[str] | None, lower: dict[str, list[str]]):
    """Each level with its settings; a level without settings weighs its items equally."""
    weighting = project.weighting
    if upper is not None:
        yield "groups", upper, weighting.groups or _equal(upper)
    for key, items in lower.items():
        yield f"within.{key}", items, weighting.within.get(key) or _equal(items)


def _equal(items: list[str]) -> LevelWeighting:
    return LevelWeighting(weights=dict.fromkeys(items, 1.0))


def _names(project: Project) -> dict[str, str]:
    names = {g.id: g.name for g in project.groups} | {c.id: c.name for c in project.criteria}
    return names | {ROOT_LEVEL: ROOT_LEVEL}


def _level_issues(key: str, items: list[str], level: LevelWeighting, names: dict[str, str]) -> list[ValidationIssue]:
    where = Location("field", ref=f"weighting.{key}")
    issues: list[ValidationIssue] = []
    if level.method == "rank":
        seen: set[str] = set()
        for id_ in (id_ for tie in level.order for id_ in tie):
            if id_ in seen:
                issues.append(ValidationIssue("weighting_duplicate", {"item": names.get(id_, id_)}, where))
            seen.add(id_)
    if level.method == "ahp" and len(items) > 1:
        if len(items) > AHP_MAX_ITEMS:
            return [ValidationIssue("ahp_too_many_items", {"count": len(items), "maximum": AHP_MAX_ITEMS}, where)]
        for pair, value in level.comparisons.items():
            i, _, j = pair.partition("|")
            reverse = f"{j}|{i}" in level.comparisons
            if not AHP_MIN_VALUE - 1e-9 <= value <= AHP_MAX_VALUE + 1e-9 or (reverse and i < j):
                params = {"i": names.get(i, i), "j": names.get(j, j), "value": value}
                issues.append(ValidationIssue("ahp_value_invalid", params, where))
        for a, i in enumerate(items):
            for j in items[a + 1 :]:
                if f"{i}|{j}" not in level.comparisons and f"{j}|{i}" not in level.comparisons:
                    issues.append(ValidationIssue("ahp_incomplete", {"i": names[i], "j": names[j]}, where))
    return issues


def _resolve(key: str, items: list[str], level: LevelWeighting) -> Level:
    if len(items) == 1:
        return Level(key, level.method, (items[0],), (1.0,))
    if level.method == "rank":
        weights = rank_weights(items, level.order, level.formula)
        return Level(key, "rank", tuple(items), tuple(weights))
    if level.method == "ahp":
        weights, diagnostics = ahp_weights(items, level.comparisons)
        return Level(key, "ahp", tuple(items), tuple(weights), diagnostics)
    raw = np.array([max(level.weights.get(i, 0.0), 0.0) for i in items])
    total = raw.sum()
    return Level(key, "direct", tuple(items), tuple(float(w) for w in (raw / total if total > 0 else raw)))


def rank_weights(items: list[str], order: list[list[str]], formula: str) -> list[float]:
    """ROC or rank-sum weights; ties share the mean of their ranks' weights, unranked items tie last."""
    known = set(items)
    ties = [[i for i in tie if i in known] for tie in order]
    placed = {i for tie in ties for i in tie}
    ties = [tie for tie in ties if tie] + ([rest] if (rest := [i for i in items if i not in placed]) else [])
    n = len(items)
    by_rank = (
        [sum(1 / k for k in range(r, n + 1)) / n for r in range(1, n + 1)]
        if formula == "roc"
        else [2 * (n + 1 - r) / (n * (n + 1)) for r in range(1, n + 1)]
    )
    weight: dict[str, float] = {}
    rank = 0
    for tie in ties:
        share = sum(by_rank[rank : rank + len(tie)]) / len(tie)
        weight |= dict.fromkeys(tie, share)
        rank += len(tie)
    return [weight[i] for i in items]


def ahp_weights(items: list[str], comparisons: dict[str, float]) -> tuple[list[float], AhpDiagnostics]:
    """Principal eigenvector of the reciprocal matrix, with Saaty's consistency ratio."""
    n = len(items)
    a = np.ones((n, n))
    for p, i in enumerate(items):
        for q, j in enumerate(items):
            if p != q:
                a[p, q] = comparisons[f"{i}|{j}"] if f"{i}|{j}" in comparisons else 1 / comparisons[f"{j}|{i}"]
    w = np.full(n, 1 / n)
    for _ in range(1000):
        nxt = a @ w
        nxt /= nxt.sum()
        if np.abs(nxt - w).max() < 1e-12:
            w = nxt
            break
        w = nxt
    lambda_max = float((a @ w / w).mean())
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0
    cr = max(ci / RANDOM_INDEX[n - 1], 0.0) if n > 2 else 0.0
    consistent = cr <= CR_LIMIT
    worst: list[AhpPair] = []
    if not consistent:
        errors = [(abs(math.log(a[p, q] * w[q] / w[p])), p, q) for p in range(n) for q in range(p + 1, n)]
        for _, p, q in sorted(errors, reverse=True)[:WORST_PAIRS]:
            worst.append(AhpPair(items[p], items[q], float(a[p, q]), float(w[p] / w[q])))
    return [float(x) for x in w], AhpDiagnostics(cr, lambda_max, consistent, tuple(worst))
