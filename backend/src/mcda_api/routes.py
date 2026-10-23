"""HTTP endpoints. The API is stateless: clients send the problem with each request."""

from __future__ import annotations

import io
from collections.abc import Callable
from pathlib import PurePath
from typing import Annotated, Any, Literal, TypeVar, get_args

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import Response

from mcda_core import (
    Criterion,
    DecisionProblem,
    Direction,
    Location,
    McdaError,
    Normalization,
    ProblemValidationError,
    StabilityScope,
    ValidationIssue,
    pareto_analysis,
    pareto_front,
    weight_stability_intervals,
)
from mcda_core.io import (
    TEMPLATE_SHEET,
    looks_like_legacy,
    parse_legacy_rows,
    parse_rows,
    read_problem,
    read_xlsx_rows,
    write_problem,
    write_report,
)

from . import __version__
from .errors import ApiError
from .observability import logger
from .schemas import (
    METHOD_SPECS,
    DominanceModel,
    ErrorResponse,
    EvaluateRequest,
    EvaluateResponse,
    ImportResponse,
    IntervalModel,
    LegacyInfo,
    MethodInfo,
    MethodResultModel,
    ParetoRequest,
    ParetoResponse,
    ProblemModel,
    ReportRequest,
    StabilityRequest,
    StabilityResponse,
)

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
UPLOAD_SUFFIXES = (".xlsx", ".xlsm", ".csv")
ERRORS: dict[int | str, dict[str, Any]] = {422: {"model": ErrorResponse}}

router = APIRouter(prefix="/api/v1", responses=ERRORS)
T = TypeVar("T")


def compute(func: Callable[[], T]) -> T:
    """Run a calculation; any ValueError without a code still becomes a 422, not a 500."""
    try:
        return func()
    except (ProblemValidationError, McdaError):
        raise  # handled with their own codes
    except ValueError as exc:
        raise ApiError(422, "invalid_value", {"detail": str(exc)}) from exc


# --- Meta --------------------------------------------------------------------


@router.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@router.get("/methods", tags=["meta"], response_model=list[MethodInfo])
def methods() -> list[MethodInfo]:
    """Available methods with their normalisation options and defaults."""
    infos = []
    for spec in METHOD_SPECS:
        fields = spec.model_fields
        parameters = {
            name: field.default for name, field in fields.items() if name not in ("method", "normalization", "bounds")
        }
        infos.append(
            MethodInfo(
                method=fields["method"].default,
                higher_is_better=fields["method"].default != "compromise_programming",
                normalizations=list(get_args(fields["normalization"].annotation)),
                default_normalization=fields["normalization"].default,
                parameters={"bounds": fields["bounds"].default, **parameters},
            )
        )
    return infos


# --- Calculations ------------------------------------------------------------


@router.post("/problems/validate", tags=["analysis"], response_model=ProblemModel)
def validate_problem(problem: ProblemModel) -> ProblemModel:
    """Check a problem; returns it unchanged if valid, else 422 with all issues."""
    problem.to_domain()
    return problem


@router.post("/evaluate", tags=["analysis"], response_model=EvaluateResponse)
def evaluate(request: EvaluateRequest) -> EvaluateResponse:
    problem = request.problem.to_domain()
    return EvaluateResponse(
        results=[
            MethodResultModel.build(spec, compute(lambda spec=spec: spec.run(problem))) for spec in request.methods
        ]
    )


@router.post("/pareto", tags=["analysis"], response_model=ParetoResponse)
def pareto(request: ParetoRequest) -> ParetoResponse:
    problem = request.problem.to_domain()
    if request.criteria is not None:
        unknown = [name for name in request.criteria if name not in problem.criterion_names]
        if unknown or not request.criteria:
            issues = [ValidationIssue("unknown_criterion", location=Location("criterion", name=n)) for n in unknown]
            raise ApiError(422, "invalid_criteria_selection", issues=issues or [ValidationIssue("empty_selection")])
    return ParetoResponse(
        front=list(pareto_front(problem, request.criteria)),
        alternatives=[DominanceModel.build(info) for info in pareto_analysis(problem, request.criteria)],
    )


@router.post("/sensitivity/stability", tags=["analysis"], response_model=StabilityResponse)
def stability(request: StabilityRequest) -> StabilityResponse:
    problem = request.problem.to_domain()
    intervals = compute(
        lambda: weight_stability_intervals(problem, request.scope, Normalization(request.normalization), request.bounds)
    )
    return StabilityResponse(
        scope=request.scope,
        normalization=request.normalization,
        intervals=[IntervalModel.build(i) for i in intervals],
    )


# --- Import ------------------------------------------------------------------


