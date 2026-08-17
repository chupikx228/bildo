from src.config import settings
from src.generation.llm_client import LlmClient, RouterAiLlmClient


def build_llm_client() -> LlmClient:
    return RouterAiLlmClient(
        api_key=settings.routerai_api_key,
        base_url=settings.routerai_base_url,
        model=settings.routerai_model,
    )
