"""Project endpoints (/api/v1/projects/*): the v2 model (docs/design/s1-project-model.md).

The API stays stateless: every request carries the whole project.
Results identify alternatives and criteria by id and also give names.
"""

from __future__ import annotations

import io
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, File, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from mcda_core import McdaError, MethodResult, StabilityScope
from mcda_core.errors import render
from mcda_core.io import write_report
from mcda_core.project import PreparedProject, Project, migrate, pareto, prepare, project_from_problem, run_method
from mcda_core.project import stability as stability_intervals
from mcda_core.project.conclusions import Conclusion, conclude
from mcda_core.project.curve import value_curve
from mcda_core.project.model import (
    CompromiseProgrammingMethod,
    ProjectMethod,
    RobustnessSettings,
    Source,
    TopsisMethod,
    WeightedSumMethod,
)
from mcda_core.project.quality import quality_report
from mcda_core.project.report import conclusion_rows, data_handling_rows, robustness_rows, weights_rows
from mcda_core.project.robustness import robustness
from mcda_core.project.weighting import derive

from . import __version__
from .routes import ERRORS, XLSX_MEDIA_TYPE, Upload, _file_response, compute, read_upload
from .schemas import ErrorResponse, IntervalModel, IssueModel

router = APIRouter(prefix="/api/v1/projects", tags=["projects"], responses=ERRORS)


# --- Response models ------------------------------------------------------------------


class ExclusionModel(BaseModel):
    alternative_id: str
    reasons: list[IssueModel]


class ImputationModel(BaseModel):
    alternative_id: str
    criterion_id: str
    policy: str


class ProjectAlternativeResult(BaseModel):
    id: str
    name: str
    score: float
    rank: int
    contributions: dict[str, float] | None = None
    """Weighted sum only: each criterion's part of the score, by criterion id."""


class ProjectMethodResult(BaseModel):
    method: str
    label: str
    spec: ProjectMethod
    higher_is_better: bool
    alternatives: list[ProjectAlternativeResult]
    """Eligible alternatives in project order."""
    order: list[str]
    """Alternative ids, best first; ties keep project order."""


class ProjectDominance(BaseModel):
    id: str
    is_pareto_optimal: bool
    dominates: list[str]
    dominated_by: list[str]


class ProjectPareto(BaseModel):
    front: list[str]
    alternatives: list[ProjectDominance]


class PlacedModel(BaseModel):
    id: str
    score: float
    """Weighted sum, 0-100."""


class ShareModel(BaseModel):
    criterion_id: str
    points: float
    """Points of the 0-100 score (negative: a disadvantage)."""


class CaveatModel(BaseModel):
    code: str
    params: dict[str, Any]
    message: str
    """English rendering; clients translate by code."""


class ConclusionModel(BaseModel):
    """Structured points for the conclusion; clients write the sentences (ADR 0007)."""

    winner: PlacedModel
    runner_up: PlacedModel
    score_gap: float
    tied: list[str]
    top_contributions: list[ShareModel]
    advantages: list[ShareModel]
    disadvantages: list[ShareModel]
    caveats: list[CaveatModel]

    @classmethod
    def build(cls, c: Conclusion) -> ConclusionModel:
        def shares(items) -> list[ShareModel]:
            return [ShareModel(criterion_id=s.criterion_id, points=s.points) for s in items]

        return cls(
            winner=PlacedModel(id=c.winner.alternative_id, score=c.winner.score),
            runner_up=PlacedModel(id=c.runner_up.alternative_id, score=c.runner_up.score),
            score_gap=c.score_gap,
            tied=list(c.tied),
            top_contributions=shares(c.top_contributions),
            advantages=shares(c.advantages),
            disadvantages=shares(c.disadvantages),
            caveats=[CaveatModel(code=k.code, params=k.params, message=render(k.code, k.params)) for k in c.caveats],
        )


class ProjectEvaluation(BaseModel):
    eligible: list[str]
    excluded: list[ExclusionModel]
    imputed: list[ImputationModel]
    weights: dict[str, float]
    """Weight shares by criterion id (sum 1)."""
    values: dict[str, dict[str, float]]
    """Value scores in [0, 1]: values[alternative_id][criterion_id], eligible alternatives only."""
    results: list[ProjectMethodResult]
    pareto: ProjectPareto
    conclusion: ConclusionModel
    """From the weighted sum, whichever methods are selected."""


class ProjectInterval(IntervalModel):
    criterion_id: str


