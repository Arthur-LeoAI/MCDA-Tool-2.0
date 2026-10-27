"""Project model v2: the content of a ``.mcda.json`` file (ADR 0006).

These models check structure (field names, types, sizes). Rules that relate
fields to each other (references, type/config consistency, data values) are
checked by :func:`mcda_core.project.validate.project_issues`, so that every
problem can be reported with an error code and a location.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from ..model import Direction

FORMAT = "mcda-project"
CURRENT_VERSION = 2

MAX_ALTERNATIVES = 500
MAX_CRITERIA = 200

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
Id = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")]
Text = Annotated[str, Field(max_length=200)]
LongText = Annotated[str, Field(max_length=5000)]
# Raw cell values as entered or imported. StrictBool first so true/false are not read as 1/0.
RawValue = StrictBool | FiniteFloat | Annotated[str, Field(max_length=500)] | None

CriterionType = Literal["numeric", "ordinal", "categorical", "boolean"]
MissingPolicy = Literal["worst", "mean", "exclude", "require"]
Bounds = Literal["data"] | tuple[FiniteFloat, FiniteFloat]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Value functions (technical design §2.2, §3.1) ----------------------------------


class LinearValueFunction(_Model):
    kind: Literal["linear"] = "linear"
    direction: Direction = Direction.BENEFIT
    bounds: Bounds = "data"
    """"data": the range of the eligible alternatives; or a fixed (low, high)."""


class LogValueFunction(_Model):
    """Linear on ln(1 + x): diminishing returns. Needs x >= 0."""

    kind: Literal["log"] = "log"
    direction: Direction = Direction.BENEFIT
    bounds: Bounds = "data"


class TargetValueFunction(_Model):
    """1 inside [ideal_low, ideal_high], falling linearly to 0 at lower and upper."""

    kind: Literal["target"] = "target"
    lower: FiniteFloat
    ideal_low: FiniteFloat
    ideal_high: FiniteFloat
    upper: FiniteFloat


class PiecewiseValueFunction(_Model):
    """Straight lines between (x, value) points; constant beyond the first and last point."""

    kind: Literal["piecewise"] = "piecewise"
    points: Annotated[list[tuple[FiniteFloat, FiniteFloat]], Field(min_length=2, max_length=50)]


ValueFunction = Annotated[
    LinearValueFunction | LogValueFunction | TargetValueFunction | PiecewiseValueFunction,
    Field(discriminator="kind"),
]


# --- Project parts --------------------------------------------------------------------


class Alternative(_Model):
    id: Id
    name: Text
    note: LongText | None = None


class Group(_Model):
    id: Id
    name: Text


class Category(_Model):
    label: Annotated[str, Field(max_length=500)]
    score: FiniteFloat
    """Value score in [0, 1]."""


class Criterion(_Model):
    id: Id
    name: Text
    group_id: Id | None = None
    type: CriterionType = "numeric"
    unit: Text | None = None
    direction: Direction | None = None
    """Only for boolean criteria: benefit means "yes" scores 1."""
    value_function: ValueFunction | None = None
    """Required for numeric criteria."""
    categories: Annotated[list[Category], Field(max_length=100)] | None = None
    """Required for ordinal (best last or any order) and categorical criteria."""
    missing: MissingPolicy = "worst"
    note: LongText | None = None


class _ConstraintBase(_Model):
    id: Id
    criterion_id: Id
    allow_missing: bool = False


class CompareConstraint(_ConstraintBase):
    op: Literal[">=", "<=", ">", "<"]
    value: FiniteFloat


class BetweenConstraint(_ConstraintBase):
    op: Literal["between"]
    low: FiniteFloat
    high: FiniteFloat


class InConstraint(_ConstraintBase):
    op: Literal["in"]
    labels: list[Annotated[str, Field(max_length=500)]]


class PresentConstraint(_ConstraintBase):
    op: Literal["present"]


Constraint = Annotated[
    CompareConstraint | BetweenConstraint | InConstraint | PresentConstraint,
    Field(discriminator="op"),
]


class LevelWeighting(_Model):
    """Weights for one level (the groups, or the criteria of one group).

    Inputs of every method are kept, so switching methods never loses work;
    ``method`` selects which one is used.
    """

    method: Literal["direct", "rank", "ahp"] = "direct"
    weights: dict[Id, FiniteFloat] = {}
    order: list[list[Id]] = []
    """Most important first; ids in the same inner list are tied."""
    formula: Literal["roc", "rank_sum"] = "roc"
    comparisons: dict[str, FiniteFloat] = {}
    """AHP judgements keyed "i|j": how much more important i is than j (1/9 .. 9)."""


ROOT_LEVEL = "_root"


class Weighting(_Model):
    groups: LevelWeighting | None = None
    within: dict[str, LevelWeighting] = {}
    """Keyed by group id, or "_root" for ungrouped criteria."""


class WeightedSumMethod(_Model):
    method: Literal["weighted_sum"] = "weighted_sum"


class TopsisMethod(_Model):
    method: Literal["topsis"] = "topsis"
    basis: Literal["values", "raw"] = "values"
    """"raw" is classic TOPSIS (vector normalisation of raw numeric data)."""
    ideal: Literal["data", "fixed"] = "data"
    """On value scores: ideal from the data, or the fixed ideal 1 / anti-ideal 0."""


class CompromiseProgrammingMethod(_Model):
    method: Literal["compromise_programming"] = "compromise_programming"
    p: Annotated[float, Field(ge=1, allow_inf_nan=False)] | Literal["inf"] = 2.0
    ideal: Literal["data", "fixed"] = "data"


ProjectMethod = Annotated[
    WeightedSumMethod | TopsisMethod | CompromiseProgrammingMethod,
    Field(discriminator="method"),
]


class RobustnessSettings(_Model):
    mode: Literal["around", "unknown"] = "around"
    spread: Annotated[float, Field(gt=0, le=2)] = 0.2
    samples: Annotated[int, Field(ge=100, le=20_000)] = 5000
    seed: int = 1


class AnalysisSettings(_Model):
    methods: Annotated[list[ProjectMethod], Field(min_length=1, max_length=10)] = [WeightedSumMethod()]
    robustness: RobustnessSettings = RobustnessSettings()
    stability_scope: Literal["full_order", "top1"] = "full_order"


class Meta(_Model):
    name: Text = ""
    description: LongText = ""
    template_id: Id | None = None
    language: Literal["zh", "en"] = "en"
    created: str | None = None
    modified: str | None = None


class Source(_Model):
    filename: Text | None = None
    kind: Literal["table", "template", "legacy", "project", "manual"] = "manual"
    sheet: Text | None = None
    header_row: int | None = None
    column_map: dict[str, Any] | None = None
    legacy: dict[str, Any] | None = None
    """For legacy workbooks: reference_order (alternative ids, best first) and prescaled flags."""


class Project(_Model):
    format: Literal["mcda-project"] = FORMAT
    version: Literal[2] = CURRENT_VERSION
    app_version: str | None = None
    meta: Meta = Meta()
    alternatives: Annotated[list[Alternative], Field(max_length=MAX_ALTERNATIVES)]
    groups: Annotated[list[Group], Field(max_length=MAX_CRITERIA)] = []
    criteria: Annotated[list[Criterion], Field(max_length=MAX_CRITERIA)]
    data: dict[Id, dict[Id, RawValue]] = {}
    """data[criterion_id][alternative_id] = raw value; absent means missing."""
    constraints: Annotated[list[Constraint], Field(max_length=200)] = []
    weighting: Weighting = Weighting()
    analysis: AnalysisSettings = AnalysisSettings()
    source: Source | None = None
    ui: dict[str, Any] | None = None
    """Interface state (mode, step); never used in calculations."""

    def raw(self, criterion_id: str, alternative_id: str) -> bool | float | str | None:
        return self.data.get(criterion_id, {}).get(alternative_id)
