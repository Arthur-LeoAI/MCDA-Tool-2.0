"""Meta and template endpoints, plus the upload and calculation helpers shared by the routers.

The API is stateless: clients send the whole project with each request.
"""

from __future__ import annotations

import io
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import PurePath
from typing import Any, Literal, TypeVar, get_args

from fastapi import APIRouter, Query, Request, UploadFile
from fastapi.responses import Response

from mcda_core import (
    Criterion,
    DecisionProblem,
    Direction,
    McdaError,
    ProblemValidationError,
)
from mcda_core.io import (
    TEMPLATE_SHEET,
    LegacyWorkbook,
    looks_like_legacy,
    parse_legacy_rows,
    parse_rows,
    read_problem,
    read_xlsx_rows,
    write_problem,
)

from . import __version__
from .errors import ApiError
from .observability import logger
from .schemas import METHOD_SPECS, ErrorResponse, MethodInfo

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


# --- Uploads ------------------------------------------------------------------


@dataclass(frozen=True)
class Upload:
    filename: str
    problem: DecisionProblem
    legacy: LegacyWorkbook | None


@dataclass(frozen=True)
class ReceivedFile:
    filename: str
    suffix: str
    data: bytes


def receive_upload(http_request: Request, file: UploadFile) -> ReceivedFile:
    """Check the type and size of an uploaded spreadsheet and read its bytes."""
    filename = PurePath(file.filename or "upload").name
    suffix = PurePath(filename).suffix.lower()
    if suffix not in UPLOAD_SUFFIXES:
        raise ApiError(415, "unsupported_file_type", {"suffix": suffix})
    max_bytes = http_request.app.state.settings.max_upload_bytes
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ApiError(413, "file_too_large", {"max_mb": round(max_bytes / (1024 * 1024), 2)})
    return ReceivedFile(filename, suffix, data)


def unreadable(received: ReceivedFile, exc: Exception) -> ApiError:
    logger.info("unreadable upload: %s", exc)
    return ApiError(422, "file_unreadable", {"filename": received.filename, "suffix": received.suffix})


def read_upload(http_request: Request, file: UploadFile) -> Upload:
    """Read an uploaded spreadsheet as a standard template or legacy workbook."""
    received = receive_upload(http_request, file)
    try:
        if received.suffix == ".csv":
            return Upload(received.filename, read_problem(io.BytesIO(received.data), received.suffix), None)
        rows = read_xlsx_rows(io.BytesIO(received.data), prefer_sheet=TEMPLATE_SHEET)
    except ProblemValidationError:
        raise
    except Exception as exc:  # corrupt or non-spreadsheet content
        raise unreadable(received, exc) from exc

    if looks_like_legacy(rows):
        legacy = parse_legacy_rows(rows)
        return Upload(received.filename, legacy.problem, legacy)
    return Upload(received.filename, parse_rows(rows), None)


# --- Template ------------------------------------------------------------------


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