class ProjectStability(BaseModel):
    scope: StabilityScope
    intervals: list[ProjectInterval]


class StabilityRequest(BaseModel):
    project: Project
    scope: StabilityScope = StabilityScope.FULL_ORDER


class ReportRequest(BaseModel):
    project: Project
    include_stability: bool = True
    include_pareto: bool = True
    include_robustness: bool = True
    conclusion: Annotated[list[Annotated[str, Field(max_length=2000)]], Field(max_length=50)] = []
    """Conclusion text as shown in the interface (rendered by the client, ADR 0007)."""


class ProjectImport(BaseModel):
    filename: str
    source_format: Literal["template", "legacy"]
    project: Project


class Validity(BaseModel):
    valid: Literal[True] = True


# --- Helpers --------------------------------------------------------------------------


def method_label(spec: ProjectMethod) -> str:
    """English column label (reports); the frontend shows its own translated label."""
    if isinstance(spec, WeightedSumMethod):
        return "Weighted sum"
    if isinstance(spec, TopsisMethod):
        return "TOPSIS (classic)" if spec.basis == "raw" else f"TOPSIS (ideal: {spec.ideal})"
    assert isinstance(spec, CompromiseProgrammingMethod)
    p = "∞" if spec.p == "inf" else f"{spec.p:g}"
    return f"CP p={p} (ideal: {spec.ideal})"


def _prepare(project: Project) -> PreparedProject:
    return compute(lambda: prepare(project))


def _ids_by_name(prepared: PreparedProject) -> tuple[dict[str, str], dict[str, str]]:
    project = prepared.project
    return {a.name: a.id for a in project.alternatives}, {c.name: c.id for c in project.criteria}


def _result(prepared: PreparedProject, spec: ProjectMethod, result: MethodResult) -> ProjectMethodResult:
    alternative_ids, _ = _ids_by_name(prepared)
    criterion_ids = [c.id for c in prepared.project.criteria]
    alternatives = []
    for i, name in enumerate(result.alternatives):
        contributions = None
        if result.contributions is not None:
            contributions = dict(zip(criterion_ids, map(float, result.contributions[i]), strict=True))
        alternatives.append(
            ProjectAlternativeResult(
                id=alternative_ids[name],
                name=name,
                score=float(result.scores[i]),
                rank=int(result.ranks[i]),
                contributions=contributions,
            )
        )
    return ProjectMethodResult(
        method=result.method,
        label=method_label(spec),
        spec=spec,
        higher_is_better=result.higher_is_better,
        alternatives=alternatives,
        order=[alternative_ids[name] for name in result.order],
    )


# --- Endpoints ------------------------------------------------------------------------


@router.post("/migrate", response_model=Project)
def migrate_project(document: Annotated[dict[str, Any], Body()]) -> Project:
    """Read a project file of any supported version (or v1 problem JSON) as a current project."""
    project = compute(lambda: migrate(document))
    return project.model_copy(update={"app_version": __version__})


@router.post("/validate", response_model=Validity)
def validate_project(project: Project) -> Validity:
    """200 if the project can be analysed; otherwise 422 with every issue found."""
    _prepare(project)
    return Validity()


@router.post("/evaluate", response_model=ProjectEvaluation)
def evaluate_project(project: Project) -> ProjectEvaluation:
    prepared = _prepare(project)
    criterion_ids = [c.id for c in project.criteria]
    alternative_ids, _ = _ids_by_name(prepared)
    shares = prepared.weights / prepared.weights.sum()
    computed = [(spec, compute(lambda spec=spec: run_method(prepared, spec))) for spec in project.analysis.methods]
    results = [_result(prepared, spec, result) for spec, result in computed]
    dominance = pareto(prepared)
    return ProjectEvaluation(
        eligible=list(prepared.eligible),
        excluded=[
            ExclusionModel(alternative_id=e.alternative_id, reasons=[IssueModel(**r.to_dict()) for r in e.reasons])
            for e in prepared.excluded
        ],
        imputed=[ImputationModel(**i.__dict__) for i in prepared.imputed],
        weights=dict(zip(criterion_ids, map(float, shares), strict=True)),
        values={
            alternative_id: dict(zip(criterion_ids, map(float, row), strict=True))
            for alternative_id, row in zip(prepared.eligible, prepared.values, strict=True)
        },
        results=results,
        pareto=ProjectPareto(
            front=[alternative_ids[d.alternative] for d in dominance if d.is_pareto_optimal],
            alternatives=[
                ProjectDominance(
                    id=alternative_ids[d.alternative],
                    is_pareto_optimal=d.is_pareto_optimal,
                    dominates=[alternative_ids[n] for n in d.dominates],
                    dominated_by=[alternative_ids[n] for n in d.dominated_by],
                )
                for d in dominance
            ],
        ),
        conclusion=ConclusionModel.build(_conclusion(prepared, computed)),
    )


