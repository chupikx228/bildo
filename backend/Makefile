.PHONY: install lint lint-fix format format-check typecheck arch test check fix

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

check: format-check lint typecheck arch test

fix: format lint-fix
