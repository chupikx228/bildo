import asyncio
import contextlib
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from typing import Any

import httpx
import pytest
from openai import AsyncOpenAI
from pydantic import BaseModel

from src.apps.schemas import AppDocument
from src.generation import llm_client as llm_client_module
from src.generation import structured_output as structured_output_module
from src.generation.exceptions import (
    GenerationError,
    GenerationNotConfiguredError,
    StrictSchemaUnsupportedError,
    TransientProviderError,
)
from src.generation.json_schema import to_strict_json_schema
from src.generation.llm_client import (
    IDLE_TIMEOUT_SECONDS,
    MAX_OUTPUT_TOKENS,
    REQUEST_TIMEOUT_SECONDS,
    ChatMessage,
    JsonSchema,
    RouterAiLlmClient,
    enforces_response_schema,
)
from src.generation.model_catalog import CURATED_MODELS
from src.generation.prompt import ALL_KEYS_RULE
from src.generation.service import generate_document
from src.generation.structured_output import (
    MAX_RETRY_AFTER_SECONDS,
    TRANSIENT_RETRY_DELAY_SECONDS,
    generate_structured,
)
from src.worker.tasks import GENERATION_TIMEOUT_SECONDS
from tests.generation.template_fixtures import build_template_document

BASE_URL = "https://routerai.test/api/v1"
MODEL = "deepseek/deepseek-v4-flash"
ANTHROPIC_MODEL = "anthropic/claude-sonnet-5"
SCHEMA_NAME = "AppDocument"
SCHEMA: JsonSchema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}
MESSAGES: list[ChatMessage] = [
    {"role": "system", "content": "ты собираешь документ приложения"},
    {"role": "user", "content": "трекер привычек"},
]
ANSWER = '{"name": "Трекер привычек"}'

NO_FORMAT = "none"

Handler = Callable[[httpx.Request], httpx.Response]
BuildClient = Callable[..., RouterAiLlmClient]


def completion_body(content: str | None) -> dict[str, Any]:
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 0,
        "model": MODEL,
        "provider": "DeepSeek",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content, "reasoning": None},
                "finish_reason": "stop",
                "native_finish_reason": "stop",
            }
        ],
    }


class StubGateway:
    def __init__(self, rejected: set[str], *, status: int = 400, body: dict[str, Any] | None = None) -> None:
        self._rejected = rejected
        self._status = status
        self._body = body if body is not None else completion_body(ANSWER)
        self.modes: list[str] = []
        self.payloads: list[dict[str, Any]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        payload: dict[str, Any] = json.loads(request.content)
        self.payloads.append(payload)
        response_format = payload.get("response_format")
        mode = NO_FORMAT if response_format is None else str(response_format["type"])
        self.modes.append(mode)
        if mode in self._rejected:
            return httpx.Response(self._status, json={"error": {"message": f"response_format {mode} is not supported"}})
        return httpx.Response(200, json=self._body)


@pytest.fixture
def build_client(monkeypatch: pytest.MonkeyPatch) -> BuildClient:
    def build(handler: Handler, **client_options: Any) -> RouterAiLlmClient:
        def make_openai(*, api_key: str, base_url: str, timeout: float, max_retries: int) -> AsyncOpenAI:
            return AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=timeout,
                max_retries=max_retries,
                http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
            )

        monkeypatch.setattr(llm_client_module, "AsyncOpenAI", make_openai)
        return RouterAiLlmClient("test-key", BASE_URL, **client_options)

    return build


async def complete(client: RouterAiLlmClient, model: str = MODEL) -> str:
    return await client.complete(MESSAGES, SCHEMA_NAME, SCHEMA, model=model)


async def test_first_attempt_asks_for_a_json_schema(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set())
    client = build_client(gateway)

    assert await complete(client) == ANSWER
    await client.aclose()

    assert gateway.modes == ["json_schema"]
    assert gateway.payloads[0]["response_format"]["json_schema"]["name"] == SCHEMA_NAME
    assert gateway.payloads[0]["response_format"]["json_schema"]["schema"] == SCHEMA
    assert gateway.payloads[0]["messages"] == MESSAGES


async def test_every_request_sets_the_output_token_limit(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set())
    client = build_client(gateway)

    await complete(client)
    await complete(client, model=ANTHROPIC_MODEL)
    await client.aclose()

    assert [payload["max_tokens"] for payload in gateway.payloads] == [MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS]


