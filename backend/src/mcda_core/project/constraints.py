"""Hard constraints: conditions an alternative must meet before it is scored (S3).

They are checked on raw values. A missing value fails the condition unless
the constraint allows missing values.
"""

from __future__ import annotations

import operator

from ..errors import Location, ValidationIssue
from .model import BetweenConstraint, CompareConstraint, Constraint, InConstraint, Project

_COMPARE = {">=": operator.ge, "<=": operator.le, ">": operator.gt, "<": operator.lt}


def violations(project: Project, alternative_id: str) -> list[ValidationIssue]:
    """Every constraint the alternative fails, as coded reasons."""
    criteria = {c.id: c for c in project.criteria}
    reasons: list[ValidationIssue] = []
    for constraint in project.constraints:
        criterion = criteria[constraint.criterion_id]  # references are validated
        value = project.raw(criterion.id, alternative_id)
        where = Location("constraint", ref=constraint.id)
        base: dict[str, object] = {"criterion": criterion.name, "unit": criterion.unit or ""}
        if value is None:
            if not constraint.allow_missing:
                reasons.append(ValidationIssue("constraint_missing", base, where))
            continue
        reason = _check(constraint, value, base)
        if reason is not None:
            reasons.append(ValidationIssue(reason[0], reason[1], where))
    return reasons


def _check(constraint: Constraint, value: object, base: dict[str, object]) -> tuple[str, dict[str, object]] | None:
    if isinstance(constraint, CompareConstraint):
        number = float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
        if number is None or not _COMPARE[constraint.op](number, constraint.value):
            return "constraint_failed_compare", {
                **base,
                "op": constraint.op,
                "value": constraint.value,
                "actual": value,
            }
    elif isinstance(constraint, BetweenConstraint):
        number = float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
        if number is None or not constraint.low <= number <= constraint.high:
            params = {**base, "low": constraint.low, "high": constraint.high, "actual": value}
            return "constraint_failed_between", params
    elif isinstance(constraint, InConstraint) and str(value) not in constraint.labels:
        return "constraint_failed_in", {**base, "labels": ", ".join(constraint.labels), "actual": str(value)}
    return None
