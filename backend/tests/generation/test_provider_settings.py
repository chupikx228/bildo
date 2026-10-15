import pytest

from src.config import Settings


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
