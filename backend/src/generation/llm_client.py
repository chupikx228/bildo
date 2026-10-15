import asyncio
import json
import logging
import math
import time
from collections.abc import Mapping, Sequence
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any, Literal, Protocol, TypedDict

from openai import (
    APIConnectionError,
    APIError,
    APIStatusError,
    AsyncOpenAI,
    BadRequestError,
    Omit,
    UnprocessableEntityError,
    omit,
)
from openai.types.chat import (
    ChatCompletion,
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
)
from openai.types.chat.completion_create_params import ResponseFormat

from src.generation.exceptions import (
    GenerationError,
    GenerationNotConfiguredError,
    StrictSchemaUnsupportedError,
    TransientProviderError,
)

logger = logging.getLogger(__name__)

JsonSchema = dict[str, Any]

ChatRole = Literal["system", "user", "assistant"]

ResponseFormatMode = Literal["json_schema", "text"]

MAX_OUTPUT_TOKENS = 64000

UNCONSTRAINED_MODEL_PREFIXES = ("anthropic/", "openai/", "x-ai/")

REQUEST_TIMEOUT_SECONDS = 750.0
IDLE_TIMEOUT_SECONDS = 60.0

SDK_MAX_RETRIES = 0

SCHEMA_REJECTION_MARKERS = ("schema", "grammar")
TRANSIENT_ERROR_MARKERS = ("connection error", "please retry")
TRANSIENT_STATUS_CODES = frozenset({408, 429})
RATE_LIMIT_STATUS_CODE = 429
NO_MATCHING_ENDPOINT_CODE = 404

LOG_ERROR_MESSAGE_CHARS = 200

LlmAttempt = tuple[int, int]

current_llm_attempt: ContextVar[LlmAttempt | None] = ContextVar("current_llm_attempt", default=None)


@dataclass
class _CallRecord:
    deadline_expired: bool = False
    provider: str | None = None
    finish_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    cost: float | None = None


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
        ignored_providers: Sequence[str] = (),
        max_price_by_model: Mapping[str, Mapping[str, float]] | None = None,
    ) -> None:
        self._api_key = api_key
        self._ignored_providers = tuple(ignored_providers)
        self._max_price_by_model = {
            model: dict(max_price) for model, max_price in (max_price_by_model or {}).items() if max_price
        }
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
            ignored_providers=self._ignored_providers,
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
        ignored_providers: Sequence[str] = (),
    ) -> str:
        record = _CallRecord()
        started = time.monotonic()
        outcome = "error"
        failure: BaseException | None = None
        try:
            content = await self._send(
                messages,
                model=model,
                mode=mode,
                response_format=response_format,
                max_tokens=max_tokens,
                ignored_providers=ignored_providers,
                record=record,
            )
        except BaseException as error:
            failure = error
            if isinstance(error, asyncio.CancelledError):
                outcome = "cancelled"
            elif isinstance(error, TransientProviderError):
                outcome = "transient"
            elif record.deadline_expired:
                outcome = "deadline"
            raise
        else:
            outcome = "ok"
            return content
        finally:
            _log_call(model, outcome, time.monotonic() - started, record, failure)

    async def _send(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str,
        mode: ResponseFormatMode,
        response_format: ResponseFormat | Omit,
        max_tokens: int,
        ignored_providers: Sequence[str],
        record: _CallRecord,
    ) -> str:
        client = self._ensure_client()
        extra_body = _provider_preferences(ignored_providers, self._max_price_by_model.get(model))
        deadline = asyncio.timeout(self._request_timeout_seconds)
        try:
            async with deadline:
                completion = await client.chat.completions.create(
                    model=model,
                    messages=[_to_message_param(message) for message in messages],
                    response_format=response_format,
                    max_tokens=max_tokens,
                    extra_body=extra_body,
                )
        except TimeoutError as error:
            if not deadline.expired():
                raise
            raise self._deadline_error(record) from error
        except (BadRequestError, UnprocessableEntityError) as error:
            raise _rejection(model, mode, str(error)) from error
        except APIConnectionError as error:
            if deadline.expired():
                raise self._deadline_error(record) from error
            raise TransientProviderError(f"RouterAI не ответил на запрос генерации: {error}") from error
        except APIStatusError as error:
            if _is_transient_status(error.status_code):
                raise TransientProviderError(
                    f"RouterAI не ответил на запрос генерации: {error}",
                    retry_after_seconds=_retry_after_seconds(error),
                ) from error
            raise GenerationError(f"RouterAI не ответил на запрос генерации: {error}") from error
        except APIError as error:
            raise GenerationError(f"RouterAI не ответил на запрос генерации: {error}") from error

        _read_completion(completion, record)
        provider_error = _extract_provider_error(completion)
        if provider_error is not None:
            raise _provider_failure(model, mode, provider_error)

        return _extract_content(completion, max_tokens)

    def _deadline_error(self, record: _CallRecord) -> GenerationError:
        record.deadline_expired = True
        return GenerationError(f"RouterAI не ответил на запрос генерации за {self._request_timeout_seconds:g} секунд")

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
                max_retries=SDK_MAX_RETRIES,
            )
            logger.info("RouterAI client ready: base_url=%s", self._base_url)
        return self._client


