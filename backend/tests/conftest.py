import os
import subprocess
import sys
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path

import docker
import pytest
import pytest_asyncio
from sqlalchemy import text as sql_text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.community.postgres import PostgresContainer

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"


def _docker_available() -> bool:
    try:
        client = docker.from_env()
    except Exception:
        return False
    try:
        client.ping()
    except Exception:
        return False
    finally:
        client.close()
    return True


requires_docker = pytest.mark.skipif(not _docker_available(), reason="Docker is not available")


def upgrade_to(database_url: str, revision: str) -> None:
    env = {**os.environ, "DATABASE_URL": database_url}
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "alembic", "-c", str(ALEMBIC_INI), "upgrade", revision],
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        pytest.fail(
            f"alembic upgrade {revision} failed:\n--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}"
        )


@asynccontextmanager
async def migration_database(database_url: str, name: str) -> AsyncIterator[str]:
    admin = create_async_engine(database_url, isolation_level="AUTOCOMMIT")
    drop = sql_text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    create = sql_text(f'CREATE DATABASE "{name}"')
    async with admin.connect() as connection:
        await connection.execute(drop)
        await connection.execute(create)
    try:
        yield make_url(database_url).set(database=name).render_as_string(hide_password=False)
    finally:
        async with admin.connect() as connection:
            await connection.execute(drop)
        await admin.dispose()


@pytest.fixture(scope="session")
def postgres_container() -> Iterator[PostgresContainer]:
    with PostgresContainer("postgres:16-alpine", driver="asyncpg") as container:
        yield container


@pytest.fixture(scope="session")
def database_url(postgres_container: PostgresContainer) -> str:
    return postgres_container.get_connection_url()


@pytest.fixture(scope="session")
def _migrated_database(database_url: str) -> None:
    env = {**os.environ, "DATABASE_URL": database_url}
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "alembic", "-c", str(ALEMBIC_INI), "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        pytest.fail(f"alembic upgrade head failed:\n--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}")


@pytest_asyncio.fixture
async def db_engine(database_url: str, _migrated_database: None) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(database_url)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_connection(db_engine: AsyncEngine) -> AsyncIterator[AsyncConnection]:
    async with db_engine.connect() as connection:
        await connection.begin()
        yield connection
        await connection.rollback()


@pytest.fixture
def db_session_factory(db_connection: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=db_connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
