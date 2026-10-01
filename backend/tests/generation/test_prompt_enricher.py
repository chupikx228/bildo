import asyncio
from collections.abc import Sequence

import pytest

from src.generation import structured_output as structured_output_module
from src.generation.exceptions import GenerationError, GenerationNotConfiguredError, TransientProviderError
from src.generation.llm_client import ChatMessage
from src.generation.prompt_enricher import (
    ENRICHER_MAX_OUTPUT_TOKENS,
    ENRICHER_SYSTEM_PROMPT,
    build_enricher_messages,
    enrich_prompt,
)
from tests.generation.fake_llm_client import FakeLlmClient

MODEL = "test/enricher"
PROMPT = "трекер привычек"
BRIEF = "Трекер привычек для студентов в сессию: фон #F3F6F4, акцент #1D3B2F."
TRANSIENT = "RouterAI временно не смог выполнить запрос генерации: Provider connection error, please retry"


class HangingTextClient(FakeLlmClient):
    async def complete_text(self, messages: Sequence[ChatMessage], *, model: str, max_tokens: int) -> str:
        await asyncio.sleep(1)
        return BRIEF


def test_messages_are_the_system_prompt_and_the_raw_request() -> None:
    assert build_enricher_messages(PROMPT) == [
        {"role": "system", "content": ENRICHER_SYSTEM_PROMPT},
        {"role": "user", "content": PROMPT},
    ]


def test_system_prompt_asks_only_for_colour_roles_the_theme_has() -> None:
    assert "success" not in ENRICHER_SYSTEM_PROMPT.lower()


async def test_returns_the_brief_without_surrounding_whitespace() -> None:
    client = FakeLlmClient([], [f"\n  {BRIEF}  \n"])

    assert await enrich_prompt(PROMPT, client=client, model=MODEL) == BRIEF


async def test_asks_the_given_model_for_plain_text_with_its_own_token_limit() -> None:
    client = FakeLlmClient([], [BRIEF])

    await enrich_prompt(PROMPT, client=client, model=MODEL)

    assert client.text_models == [MODEL]
    assert client.text_max_tokens == [ENRICHER_MAX_OUTPUT_TOKENS]
    assert client.text_calls == [build_enricher_messages(PROMPT)]
    assert client.calls == []


@pytest.mark.parametrize(
    "failure",
    [
        GenerationError("RouterAI отклонил запрос генерации: 400"),
        GenerationNotConfiguredError(),
        RuntimeError("connection reset"),
    ],
)
async def test_any_failure_means_no_brief(failure: Exception) -> None:
    client = FakeLlmClient([], [failure])

    assert await enrich_prompt(PROMPT, client=client, model=MODEL) is None


async def test_timeout_means_no_brief() -> None:
    client = HangingTextClient([])

    assert await enrich_prompt(PROMPT, client=client, model=MODEL, timeout_seconds=0.01) is None


async def test_failure_is_logged_as_a_fallback(caplog: pytest.LogCaptureFixture) -> None:
    client = FakeLlmClient([], [GenerationError("RouterAI не ответил на запрос генерации")])

    await enrich_prompt(PROMPT, client=client, model=MODEL)

    assert "falling back to the raw prompt" in caplog.text


@pytest.fixture
def no_transient_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(structured_output_module, "TRANSIENT_RETRY_DELAY_SECONDS", 0)


@pytest.mark.usefixtures("no_transient_delay")
async def test_first_transient_error_is_retried_with_the_same_request() -> None:
    client = FakeLlmClient([], [TransientProviderError(TRANSIENT), BRIEF])

    assert await enrich_prompt(PROMPT, client=client, model=MODEL) == BRIEF
    assert client.text_calls == [build_enricher_messages(PROMPT), build_enricher_messages(PROMPT)]


@pytest.mark.usefixtures("no_transient_delay")
async def test_second_transient_error_falls_back_without_a_third_request() -> None:
    client = FakeLlmClient([], [TransientProviderError(TRANSIENT), TransientProviderError(TRANSIENT), BRIEF])

    assert await enrich_prompt(PROMPT, client=client, model=MODEL) is None
    assert len(client.text_calls) == 2


@pytest.mark.usefixtures("no_transient_delay")
async def test_non_transient_failure_is_not_retried() -> None:
    client = FakeLlmClient([], [GenerationError("RouterAI отклонил запрос генерации: 400"), BRIEF])

    assert await enrich_prompt(PROMPT, client=client, model=MODEL) is None
    assert len(client.text_calls) == 1


async def test_retry_pause_counts_against_the_enricher_deadline() -> None:
    client = FakeLlmClient([], [TransientProviderError(TRANSIENT, retry_after_seconds=30), BRIEF])

    assert await enrich_prompt(PROMPT, client=client, model=MODEL, timeout_seconds=0.05) is None
    assert len(client.text_calls) == 1
