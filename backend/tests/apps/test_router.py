import json
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest

from src.apps.dependencies import get_app_service
from src.apps.schemas import AppDocument, AppNavigation, AppThemeTokens
from src.apps.service import AppService
from src.main import app
from src.queue.jobs import GENERATE_APP_DOCUMENT_JOB
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.in_memory_task_queue import InMemoryTaskQueue


def build_document_payload(app_id: str, name: str = "Renamed app") -> dict[str, object]:
    now = datetime.now(UTC).isoformat()
    document = AppDocument(
        id=app_id,
        name=name,
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
    return document.model_dump(mode="json", by_alias=True)


@pytest.fixture
def repository() -> InMemoryAppRepository:
    return InMemoryAppRepository()


@pytest.fixture
def task_queue() -> InMemoryTaskQueue:
    return InMemoryTaskQueue()


@pytest.fixture
async def client(
    repository: InMemoryAppRepository,
    task_queue: InMemoryTaskQueue,
) -> AsyncIterator[httpx.AsyncClient]:
    app.dependency_overrides[get_app_service] = lambda: AppService(repository, task_queue)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


async def create_app(client: httpx.AsyncClient, prompt: str = "a habit tracker") -> str:
    response = await client.post("/api/apps", json={"prompt": prompt})
    assert response.status_code == 201
    return str(response.json()["id"])


async def create_generated_app(
    client: httpx.AsyncClient,
    repository: InMemoryAppRepository,
    prompt: str = "a habit tracker",
) -> str:
    app_id = await create_app(client, prompt)
    app = await repository.get(UUID(app_id))
    assert app is not None
    await repository.set_generation_status(app, "ready", None)
    return app_id


async def test_create_app(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/apps", json={"prompt": "a habit tracker"})

    assert response.status_code == 201
    body = response.json()
    assert list(body) == ["id"]
    assert UUID(body["id"])


async def test_create_app_enqueues_generation_job(client: httpx.AsyncClient, task_queue: InMemoryTaskQueue) -> None:
    app_id = await create_app(client, prompt="a habit tracker")

    assert len(task_queue.jobs) == 1
    job = task_queue.jobs[0]
    assert job.job_name == GENERATE_APP_DOCUMENT_JOB
    assert job.job_id == app_id
    assert job.kwargs == {"app_id": app_id, "prompt": "a habit tracker", "name": None}


async def test_created_app_is_pending_until_worker_runs(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

    response = await client.get(f"/api/apps/{app_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["generationStatus"] == "pending"
    assert body["generationError"] is None
    assert body["document"]["screens"] == []
    assert body["document"]["theme"]["colorPrimary"] == "#5C6CF5"


async def test_create_app_rejects_short_prompt(client: httpx.AsyncClient, task_queue: InMemoryTaskQueue) -> None:
    response = await client.post("/api/apps", json={"prompt": "ab"})

    assert response.status_code == 422
    assert "error" in response.json()
    assert task_queue.jobs == []


async def test_list_apps(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

    response = await client.get("/api/apps")

    assert response.status_code == 200
    assert [app["id"] for app in response.json()["apps"]] == [app_id]


async def test_get_app(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

    response = await client.get(f"/api/apps/{app_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == app_id
    assert body["document"]["id"] == app_id


async def test_get_app_not_found_returns_404(client: httpx.AsyncClient) -> None:
    response = await client.get(f"/api/apps/{uuid4()}")

    assert response.status_code == 404
    assert "error" in response.json()


async def test_save_app(client: httpx.AsyncClient, repository: InMemoryAppRepository) -> None:
    app_id = await create_generated_app(client, repository)

    response = await client.put(f"/api/apps/{app_id}", json=build_document_payload(app_id))

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["document"]["name"] == "Renamed app"

    get_response = await client.get(f"/api/apps/{app_id}")
    assert get_response.json()["document"]["name"] == "Renamed app"


async def test_save_app_invalid_body_returns_422(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

    response = await client.put(f"/api/apps/{app_id}", json={"name": "not a full document"})

    assert response.status_code == 422
    assert "error" in response.json()


async def test_validation_error_message_is_russian(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

    short_prompt = await client.post("/api/apps", json={"prompt": "ab"})
    incomplete_document = await client.put(f"/api/apps/{app_id}", json={"name": "not a full document"})
    wrong_type = await client.post("/api/apps", json={"prompt": 5})

    for response in (short_prompt, incomplete_document, wrong_type):
        error = response.json()["error"]
        details = error.removeprefix("Ошибка валидации данных: ")
        for detail in details.split("; "):
            assert not re.search(r"[A-Za-z]", detail.rsplit(": ", 1)[-1]), error

    assert short_prompt.json()["error"] == "Ошибка валидации данных: prompt: слишком короткое значение"
    assert wrong_type.json()["error"] == "Ошибка валидации данных: prompt: должно быть строкой"
    assert "theme: обязательное поле" in incomplete_document.json()["error"]


async def test_save_app_while_generation_is_pending_returns_409(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

    response = await client.put(f"/api/apps/{app_id}", json=build_document_payload(app_id))

    assert response.status_code == 409
    assert response.json()["error"] == "Приложение ещё генерируется, сохранение недоступно"

    get_response = await client.get(f"/api/apps/{app_id}")
    assert get_response.json()["document"]["name"] == "New app"


async def test_save_app_not_found_returns_404(client: httpx.AsyncClient) -> None:
    unknown_id = str(uuid4())

    response = await client.put(f"/api/apps/{unknown_id}", json=build_document_payload(unknown_id))

    assert response.status_code == 404
    assert "error" in response.json()


async def test_delete_app(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

    response = await client.delete(f"/api/apps/{app_id}")

    assert response.status_code == 200
    assert response.json() == {"ok": True}

    get_response = await client.get(f"/api/apps/{app_id}")
    assert get_response.status_code == 404


async def test_delete_app_not_found_returns_404(client: httpx.AsyncClient) -> None:
    response = await client.delete(f"/api/apps/{uuid4()}")

    assert response.status_code == 404
    assert "error" in response.json()


def build_sparse_screen() -> dict[str, object]:
    return {
        "id": "screen-1",
        "name": "Home",
        "route": "index",
        "root": {
            "id": "node-root",
            "type": "View",
            "style": {"padding": 12, "backgroundColor": "#FFFFFF"},
            "layout": {"x": 0, "y": 0, "width": 370, "height": 640},
            "children": [
                {
                    "id": "node-text",
                    "type": "Text",
                    "props": {"text": "Привет"},
                    "layout": {"x": 16, "y": 24, "width": 280, "height": 36},
                    "children": [],
                }
            ],
        },
    }


def find_null_paths(value: object, path: str = "$") -> list[str]:
    if value is None:
        return [path]
    if isinstance(value, dict):
        return [null_path for key, item in value.items() for null_path in find_null_paths(item, f"{path}.{key}")]
    if isinstance(value, list):
        return [
            null_path for index, item in enumerate(value) for null_path in find_null_paths(item, f"{path}[{index}]")
        ]
    return []


async def test_document_omits_unset_optional_fields(
    client: httpx.AsyncClient,
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_generated_app(client, repository)
    payload = build_document_payload(app_id)
    payload["screens"] = [build_sparse_screen()]

    put_response = await client.put(f"/api/apps/{app_id}", json=payload)
    assert put_response.status_code == 200
    put_document = json.loads(put_response.text)["document"]
    assert find_null_paths(put_document) == []

    get_response = await client.get(f"/api/apps/{app_id}")
    assert get_response.status_code == 200
    get_document = json.loads(get_response.text)["document"]
    assert find_null_paths(get_document) == []

    screen = get_document["screens"][0]
    assert "icon" not in screen
    root = screen["root"]
    assert root["style"] == {"padding": 12, "backgroundColor": "#FFFFFF"}
    assert "props" not in root
    assert "zIndex" not in root["layout"]
    assert root["children"][0]["props"] == {"text": "Привет"}


async def test_app_summary_omits_unset_slug(client: httpx.AsyncClient) -> None:
    await create_app(client)

    response = await client.get("/api/apps")

    assert response.status_code == 200
    summary = json.loads(response.text)["apps"][0]
    assert find_null_paths(summary) == []
    assert "slug" not in summary