def _conclusion(prepared: PreparedProject, computed: list[tuple[ProjectMethod, MethodResult]]) -> Conclusion:
    """Conclusion points from the weighted sum; other selected methods only feed the "disagree" caveat."""
    weighted = next((r for s, r in computed if isinstance(s, WeightedSumMethod)), None)
    if weighted is None:
        weighted = compute(lambda: run_method(prepared, WeightedSumMethod()))
    others = [(method_label(s), r) for s, r in computed if not isinstance(s, WeightedSumMethod)]
    return conclude(prepared, weighted, others)


@router.post("/stability", response_model=ProjectStability)
def project_stability(request: StabilityRequest) -> ProjectStability:
    """Weight stability intervals of the weighted sum on value scores."""
    prepared = _prepare(request.project)
    _, criterion_ids = _ids_by_name(prepared)
    intervals = compute(lambda: stability_intervals(prepared, request.scope))
    return ProjectStability(
        scope=request.scope,
        intervals=[
            ProjectInterval(criterion_id=criterion_ids[i.criterion], **IntervalModel.build(i).model_dump())
            for i in intervals
        ],
    )


class RobustAlternative(BaseModel):
    id: str
    name: str
    rank_probabilities: list[float]
    """Item r is the probability of rank r + 1."""
    p_best: float
    mean_rank: float


class ConfidenceModel(BaseModel):
    id: str
    """The alternative ranked first with the current weights."""
    p_best: float
    level: Literal["high", "medium", "low"]


class RobustnessModel(BaseModel):
    settings: RobustnessSettings
    alternatives: list[RobustAlternative]
    """Eligible alternatives, best mean rank first."""
    wins: list[list[float]]
    """wins[i][j]: probability that alternative i scores higher than j (same order as alternatives)."""
    confidence: ConfidenceModel


@router.post("/robustness", response_model=RobustnessModel)
def project_robustness(project: Project) -> RobustnessModel:
    """Monte Carlo simulation of the weighted sum with uncertain weights (settings from analysis.robustness)."""
    prepared = _prepare(project)
    result = compute(lambda: robustness(prepared))
    names = {a.id: a.name for a in project.alternatives}
    return RobustnessModel(
        settings=result.settings,
        alternatives=[
            RobustAlternative(
                id=id_,
                name=names[id_],
                rank_probabilities=[float(p) for p in result.rank_probabilities[k]],
                p_best=float(result.p_best[k]),
                mean_rank=float(result.mean_rank[k]),
            )
            for k, id_ in enumerate(result.alternative_ids)
        ],
        wins=result.wins.tolist(),
        confidence=ConfidenceModel(
            id=result.confidence.alternative_id, p_best=result.confidence.p_best, level=result.confidence.level
        ),
    )


class CurveRequest(BaseModel):
    project: Project
    criterion_id: str


class CurveAlternative(BaseModel):
    id: str
    x: float
    value: float | None
    """None for excluded alternatives."""


class CurveModel(BaseModel):
    criterion_id: str
    low: float
    high: float
    points: list[tuple[float, float]]
    """(raw value, value score) along the axis."""
    alternatives: list[CurveAlternative]


@router.post("/curve", response_model=CurveModel)
def project_curve(request: CurveRequest) -> CurveModel:
    """Points to draw a numeric criterion's value function, and where each alternative lies on it."""
    curve = compute(lambda: value_curve(request.project, request.criterion_id))
    return CurveModel(
        criterion_id=curve.criterion_id,
        low=curve.low,
        high=curve.high,
        points=curve.points,
        alternatives=[CurveAlternative(id=p.alternative_id, x=p.x, value=p.value) for p in curve.alternatives],
    )


class AhpPairModel(BaseModel):
    i: str
    j: str
    given: float
    """How much more important i was judged than j."""
    implied: float
    """w_i / w_j of the resulting weights."""


class AhpModel(BaseModel):
    cr: float
    lambda_max: float
    consistent: bool
    worst_pairs: list[AhpPairModel]


