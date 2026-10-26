"""Read any supported document as a current project (ADR 0006).

Supported inputs:

- v2 projects (``{"format": "mcda-project", "version": 2, ...}``)
- v1: the "problem" JSON of the version-3 tool,
  ``{"alternatives": [...], "criteria": [{name, direction, weight}], "matrix": [[...]]}``,
  optionally with the settings that were active then: ``normalization``
  and ``bounds`` of the weighted sum, and the old method specs in ``methods``.

Rules for v1 settings: docs/design/s1-project-model.md.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
from pydantic import ValidationError

from ..errors import Location, McdaError, ProblemValidationError, ValidationIssue
from ..model import DecisionProblem, Direction
from .model import (
    CURRENT_VERSION,
    FORMAT,
    ROOT_LEVEL,
    Alternative,
    AnalysisSettings,
    CompromiseProgrammingMethod,
    Criterion,
    LevelWeighting,
    LinearValueFunction,
    Project,
    ProjectMethod,
    RawValue,
    Source,
    TopsisMethod,
    WeightedSumMethod,
    Weighting,
)

Bounds = str | tuple[float, float]


def migrate(document: object) -> Project:
    if not isinstance(document, Mapping):
        raise McdaError("project_unreadable")
    if document.get("format") == FORMAT:
        version = document.get("version")
        if not isinstance(version, int) or isinstance(version, bool):
            raise McdaError("project_unreadable")
        if version > CURRENT_VERSION:
            raise McdaError("project_version_unsupported", version=version, supported=CURRENT_VERSION)
        if version == CURRENT_VERSION:
            return parse_project(document)
        raise McdaError("project_unreadable")
    if {"alternatives", "criteria", "matrix"} <= set(document):
        return _from_v1(document)
    raise McdaError("project_unreadable")


def parse_project(document: Mapping[str, Any]) -> Project:
    """Validate the structure of a current-version project, as coded issues."""
    try:
        return Project.model_validate(document)
    except ValidationError as exc:
        raise ProblemValidationError(issues_from_pydantic(exc)) from exc


def issues_from_pydantic(exc: ValidationError) -> list[ValidationIssue]:
    issues = []
    for error in exc.errors():
        ref = ".".join(str(part) for part in error["loc"])
        location = Location("field", ref=ref) if ref else None
        issues.append(ValidationIssue("request_invalid", {"detail": error["msg"], "type": error["type"]}, location))
    return issues


# --- From tables and problems (imports, v1) ----------------------------------------------


def project_from_table(
    alternatives: Sequence[str],
    criteria: Sequence[tuple[str, Direction, float]],
    rows: Sequence[Sequence[float | None]],
    *,
    bounds: Bounds = "data",
    methods: Sequence[ProjectMethod] | None = None,
    source: Source | None = None,
) -> Project:
    """A v2 project with linear value functions and direct weights.

    ``criteria`` are (name, direction, weight); ``rows`` hold one value per
    criterion for each alternative, None for missing. Incomplete data (empty
    names, missing values) is kept as is, to be reported by validation.
    """
    alternative_items = [Alternative(id=f"a{i + 1}", name=name) for i, name in enumerate(alternatives)]
    criterion_items = [
        Criterion(
            id=f"c{j + 1}",
            name=name,
            type="numeric",
            value_function=LinearValueFunction(direction=direction, bounds=bounds),  # type: ignore[arg-type]
        )
        for j, (name, direction, _) in enumerate(criteria)
    ]
    data: dict[str, dict[str, RawValue]] = {
        criterion.id: {alternative.id: rows[i][j] for i, alternative in enumerate(alternative_items)}
        for j, criterion in enumerate(criterion_items)
    }
    weights = {item.id: float(weight) for item, (_, _, weight) in zip(criterion_items, criteria, strict=True)}
    return Project(
        alternatives=alternative_items,
        criteria=criterion_items,
        data=data,
        weighting=Weighting(within={ROOT_LEVEL: LevelWeighting(method="direct", weights=weights)}),
        analysis=AnalysisSettings(methods=list(methods or [WeightedSumMethod()])),
        source=source,
    )


def project_from_problem(problem: DecisionProblem, **options: Any) -> Project:
    """A v2 project from a complete problem (template or legacy import)."""
    criteria = [(c.name, c.direction, c.weight) for c in problem.criteria]
    rows = [[float(v) for v in row] for row in problem.matrix]
    return project_from_table(problem.alternatives, criteria, rows, **options)


def uniform_bounds(matrix: np.ndarray) -> tuple[float, float]:
    """One fixed range for all criteria, so that scaling keeps weighted-sum rankings unchanged.

    Used for the old "none" normalisation; equals [0, 100] for legacy V7 data.
    """
    low = min(0.0, float(np.nanmin(matrix)))
    high = float(np.nanmax(matrix))
    return (low, high if high > low else low + 1.0)


def _from_v1(document: Mapping[str, Any]) -> Project:
    try:
        alternatives = [str(a) for a in document["alternatives"]]
        criteria = [
            (str(c["name"]), Direction.parse(c.get("direction", "benefit")), float(c["weight"]))
            for c in document["criteria"]
        ]
        rows = [[None if v is None else float(v) for v in row] for row in document["matrix"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise McdaError("project_unreadable") from exc
    if len(rows) != len(alternatives) or any(len(row) != len(criteria) for row in rows):
        raise McdaError("project_unreadable")

    present = np.array([[np.nan if v is None else v for v in row] for row in rows], dtype=float)
    normalization = document.get("normalization", "min_max")
    if normalization == "fixed_range":
        low, high = document.get("bounds", (0, 100))
        bounds: Bounds = (float(low), float(high))
    elif normalization == "none" and np.isfinite(present).any():
        bounds = uniform_bounds(present)
    else:
        bounds = "data"
    return project_from_table(
        alternatives,
        criteria,
        rows,
        bounds=bounds,
        methods=_v1_methods(document.get("methods")),
        source=Source(kind="manual"),
    )


def _v1_methods(specs: object) -> list[ProjectMethod]:
    if not isinstance(specs, list) or not specs:
        return [WeightedSumMethod()]
    methods: list[ProjectMethod] = []
    for spec in specs:
        if not isinstance(spec, Mapping):
            continue
        normalization = spec.get("normalization")
        ideal = "fixed" if normalization == "fixed_range" else "data"
        if spec.get("method") == "weighted_sum":
            methods.append(WeightedSumMethod())
        elif spec.get("method") == "topsis":
            basis = "raw" if normalization in (None, "vector") else "values"
            methods.append(TopsisMethod(basis=basis, ideal=ideal))
        elif spec.get("method") == "compromise_programming":
            p = spec.get("p", 2.0)
            methods.append(CompromiseProgrammingMethod(p="inf" if p == "inf" else float(p), ideal=ideal))
    return methods or [WeightedSumMethod()]
