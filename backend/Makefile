.PHONY: install lint lint-fix format format-check typecheck arch test check fix

install:
	uv sync --group dev

lint:
	ruff check .

lint-fix:
	ruff check . --fix

format:
	ruff format .

format-check:
	ruff format --check .

typecheck:
	mypy src

arch:
	lint-imports

test:
	pytest

check: format-check lint typecheck arch test

fix: format lint-fix
