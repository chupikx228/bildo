import pytest

from src.config import Settings
from src.generation.llm_client import resolve_max_price
from src.generation.model_catalog import CURATED_MODELS


def test_default_deepseek_flash_route_is_capped_and_skips_expensive_providers() -> None:
    settings = Settings(_env_file=None)

    assert settings.routerai_max_price_by_model == {"deepseek/deepseek-v4-flash": {"completion": 1.0}}
    assert settings.routerai_ignored_providers == ["OpenInference", "yandex"]


def test_price_cap_is_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ROUTERAI_MAX_PRICE_BY_MODEL", '{"deepseek/deepseek-v4-pro": {"completion": 4.5}}')

    assert Settings(_env_file=None).routerai_max_price_by_model == {"deepseek/deepseek-v4-pro": {"completion": 4.5}}


def test_empty_environment_value_turns_the_cap_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ROUTERAI_MAX_PRICE_BY_MODEL", "{}")

    assert Settings(_env_file=None).routerai_max_price_by_model == {}


DEEPSEEK_PRICE_CAP_BY_CURATED_MODEL: dict[str, dict[str, float] | None] = {
    "deepseek/deepseek-v4-pro": None,
}


def test_every_curated_deepseek_model_has_a_deliberate_price_cap_decision() -> None:
    curated = {model.id for model in CURATED_MODELS if model.id.startswith("deepseek/")}

    assert curated == set(DEEPSEEK_PRICE_CAP_BY_CURATED_MODEL)


def test_curated_deepseek_models_follow_the_default_price_cap_decision() -> None:
    caps = Settings(_env_file=None).routerai_max_price_by_model

    for model, expected in DEEPSEEK_PRICE_CAP_BY_CURATED_MODEL.items():
        resolved = resolve_max_price(caps, model)
        assert (dict(resolved) if resolved is not None else None) == expected, model


def test_default_generation_and_enricher_models_are_capped() -> None:
    settings = Settings(_env_file=None)
    caps = settings.routerai_max_price_by_model

    assert resolve_max_price(caps, settings.routerai_model) == {"completion": 1.0}
    assert resolve_max_price(caps, settings.routerai_enricher_model) == {"completion": 1.0}


def test_dated_default_model_is_capped_by_the_default_setting() -> None:
    caps = Settings(_env_file=None).routerai_max_price_by_model

    assert resolve_max_price(caps, "deepseek/deepseek-v4-flash-0731") == {"completion": 1.0}
