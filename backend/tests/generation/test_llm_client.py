import asyncio
import contextlib
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest
from openai import AsyncOpenAI

from src.generation import llm_client as llm_client_module
from src.generation.exceptions import GenerationError, GenerationNotConfiguredError, StrictSchemaUnsupportedError
from src.generation.llm_client import (
    IDLE_TIMEOUT_SECONDS,
    MAX_OUTPUT_TOKENS,
    REQUEST_TIMEOUT_SECONDS,
    ChatMessage,
    JsonSchema,
    RouterAiLlmClient,
)
from src.worker.tasks import GENERATION_TIMEOUT_SECONDS

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
BuildClient = Callable[[Handler], RouterAiLlmClient]


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
    def build(handler: Handler) -> RouterAiLlmClient:
        def make_openai(*, api_key: str, base_url: str, timeout: float) -> AsyncOpenAI:
            return AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=timeout,
                max_retries=0,
                http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
            )

        monkeypatch.setattr(llm_client_module, "AsyncOpenAI", make_openai)
        return RouterAiLlmClient("test-key", BASE_URL)

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


@pytest.mark.parametrize("model", ["anthropic/claude-sonnet-5", "anthropic/claude-opus-5", "anthropic/claude-fable-5"])
async def test_anthropic_models_get_no_response_format_from_the_first_call(
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

    assert not isinstance(error.value, StrictSchemaUnsupportedError)
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
    assert TRANSIENT_PROVIDER_ERROR in error.value.message


LOCAL_GATEWAY_LIFETIME_SECONDS = 5.0

Respond = Callable[[asyncio.StreamReader, asyncio.StreamWriter], Awaitable[None]]


@asynccontextmanager
async def local_gateway(respond: Respond) -> AsyncIterator[str]:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
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


async def test_silent_connection_fails_on_the_idle_timeout() -> None:
    async with local_gateway(stay_silent) as base_url:
        client = RouterAiLlmClient("test-key", base_url, request_timeout_seconds=30, idle_timeout_seconds=0.2)
        started = time.monotonic()

        with pytest.raises(GenerationError) as error:
            await complete(client)
        await client.aclose()

    assert "Request timed out" in error.value.message
    assert time.monotonic() - started < LOCAL_GATEWAY_LIFETIME_SECONDS


async def test_request_kept_alive_with_whitespace_fails_on_the_request_timeout() -> None:
    async with local_gateway(keep_alive_with_whitespace) as base_url:
        client = RouterAiLlmClient("test-key", base_url, request_timeout_seconds=0.5, idle_timeout_seconds=0.2)
        started = time.monotonic()

        with pytest.raises(GenerationError) as error:
            await complete(client)
        await client.aclose()

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

    with pytest.raises(GenerationError):
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
