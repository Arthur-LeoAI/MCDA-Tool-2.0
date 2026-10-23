"""Request and response models for the HTTP API."""

from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from mcda_core import (
    Criterion,
    DecisionProblem,
    Direction,
    DominanceInfo,
    MethodResult,
    Normalization,
    ProblemValidationError,
    StabilityScope,
    ValidationIssue,
    WeightInterval,
    compromise_programming,
    topsis,
    weighted_sum,
)

MAX_ALTERNATIVES = 500
MAX_CRITERIA = 200
MAX_METHODS = 10

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
Name = Annotated[str, Field(min_length=1, max_length=200)]
Row = Annotated[list[FiniteFloat], Field(max_length=MAX_CRITERIA)]
BoundsIn = tuple[FiniteFloat, FiniteFloat] | Annotated[list[tuple[FiniteFloat, FiniteFloat]], Field(max_length=MAX_CRITERIA)]


# --- Problem -----------------------------------------------------------------


class CriterionModel(BaseModel):
    name: Name
    direction: Direction = Direction.BENEFIT
    weight: FiniteFloat


class ProblemModel(BaseModel):
    """A decision problem; ``matrix[i][j]`` is alternative i on criterion j."""

    alternatives: Annotated[list[Name], Field(max_length=MAX_ALTERNATIVES)]
    criteria: Annotated[list[CriterionModel], Field(max_length=MAX_CRITERIA)]
    matrix: Annotated[list[Row], Field(max_length=MAX_ALTERNATIVES)]

    def to_domain(self) -> DecisionProblem:
        ragged = [
            ValidationIssue(f"row has {len(row)} values, expected {len(self.criteria)}", f"matrix row {i + 1}")
            for i, row in enumerate(self.matrix)
            if len(row) != len(self.criteria)
        ]
        if ragged:
            raise ProblemValidationError(ragged)
        criteria = tuple(Criterion(c.name, c.direction, c.weight) for c in self.criteria)
        return DecisionProblem(tuple(self.alternatives), criteria, self.matrix)

    @classmethod
    def from_domain(cls, problem: DecisionProblem) -> ProblemModel:
        return cls(
            alternatives=list(problem.alternatives),
            criteria=[CriterionModel(name=c.name, direction=c.direction, weight=c.weight) for c in problem.criteria],
            matrix=problem.matrix.tolist(),
        )


# --- Methods -----------------------------------------------------------------


class WeightedSumSpec(BaseModel):
    method: Literal["weighted_sum"] = "weighted_sum"
    normalization: Literal["min_max", "fixed_range", "none"] = "min_max"
    bounds: BoundsIn = (0.0, 100.0)

    def label(self) -> str:
        return f"Weighted sum ({self.normalization})"

    def run(self, problem: DecisionProblem) -> MethodResult:
        return weighted_sum(problem, Normalization(self.normalization), self.bounds)


class TopsisSpec(BaseModel):
    method: Literal["topsis"] = "topsis"
    normalization: Literal["vector", "min_max", "fixed_range", "none"] = "vector"
    bounds: BoundsIn = (0.0, 100.0)

    def label(self) -> str:
        return f"TOPSIS ({self.normalization})"

    def run(self, problem: DecisionProblem) -> MethodResult:
        return topsis(problem, Normalization(self.normalization), self.bounds)


class CompromiseProgrammingSpec(BaseModel):
    method: Literal["compromise_programming"] = "compromise_programming"
    p: Annotated[float, Field(ge=1, allow_inf_nan=False)] | Literal["inf"] = 2.0
    normalization: Literal["min_max", "fixed_range"] = "min_max"
    bounds: BoundsIn = (0.0, 100.0)

    def label(self) -> str:
        p = "∞" if self.p == "inf" else f"{self.p:g}"
        return f"CP p={p} ({self.normalization})"

    def run(self, problem: DecisionProblem) -> MethodResult:
        p = math.inf if self.p == "inf" else self.p
        return compromise_programming(problem, p, Normalization(self.normalization), self.bounds)


MethodSpec = Annotated[WeightedSumSpec | TopsisSpec | CompromiseProgrammingSpec, Field(discriminator="method")]
METHOD_SPECS = (WeightedSumSpec, TopsisSpec, CompromiseProgrammingSpec)


class MethodInfo(BaseModel):
    method: str
    higher_is_better: bool
    normalizations: list[str]
    default_normalization: str
    parameters: dict[str, object]


