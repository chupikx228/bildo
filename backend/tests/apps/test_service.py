from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.apps.exceptions import AppNotFound
from src.apps.schemas import AppDocument, AppNavigation, AppThemeTokens
from src.apps.service import AppService
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.in_memory_task_queue import InMemoryTaskQueue


def build_document(app_id: str) -> AppDocument:
    now = datetime.now(UTC).isoformat()
    return AppDocument(
        id=app_id,
        name="Renamed app",
        prompt="a habit tracker",
        theme=AppThemeTokens(
            color_bg="#FBFBFC",
            color_surface="#F4F4F5",
            color_border="#EBEBEE",
            color_text="#101014",
            color_text_muted="#5B5B66",
            color_primary="#5C6CF5",
            color_primary_fg="#FFFFFF",
            radius_base="9",
            font_body="Inter",
            font_heading="Inter",
        ),
        navigation=AppNavigation(type="tabs", roots=[]),
        screens=[],
        state={},
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def repository() -> InMemoryAppRepository:
    return InMemoryAppRepository()


@pytest.fixture
def task_queue() -> InMemoryTaskQueue:
    return InMemoryTaskQueue()


@pytest.fixture
def service(repository: InMemoryAppRepository, task_queue: InMemoryTaskQueue) -> AppService:
    return AppService(repository, task_queue)


async def test_list_apps_is_empty_on_start(service: AppService) -> None:
    assert await service.list_apps() == []


async def test_create_from_prompt_creates_valid_document(service: AppService) -> None:
    app_id = await service.create_from_prompt("a habit tracker", None)

    app = await service.get_app(app_id)
    document = AppDocument.model_validate(app.document)

    assert document.id == str(app_id)
    assert document.prompt == "a habit tracker"
    assert document.screens == []
    assert document.theme.color_primary == "#5C6CF5"


async def test_get_app_raises_not_found_for_unknown_id(service: AppService) -> None:
    with pytest.raises(AppNotFound):
        await service.get_app(uuid4())


async def test_save_document_raises_not_found_for_unknown_id(service: AppService) -> None:
    unknown_id = uuid4()

    with pytest.raises(AppNotFound):
        await service.save_document(unknown_id, build_document(str(unknown_id)))


async def test_delete_raises_not_found_for_unknown_id(service: AppService) -> None:
    with pytest.raises(AppNotFound):
        await service.delete(uuid4())


async def test_delete_returns_true_for_existing_app(service: AppService) -> None:
    app_id = await service.create_from_prompt("a habit tracker", None)

    assert await service.delete(app_id) is True

    with pytest.raises(AppNotFound):
        await service.get_app(app_id)


async def test_list_apps_sorts_by_updated_at_desc(service: AppService, repository: InMemoryAppRepository) -> None:
    first_id = await service.create_from_prompt("first idea", None)
    second_id = await service.create_from_prompt("second idea", None)
    third_id = await service.create_from_prompt("third idea", None)

    first_app = await repository.get(first_id)
    second_app = await repository.get(second_id)
    third_app = await repository.get(third_id)
    assert first_app is not None
    assert second_app is not None
    assert third_app is not None
    first_app.updated_at = datetime(2024, 1, 1, tzinfo=UTC)
    second_app.updated_at = datetime(2024, 1, 3, tzinfo=UTC)
    third_app.updated_at = datetime(2024, 1, 2, tzinfo=UTC)

    summaries = await service.list_apps()

    assert [summary.id for summary in summaries] == [str(second_id), str(third_id), str(first_id)]
