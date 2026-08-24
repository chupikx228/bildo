from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import httpx
import pytest

from src.apps.service import AppService
from src.chat.dependencies import get_chat_service
from src.chat.service import ChatService
from src.main import app
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.chat.in_memory_repository import InMemoryChatRepository
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import InMemoryTaskQueue


@pytest.fixture
def app_repository() -> InMemoryAppRepository:
    return InMemoryAppRepository()


@pytest.fixture
def chat_repository() -> InMemoryChatRepository:
    return InMemoryChatRepository()


@pytest.fixture
def app_service(app_repository: InMemoryAppRepository) -> AppService:
    return AppService(app_repository, InMemoryTaskQueue())


@pytest.fixture
def chat_service(chat_repository: InMemoryChatRepository, app_service: AppService) -> ChatService:
    return ChatService(chat_repository, app_service)


@pytest.fixture
async def client(chat_service: ChatService) -> AsyncIterator[httpx.AsyncClient]:
    app.dependency_overrides[get_chat_service] = lambda: chat_service
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


@pytest.fixture
async def app_id(app_service: AppService) -> UUID:
    return await app_service.create_from_prompt("трекер привычек", None)


async def test_list_messages_empty_history_returns_empty_list(client: httpx.AsyncClient, app_id: UUID) -> None:
    response = await client.get(f"/api/apps/{app_id}/chat/messages")

    assert response.status_code == 200
    assert response.json() == {"messages": []}


async def test_list_messages_unknown_app_returns_404(client: httpx.AsyncClient) -> None:
    response = await client.get(f"/api/apps/{uuid4()}/chat/messages")

    assert response.status_code == 404
    assert "error" in response.json()


async def test_list_messages_returns_camel_case_shape(
    client: httpx.AsyncClient,
    chat_service: ChatService,
    app_id: UUID,
) -> None:
    await chat_service.add_message(app_id, "user", "привет")
    await chat_service.add_message(app_id, "assistant", "вот предложение", build_template_document("трекер", None))

    response = await client.get(f"/api/apps/{app_id}/chat/messages")

    assert response.status_code == 200
    messages = response.json()["messages"]
    assert len(messages) == 2

    plain = messages[0]
    assert plain["role"] == "user"
    assert plain["content"] == "привет"
    assert plain["proposedDocument"] is None
    assert plain["accepted"] is None
    assert "created_at" not in plain
    assert plain["createdAt"]

    with_proposal = messages[1]
    assert with_proposal["role"] == "assistant"
    assert with_proposal["proposedDocument"]["name"]
    assert with_proposal["accepted"] is None


async def test_decide_message_happy_path(
    client: httpx.AsyncClient,
    chat_service: ChatService,
    app_id: UUID,
) -> None:
    message = await chat_service.add_message(
        app_id, "assistant", "вот предложение", build_template_document("трекер", None)
    )

    response = await client.post(
        f"/api/apps/{app_id}/chat/messages/{message.id}/decision",
        json={"accepted": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["message"]["accepted"] is True

    get_response = await client.get(f"/api/apps/{app_id}/chat/messages")
    assert get_response.json()["messages"][0]["accepted"] is True


async def test_decide_message_unknown_app_returns_404(client: httpx.AsyncClient) -> None:
    response = await client.post(
        f"/api/apps/{uuid4()}/chat/messages/{uuid4()}/decision",
        json={"accepted": True},
    )

    assert response.status_code == 404
    assert "error" in response.json()


async def test_decide_message_unknown_message_returns_404(client: httpx.AsyncClient, app_id: UUID) -> None:
    response = await client.post(
        f"/api/apps/{app_id}/chat/messages/{uuid4()}/decision",
        json={"accepted": True},
    )

    assert response.status_code == 404
    assert "error" in response.json()


async def test_decide_message_for_another_app_returns_404(
    client: httpx.AsyncClient,
    chat_service: ChatService,
    app_service: AppService,
    app_id: UUID,
) -> None:
    other_app_id = await app_service.create_from_prompt("список покупок", None)
    message = await chat_service.add_message(
        app_id, "assistant", "вот предложение", build_template_document("трекер", None)
    )

    response = await client.post(
        f"/api/apps/{other_app_id}/chat/messages/{message.id}/decision",
        json={"accepted": True},
    )

    assert response.status_code == 404
    assert "error" in response.json()


async def test_decide_message_not_decidable_returns_409(
    client: httpx.AsyncClient,
    chat_service: ChatService,
    app_id: UUID,
) -> None:
    message = await chat_service.add_message(app_id, "user", "просто вопрос")

    response = await client.post(
        f"/api/apps/{app_id}/chat/messages/{message.id}/decision",
        json={"accepted": True},
    )

    assert response.status_code == 409
    assert "error" in response.json()