async def test_ignored_providers_are_sent_on_structured_requests(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set())
    client = build_client(gateway, ignored_providers=["OpenInference", "Other"])

    await complete(client)
    await complete(client, model=ANTHROPIC_MODEL)
    await client.aclose()

    assert [payload["provider"] for payload in gateway.payloads] == [{"ignore": ["OpenInference", "Other"]}] * 2


async def test_no_provider_preference_is_sent_by_default(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set())
    client = build_client(gateway)

    await complete(client)
    await client.aclose()

    assert "provider" not in gateway.payloads[0]


async def test_ignored_providers_are_not_sent_on_text_requests(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set())
    client = build_client(gateway, ignored_providers=["OpenInference"])

    await client.complete_text(MESSAGES, model=MODEL, max_tokens=100)
    await client.aclose()

    assert "provider" not in gateway.payloads[0]


STRICT_SCHEMA_BY_CURATED_MODEL = {
    "deepseek/deepseek-v4-pro": True,
    "openai/gpt-5.6-terra": True,
    "anthropic/claude-opus-5": False,
    "anthropic/claude-fable-5": False,
    "openai/gpt-5.6-sol": True,
    "x-ai/grok-4.6": False,
    "anthropic/claude-sonnet-5": False,
}


def test_every_curated_model_has_a_deliberate_schema_path() -> None:
    assert {model.id for model in CURATED_MODELS} == set(STRICT_SCHEMA_BY_CURATED_MODEL)


@pytest.mark.parametrize(
    ("model", "strict"), [*STRICT_SCHEMA_BY_CURATED_MODEL.items(), ("deepseek/deepseek-v4-flash", True)]
)
def test_strict_schema_path_is_chosen_by_model_family(model: str, strict: bool) -> None:
    assert enforces_response_schema(model) is strict


@pytest.mark.parametrize(
    "model", ["anthropic/claude-sonnet-5", "anthropic/claude-opus-5", "anthropic/claude-fable-5", "x-ai/grok-4.6"]
)
async def test_unconstrained_models_get_no_response_format_from_the_first_call(
    build_client: BuildClient, model: str
) -> None:
    gateway = StubGateway(rejected=set())
    client = build_client(gateway)

    assert await complete(client, model=model) == ANSWER
    await client.aclose()

    assert gateway.modes == [NO_FORMAT]
    assert "response_format" not in gateway.payloads[0]


@pytest.mark.parametrize("status", [400, 422])
async def test_rejected_strict_schema_fails_fast_instead_of_downgrading(build_client: BuildClient, status: int) -> None:
    gateway = StubGateway(rejected={"json_schema"}, status=status)
    client = build_client(gateway)

    with pytest.raises(StrictSchemaUnsupportedError) as error:
        await complete(client)
    await client.aclose()

    assert gateway.modes == ["json_schema"]
    assert MODEL in error.value.message
    assert "response_format json_schema is not supported" in error.value.message


def embedded_error_body(mode: str) -> dict[str, Any]:
    raw = json.dumps(
        {
            "error": {
                "message": f"response_format {mode} is not supported",
                "type": "invalid_request_error",
                "param": None,
                "code": None,
            }
        }
    )
    return {
        "id": "gen-test",
        "object": "chat.completion",
        "created": 0,
        "model": MODEL,
        "provider": "DeepSeek",
        "choices": [],
        "error": {
            "message": "Provider returned error",
            "code": 400,
            "metadata": {"provider_name": "DeepSeek", "raw": raw},
        },
        "previous_errors": [
            {"provider_name": "DeepSeek", "error": {"message": "Provider returned error", "code": 400}},
        ],
    }


async def test_strict_schema_rejection_embedded_in_a_200_response_fails_fast(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set(), body=embedded_error_body("json_schema"))
    client = build_client(gateway)

    with pytest.raises(StrictSchemaUnsupportedError) as error:
        await complete(client)
    await client.aclose()

    assert gateway.modes == ["json_schema"]
    assert "not supported" in error.value.message


def gateway_error_body(code: int, provider_raw: str) -> dict[str, Any]:
    error = {
        "error": {
            "message": "Provider returned error",
            "code": code,
            "metadata": {"raw": provider_raw, "provider_name": "Azure", "is_byok": False},
        }
    }
    return {"error": json.dumps(error)}


