FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.13@sha256:b485bd65cc2cf1c9a93b3554012c9c3778cf7b1b5fd3d3096ce9e1226c97e1e6 /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY src/ src/
COPY alembic/ alembic/
COPY alembic.ini ./

RUN uv sync --locked --no-dev

RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 8000
