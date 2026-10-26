"""FastAPI application.

Run locally with:  uv run uvicorn mcda_api.main:app --reload
Interactive API docs are then at http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .errors import install_error_handlers
from .observability import REQUEST_ID_HEADER, configure_logging, install_request_context
from .projects import router as projects_router
from .routes import router


def _env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Configuration, read from MCDA_* environment variables by default."""

    cors_origins: list[str] = field(
        default_factory=lambda: _env_list("MCDA_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    )
    max_upload_bytes: int = field(
        default_factory=lambda: int(float(os.environ.get("MCDA_MAX_UPLOAD_MB", "5")) * 1024 * 1024)
    )
    log_level: str = field(default_factory=lambda: os.environ.get("MCDA_LOG_LEVEL", "INFO"))
    log_format: str = field(default_factory=lambda: os.environ.get("MCDA_LOG_FORMAT", "text"))
    """'text' for development, 'json' for log collectors in production."""


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    configure_logging(settings.log_level, settings.log_format)
    app = FastAPI(
        title="MCDA API",
        version=__version__,
        description="Multi-criteria decision analysis: ranking methods, Pareto analysis and weight sensitivity.",
    )
    app.state.settings = settings
    # Middleware added last runs outermost: CORS must wrap the request context
    # so that even 500 responses carry CORS headers.
    install_request_context(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", REQUEST_ID_HEADER],
    )
    install_error_handlers(app)
    app.include_router(router)
    app.include_router(projects_router)
    return app


app = create_app()