OPENAI_SCHEMA_REJECTION = json.dumps(
    {
        "error": {
            "message": "Invalid schema for response_format 'AppDocument': "
            "In context=('properties', 'a'), 'oneOf' is not permitted.",
            "type": "invalid_request_error",
            "param": "text.format.schema",
            "code": "invalid_json_schema",
        }
    }
)
ANTHROPIC_SCHEMA_REJECTION = json.dumps(
    {
        "type": "error",
        "error": {
            "type": "invalid_request_error",
            "message": "output_config.format.schema: Invalid schema: Circular reference detected in schema "
            "definitions: AppNode -> AppNode. Self-referencing or mutually-referencing definitions are not supported.",
        },
    }
)
ANTHROPIC_GRAMMAR_REJECTION = json.dumps(
    {"type": "error", "error": {"type": "invalid_request_error", "message": "The compiled grammar is too large"}}
)
TRANSIENT_PROVIDER_ERROR = "Provider connection error, please retry"


@pytest.mark.parametrize(
    "provider_raw", [OPENAI_SCHEMA_REJECTION, ANTHROPIC_SCHEMA_REJECTION, ANTHROPIC_GRAMMAR_REJECTION]
)
async def test_real_gateway_schema_rejection_fails_fast(build_client: BuildClient, provider_raw: str) -> None:
    client = build_client(StubGateway(rejected=set(), body=gateway_error_body(400, provider_raw)))

    with pytest.raises(StrictSchemaUnsupportedError) as error:
        await complete(client)
    await client.aclose()

    assert MODEL in error.value.message


async def test_transient_provider_error_embedded_in_a_200_response_is_not_a_schema_rejection(
    build_client: BuildClient,
) -> None:
    body = gateway_error_body(502, json.dumps({"error": {"message": TRANSIENT_PROVIDER_ERROR}}))
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert isinstance(error.value, TransientProviderError)
    assert TRANSIENT_PROVIDER_ERROR in error.value.message


