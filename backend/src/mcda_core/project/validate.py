"""Rules that relate the parts of a project to each other.

Structure is checked by the Pydantic models; this module checks references,
consistency between a criterion's type and its settings, and the data
values. Every rule reports a coded issue with a location, and all issues
are collected so users can fix them in one pass.
"""

from __future__ import annotations

import itertools
import math
from collections.abc import Iterable
from typing import Literal

from ..errors import Location, ValidationIssue
from .model import (
    ROOT_LEVEL,
    BetweenConstraint,
    CompareConstraint,
    Criterion,
    InConstraint,
    LinearValueFunction,
    LogValueFunction,
    PiecewiseValueFunction,
    Project,
    TargetValueFunction,
)
from .weighting import weighting_issues


def project_issues(project: Project) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if len(project.alternatives) < 2:
        issues.append(ValidationIssue("too_few_alternatives", {"minimum": 2, "count": len(project.alternatives)}))
    if not project.criteria:
        issues.append(ValidationIssue("too_few_criteria", {"minimum": 1, "count": 0}))

    issues += _named("alternative", [(a.id, a.name) for a in project.alternatives])
    issues += _named("group", [(g.id, g.name) for g in project.groups])
    issues += _named("criterion", [(c.id, c.name) for c in project.criteria])

    group_ids = {g.id for g in project.groups}
    for position, criterion in enumerate(project.criteria, start=1):
        where = Location("criterion", name=criterion.name or None, index=None if criterion.name else position)
        if criterion.group_id is not None and criterion.group_id not in group_ids:
            issues.append(_unknown("group", criterion.group_id, where))
        issues += _criterion_settings(criterion, where)

    issues += _data_issues(project)
    issues += _constraint_issues(project)
    issues += _weighting_issues(project, group_ids)
    issues += weighting_issues(project)
    return issues


def _unknown(target: str, id_: str, where: Location | None) -> ValidationIssue:
    return ValidationIssue("unknown_reference", {"target": target, "id": id_}, where)


def _named(kind: Literal["alternative", "group", "criterion"], items: Iterable[tuple[str, str]]):
    issues: list[ValidationIssue] = []
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for position, (id_, name) in enumerate(items, start=1):
        if id_ in seen_ids:
            where = Location(kind, name=name or None, index=position)
            issues.append(ValidationIssue("duplicate_id", {"id": id_}, where))
        seen_ids.add(id_)
        if not name.strip():
            issues.append(ValidationIssue("empty_name", location=Location(kind, index=position)))
        elif name.strip() in seen_names:
            issues.append(ValidationIssue("duplicate_name", location=Location(kind, name=name)))
        else:
            seen_names.add(name.strip())
    return issues


def _criterion_settings(criterion: Criterion, where: Location) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if criterion.type == "numeric":
        vf = criterion.value_function
        if vf is None:
            return [ValidationIssue("value_function_missing", location=where)]
        reason = _value_function_problem(vf)
        if reason:
            issues.append(ValidationIssue("value_function_invalid", {"reason": reason}, where))
    elif criterion.type in ("ordinal", "categorical"):
        if not criterion.categories:
            return [ValidationIssue("categories_missing", location=where)]
        labels = [c.label for c in criterion.categories]
        if len(set(labels)) != len(labels):
            issues.append(ValidationIssue("categories_invalid", {"reason": "duplicate_label"}, where))
        if any(not 0 <= c.score <= 1 for c in criterion.categories):
            issues.append(ValidationIssue("categories_invalid", {"reason": "score_range"}, where))
    elif criterion.direction is None:  # boolean
        issues.append(ValidationIssue("direction_missing", location=where))
    return issues


def _value_function_problem(vf: object) -> str | None:
    if isinstance(vf, (LinearValueFunction, LogValueFunction)) and vf.bounds != "data":
        low, high = vf.bounds
        if not low < high:
            return "bounds_order"
        if isinstance(vf, LogValueFunction) and low < 0:
            return "log_bounds_negative"
    if isinstance(vf, TargetValueFunction) and not (
        vf.lower <= vf.ideal_low <= vf.ideal_high <= vf.upper and vf.lower < vf.upper
    ):
        return "target_order"
    if isinstance(vf, PiecewiseValueFunction):
        xs = [x for x, _ in vf.points]
        if any(a >= b for a, b in itertools.pairwise(xs)):
            return "points_order"
        if any(not 0 <= v <= 1 for _, v in vf.points):
            return "points_range"
    return None


