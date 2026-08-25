from datetime import UTC, datetime
from uuid import UUID, uuid4

from src.apps.exceptions import AppGenerationInProgress, AppNotFound
from src.apps.models import App
from src.apps.repository import AppRepository
from src.apps.schemas import AppDocument, AppNavigation, AppSummary, AppThemeTokens
from src.queue.base import TaskQueue
from src.queue.jobs import GENERATE_APP_DOCUMENT_JOB
from src.transaction.base import Transaction

DEFAULT_THEME = AppThemeTokens(
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
)

DEFAULT_APP_NAME = "New app"


class AppService:
    def __init__(self, repository: AppRepository, task_queue: TaskQueue, transaction: Transaction) -> None:
        self._repository = repository
        self._task_queue = task_queue
        self._transaction = transaction

    async def list_apps(self) -> list[AppSummary]:
        apps = await self._repository.list_all()
        return [
            AppSummary(id=str(app.id), name=app.name, slug=app.slug, updated_at=app.updated_at.isoformat())
            for app in apps
        ]

    async def get_app(self, app_id: UUID) -> App:
        app = await self._repository.get(app_id)
        if app is None:
            raise AppNotFound(app_id)
        return app

    async def create_from_prompt(self, prompt: str, name: str | None) -> UUID:
        app_id = uuid4()
        now = datetime.now(UTC).isoformat()
        document_name = name or DEFAULT_APP_NAME
        document = AppDocument(
            id=str(app_id),
            name=document_name,
            prompt=prompt,
            theme=DEFAULT_THEME,
            navigation=AppNavigation(type="tabs", roots=[]),
            screens=[],
            state={},
            created_at=now,
            updated_at=now,
        )
        await self._repository.create(document_name, prompt, document, "pending")
        await self._transaction.commit()
        await self._task_queue.enqueue(
            GENERATE_APP_DOCUMENT_JOB,
            str(app_id),
            app_id=str(app_id),
            prompt=prompt,
            name=name,
        )
        return app_id

    async def mark_generated(self, app_id: UUID, document: AppDocument) -> None:
        app = await self._repository.get(app_id)
        if app is None:
            raise AppNotFound(app_id)
        existing = AppDocument.model_validate(app.document)
        generated = document.model_copy(
            update={
                "id": str(app_id),
                "slug": existing.slug,
                "prompt": existing.prompt,
                "created_at": existing.created_at,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        )
        app = await self._repository.update_document(app, generated)
        await self._repository.set_generation_status(app, "ready", None)

    async def mark_generation_failed(self, app_id: UUID, error: str) -> None:
        app = await self._repository.get(app_id)
        if app is None:
            raise AppNotFound(app_id)
        await self._repository.set_generation_status(app, "failed", error)

    async def save_document(self, app_id: UUID, document: AppDocument) -> AppDocument:
        current = await self._repository.get(app_id)
        if current is None:
            raise AppNotFound(app_id)
        if current.generation_status == "pending":
            raise AppGenerationInProgress(app_id)
        app = await self._repository.update_document(current, document)
        return AppDocument.model_validate(app.document)

    async def delete(self, app_id: UUID) -> bool:
        deleted = await self._repository.delete(app_id)
        if not deleted:
            raise AppNotFound(app_id)
        return deleted
