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

    async def aclose(self) -> None: ...


class RouterAiLlmClient:
    def __init__(self, api_key: str | None, base_url: str) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._client: AsyncOpenAI | None = None

    async def complete(
        self,
        messages: Sequence[ChatMessage],
        schema_name: str,
        schema: JsonSchema,
        *,
        model: str,
    ) -> str:
        client = self._ensure_client()
        mode = _response_format_mode(model)
        try:
            completion = await client.chat.completions.create(
                model=model,
                messages=[_to_message_param(message) for message in messages],
                response_format=_response_format(mode, schema_name, schema),
                max_tokens=MAX_OUTPUT_TOKENS,
            )
        except (BadRequestError, UnprocessableEntityError) as error:
            raise _rejection(model, mode, str(error)) from error
        except APIError as error:
            raise GenerationError(f"RouterAI не ответил на запрос генерации: {error}") from error

        provider_error = _extract_provider_error(completion)
        if provider_error is not None:
            raise _rejection(model, mode, provider_error)

        return _extract_content(completion)

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    def _ensure_client(self) -> AsyncOpenAI:
        if self._api_key is None:
            raise GenerationNotConfiguredError
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self._api_key, base_url=self._base_url)
            logger.info("RouterAI client ready: base_url=%s", self._base_url)
        return self._client


def _response_format_mode(model: str) -> ResponseFormatMode:
    if model.startswith(UNCONSTRAINED_MODEL_PREFIXES):
        return "text"
    return "json_schema"


def _rejection(model: str, mode: ResponseFormatMode, detail: str) -> GenerationError:
    if mode == "json_schema":
        logger.error("RouterAI rejected strict response_format=json_schema for model %s: %s", model, detail)
        return StrictSchemaUnsupportedError(model, detail)
    return GenerationError(f"RouterAI отклонил запрос генерации: {detail}")


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


def _extract_content(completion: ChatCompletion) -> str:
    if not completion.choices:
        raise GenerationError("RouterAI вернул пустой ответ")
    choice = completion.choices[0]
    if choice.finish_reason == "length":
        raise GenerationError(f"Ответ модели обрезан по лимиту в {MAX_OUTPUT_TOKENS} токенов")
    content = choice.message.content
    if content is None or not content.strip():
        raise GenerationError("RouterAI вернул ответ без текста")
    return content
