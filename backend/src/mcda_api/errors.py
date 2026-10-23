"""One error shape for every failure.

    {"code": "...", "detail": "...", "params": {...},
     "issues": [{"code", "params", "location", "message"}], "request_id": "..."}

``code`` and each issue's ``code`` are stable identifiers that clients
translate; ``detail`` and ``message`` are English fallbacks.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from mcda_core import Location, McdaError, ProblemValidationError, ValidationIssue
from mcda_core.errors import render

from .observability import request_id_var


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        params: dict[str, Any] | None = None,
        issues: list[ValidationIssue] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.params = params or {}
        self.issues = issues or []
        super().__init__(render(code, self.params))


def error_body(code: str, params: dict[str, Any] | None = None, issues: list[ValidationIssue] | None = None):
    params = params or {}
    return {
        "code": code,
        "detail": render(code, params),
        "params": params,
        "issues": [issue.to_dict() for issue in issues or []],
        "request_id": request_id_var.get(),
    }


def _request_issue(error: dict[str, Any]) -> ValidationIssue:
    parts = [str(part) for part in error["loc"]]
    if parts and parts[0] == "body":
        parts = parts[1:]
    location = Location("field", ref=".".join(parts)) if parts else None
    return ValidationIssue("request_invalid", {"detail": error["msg"], "type": error["type"]}, location)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.params, exc.issues), status_code=exc.status_code)

    @app.exception_handler(ProblemValidationError)
    async def invalid_problem(_: Request, exc: ProblemValidationError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, issues=list(exc.issues)), status_code=422)

    @app.exception_handler(McdaError)
    async def invalid_setting(_: Request, exc: McdaError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.params), status_code=422)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        issues = [_request_issue(error) for error in exc.errors()]
        return JSONResponse(error_body("invalid_request", issues=issues), status_code=422)
