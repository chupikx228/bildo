import json
import re

import pytest

from src.codegen.service import generate_files, slugify
from tests.codegen.max_coverage_document import build_max_coverage_document

ANDROID_PACKAGE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$")
URL_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*$")


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Максимальное покрытие 2.0", "app-2-0"),
        ("2048", "app-2048"),
        ("  7 дней  ", "app-7"),
        ("Habit Tracker 2", "habit-tracker-2"),
        ("Трекер привычек", "app"),
        ("", "app"),
    ],
)
def test_slugify_never_starts_with_a_digit(name: str, slug: str) -> None:
    assert slugify(name) == slug


def test_slugify_keeps_the_length_limit_for_a_digit_leading_name() -> None:
    slug = slugify("1" * 40)

    assert slug == "app-" + "1" * 28
    assert len(slug) == 32


def test_export_of_a_digit_leading_name_has_a_valid_scheme_and_package() -> None:
    document = build_max_coverage_document().model_copy(update={"name": "Максимальное покрытие 2.0"})

    files = generate_files(document)
    expo = json.loads(files["app.json"])["expo"]

    assert expo["scheme"] == "app-2-0"
    assert URL_SCHEME.match(expo["scheme"])
    assert expo["slug"] == "app-2-0"
    assert ANDROID_PACKAGE.match(expo["android"]["package"])
    assert expo["android"]["package"] == expo["ios"]["bundleIdentifier"] == "com.bildo.app20"
    assert json.loads(files["package.json"])["name"] == "app-2-0"
