"""One error shape for every failure: {"detail": ..., "issues": [{location, message}]}."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from mcda_core import ProblemValidationError, ValidationIssue


class ApiError(Exception):
    def __init__(self, status_code: int, detail: str, issues: list[ValidationIssue] | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.issues = issues or []


def _body(detail: str, issues: list[ValidationIssue]) -> dict[str, object]:
    return {"detail": detail, "issues": [{"location": i.location, "message": i.message} for i in issues]}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(_body(exc.detail, exc.issues), status_code=exc.status_code)

    @app.exception_handler(ProblemValidationError)
    async def invalid_problem(_: Request, exc: ProblemValidationError) -> JSONResponse:
        return JSONResponse(_body("Invalid decision problem", list(exc.issues)), status_code=422)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        issues = [ValidationIssue(error["msg"], ".".join(str(part) for part in error["loc"])) for error in exc.errors()]
        return JSONResponse(_body("Invalid request", issues), status_code=422)