class LevelModel(BaseModel):
    key: str
    """"groups" or "within.<group id>" ("within._root" for ungrouped criteria)."""
    method: Literal["direct", "rank", "ahp"]
    weights: dict[str, float]
    """Local weights of the level's items (sum 1, or all 0)."""
    ahp: AhpModel | None = None


class WeightsModel(BaseModel):
    levels: list[LevelModel]
    weights: dict[str, float]
    """Global weight of each criterion."""


@router.post("/weights", response_model=WeightsModel)
def project_weights(project: Project) -> WeightsModel:
    """Local weights of every level and the global criterion weights; the data need not be complete."""
    result = compute(lambda: derive(project))
    return WeightsModel(
        levels=[
            LevelModel(
                key=level.key,
                method=level.method,
                weights=dict(zip(level.items, level.weights, strict=True)),
                ahp=None
                if level.ahp is None
                else AhpModel(
                    cr=level.ahp.cr,
                    lambda_max=level.ahp.lambda_max,
                    consistent=level.ahp.consistent,
                    worst_pairs=[AhpPairModel(**p.__dict__) for p in level.ahp.worst_pairs],
                ),
            )
            for level in result.levels
        ],
        weights=result.global_weights,
    )


@router.post(
    "/import",
    response_model=ProjectImport,
    responses={413: {"model": ErrorResponse}, 415: {"model": ErrorResponse}},
)
def import_project(http_request: Request, file: Annotated[UploadFile, File()]) -> ProjectImport:
    """Convert an uploaded template (.xlsx/.csv) or legacy V7 workbook into a project.

    Template data gets linear value functions over the data range; legacy
    data (already on a 0-100 benefit scale) gets the fixed range [0, 100].
    """
    upload = read_upload(http_request, file)
    source_format, project = project_from_upload(upload)
    return ProjectImport(filename=upload.filename, source_format=source_format, project=project)


def project_from_upload(upload: Upload) -> tuple[Literal["template", "legacy"], Project]:
    """A template or legacy workbook as a project (stamped with the app version)."""
    legacy = upload.legacy
    if legacy is None:
        project = project_from_problem(upload.problem, source=Source(filename=upload.filename, kind="template"))
        return "template", project.model_copy(update={"app_version": __version__})
    ids = {name: f"a{i + 1}" for i, name in enumerate(legacy.problem.alternatives)}
    source = Source(
        filename=upload.filename,
        kind="legacy",
        legacy={
            "reference_order": [ids[name] for name in legacy.reference_order],
            "prescaled": list(legacy.prescaled),
        },
    )
    project = project_from_problem(legacy.problem, bounds=(0.0, 100.0), source=source)
    return "legacy", project.model_copy(update={"app_version": __version__})


@router.post("/quality", response_model=list[IssueModel])
def project_quality(project: Project) -> list[IssueModel]:
    """Data quality findings per criterion (missing values, constant columns, extreme values, ...)."""
    return [IssueModel(**finding.to_dict()) for finding in quality_report(project)]


@router.post("/report", response_class=Response, responses={200: {"content": {XLSX_MEDIA_TYPE: {}}}})
def project_report(request: ReportRequest) -> Response:
    """Excel report v2: conclusion, results, data handling, weights, stability, Pareto, robustness, raw data."""
    project = request.project
    prepared = _prepare(project)
    problem = prepared.value_problem()
    results = [(method_label(s), compute(lambda s=s: run_method(prepared, s))) for s in project.analysis.methods]
    stability_sheets = None
    if request.include_stability:
        stability_sheets = {scope: stability_intervals(prepared, scope) for scope in StabilityScope}
    # The re-importable "Decision" sheet needs raw numeric data without gaps.
    try:
        decision = prepared.raw_problem() if not prepared.imputed else None
    except McdaError:
        decision = None
    computed = list(zip(project.analysis.methods, (r for _, r in results), strict=True))
    conclusion = _conclusion(prepared, computed)
    robust = compute(lambda: robustness(prepared)) if request.include_robustness else None
    front = [
        ("Conclusion", conclusion_rows(project, conclusion, request.conclusion, robust)),
        ("Data handling", data_handling_rows(prepared)),
        ("Weights", weights_rows(project, derive(project))),
    ]
    back = [("Robustness", robustness_rows(project, robust))] if robust is not None else []
    buffer = io.BytesIO()
    write_report(
        buffer,
        problem,
        results,
        stability_sheets,
        pareto(prepared) if request.include_pareto else None,
        decision=decision,
        front=front,
        back=back,
    )
    return _file_response(buffer.getvalue(), "mcda-report.xlsx", XLSX_MEDIA_TYPE)