def _read_completion(completion: ChatCompletion, record: _CallRecord) -> None:
    provider = (completion.model_extra or {}).get("provider")
    record.provider = provider if isinstance(provider, str) else None
    if completion.choices:
        record.finish_reason = completion.choices[0].finish_reason
    usage = completion.usage
    if usage is not None:
        record.prompt_tokens = usage.prompt_tokens
        record.completion_tokens = usage.completion_tokens
        cost = (usage.model_extra or {}).get("cost")
        record.cost = float(cost) if isinstance(cost, int | float) and not isinstance(cost, bool) else None


def _log_call(model: str, outcome: str, seconds: float, record: _CallRecord, failure: BaseException | None) -> None:
    attempt = current_llm_attempt.get()
    fields = [
        f"model={model}",
        f"attempt={'-' if attempt is None else f'{attempt[0]}/{attempt[1]}'}",
        f"outcome={outcome}",
        f"duration_s={seconds:.2f}",
        f"provider={record.provider or '-'}",
        f"finish_reason={record.finish_reason or '-'}",
        f"prompt_tokens={_or_dash(record.prompt_tokens)}",
        f"completion_tokens={_or_dash(record.completion_tokens)}",
        f"cost={_or_dash(record.cost)}",
    ]
    if failure is not None:
        message = " ".join(str(failure).split())[:LOG_ERROR_MESSAGE_CHARS]
        fields += [f"error={type(failure).__name__}", f"error_message={message!r}"]
    logger.info("LLM call: %s", " ".join(fields))


def _or_dash(value: float | None) -> str:
    return "-" if value is None else str(value)


def _provider_preferences(
    ignored_providers: Sequence[str], max_price: Mapping[str, float] | None
) -> dict[str, Any] | None:
    provider: dict[str, Any] = {}
    if ignored_providers:
        provider["ignore"] = list(ignored_providers)
    if max_price:
        provider["max_price"] = dict(max_price)
    return {"provider": provider} if provider else None


def enforces_response_schema(model: str) -> bool:
    return not model.startswith(UNCONSTRAINED_MODEL_PREFIXES)


def _response_format_mode(model: str) -> ResponseFormatMode:
    return "json_schema" if enforces_response_schema(model) else "text"


def _rejection(model: str, mode: ResponseFormatMode, detail: str) -> GenerationError:
    if mode == "json_schema" and _is_schema_rejection(detail):
        logger.error("RouterAI rejected strict response_format=json_schema for model %s: %s", model, detail)
        return StrictSchemaUnsupportedError(model, detail)
    return GenerationError(f"RouterAI отклонил запрос генерации: {detail}")


def _provider_failure(model: str, mode: ResponseFormatMode, error: object) -> GenerationError:
    detail = str(error)
    schema_rejection = mode == "json_schema" and _is_schema_rejection(detail)
    if not schema_rejection and _is_transient_provider_error(error, detail):
        return TransientProviderError(f"RouterAI временно не смог выполнить запрос генерации: {detail}")
    return _rejection(model, mode, detail)


def _is_transient_provider_error(error: object, detail: str) -> bool:
    if _upstream_error_code(error) == NO_MATCHING_ENDPOINT_CODE:
        return False
    code = _provider_error_code(error)
    if code is not None and _is_transient_status(code):
        return True
    lowered = detail.lower()
    return any(marker in lowered for marker in TRANSIENT_ERROR_MARKERS)


def _provider_error_payload(error: object) -> dict[str, Any] | None:
    payload = error
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except ValueError:
            return None
    if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
        payload = payload["error"]
    return payload if isinstance(payload, dict) else None


def _provider_error_code(error: object) -> int | None:
    payload = _provider_error_payload(error)
    code = payload.get("code") if payload is not None else None
    return code if isinstance(code, int) else None


def _upstream_error_code(error: object) -> int | None:
    payload = _provider_error_payload(error)
    metadata = payload.get("metadata") if payload is not None else None
    code = metadata.get("provider_error_code") if isinstance(metadata, dict) else None
    try:
        return int(code) if isinstance(code, int | str) else None
    except ValueError:
        return None


def _is_transient_status(status_code: int) -> bool:
    return status_code in TRANSIENT_STATUS_CODES or status_code >= 500


def _retry_after_seconds(error: APIStatusError) -> float | None:
    if error.status_code != RATE_LIMIT_STATUS_CODE:
        return None
    value = error.response.headers.get("retry-after")
    if value is None:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return _seconds_until_http_date(value)
    if not math.isfinite(seconds) or seconds < 0:
        return None
    return seconds


def _seconds_until_http_date(value: str) -> float | None:
    try:
        moment = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return max(0.0, (moment - datetime.now(UTC)).total_seconds())


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


def _extract_provider_error(completion: ChatCompletion) -> object | None:
    if completion.choices:
        return None
    return getattr(completion, "error", None)


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
