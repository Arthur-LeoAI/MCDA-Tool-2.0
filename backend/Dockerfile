# API image: dependencies are installed in a separate layer, so code changes rebuild quickly.
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.11 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

RUN useradd --system --no-create-home app
USER app

ENV PATH="/app/.venv/bin:$PATH" \
    MCDA_LOG_FORMAT=json
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')"]
CMD ["uvicorn", "mcda_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
