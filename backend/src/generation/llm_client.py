import asyncio
import logging
from collections.abc import Sequence
from typing import Any, Literal, Protocol, TypedDict

from openai import APIError, AsyncOpenAI, BadRequestError, Omit, UnprocessableEntityError, omit
from openai.types.chat import (
    ChatCompletion,
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
)
from openai.types.chat.completion_create_params import ResponseFormat

from src.generation.exceptions import GenerationError, GenerationNotConfiguredError, StrictSchemaUnsupportedError

logger = logging.getLogger(__name__)

JsonSchema = dict[str, Any]

ChatRole = Literal["system", "user", "assistant"]

ResponseFormatMode = Literal["json_schema", "text"]

MAX_OUTPUT_TOKENS = 64000

UNCONSTRAINED_MODEL_PREFIXES = ("anthropic/",)

REQUEST_TIMEOUT_SECONDS = 750.0
IDLE_TIMEOUT_SECONDS = 60.0

SCHEMA_REJECTION_MARKERS = ("schema", "grammar")


class ChatMessage(TypedDict):
    role: ChatRole
    content: str


class LlmClient(Protocol):
    async def complete(
        self,
        messages: Sequence[ChatMessage],
        schema_name: str,
        schema: JsonSchema,
        *,
        model: str,
    ) -> str: ...

    async def complete_text(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str,
        max_tokens: int,
    ) -> str: ...

    async def aclose(self) -> None: ...


class RouterAiLlmClient:
    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        *,
        request_timeout_seconds: float = REQUEST_TIMEOUT_SECONDS,
        idle_timeout_seconds: float = IDLE_TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._request_timeout_seconds = request_timeout_seconds
        self._idle_timeout_seconds = idle_timeout_seconds
        self._client: AsyncOpenAI | None = None

    async def complete(
        self,
        messages: Sequence[ChatMessage],
        schema_name: str,
        schema: JsonSchema,
        *,
        model: str,
    ) -> str:
        mode = _response_format_mode(model)
        return await self._request(
            messages,
            model=model,
            mode=mode,
            response_format=_response_format(mode, schema_name, schema),
            max_tokens=MAX_OUTPUT_TOKENS,
        )

    async def complete_text(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str,
        max_tokens: int,
    ) -> str:
        return await self._request(messages, model=model, mode="text", response_format=omit, max_tokens=max_tokens)

    async def _request(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str,
        mode: ResponseFormatMode,
        response_format: ResponseFormat | Omit,
        max_tokens: int,
    ) -> str:
        client = self._ensure_client()
        deadline = asyncio.timeout(self._request_timeout_seconds)
        try:
            async with deadline:
                completion = await client.chat.completions.create(
                    model=model,
                    messages=[_to_message_param(message) for message in messages],
                    response_format=response_format,
                    max_tokens=max_tokens,
                )
        except TimeoutError as error:
            if not deadline.expired():
                raise
            raise GenerationError(
                f"RouterAI не ответил на запрос генерации за {self._request_timeout_seconds:g} секунд"
            ) from error
        except (BadRequestError, UnprocessableEntityError) as error:
            raise _rejection(model, mode, str(error)) from error
        except APIError as error:
            raise GenerationError(f"RouterAI не ответил на запрос генерации: {error}") from error

        provider_error = _extract_provider_error(completion)
        if provider_error is not None:
            raise _rejection(model, mode, provider_error)

        return _extract_content(completion, max_tokens)

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    def _ensure_client(self) -> AsyncOpenAI:
        if self._api_key is None:
            raise GenerationNotConfiguredError
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
                timeout=self._idle_timeout_seconds,
            )
            logger.info("RouterAI client ready: base_url=%s", self._base_url)
        return self._client


def _response_format_mode(model: str) -> ResponseFormatMode:
    if model.startswith(UNCONSTRAINED_MODEL_PREFIXES):
        return "text"
    return "json_schema"


def _rejection(model: str, mode: ResponseFormatMode, detail: str) -> GenerationError:
    if mode == "json_schema" and _is_schema_rejection(detail):
        logger.error("RouterAI rejected strict response_format=json_schema for model %s: %s", model, detail)
        return StrictSchemaUnsupportedError(model, detail)
    return GenerationError(f"RouterAI отклонил запрос генерации: {detail}")


def _is_schema_rejection(detail: str) -> bool:
    lowered = detail.lower()
    return any(marker in lowered for marker in SCHEMA_REJECTION_MARKERS)


def _response_format(mode: ResponseFormatMode, schema_name: str, schema: JsonSchema) -> ResponseFormat | Omit:
    if mode == "json_schema":
        return {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "schema": schema, "strict": True},
        }
    return omit


def _to_message_param(message: ChatMessage) -> ChatCompletionMessageParam:
    if message["role"] == "system":
        return ChatCompletionSystemMessageParam(role="system", content=message["content"])
    if message["role"] == "assistant":
        return ChatCompletionAssistantMessageParam(role="assistant", content=message["content"])
    return ChatCompletionUserMessageParam(role="user", content=message["content"])


def _extract_provider_error(completion: ChatCompletion) -> str | None:
    if completion.choices:
        return None
    error = getattr(completion, "error", None)
    if error is None:
        return None
    return str(error)


def _extract_content(completion: ChatCompletion, max_tokens: int) -> str:
    if not completion.choices:
        raise GenerationError("RouterAI вернул пустой ответ")
    choice = completion.choices[0]
    if choice.finish_reason == "length":
        raise GenerationError(f"Ответ модели обрезан по лимиту в {max_tokens} токенов")
    content = choice.message.content
    if content is None or not content.strip():
        raise GenerationError("RouterAI вернул ответ без текста")
    return content