# --- Evaluation ----------------------------------------------------------------


class EvaluateRequest(BaseModel):
    problem: ProblemModel
    methods: Annotated[list[MethodSpec], Field(min_length=1, max_length=MAX_METHODS)]


class AlternativeResult(BaseModel):
    name: str
    score: float
    rank: int
    contributions: list[float] | None = None
    """Weighted sum only: each criterion's part of the score, in criteria order."""


class MethodResultModel(BaseModel):
    method: str
    label: str
    spec: MethodSpec
    higher_is_better: bool
    alternatives: list[AlternativeResult]
    """In input order."""
    order: list[str]
    """Best first; tied alternatives keep their input order."""

    @classmethod
    def build(cls, spec: WeightedSumSpec | TopsisSpec | CompromiseProgrammingSpec, result: MethodResult) -> MethodResultModel:
        return cls(
            method=result.method,
            label=spec.label(),
            spec=spec,
            higher_is_better=result.higher_is_better,
            alternatives=[
                AlternativeResult(
                    name=name,
                    score=float(result.scores[i]),
                    rank=int(result.ranks[i]),
                    contributions=None if result.contributions is None else result.contributions[i].tolist(),
                )
                for i, name in enumerate(result.alternatives)
            ],
            order=list(result.order),
        )


class EvaluateResponse(BaseModel):
    results: list[MethodResultModel]


# --- Pareto ------------------------------------------------------------------


class ParetoRequest(BaseModel):
    problem: ProblemModel
    criteria: list[str] | None = None
    """Compare on these criteria only (default: all)."""


class DominanceModel(BaseModel):
    alternative: str
    is_pareto_optimal: bool
    dominates: list[str]
    dominated_by: list[str]

    @classmethod
    def build(cls, info: DominanceInfo) -> DominanceModel:
        return cls(
            alternative=info.alternative,
            is_pareto_optimal=info.is_pareto_optimal,
            dominates=list(info.dominates),
            dominated_by=list(info.dominated_by),
        )


class ParetoResponse(BaseModel):
    front: list[str]
    alternatives: list[DominanceModel]


# --- Sensitivity -------------------------------------------------------------


class StabilityOptions(BaseModel):
    """Normalisation of the weighted sum whose ranking is analysed."""

    normalization: Literal["min_max", "fixed_range", "none"] = "min_max"
    bounds: BoundsIn = (0.0, 100.0)


class StabilityRequest(StabilityOptions):
    problem: ProblemModel
    scope: StabilityScope = StabilityScope.FULL_ORDER


class IntervalModel(BaseModel):
    criterion: str
    weight: float
    lower: float
    upper: float | None
    """None when the weight can grow without changing the ranking."""
    lower_share: float
    upper_share: float
    """Bounds as a share of the total weight (0-1)."""

    @classmethod
    def build(cls, interval: WeightInterval) -> IntervalModel:
        return cls(
            criterion=interval.criterion,
            weight=interval.weight,
            lower=interval.lower,
            upper=None if math.isinf(interval.upper) else interval.upper,
            lower_share=interval.lower_normalized,
            upper_share=interval.upper_normalized,
        )


class StabilityResponse(BaseModel):
    scope: StabilityScope
    normalization: str
    intervals: list[IntervalModel]


# --- Import / export -----------------------------------------------------------


class LegacyInfo(BaseModel):
    reference_order: list[str]
    """Ordering stored in the workbook's "Rank" column, best first."""
    prescaled: list[bool]
    """Per criterion: values already rescaled to 0-100 in the workbook."""
    note: str = (
        "Legacy workbooks store values already on a 0-100 benefit scale; use "
        "weighted_sum with normalization 'none' to reproduce the workbook's ranking."
    )


class ImportResponse(BaseModel):
    filename: str
    source_format: Literal["template", "legacy"]
    problem: ProblemModel
    legacy: LegacyInfo | None = None


class ReportRequest(BaseModel):
    problem: ProblemModel
    methods: Annotated[list[MethodSpec], Field(min_length=1, max_length=MAX_METHODS)]
    stability: StabilityOptions | None = StabilityOptions()
    """Set to null to leave the stability sheets out."""
    include_pareto: bool = True


# --- Errors ------------------------------------------------------------------


class IssueModel(BaseModel):
    location: str | None
    message: str


class ErrorResponse(BaseModel):
    detail: str
    issues: list[IssueModel] = []
