"""Analysis pipeline for projects (technical design §3).

Covers hard constraints, missing values, value functions and category
scores, global weights from groups and the weighting methods, the methods,
Pareto analysis and stability intervals on the value matrix.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from ..errors import Location, McdaError, ProblemValidationError, ValidationIssue
from ..methods import MethodResult, compromise_programming, topsis, weighted_sum
from ..model import Criterion as CoreCriterion
from ..model import DecisionProblem, Direction
from ..normalization import Normalization
from ..pareto import DominanceInfo, pareto_analysis
from ..sensitivity import StabilityScope, WeightInterval, weight_stability_intervals
from .constraints import violations
from .model import (
    CompromiseProgrammingMethod,
    Criterion,
    LinearValueFunction,
    Project,
    ProjectMethod,
    TopsisMethod,
    WeightedSumMethod,
)
from .validate import project_issues
from .values import value_scores
from .weighting import derive


@dataclass(frozen=True)
class Exclusion:
    alternative_id: str
    reasons: tuple[ValidationIssue, ...]


@dataclass(frozen=True)
class Imputation:
    alternative_id: str
    criterion_id: str
    policy: str


@dataclass(frozen=True)
class PreparedProject:
    """The project reduced to numbers: eligible alternatives x criteria value scores."""

    project: Project
    eligible: tuple[str, ...]
    excluded: tuple[Exclusion, ...]
    imputed: tuple[Imputation, ...]
    values: np.ndarray
    weights: np.ndarray
    """Global weights (sum 1), aligned with ``project.criteria``."""

    def value_problem(self) -> DecisionProblem:
        """Benefit-oriented problem on value scores, named like the project."""
        names = {a.id: a.name for a in self.project.alternatives}
        criteria = [
            CoreCriterion(c.name, Direction.BENEFIT, float(w))
            for c, w in zip(self.project.criteria, self.weights, strict=True)
        ]
        return DecisionProblem([names[i] for i in self.eligible], criteria, self.values)

    def raw_problem(self) -> DecisionProblem:
        """Raw numeric data with directions, for classic TOPSIS (linear numeric criteria only)."""
        names = {a.id: a.name for a in self.project.alternatives}
        columns, criteria = [], []
        for criterion, weight in zip(self.project.criteria, self.weights, strict=True):
            vf = criterion.value_function
            if criterion.type != "numeric" or not isinstance(vf, LinearValueFunction):
                raise McdaError("raw_basis_needs_linear_numeric")
            column = np.array([number_or_nan(self.project.raw(criterion.id, i)) for i in self.eligible])
            missing = np.isnan(column)
            if missing.any():
                present = column[~missing]
                worst = present.min() if vf.direction is Direction.BENEFIT else present.max()
                fill = present.mean() if criterion.missing == "mean" else worst
                column = np.where(missing, fill, column)
            columns.append(column)
            criteria.append(CoreCriterion(criterion.name, vf.direction, float(weight)))
        return DecisionProblem([names[i] for i in self.eligible], criteria, np.column_stack(columns))


def prepare(project: Project) -> PreparedProject:
    issues = project_issues(project)
    if issues:
        raise ProblemValidationError(issues)

    excluded: list[Exclusion] = []
    eligible: list[str] = []
    for alternative in project.alternatives:
        # Hard constraints first (S3), then criteria whose missing values exclude the alternative.
        reasons = tuple(violations(project, alternative.id)) + tuple(
            ValidationIssue("missing_value", {"policy": "exclude"}, _value_location(project, alternative.id, c))
            for c in project.criteria
            if c.missing == "exclude" and project.raw(c.id, alternative.id) is None
        )
        if reasons:
            excluded.append(Exclusion(alternative.id, reasons))
        else:
            eligible.append(alternative.id)
    if len(eligible) < 2:
        raise McdaError("too_few_eligible", count=len(eligible))

    columns: list[np.ndarray] = []
    imputed: list[Imputation] = []
    for criterion in project.criteria:
        column = _criterion_values(project, criterion, eligible)
        missing = np.isnan(column)
        if missing.any():
            present = column[~missing]
            fill = float(present.mean()) if criterion.missing == "mean" and present.size else 0.0
            column = np.where(missing, fill, column)
            imputed += [Imputation(eligible[i], criterion.id, criterion.missing) for i in np.flatnonzero(missing)]
        columns.append(column)

    weights = np.array(list(derive(project).global_weights.values()), dtype=float)
    return PreparedProject(
        project=project,
        eligible=tuple(eligible),
        excluded=tuple(excluded),
        imputed=tuple(imputed),
        values=np.column_stack(columns),
        weights=weights,
    )


def _value_location(project: Project, alternative_id: str, criterion: Criterion) -> Location:
    name = next(a.name for a in project.alternatives if a.id == alternative_id)
    return Location("value", alternative=name, criterion=criterion.name)


def number_or_nan(value: object) -> float:
    """A raw value as float; NaN for missing or non-numeric values."""
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else math.nan


def _criterion_values(project: Project, criterion: Criterion, eligible: list[str]) -> np.ndarray:
    """Value scores of the eligible alternatives, NaN where the raw value is missing."""
    raw = [project.raw(criterion.id, i) for i in eligible]
    if criterion.type == "numeric":
        x = np.array([number_or_nan(v) for v in raw])
        present = x[~np.isnan(x)]
        data_range = (float(present.min()), float(present.max())) if present.size else None
        assert criterion.value_function is not None  # validated
        return value_scores(criterion.value_function, x, data_range)
    if criterion.type == "boolean":
        yes = 1.0 if criterion.direction is Direction.BENEFIT else 0.0
        return np.array([math.nan if v is None else (yes if v else 1.0 - yes) for v in raw])
    scores = {c.label: c.score for c in criterion.categories or []}
    return np.array([math.nan if v is None else scores[str(v)] for v in raw])


# --- Running methods ------------------------------------------------------------------


def run_method(prepared: PreparedProject, spec: ProjectMethod) -> MethodResult:
    if isinstance(spec, WeightedSumMethod):
        return weighted_sum(prepared.value_problem(), Normalization.NONE)
    if isinstance(spec, TopsisMethod):
        if spec.basis == "raw":
            return topsis(prepared.raw_problem(), Normalization.VECTOR)
        if spec.ideal == "fixed":
            return topsis(prepared.value_problem(), Normalization.FIXED_RANGE, (0.0, 1.0))
        return topsis(prepared.value_problem(), Normalization.NONE)
    assert isinstance(spec, CompromiseProgrammingMethod)
    p = math.inf if spec.p == "inf" else spec.p
    if spec.ideal == "fixed":
        return compromise_programming(prepared.value_problem(), p, Normalization.FIXED_RANGE, (0.0, 1.0))
    return compromise_programming(prepared.value_problem(), p, Normalization.MIN_MAX)


def pareto(prepared: PreparedProject) -> list[DominanceInfo]:
    return pareto_analysis(prepared.value_problem())


def stability(prepared: PreparedProject, scope: StabilityScope) -> list[WeightInterval]:
    """Weight stability intervals of the weighted sum on value scores."""
    return weight_stability_intervals(prepared.value_problem(), scope, Normalization.NONE)
