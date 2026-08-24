.PHONY: install lint lint-fix format format-check typecheck arch test coverage check fix

install:
	uv sync --group dev

lint:
	uv run ruff check .

lint-fix:
	uv run ruff check . --fix

format:
	uv run ruff format .

format-check:
	uv run ruff format --check .

typecheck:
	uv run mypy src

arch:
	uv run lint-imports

test:
	uv run pytest

coverage:
	uv run pytest --cov=src --cov-report=term-missing

check: format-check lint typecheck arch coverage

fix: format lint-fix
