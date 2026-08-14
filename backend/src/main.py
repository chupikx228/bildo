from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic_core import ErrorDetails

from src.exceptions import DomainError

routers: list[APIRouter] = []


def create_app() -> FastAPI:
    app = FastAPI(title="Bildo API")

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


def _format_validation_error(error: ErrorDetails) -> str:
    location = ".".join(str(part) for part in error["loc"] if part != "body")
    return f"{location}: {error['msg']}" if location else error["msg"]


app = create_app()
