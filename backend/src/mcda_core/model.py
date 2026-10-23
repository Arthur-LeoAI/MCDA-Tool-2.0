"""Decision problem data model: alternatives x criteria matrix with weights."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

import numpy as np
import numpy.typing as npt

from .errors import Location, McdaError, ProblemValidationError, ValidationIssue


class Direction(StrEnum):
    """Whether higher (benefit) or lower (cost) values are preferred."""

    BENEFIT = "benefit"
    COST = "cost"

    @classmethod
    def parse(cls, value: object) -> Direction:
        """Accept ``benefit/cost``, ``max/min`` or the legacy ``1/0`` codes."""
        if isinstance(value, Direction):
            return value
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        key = str(value).strip().lower()
        if key in ("benefit", "max", "maximise", "maximize", "1"):
            return cls.BENEFIT
        if key in ("cost", "min", "minimise", "minimize", "0"):
            return cls.COST
        raise McdaError("invalid_direction", value=value)


@dataclass(frozen=True)
class Criterion:
    name: str
    direction: Direction = Direction.BENEFIT
    weight: float = 1.0


@dataclass(frozen=True, init=False, eq=False)
class DecisionProblem:
    """An immutable, validated MCDA problem.

    ``matrix[i, j]`` is the performance of alternative ``i`` on criterion
    ``j``. Weights are stored as given; methods use them normalised to sum
    to 1, which does not change any ranking.

    Equality is identity: comparing matrices element-wise has no single
    truth value, so compare the fields explicitly where needed.
    """

    alternatives: tuple[str, ...]
    criteria: tuple[Criterion, ...]
    matrix: np.ndarray

    def __init__(self, alternatives: Sequence[str], criteria: Sequence[Criterion], matrix: npt.ArrayLike) -> None:
        object.__setattr__(self, "alternatives", tuple(alternatives))
        object.__setattr__(self, "criteria", tuple(criteria))
        try:
            array = np.array(matrix, dtype=float)
        except (TypeError, ValueError) as exc:
            raise ProblemValidationError([ValidationIssue("matrix_not_numeric", {"detail": str(exc)})]) from exc
        array.setflags(write=False)
        object.__setattr__(self, "matrix", array)

        issues = _validate(self)
        if issues:
            raise ProblemValidationError(issues)

    @property
    def criterion_names(self) -> tuple[str, ...]:
        return tuple(c.name for c in self.criteria)

    @property
    def weights(self) -> np.ndarray:
        return np.array([c.weight for c in self.criteria], dtype=float)

    @property
    def normalized_weights(self) -> np.ndarray:
        weights = self.weights
        return weights / weights.sum()

    @property
    def directions(self) -> tuple[Direction, ...]:
        return tuple(c.direction for c in self.criteria)

    def with_weights(self, weights: Mapping[str, float] | Sequence[float]) -> DecisionProblem:
        """Return a copy with new weights (by criterion name or in column order).

        Criteria missing from a mapping keep their current weight.
        """
        if isinstance(weights, Mapping):
            unknown = set(weights) - set(self.criterion_names)
            if unknown:
                raise KeyError(f"unknown criteria: {sorted(unknown)}")
            new = [weights.get(c.name, c.weight) for c in self.criteria]
        else:
            new = list(weights)
            if len(new) != len(self.criteria):
                raise McdaError("weights_length", expected=len(self.criteria), count=len(new))
        criteria = tuple(Criterion(c.name, c.direction, float(w)) for c, w in zip(self.criteria, new, strict=True))
        return DecisionProblem(self.alternatives, criteria, self.matrix)


def _validate(problem: DecisionProblem) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    issues += _validate_names(problem.alternatives, "alternative", "too_few_alternatives", minimum=2)
    issues += _validate_names(problem.criterion_names, "criterion", "too_few_criteria", minimum=1)

    for c in problem.criteria:
        where = Location("criterion", name=c.name)
        if not isinstance(c.direction, Direction):
            issues.append(ValidationIssue("invalid_direction", {"value": c.direction}, where))
        if not isinstance(c.weight, (int, float)) or not math.isfinite(c.weight):
            issues.append(ValidationIssue("weight_not_finite", {"value": c.weight}, where))
        elif c.weight < 0:
            issues.append(ValidationIssue("weight_negative", {"value": c.weight}, where))
    if not issues and problem.weights.sum() <= 0:
        issues.append(ValidationIssue("no_positive_weight"))

    expected = (len(problem.alternatives), len(problem.criteria))
    shape = problem.matrix.shape
    if shape != expected:
        rows, cols = (*shape, 0, 0)[:2]
        params = {"rows": rows, "cols": cols, "expected_rows": expected[0], "expected_cols": expected[1]}
        issues.append(ValidationIssue("matrix_shape", params))
        return issues
    for i, j in zip(*np.nonzero(~np.isfinite(problem.matrix)), strict=True):
        where = Location("value", alternative=problem.alternatives[i], criterion=problem.criteria[j].name)
        issues.append(ValidationIssue("value_not_finite", location=where))
    return issues


def _validate_names(names: Sequence[object], kind: Literal["alternative", "criterion"], too_few: str, minimum: int):
    issues: list[ValidationIssue] = []
    if len(names) < minimum:
        issues.append(ValidationIssue(too_few, {"minimum": minimum, "count": len(names)}))
    seen: set[str] = set()
    for position, name in enumerate(names, start=1):
        if not isinstance(name, str) or not name.strip():
            issues.append(ValidationIssue("empty_name", location=Location(kind, index=position)))
        elif name in seen:
            issues.append(ValidationIssue("duplicate_name", location=Location(kind, name=name)))
        else:
            seen.add(name)
    return issues
