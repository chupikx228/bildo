import logging
import os
import subprocess
import sys
import textwrap
from collections.abc import Iterator
from pathlib import Path

import pytest

from src.logging_config import APP_LOGGER_NAME, configure_logging

BACKEND_ROOT = Path(__file__).resolve().parent.parent
NOISY_LIBRARIES = ["httpx", "httpcore", "openai"]


@pytest.fixture
def app_logger() -> Iterator[logging.Logger]:
    logger = logging.getLogger(APP_LOGGER_NAME)
    level, handlers = logger.level, list(logger.handlers)
    logger.handlers.clear()
    yield logger
    logger.setLevel(level)
    logger.handlers[:] = handlers


def test_app_loggers_are_effective_at_the_configured_level(app_logger: logging.Logger) -> None:
    configure_logging("INFO")

    assert logging.getLogger("src.generation.llm_client").getEffectiveLevel() == logging.INFO
    assert logging.getLogger("src.generation.llm_client").isEnabledFor(logging.INFO)


def test_configured_level_is_applied(app_logger: logging.Logger) -> None:
    configure_logging("ERROR")

    assert not logging.getLogger("src.worker.tasks").isEnabledFor(logging.WARNING)


def test_noisy_libraries_stay_at_warning(app_logger: logging.Logger) -> None:
    configure_logging("DEBUG")

    for name in NOISY_LIBRARIES:
        assert logging.getLogger(name).getEffectiveLevel() >= logging.WARNING


def test_repeated_setup_does_not_duplicate_the_handler(app_logger: logging.Logger) -> None:
    configure_logging("INFO")
    configure_logging("INFO")

    assert len(app_logger.handlers) == 1


WORKER_SCRIPT = textwrap.dedent(
    """
    import asyncio, json, logging.config, sys

    from arq.logs import default_log_config

    logging.config.dictConfig(default_log_config(False))

    from src.worker.main import startup

    BODY = json.dumps({
        "id": "x", "object": "chat.completion", "created": 0, "model": "m", "provider": "StreamLake",
        "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "{}"}}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7, "cost": 0.01},
    }).encode()

    async def handle(reader, writer):
        await reader.readuntil(b"\\r\\n\\r\\n")
        await asyncio.sleep(0.05)
        head = b"HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\nContent-Length: %d\\r\\n\\r\\n" % len(BODY)
        writer.write(head + BODY)
        await writer.drain()
        writer.close()

    async def main():
        server = await asyncio.start_server(handle, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        async with server:
            ctx = {}
            await startup(ctx)
            client = ctx["llm_client"]
            client._base_url = f"http://127.0.0.1:{port}/api/v1"
            await client.complete([{"role": "user", "content": "SECRET-PROMPT-TEXT"}], "S", {"type": "object"}, model="vendor/model")
            await client.aclose()

    asyncio.run(main())
    """
)


def run_worker_script(**env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603
        [sys.executable, "-c", WORKER_SCRIPT],
        cwd=BACKEND_ROOT,
        env={**os.environ, "PYTHONPATH": str(BACKEND_ROOT), "ROUTERAI_API_KEY": "test-key", **env},
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )


def test_worker_started_the_way_arq_starts_it_prints_the_llm_call_line() -> None:
    result = run_worker_script(LOG_LEVEL="INFO")

    assert result.returncode == 0, result.stderr
    lines = [line for line in result.stderr.splitlines() if line.startswith("LLM call: ")]
    assert len(lines) == 1
    assert "model=vendor/model" in lines[0]
    assert "outcome=ok" in lines[0]
    assert "provider=StreamLake" in lines[0]
    assert "cost=0.01" in lines[0]
    assert "SECRET-PROMPT-TEXT" not in result.stderr


def test_worker_prints_nothing_from_the_app_at_warning_level() -> None:
    result = run_worker_script(LOG_LEVEL="WARNING")

    assert result.returncode == 0, result.stderr
    assert "LLM call:" not in result.stderr