@router.post(
    "/problems/import",
    tags=["files"],
    response_model=ImportResponse,
    responses={413: {"model": ErrorResponse}, 415: {"model": ErrorResponse}},
)
def import_problem(http_request: Request, file: Annotated[UploadFile, File()]) -> ImportResponse:
    """Read an uploaded template (.xlsx/.csv) or legacy V7 workbook."""
    filename = PurePath(file.filename or "upload").name
    suffix = PurePath(filename).suffix.lower()
    if suffix not in UPLOAD_SUFFIXES:
        raise ApiError(415, "unsupported_file_type", {"suffix": suffix})

    max_bytes = http_request.app.state.settings.max_upload_bytes
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ApiError(413, "file_too_large", {"max_mb": round(max_bytes / (1024 * 1024), 2)})

    try:
        if suffix == ".csv":
            return ImportResponse(
                filename=filename,
                source_format="template",
                problem=ProblemModel.from_domain(read_problem(io.BytesIO(data), suffix)),
            )
        rows = read_xlsx_rows(io.BytesIO(data), prefer_sheet=TEMPLATE_SHEET)
    except ProblemValidationError:
        raise
    except Exception as exc:  # corrupt or non-spreadsheet content
        logger.info("unreadable upload: %s", exc)
        raise ApiError(422, "file_unreadable", {"filename": filename, "suffix": suffix}) from exc

    if looks_like_legacy(rows):
        legacy = parse_legacy_rows(rows)
        return ImportResponse(
            filename=filename,
            source_format="legacy",
            problem=ProblemModel.from_domain(legacy.problem),
            legacy=LegacyInfo(reference_order=list(legacy.reference_order), prescaled=list(legacy.prescaled)),
        )
    return ImportResponse(
        filename=filename, source_format="template", problem=ProblemModel.from_domain(parse_rows(rows))
    )


# --- Export ------------------------------------------------------------------


def _file_response(data: bytes, filename: str, media_type: str) -> Response:
    return Response(data, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _problem_file(problem: DecisionProblem, file_format: str, stem: str) -> Response:
    buffer = io.BytesIO()
    write_problem(problem, buffer, suffix=f".{file_format}")
    media_type = XLSX_MEDIA_TYPE if file_format == "xlsx" else "text/csv; charset=utf-8"
    return _file_response(buffer.getvalue(), f"{stem}.{file_format}", media_type)


EXAMPLE_PROBLEM = DecisionProblem(
    alternatives=("Option A", "Option B", "Option C"),
    criteria=(
        Criterion("Cost", Direction.COST, 0.4),
        Criterion("Quality", Direction.BENEFIT, 0.4),
        Criterion("Risk", Direction.COST, 0.2),
    ),
    matrix=[[120.0, 7.0, 3.0], [95.0, 6.0, 4.0], [150.0, 9.0, 2.0]],
)


@router.get(
    "/template",
    tags=["files"],
    response_class=Response,
    responses={200: {"content": {XLSX_MEDIA_TYPE: {}, "text/csv": {}}}},
)
def template(file_format: Literal["xlsx", "csv"] = Query("xlsx", alias="format")) -> Response:
    """An example input file in the standard template layout."""
    return _problem_file(EXAMPLE_PROBLEM, file_format, "mcda-template")


@router.post(
    "/export/problem",
    tags=["files"],
    response_class=Response,
    responses={200: {"content": {XLSX_MEDIA_TYPE: {}, "text/csv": {}}}},
)
def export_problem(
    problem: ProblemModel, file_format: Literal["xlsx", "csv"] = Query("xlsx", alias="format")
) -> Response:
    return _problem_file(problem.to_domain(), file_format, "mcda-problem")


@router.post(
    "/export/report", tags=["files"], response_class=Response, responses={200: {"content": {XLSX_MEDIA_TYPE: {}}}}
)
def export_report(request: ReportRequest) -> Response:
    """Excel report: results of every method, stability intervals, Pareto analysis and the input."""
    problem = request.problem.to_domain()
    results = [(spec.label(), compute(lambda spec=spec: spec.run(problem))) for spec in request.methods]
    stability_sheets = None
    if request.stability is not None:
        options = request.stability
        stability_sheets = {
            scope: compute(
                lambda scope=scope: weight_stability_intervals(
                    problem, scope, Normalization(options.normalization), options.bounds
                )
            )
            for scope in StabilityScope
        }
    pareto_info = pareto_analysis(problem) if request.include_pareto else None

    buffer = io.BytesIO()
    write_report(buffer, problem, results, stability_sheets, pareto_info)
    return _file_response(buffer.getvalue(), "mcda-report.xlsx", XLSX_MEDIA_TYPE)
