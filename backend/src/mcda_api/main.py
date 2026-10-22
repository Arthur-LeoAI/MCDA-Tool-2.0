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


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(
        title="MCDA API",
        version=__version__,
        description="Multi-criteria decision analysis: ranking methods, Pareto analysis and weight sensitivity.",
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    install_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
