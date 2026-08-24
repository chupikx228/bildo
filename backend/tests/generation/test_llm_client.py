import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from openai import AsyncOpenAI

from src.generation import llm_client as llm_client_module
from src.generation.exceptions import GenerationError, GenerationNotConfiguredError
from src.generation.llm_client import ChatMessage, JsonSchema, RouterAiLlmClient

BASE_URL = "https://routerai.test/api/v1"
MODEL = "deepseek/deepseek-v4-flash"
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
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
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
        def make_openai(*, api_key: str, base_url: str) -> AsyncOpenAI:
            return AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                max_retries=0,
                http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
            )

        monkeypatch.setattr(llm_client_module, "AsyncOpenAI", make_openai)
        return RouterAiLlmClient("test-key", BASE_URL, MODEL)

    return build


async def complete(client: RouterAiLlmClient) -> str:
    return await client.complete(MESSAGES, SCHEMA_NAME, SCHEMA)


async def test_first_attempt_asks_for_a_json_schema(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected=set())
    client = build_client(gateway)

    assert await complete(client) == ANSWER
    await client.aclose()

    assert gateway.modes == ["json_schema"]
    assert gateway.payloads[0]["response_format"]["json_schema"]["name"] == SCHEMA_NAME
    assert gateway.payloads[0]["response_format"]["json_schema"]["schema"] == SCHEMA
    assert gateway.payloads[0]["messages"] == MESSAGES


async def test_downgrades_to_json_object_when_json_schema_is_rejected(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected={"json_schema"})
    client = build_client(gateway)

    assert await complete(client) == ANSWER
    await client.aclose()

    assert gateway.modes == ["json_schema", "json_object"]
    assert gateway.payloads[1]["response_format"] == {"type": "json_object"}


class EmbeddedErrorGateway:
    def __init__(self, rejected: set[str]) -> None:
        self._rejected = rejected
        self.modes: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        payload: dict[str, Any] = json.loads(request.content)
        response_format = payload.get("response_format")
        mode = NO_FORMAT if response_format is None else str(response_format["type"])
        self.modes.append(mode)
        if mode in self._rejected:
            return httpx.Response(200, json={"error": f"response_format {mode} is not supported"})
        return httpx.Response(200, json=completion_body(ANSWER))


async def test_downgrades_when_gateway_embeds_the_error_in_a_200_response(build_client: BuildClient) -> None:
    gateway = EmbeddedErrorGateway(rejected={"json_schema"})
    client = build_client(gateway)

    assert await complete(client) == ANSWER
    await client.aclose()

    assert gateway.modes == ["json_schema", "json_object"]


async def test_downgrades_on_unprocessable_entity_too(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected={"json_schema"}, status=422)
    client = build_client(gateway)

    assert await complete(client) == ANSWER
    await client.aclose()

    assert gateway.modes == ["json_schema", "json_object"]


async def test_drops_response_format_entirely_when_both_json_modes_are_rejected(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected={"json_schema", "json_object"})
    client = build_client(gateway)

    assert await complete(client) == ANSWER
    await client.aclose()

    assert gateway.modes == ["json_schema", "json_object", NO_FORMAT]
    assert "response_format" not in gateway.payloads[2]


async def test_fails_when_every_response_format_is_rejected(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected={"json_schema", "json_object", NO_FORMAT})
    client = build_client(gateway)

    with pytest.raises(GenerationError) as error:
        await complete(client)
    await client.aclose()

    assert gateway.modes == ["json_schema", "json_object", NO_FORMAT]
    assert "отклонил" in error.value.message


async def test_remembers_the_accepted_response_format_between_calls(build_client: BuildClient) -> None:
    gateway = StubGateway(rejected={"json_schema"})
    client = build_client(gateway)

    await complete(client)
    await complete(client)
    await complete(client)
    await client.aclose()

    assert gateway.modes == ["json_schema", "json_object", "json_object", "json_object"]


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


async def test_missing_api_key_is_reported_before_any_request(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden_openai(**kwargs: Any) -> AsyncOpenAI:
        raise AssertionError("Без ключа клиент RouterAI создаваться не должен")

    monkeypatch.setattr(llm_client_module, "AsyncOpenAI", forbidden_openai)
    client = RouterAiLlmClient(None, BASE_URL, MODEL)

    with pytest.raises(GenerationNotConfiguredError):
        await complete(client)
