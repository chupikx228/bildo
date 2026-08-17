from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql+asyncpg://bildo:bildo@localhost:5432/bildo"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    routerai_api_key: str | None = None
    routerai_base_url: str = "https://routerai.ru/api/v1"
    routerai_model: str = "deepseek/deepseek-v4-flash"
    routerai_max_retries: int = 3


settings = Settings()
