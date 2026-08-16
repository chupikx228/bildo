from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic_core import ErrorDetails

from src.apps.router import router as apps_router
from src.codegen.router import router as codegen_router
from src.config import settings
from src.exceptions import DomainError
from src.queue.arq_queue import create_arq_pool
from src.tasks.router import router as tasks_router

routers: list[APIRouter] = [apps_router, codegen_router, tasks_router]

VALIDATION_MESSAGES: dict[str, str] = {
    "missing": "обязательное поле",
    "string_too_short": "слишком короткое значение",
    "string_too_long": "слишком длинное значение",
    "string_type": "должно быть строкой",
    "int_parsing": "должно быть числом",
    "int_type": "должно быть числом",
    "float_parsing": "должно быть числом",
    "float_type": "должно быть числом",
    "bool_type": "должно быть булевым значением",
    "list_type": "должно быть списком",
    "dict_type": "должно быть объектом",
    "model_attributes_type": "должно быть объектом",
    "uuid_parsing": "должно быть идентификатором UUID",
    "json_invalid": "некорректный JSON",
    "literal_error": "недопустимое значение",
    "enum": "недопустимое значение",
    "union_tag_invalid": "недопустимый тип элемента",
    "union_tag_not_found": "не указан тип элемента",
    "extra_forbidden": "лишнее поле",
    "greater_than": "значение слишком мало",
    "greater_than_equal": "значение слишком мало",
    "less_than": "значение слишком велико",
    "less_than_equal": "значение слишком велико",
}

DEFAULT_VALIDATION_MESSAGE = "некорректное значение"
VALUE_ERROR_PREFIX = "Value error, "

CORS_METHODS = ["GET", "POST", "PUT", "DELETE"]
CORS_HEADERS = ["Content-Type"]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.arq_redis = await create_arq_pool()
    try:
        yield
    finally:
        await app.state.arq_redis.aclose()


def create_app() -> FastAPI:
    app = FastAPI(title="Bildo API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=CORS_METHODS,
        allow_headers=CORS_HEADERS,
    )

    for router in routers:
        app.include_router(router)

    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": exc.message})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = "; ".join(_format_validation_error(error) for error in exc.errors())
        message = f"Ошибка валидации данных: {details}" if details else "Ошибка валидации данных"
        return JSONResponse(status_code=422, content={"error": message})

    return app


def _validation_message(error: ErrorDetails) -> str:
    error_type = error["type"]
    if error_type == "value_error":
        message = error["msg"].removeprefix(VALUE_ERROR_PREFIX).strip()
        return message or DEFAULT_VALIDATION_MESSAGE
    return VALIDATION_MESSAGES.get(error_type, DEFAULT_VALIDATION_MESSAGE)


def _format_validation_error(error: ErrorDetails) -> str:
    location = ".".join(str(part) for part in error["loc"] if part != "body")
    message = _validation_message(error)
    return f"{location}: {message}" if location else message


app = create_app()