def _data_issues(project: Project) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    criteria = {c.id: c for c in project.criteria}
    alternatives = {a.id: a for a in project.alternatives}
    for criterion_id, column in project.data.items():
        if criterion_id not in criteria:
            issues.append(_unknown("criterion", criterion_id, Location("field", ref=f"data.{criterion_id}")))
            continue
        for alternative_id in column:
            if alternative_id not in alternatives:
                ref = f"data.{criterion_id}.{alternative_id}"
                issues.append(_unknown("alternative", alternative_id, Location("field", ref=ref)))

    for criterion in project.criteria:
        labels = {c.label for c in criterion.categories or []}
        for alternative in project.alternatives:
            value = project.raw(criterion.id, alternative.id)
            where = Location("value", alternative=alternative.name, criterion=criterion.name)
            if value is None:
                if criterion.missing == "require":
                    issues.append(ValidationIssue("missing_value", location=where))
                continue
            if criterion.type == "numeric":
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    issues.append(ValidationIssue("value_not_number", {"value": str(value)}, where))
                elif isinstance(criterion.value_function, LogValueFunction) and value < 0:
                    issues.append(ValidationIssue("log_negative_value", {"value": value}, where))
            elif criterion.type == "boolean":
                if not isinstance(value, bool):
                    issues.append(ValidationIssue("value_not_boolean", {"value": str(value)}, where))
            elif str(value) not in labels:
                issues.append(ValidationIssue("unknown_category", {"value": str(value)}, where))
    return issues


def _constraint_issues(project: Project) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    criteria = {c.id: c for c in project.criteria}
    seen: set[str] = set()
    for constraint in project.constraints:
        where = Location("constraint", ref=constraint.id)
        if constraint.id in seen:
            issues.append(ValidationIssue("duplicate_id", {"id": constraint.id}, where))
        seen.add(constraint.id)
        criterion = criteria.get(constraint.criterion_id)
        if criterion is None:
            issues.append(_unknown("criterion", constraint.criterion_id, where))
            continue
        numeric_only = isinstance(constraint, (CompareConstraint, BetweenConstraint))
        if numeric_only and criterion.type != "numeric":
            issues.append(ValidationIssue("constraint_criterion_type", location=where))
        if isinstance(constraint, InConstraint) and criterion.type not in ("ordinal", "categorical"):
            issues.append(ValidationIssue("constraint_criterion_type", location=where))
        if isinstance(constraint, BetweenConstraint) and constraint.low > constraint.high:
            issues.append(ValidationIssue("constraint_invalid", {"reason": "bounds_order"}, where))
    return issues


def _weighting_issues(project: Project, group_ids: set[str]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    criterion_ids = {c.id for c in project.criteria}
    levels = [("groups", project.weighting.groups, group_ids | {ROOT_LEVEL})] if project.weighting.groups else []
    for key, level in project.weighting.within.items():
        if key != ROOT_LEVEL and key not in group_ids:
            issues.append(_unknown("group", key, Location("field", ref=f"weighting.within.{key}")))
            continue
        levels.append((f"within.{key}", level, criterion_ids))
    for path, level, known in levels:
        referenced = list(level.weights) + [id_ for tie in level.order for id_ in tie]
        for pair in level.comparisons:
            referenced += pair.split("|")
        for id_ in dict.fromkeys(referenced):
            if id_ not in known:
                issues.append(_unknown("criterion or group", id_, Location("field", ref=f"weighting.{path}")))
        for id_, weight in level.weights.items():
            if weight < 0 or not math.isfinite(weight):
                ref = f"weighting.{path}.weights.{id_}"
                issues.append(ValidationIssue("weight_negative", {"value": weight}, Location("field", ref=ref)))
    return issues
