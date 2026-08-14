from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from src.apps.dependencies import get_app_service
from src.apps.schemas import AppDocument, AppNavigation, AppThemeTokens
from src.apps.service import AppService
from src.main import app
from tests.apps.in_memory_repository import InMemoryAppRepository


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
async def client(repository: InMemoryAppRepository) -> AsyncIterator[httpx.AsyncClient]:
    app.dependency_overrides[get_app_service] = lambda: AppService(repository)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


async def create_app(client: httpx.AsyncClient, prompt: str = "a habit tracker") -> str:
    response = await client.post("/api/apps", json={"prompt": prompt})
    assert response.status_code == 201
    return str(response.json()["id"])


async def test_create_app(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/apps", json={"prompt": "a habit tracker"})

    assert response.status_code == 201
    assert "id" in response.json()


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


async def test_save_app(client: httpx.AsyncClient) -> None:
    app_id = await create_app(client)

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