@pytest.mark.parametrize("status", [400, 422])
async def test_transient_provider_error_with_a_client_error_status_is_not_a_schema_rejection(
    build_client: BuildClient, status: int
) -> None:
    def transient(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": TRANSIENT_PROVIDER_ERROR, "code": status}})

    client = build_client(transient)

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert not isinstance(error.value, StrictSchemaUnsupportedError)
    assert not isinstance(error.value, TransientProviderError)
    assert TRANSIENT_PROVIDER_ERROR in error.value.message


@pytest.mark.parametrize("code", [408, 429, 500, 502, 503, 504])
async def test_provider_error_with_a_transient_code_embedded_in_a_200_response_is_transient(
    build_client: BuildClient, code: int
) -> None:
    body = gateway_error_body(code, json.dumps({"error": {"message": "upstream failed"}}))
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(TransientProviderError) as error:
        await complete(client)
    await client.aclose()

    assert "upstream failed" in error.value.message


async def test_provider_error_with_a_client_error_code_embedded_in_a_200_response_is_not_transient(
    build_client: BuildClient,
) -> None:
    body = gateway_error_body(400, json.dumps({"error": {"message": "max_tokens is too large"}}))
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert not isinstance(error.value, TransientProviderError)
    assert not isinstance(error.value, StrictSchemaUnsupportedError)
    assert "max_tokens is too large" in error.value.message


async def test_schema_rejection_wins_over_a_transient_error_in_the_same_response(build_client: BuildClient) -> None:
    body = gateway_error_body(502, OPENAI_SCHEMA_REJECTION + " " + TRANSIENT_PROVIDER_ERROR)
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(StrictSchemaUnsupportedError):
        await complete(client)
    await client.aclose()


async def test_transient_text_without_a_response_format_is_still_transient(build_client: BuildClient) -> None:
    body = gateway_error_body(400, json.dumps({"error": {"message": f"schema cache: {TRANSIENT_PROVIDER_ERROR}"}}))
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(TransientProviderError):
        await complete(client, model=ANTHROPIC_MODEL)
    await client.aclose()


@pytest.mark.parametrize("status", [408, 429, 500, 502, 503, 504])
async def test_gateway_status_that_is_transient_becomes_a_transient_error(
    build_client: BuildClient, status: int
) -> None:
    def failing(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": "gateway is busy"}})

    client = build_client(failing)

    with pytest.raises(TransientProviderError):
        await complete(client)
    await client.aclose()


@pytest.mark.parametrize("status", [401, 402, 403, 404])
async def test_gateway_status_that_is_not_transient_stays_a_plain_generation_error(
    build_client: BuildClient, status: int
) -> None:
    def failing(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": "nope"}})

    client = build_client(failing)

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert not isinstance(error.value, TransientProviderError)


class Named(BaseModel):
    name: str


@pytest.fixture
def no_transient_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(structured_output_module, "TRANSIENT_RETRY_DELAY_SECONDS", 0)


class FlakyGateway:
    def __init__(self, failures: list[dict[str, Any]]) -> None:
        self._failures = failures
        self.calls = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        if self._failures:
            return httpx.Response(200, json=self._failures.pop(0))
        return httpx.Response(200, json=completion_body(ANSWER))


async def generate_named(client: RouterAiLlmClient, max_attempts: int = 3) -> Named:
    return await generate_structured(
        MESSAGES,
        client=client,
        model=MODEL,
        schema_name=SCHEMA_NAME,
        schema=SCHEMA,
        target_model=Named,
        max_attempts=max_attempts,
    )


def transient_body() -> dict[str, Any]:
    return gateway_error_body(502, json.dumps({"error": {"message": TRANSIENT_PROVIDER_ERROR}}))


@pytest.mark.usefixtures("no_transient_delay")
async def test_transient_gateway_error_is_retried_until_the_model_answers(build_client: BuildClient) -> None:
    gateway = FlakyGateway([transient_body(), transient_body()])
    client = build_client(gateway)

    assert await generate_named(client) == Named(name="Трекер привычек")
    await client.aclose()

    assert gateway.calls == 3


@pytest.mark.usefixtures("no_transient_delay")
async def test_transient_gateway_errors_exhaust_the_attempts(build_client: BuildClient) -> None:
    gateway = FlakyGateway([transient_body() for _ in range(3)])
    client = build_client(gateway)

    with pytest.raises(TransientProviderError) as error:
        await generate_named(client)
    await client.aclose()

    assert gateway.calls == 3
    assert TRANSIENT_PROVIDER_ERROR in error.value.message


@pytest.mark.usefixtures("no_transient_delay")
async def test_strict_schema_rejection_is_not_retried(build_client: BuildClient) -> None:
    gateway = FlakyGateway([gateway_error_body(400, OPENAI_SCHEMA_REJECTION)])
    client = build_client(gateway)

    with pytest.raises(StrictSchemaUnsupportedError):
        await generate_named(client)
    await client.aclose()

    assert gateway.calls == 1


@pytest.mark.usefixtures("no_transient_delay")
async def test_network_failure_is_retried_by_us_not_by_the_sdk(build_client: BuildClient) -> None:
    calls = 0

    def unreachable_once(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectError("шлюз недоступен", request=request)
        return httpx.Response(200, json=completion_body(ANSWER))

    client = build_client(unreachable_once)

    assert await generate_named(client) == Named(name="Трекер привычек")
    await client.aclose()

    assert calls == 2


@pytest.fixture
def recorded_sleeps(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    sleeps: list[float] = []

    async def record(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(asyncio, "sleep", record)
    return sleeps


def rate_limited_once(headers: dict[str, str]) -> Handler:
    calls = 0

    def gateway(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers=headers, json={"error": {"message": "rate limit exceeded"}})
        return httpx.Response(200, json=completion_body(ANSWER))

    return gateway


@pytest.mark.parametrize(
    ("headers", "expected_delay"),
    [
        ({"Retry-After": "7"}, 7.0),
        ({"Retry-After": "0.5"}, 0.5),
        ({"Retry-After": "0"}, 0.0),
        ({}, TRANSIENT_RETRY_DELAY_SECONDS),
        ({"Retry-After": "soon"}, TRANSIENT_RETRY_DELAY_SECONDS),
        ({"Retry-After": "-5"}, TRANSIENT_RETRY_DELAY_SECONDS),
        ({"Retry-After": "3600"}, MAX_RETRY_AFTER_SECONDS),
    ],
)
async def test_rate_limit_retry_waits_as_long_as_retry_after_says(
    build_client: BuildClient, recorded_sleeps: list[float], headers: dict[str, str], expected_delay: float
) -> None:
    client = build_client(rate_limited_once(headers))

    assert await generate_named(client) == Named(name="Трекер привычек")
    await client.aclose()

    assert recorded_sleeps == [expected_delay]


async def test_rate_limit_retry_after_as_an_http_date(build_client: BuildClient, recorded_sleeps: list[float]) -> None:
    retry_at = format_datetime(datetime.now(UTC) + timedelta(seconds=30), usegmt=True)
    client = build_client(rate_limited_once({"Retry-After": retry_at}))

    assert await generate_named(client) == Named(name="Трекер привычек")
    await client.aclose()

    assert len(recorded_sleeps) == 1
    assert 25 < recorded_sleeps[0] <= 30


async def test_rate_limit_retry_after_date_in_the_past_retries_immediately(
    build_client: BuildClient, recorded_sleeps: list[float]
) -> None:
    retry_at = format_datetime(datetime.now(UTC) - timedelta(minutes=5), usegmt=True)
    client = build_client(rate_limited_once({"Retry-After": retry_at}))

    assert await generate_named(client) == Named(name="Трекер привычек")
    await client.aclose()

    assert recorded_sleeps == [0.0]


async def test_sdk_retries_are_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}
    gateway = StubGateway(rejected=set())

    def make_openai(**kwargs: Any) -> AsyncOpenAI:
        seen.update(kwargs)
        return AsyncOpenAI(**kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(gateway)))

    monkeypatch.setattr(llm_client_module, "AsyncOpenAI", make_openai)
    client = RouterAiLlmClient("test-key", BASE_URL)

    await complete(client)
    await client.aclose()

    assert seen["max_retries"] == 0


LOCAL_GATEWAY_LIFETIME_SECONDS = 5.0

Respond = Callable[[asyncio.StreamReader, asyncio.StreamWriter], Awaitable[None]]


@asynccontextmanager
async def local_gateway(respond: Respond, connections: list[int] | None = None) -> AsyncIterator[str]:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        if connections is not None:
            connections.append(1)
        await reader.readuntil(b"\r\n\r\n")
        with contextlib.suppress(ConnectionError, TimeoutError):
            async with asyncio.timeout(LOCAL_GATEWAY_LIFETIME_SECONDS):
                await respond(reader, writer)
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    async with server:
        yield f"http://127.0.0.1:{port}/api/v1"


async def stay_silent(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    await reader.read()


async def keep_alive_with_whitespace(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 1000000\r\n\r\n")
    while True:
        writer.write(b"\n         \n")
        await writer.drain()
        await asyncio.sleep(0.05)


async def test_silent_connection_fails_on_the_idle_timeout_without_sdk_retries() -> None:
    connections: list[int] = []
    async with local_gateway(stay_silent, connections) as base_url:
        client = RouterAiLlmClient("test-key", base_url, request_timeout_seconds=30, idle_timeout_seconds=0.2)
        started = time.monotonic()

        with pytest.raises(TransientProviderError) as error:
            await complete(client)
        await client.aclose()

    assert "Request timed out" in error.value.message
    assert len(connections) == 1
    assert time.monotonic() - started < LOCAL_GATEWAY_LIFETIME_SECONDS


async def test_request_kept_alive_with_whitespace_fails_on_the_request_timeout() -> None:
    async with local_gateway(keep_alive_with_whitespace) as base_url:
        client = RouterAiLlmClient("test-key", base_url, request_timeout_seconds=0.5, idle_timeout_seconds=0.2)
        started = time.monotonic()

        with pytest.raises(GenerationError) as error:
            await complete(client)
        await client.aclose()

    assert not isinstance(error.value, TransientProviderError)
    assert "за 0.5 секунд" in error.value.message
    assert time.monotonic() - started < LOCAL_GATEWAY_LIFETIME_SECONDS


def test_default_timeouts_bound_a_request_below_the_generation_deadline() -> None:
    assert IDLE_TIMEOUT_SECONDS < REQUEST_TIMEOUT_SECONDS < GENERATION_TIMEOUT_SECONDS


async def test_rejected_unconstrained_request_is_a_plain_generation_error(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected={NO_FORMAT})
    client = build_client(gateway)

    with pytest.raises(GenerationError) as error:
        await complete(client, model=ANTHROPIC_MODEL)
    await client.aclose()

    assert not isinstance(error.value, StrictSchemaUnsupportedError)
    assert "отклонил" in error.value.message


async def test_answer_cut_off_by_the_token_limit_becomes_a_generation_error(build_client: BuildClient) -> None:
    body = completion_body('{"name": "Трекер')
    body["choices"][0]["finish_reason"] = "length"
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert "обрезан" in error.value.message


async def test_network_failure_becomes_a_generation_error(build_client: BuildClient) -> None:
    def unreachable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("шлюз недоступен", request=request)

    client = build_client(unreachable)

    with pytest.raises(TransientProviderError):
        await complete(client)
    await client.aclose()


async def test_answer_without_text_becomes_a_generation_error(build_client: BuildClient) -> None:
    client = build_client(StubGateway(rejected=set(), body=completion_body(None)))

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert "без текста" in error.value.message


async def test_answer_without_choices_becomes_a_generation_error(build_client: BuildClient) -> None:
    body = completion_body(ANSWER)
    body["choices"] = []
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert "пустой ответ" in error.value.message


async def test_text_request_has_no_response_format_and_uses_the_given_token_limit(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set(), body=completion_body("бриф приложения"))
    client = build_client(gateway)

    assert await client.complete_text(MESSAGES, model=MODEL, max_tokens=1234) == "бриф приложения"
    await client.aclose()

    assert gateway.modes == [NO_FORMAT]
    assert gateway.payloads[0]["max_tokens"] == 1234
    assert gateway.payloads[0]["messages"] == MESSAGES


async def test_rejected_text_request_is_a_plain_generation_error(build_client: BuildClient) -> None:
    client = build_client(StubGateway(rejected={NO_FORMAT}))

    with pytest.raises(GenerationError) as error:
        await client.complete_text(MESSAGES, model=MODEL, max_tokens=1234)
    await client.aclose()

    assert not isinstance(error.value, StrictSchemaUnsupportedError)
    assert "отклонил" in error.value.message


async def test_text_answer_cut_off_reports_the_limit_it_was_given(build_client: BuildClient) -> None:
    body = completion_body("бриф при")
    body["choices"][0]["finish_reason"] = "length"
    client = build_client(StubGateway(rejected=set(), body=body))

    with pytest.raises(GenerationError) as error:
        await client.complete_text(MESSAGES, model=MODEL, max_tokens=1234)
    await client.aclose()

    assert "1234" in error.value.message


async def test_missing_api_key_is_reported_before_any_request(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden_openai(**kwargs: Any) -> AsyncOpenAI:
        raise AssertionError("Без ключа клиент RouterAI создаваться не должен")

    monkeypatch.setattr(llm_client_module, "AsyncOpenAI", forbidden_openai)
    client = RouterAiLlmClient(None, BASE_URL)

    with pytest.raises(GenerationNotConfiguredError):
        await complete(client)


def app_document_answer() -> str:
    return json.dumps(build_template_document("трекер", "Трекер").model_dump(mode="json", by_alias=True))


@pytest.mark.parametrize(
    ("model", "strict"),
    [
        ("anthropic/claude-sonnet-5", False),
        ("anthropic/claude-opus-5", False),
        ("anthropic/claude-fable-5", False),
        ("x-ai/grok-4.6", False),
        ("deepseek/deepseek-v4-flash", True),
        ("openai/gpt-5.6-terra", True),
    ],
)
async def test_generation_request_payload_carries_the_schema_matching_the_model_family(
    build_client: BuildClient, model: str, strict: bool
) -> None:
    gateway = StubGateway(rejected=set(), body=completion_body(app_document_answer()))
    client = build_client(gateway)

    await generate_document("трекер", None, client=client, model=model, max_attempts=1)
    await client.aclose()

    payload = gateway.payloads[0]
    plain = AppDocument.model_json_schema(by_alias=True)
    system = payload["messages"][0]["content"]
    embedded = json.loads(system.split("JSON Schema документа:\n", 1)[1])
    if strict:
        assert embedded == to_strict_json_schema(plain)
        assert payload["response_format"]["json_schema"]["schema"] == to_strict_json_schema(plain)
        assert ALL_KEYS_RULE in system
    else:
        assert embedded == plain
        assert "response_format" not in payload
        assert ALL_KEYS_RULE not in system
