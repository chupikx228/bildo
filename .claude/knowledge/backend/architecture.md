# Backend — архитектура и правила написания кода

Это рабочий документ для того, кто пишет бэкенд Bildo (человек или ИИ). Читается сверху вниз: сначала что строим, потом жёсткие правила, потом конкретные скелеты кода, которые можно копировать.

Продукт целиком описан в [`../product.md`](../product.md), контракт с фронтендом — в [`../api-contract.md`](../api-contract.md). Здесь **не дублируются** формы запросов/ответов: если нужно узнать, что отдаёт `GET /api/apps`, читай контракт.

---

## 0. За 30 секунд

Bildo — конструктор мобильных приложений. Пользователь описывает идею текстом, система собирает приложение, он правит его в визуальном редакторе, а на выходе получает работающий Expo-проект.

Для бэкенда это значит: **всё приложение пользователя — один JSON-документ `AppDocument`**, который лежит в одной колонке одной таблицы и гоняется целиком. Никаких таблиц под экраны, узлы и стили — дробить документ на реляционные сущности не нужно и вредно: редактор всегда правит документ целиком и сохраняет его целиком.

Основная работа бэкенда:
1. CRUD документа (быстрые операции, синхронно в HTTP).
2. Генерация документа из промпта (медленно, LLM → очередь).
3. Сборка Expo-проекта и zip-архива из документа (медленно → очередь).

---

## 1. Стек (зафиксирован)

| Что | Чем |
|---|---|
| HTTP | FastAPI, полностью асинхронный |
| Валидация и схемы | Pydantic v2 |
| БД | PostgreSQL |
| ORM | SQLAlchemy 2.0, async-режим (`AsyncSession`) |
| Миграции | Alembic |
| Кеш / брокер | Redis |
| Очередь задач | Arq |

Всё, что ходит в сеть или в БД, — `async def`. Синхронный драйвер БД в проекте не появляется: `asyncpg`, не `psycopg2`.

---

## 2. Три правила, которые не обсуждаются

### 2.1 Слои и направление зависимостей

```
HTTP (router)  →  Service  →  Repository (интерфейс)  ←  Repository (реализация на SQLAlchemy)
```

- **Router** знает про HTTP: маршруты, коды ответов, Pydantic-схемы запроса/ответа. Не знает про SQLAlchemy.
- **Service** знает про бизнес-правила. Не знает ни про HTTP (`HTTPException` тут не бросаем), ни про SQLAlchemy.
- **Repository** знает про хранилище. Не знает про бизнес-правила.

Зависимость всегда идёт вниз и **только на абстракцию**: сервис принимает интерфейс репозитория, а не конкретный класс. Импорт «снизу вверх» (репозиторий импортирует сервис) — ошибка архитектуры, а не мелочь.

### 2.2 Repository + Interface

Каждый доступ к данным описывается **интерфейсом** в домене и **реализуется** отдельным классом. Сервис зависит от интерфейса, реализация подставляется через DI.

Зачем: сервис можно тестировать без базы (подставив реализацию в памяти), а хранилище — заменить, не трогая бизнес-логику. Это же требование Dependency Inversion из SOLID.

### 2.3 SOLID

Не как мантра, а как проверка при ревью — конкретно для этого проекта, см. раздел 5.

---

## 3. Структура каталогов

Модульный монолит: один процесс, но домены разделены так, чтобы любой можно было вынести в сервис, не распутывая импорты.

```
backend/
├── alembic/                     # миграции
├── src/
│   ├── main.py                  # сборка FastAPI-приложения, подключение роутеров
│   ├── config.py                # Settings на pydantic-settings, читает env
│   ├── database.py              # engine, async_session_factory, Base
│   ├── dependencies.py          # общие Depends (сессия БД, текущий пользователь)
│   ├── exceptions.py            # базовые доменные исключения
│   │
│   ├── apps/                    # ДОМЕН: документы приложений
│   │   ├── router.py            # FastAPI-роутер, только HTTP
│   │   ├── schemas.py           # Pydantic: запросы/ответы + модель AppDocument
│   │   ├── models.py            # SQLAlchemy-модели (таблица apps)
│   │   ├── repository.py        # интерфейс + реализация
│   │   ├── service.py           # бизнес-логика
│   │   ├── exceptions.py        # AppNotFound, InvalidDocument…
│   │   └── dependencies.py      # сборка сервиса для этого домена
│   │
│   ├── generation/              # ДОМЕН: промпт → AppDocument через LLM
│   │   ├── service.py           # generate_document: собрать промпт → generate_structured → дозаполнить документ
│   │   ├── structured_output.py # общий цикл «спросить → валидировать → переспросить», параметризован Pydantic-моделью
│   │   ├── llm_client.py        # Protocol LlmClient + реализация RouterAiLlmClient поверх openai
│   │   ├── prompt.py            # системный промпт и JSON Schema документа
│   │   ├── exceptions.py        # GenerationError, GenerationNotConfiguredError
│   │   └── dependencies.py      # сборка клиента из настроек
│   ├── codegen/                 # ДОМЕН: AppDocument → файлы Expo → zip
│   ├── tasks/                   # ДОМЕН: статус фоновой задачи (GET /api/tasks/{id})
│   ├── files/                   # ДОМЕН: загрузка файлов (не специфицирован)
│   ├── chat/                    # ДОМЕН: ассистент — история, решения, ход диалога с LLM
│   │   ├── prompt.py            # системный промпт чата: роль + схема ChatTurnResponse (AppDocument внутри неё)
│   │   └── …                    # router / schemas / models / repository / service / exceptions
│   │
│   ├── queue/                   # НЕ домен: Protocol TaskQueue + реализация на Arq
│   │   ├── base.py              # Protocol TaskQueue — без arq, fastapi и sqlalchemy
│   │   ├── arq_queue.py         # ArqTaskQueue, RedisSettings, создание пула
│   │   ├── jobs.py              # имена задач — общий контракт продюсера и воркера
│   │   └── dependencies.py      # ArqRedis из app.state → Depends
│   │
│   ├── transaction/             # НЕ домен: Protocol Transaction (commit) + реализация поверх AsyncSession
│   │
│   └── worker/
│       ├── main.py              # точка входа Arq
│       └── tasks.py             # задачи очереди
└── tests/
```

**Правило междоменных импортов:** домен импортирует из другого домена только его публичный слой — сервис или схемы. Лезть в чужой `repository.py` или `models.py` нельзя. Если `codegen` нужен документ — он просит его у `apps.service`, а не читает таблицу сам.

---

## 4. Repository + Interface — скелет для копирования

### 4.1 Интерфейс

Используем `typing.Protocol`, а не наследование от ABC: реализации не обязаны знать об интерфейсе, а подмена в тестах не требует общего базового класса. Если по каким-то причинам нужен явный контроль наследования — ABC допустим, но Protocol предпочтителен.

```python
# src/apps/repository.py
from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.models import App
from src.apps.schemas import AppDocument


class AppRepository(Protocol):
    """Контракт хранилища приложений. Сервис знает только его."""

    async def list_by_owner(self, owner_id: UUID) -> list[App]: ...

    async def get(self, app_id: UUID) -> App | None: ...

    async def create(self, owner_id: UUID, name: str, prompt: str, document: AppDocument) -> App: ...

    async def update_document(self, app_id: UUID, document: AppDocument) -> App | None: ...

    async def delete(self, app_id: UUID) -> bool: ...
```

### 4.2 Реализация

```python
class SqlAlchemyAppRepository:
    """Единственное место в домене, где есть знание про SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_owner(self, owner_id: UUID) -> list[App]:
        stmt = (
            select(App)
            .where(App.owner_id == owner_id)
            .order_by(App.updated_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, app_id: UUID) -> App | None:
        return await self._session.get(App, app_id)

    async def create(self, owner_id: UUID, name: str, prompt: str, document: AppDocument) -> App:
        app = App(
            owner_id=owner_id,
            name=name,
            prompt=prompt,
            document=document.model_dump(mode="json"),
        )
        self._session.add(app)
        await self._session.flush()
        return app

    async def update_document(self, app_id: UUID, document: AppDocument) -> App | None:
        app = await self._session.get(App, app_id)
        if app is None:
            return None
        app.document = document.model_dump(mode="json")
        app.name = document.name
        await self._session.flush()
        return app

    async def delete(self, app_id: UUID) -> bool:
        app = await self._session.get(App, app_id)
        if app is None:
            return False
        await self._session.delete(app)
        return True
```

Транзакцией управляет не репозиторий, а слой выше (зависимость сессии — см. 4.4): репозиторий делает `flush`, коммит происходит один раз на запрос. Иначе один HTTP-запрос породит несколько несогласованных транзакций.

### 4.3 Сервис

```python
# src/apps/service.py
from uuid import UUID

from src.apps.exceptions import AppNotFound, PromptTooShort
from src.apps.repository import AppRepository
from src.apps.schemas import AppDocument, AppSummary

MIN_PROMPT_LENGTH = 3


class AppService:
    def __init__(self, repository: AppRepository) -> None:
        # Тип — интерфейс, не SqlAlchemyAppRepository. Это и есть Dependency Inversion.
        self._repository = repository

    async def list_apps(self, owner_id: UUID) -> list[AppSummary]:
        apps = await self._repository.list_by_owner(owner_id)
        return [AppSummary.model_validate(app) for app in apps]

    async def get_document(self, app_id: UUID) -> AppDocument:
        app = await self._repository.get(app_id)
        if app is None:
            raise AppNotFound(app_id)
        return AppDocument.model_validate(app.document)

    async def save_document(self, app_id: UUID, document: AppDocument) -> AppDocument:
        app = await self._repository.update_document(app_id, document)
        if app is None:
            raise AppNotFound(app_id)
        return AppDocument.model_validate(app.document)
```

Сервис бросает **доменные** исключения (`AppNotFound`), а не `HTTPException`. HTTP — забота роутера.

### 4.4 Сборка зависимостей

```python
# src/dependencies.py
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from src.database import async_session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    """Одна транзакция на запрос: commit при успехе, rollback при исключении."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

```python
# src/apps/dependencies.py
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.repository import SqlAlchemyAppRepository
from src.apps.service import AppService
from src.dependencies import get_session


def get_app_service(session: Annotated[AsyncSession, Depends(get_session)]) -> AppService:
    return AppService(SqlAlchemyAppRepository(session))


AppServiceDep = Annotated[AppService, Depends(get_app_service)]
```

### 4.5 Роутер

```python
# src/apps/router.py
from uuid import UUID

from fastapi import APIRouter, status

from src.apps.dependencies import AppServiceDep
from src.apps.schemas import AppDocument, AppListResponse, CreateAppRequest, CreateAppResponse

router = APIRouter(prefix="/api/apps", tags=["apps"])


@router.get("", response_model=AppListResponse)
async def list_apps(service: AppServiceDep, owner_id: OwnerDep) -> AppListResponse:
    return AppListResponse(apps=await service.list_apps(owner_id))


@router.put("/{app_id}")
async def save_app(app_id: UUID, document: AppDocument, service: AppServiceDep) -> dict:
    saved = await service.save_document(app_id, document)
    return {"ok": True, "document": saved}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateAppResponse)
async def create_app(body: CreateAppRequest, service: AppServiceDep, owner_id: OwnerDep) -> CreateAppResponse:
    app_id = await service.create_from_prompt(owner_id, body.prompt, body.name)
    return CreateAppResponse(id=app_id)
```

Роутер не ловит `AppNotFound` вручную — это делает общий обработчик исключений (раздел 8).

---

## 5. SOLID применительно к этому коду

Не абстрактно, а что конкретно считается нарушением на ревью.

**S — Single Responsibility.** У модуля одна причина меняться. `router.py` меняется, когда меняется HTTP-контракт; `service.py` — когда меняются бизнес-правила; `repository.py` — когда меняется хранилище. Роутер, который сам собирает SQL-запрос, нарушает это правило, даже если код короткий.

**O — Open/Closed.** Новый способ генерации документа (шаблоны → LLM → другая LLM) добавляется новой реализацией интерфейса, а не `if provider == "openai"` внутри сервиса.

**L — Liskov.** Любая реализация `AppRepository` подставляется, не ломая сервис. Если реализация в памяти для тестов возвращает `None` там, где боевая кидает исключение, — контракт нарушен, и тесты начинают врать.

**I — Interface Segregation.** Лучше два узких интерфейса, чем один широкий. Если `codegen` нужно только прочитать документ, он получает интерфейс с одним методом чтения, а не весь `AppRepository` с `delete`.

**D — Dependency Inversion.** Сервис зависит от `AppRepository` (Protocol), а конкретный `SqlAlchemyAppRepository` подставляется в `dependencies.py`. Импорт конкретной реализации внутри сервиса — прямое нарушение.

### 5.1 Что из этого проверяет машина, а что — ревью

Полностью SOLID статически не проверяется: «у модуля одна причина меняться» и «абстракция не раздута» — свойства дизайна, а не синтаксиса. Но часть сводится к правилам импортов, и она вынесена в `make arch` (import-linter, контракты в `pyproject.toml`):

| Принцип | Чем проверяется |
|---|---|
| **D** | `make arch` — контракт «сервис не импортирует sqlalchemy/fastapi». Проверено: импорт `AsyncSession` в сервисе ломает сборку |
| Слои § 2.1 | `make arch` — контракт `router → service → repository → models`; импорт снизу вверх ломает сборку |
| Границы доменов § 3 | `make arch` — прямой `codegen → apps.repository` запрещён, `codegen → apps.service` разрешён |
| **L** | `mypy --strict` — несовместимая сигнатура при переопределении метода |
| **S** | Только косвенно: длина функции, число аргументов, сложность. Настоящая проверка — ревью |
| **O**, **I** | Механически никак. Только ревью |

**Когда добавляешь новый домен — впиши его в `containers` контракта слоёв и в списки `source_modules`.** Контракт проверяет только перечисленные модули: не добавишь — новый домен просто не проверяется, и это молчаливая дыра, а не ошибка.

---

## 6. Модель данных

Одна таблица под приложение, документ — целиком в `JSONB`.

```python
# src/apps/models.py
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class App(Base):
    __tablename__ = "apps"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt: Mapped[str | None] = mapped_column(nullable=True)
    document: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
```

Почему `JSONB`, а не таблицы `screens`/`nodes`: редактор сохраняет документ целиком раз в 1200 мс (см. `../product.md` → «Сохранение и история»). Разбор дерева на строки и обратная сборка на каждый `PUT` дали бы десятки запросов там, где хватает одного `UPDATE`, и не дали бы ничего взамен — по узлам никогда не идёт выборка.

Индекс по `owner_id` нужен: список приложений — самый частый запрос.

---

## 7. Схемы Pydantic и валидация

`AppDocument` — общий контракт с фронтендом. На фронте он описан zod-схемами в `frontend/packages/api/src/apps/model.ts`; **при изменении формы правь оба места и [`../api-contract.md`](../api-contract.md) синхронно**.

Ключевое требование: `PUT /api/apps/{id}` обязан валидировать тело **полной Pydantic-моделью** `AppDocument`, а не проверкой «есть ли ключ screens». В прототипе проверка была именно такой (`Array.isArray(document.screens) && document.theme`) — это не образец, это фиксация того, что было.

```python
# src/apps/schemas.py
from typing import Literal
from pydantic import BaseModel, Field

NodeType = Literal["View", "Text", "Button", "Image", "TextInput", "ScrollView", "FlatList", "Spacer"]


class AppNodeLayout(BaseModel):
    x: float
    y: float
    width: float
    height: float
    z_index: int | None = Field(default=None, alias="zIndex")


class AppNode(BaseModel):
    id: str
    type: NodeType
    name: str | None = None
    props: AppNodeProps | None = None
    style: AppNodeStyle | None = None
    layout: AppNodeLayout | None = None
    children: list["AppNode"] = Field(default_factory=list)
```

**Про camelCase:** фронт присылает `colorBg`, `zIndex`, `textBind`. Не переименовывай поля в snake_case на уровне JSON — документ хранится как есть и уходит обратно как есть. Внутри Python можно использовать snake_case-имена с `alias`, но сериализация наружу обязана давать исходные ключи (`model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)`).

Полный перечень полей `AppDocument`, `AppNode`, темы и действий — в [`../product.md`](../product.md#модель-данных).

---

## 8. Ошибки

Единый формат ответа об ошибке, человекочитаемый текст **на русском**:

```json
{ "error": "Приложение не найдено" }
```

Доменные исключения не превращаются в `HTTPException` вручную в каждом роутере — регистрируется общий обработчик:

```python
# src/exceptions.py
class DomainError(Exception):
    status_code = 400
    message = "Ошибка запроса"


class NotFoundError(DomainError):
    status_code = 404


# src/main.py
@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.message})
```

Ошибки валидации Pydantic тоже приводятся к этому формату — фронт везде читает поле `error` и показывает его пользователю.

---

## 9. Очередь: что уходит в Arq, а что нет

Правило простое: **в HTTP остаётся то, что укладывается в десятки миллисекунд**. Всё, что зависит от внешней LLM или собирает архив, — в очередь.

| Операция | Где | Почему |
|---|---|---|
| Список, чтение, сохранение, удаление документа | HTTP, синхронно | один запрос к БД |
| Генерация `AppDocument` из промпта | Arq | ходит в LLM, секунды-десятки секунд |
| Ход диалога с ассистентом (`chat_turn`) | Arq | тоже ходит в LLM; `job_id` — свежий `uuid4()`, ходов у приложения много |
| Сборка Expo-проекта и zip | Arq | CPU + память, растёт с размером приложения |

**Экспорт — исключение из схемы «поставил задачу, отдал `id`, клиент поллит».** `GET /api/apps/{id}/export` для клиента остаётся синхронным: в ответе сразу `application/zip`, фронт по-прежнему просто открывает ссылку. Внутри обработчик ставит задачу `build_export_zip` в очередь и ждёт её результат (`TaskQueue.enqueue_and_wait`, таймаут 30 с) — тяжёлая CPU-сборка уходит в процесс воркера и не занимает event loop API, пока конкретный запрос ждёт. `job_id` здесь — свежий `uuid4()`, а не `id` приложения: экспортов одного приложения может быть сколько угодно и они независимы (в отличие от генерации, где `job_id` намеренно равен `id` приложения).

**Результат экспорта хранится в Redis 5 секунд, а не час** (`keep_result=EXPORT_RESULT_TTL_SECONDS` на регистрации `build_export_zip` в `src/worker/main.py`, BIL-57). Дефолт arq — `keep_result=3600`, то есть весь zip-архив лежал в Redis час после того, как единственный потребитель уже забрал его синхронно и отдал клиенту; это чистый расход памяти, растущий с числом экспортов.

Ноль здесь поставить нельзя, и это не вопрос вкуса. `keep_result=0` в arq означает «результат не записывать вовсе» (`arq/worker.py`: `result_data` собирается только при `result_timeout_s > 0`), а `enqueue_and_wait` ждёт результат через `Job.result()`, который **поллит ключ результата в Redis**. Не записали — ждущий поллер видит, что ключа нет и джобы в очереди уже нет, и получает `ResultNotFound` («Is the worker function configured to keep result?»); экспорт ломается целиком, на каждом запросе. Проверено вживую на arq 0.28: при `keep_result=0` архив до клиента не доезжает, при `keep_result=5` доезжает и ключ живёт ~5 с.

Отсюда и величина: TTL обязан пережить промежуток между записью результата воркером и его чтением ждущим поллером (шаг поллинга — `RESULT_POLL_DELAY_SECONDS = 0.1`), с запасом на занятый event loop API. Пять секунд — полсотни шагов поллинга, при этом в 720 раз меньше дефолта. `generate_app_document` и `chat_turn` не трогали: они возвращают `None`, и хранить там нечего.

**Обычно ключ результата не доживает и до этих пяти секунд: `enqueue_and_wait` удаляет его сразу после успешного `Job.result()`** (BIL-62). Единственный потребитель архива уже забрал его в память API-процесса, и всё, что ключ делает дальше, — держит несколько сотен килобайт в Redis без читателя.

Встроенного способа у arq для этого нет: у `arq.jobs.Job` есть `result()`, `result_info()`, `status()`, `abort()` — и ни одного метода, удаляющего собственный результат. Поэтому ключ вычисляется той же схемой, что использует сам arq, — `arq.constants.result_key_prefix + job_id` (`arq/jobs.py` считает его ровно так в `result`, `result_info` и `status`, `arq/worker.py` — при записи). Это модульная константа, а не приватный атрибут; лезть в `Job._redis` не нужно — `ArqTaskQueue` держит собственный пул. Команда — `UNLINK`, а не `DEL`: освобождение памяти под архив уходит в фоновый поток Redis.

Удаление стоит **после** `await job.result(...)` и потому не выполняется, если тот бросил исключение: при `ResultNotFound` удалять нечего, а при ошибке самой задачи (`GenerationError`, сбой кодогена) результат — не архив, и его подчистит TTL на общих основаниях. Падение самого `UNLINK` тоже не доходит до клиента: `RedisError` перехватывается и уходит в `logger.warning`, успешный архив всё равно возвращается, а единственной подстраховкой на этот случай остаётся TTL.

Поэтому TTL из BIL-57 остаётся и после BIL-62 — как подстраховка, а не как основной механизм: если API-процесс упадёт между чтением результата и его удалением, ключ осиротеет, и убрать его будет уже некому. Оба свойства закреплены тестами в `tests/worker/test_export_result_retention.py`: ключа нет сразу после возврата из `enqueue_and_wait` (без всякого `sleep`), а при подавленном удалении на ключе стоит `PTTL` в пределах пяти секунд.

Для долгих операций фронту нужен статус. Решено поллингом, без SSE: `POST /api/apps` форму ответа не меняет (`{ id }`, 201), задача ставится в очередь с `job_id`, равным `id` приложения, а статус читается двумя способами — `generationStatus` в `GET /api/apps/{id}` (источник правды, лежит в БД) и генерический `GET /api/tasks/{id}` поверх состояния джобы в Redis. Формы ответов — в [`../api-contract.md`](../api-contract.md).

Задачи ставятся в очередь **через `Protocol` `TaskQueue`** (`src/queue/base.py`), реализация `ArqTaskQueue` подставляется через DI ровно так же, как `SqlAlchemyAppRepository` под `AppRepository`: сервис не знает про Arq, а тесты подставляют очередь в памяти. Пул `ArqRedis` создаётся один раз в lifespan-обработчике `src/main.py` и живёт в `app.state`.

Воркер (`src/worker/tasks.py`) — единственное место, где домены сшиваются: он открывает сессию сам через `async_session_factory` (Depends вне запроса не работает), зовёт `generation.service.generate_document`, потом `apps.service.mark_generated` / `mark_generation_failed` и сам коммитит. Поэтому на него не распространяется запрет сервисам знать про SQLAlchemy — это композиционный инфраструктурный код, а не слой домена.

---

## 9.1 Генерация документа: RouterAI

`generate_document(prompt, name, *, client, model, max_attempts)` — асинхронная функция в `src/generation/service.py`. Она не создаёт клиента LLM сама: клиент приходит параметром, ровно как `TaskQueue` приходит в `AppService`. Тип параметра — `Protocol` `LlmClient` (`src/generation/llm_client.py`), реализация под RouterAI — `RouterAiLlmClient` там же.

### Шлюз и настройки

RouterAI — OpenAI-совместимый шлюз, поэтому отдельной библиотеки нет: используется официальный `openai` (`AsyncOpenAI(api_key=…, base_url=…)`), эндпоинт — стандартный `/chat/completions`, идентификаторы моделей в формате `provider/model`, как в OpenRouter.

| Настройка (`src/config.py`, env) | Значение по умолчанию | Смысл |
|---|---|---|
| `routerai_api_key` | `None` | ключ шлюза; **необязателен** — без него приложение и воркер стартуют нормально |
| `routerai_base_url` | `https://routerai.ru/api/v1` | база OpenAI-совместимого API |
| `routerai_model` | `deepseek/deepseek-v4-flash` | модель генерации **по умолчанию** — на неё резолвятся `"auto"` и отсутствие выбора (см. § 9.3) |
| `routerai_enricher_model` | `deepseek/deepseek-v4-flash` | модель обогащения промпта перед генерацией, пользователь её не выбирает (см. «Обогащение промпта», BIL-86) |
| `routerai_max_retries` | `3` | **общее** число попыток получить валидный документ, не число повторов сверх первой |

Ключ живёт только в окружении (`backend/.env`, шаблон — `.env.example`), в репозиторий не попадает.

**Модель по умолчанию вживую не проверена — ключа на момент BIL-15 не было.** Что проверено: `deepseek/deepseek-v4-flash` присутствует в публичном каталоге `GET https://routerai.ru/api/v1/models` и заявляет в `supported_parameters` и `response_format`, и `structured_outputs`. Когда ключ появится — прогнать реальную генерацию и сверить: доезжает ли `response_format: json_schema` (см. ниже, какой путь выбрался — он пишется в лог), хватает ли качества документа, укладывается ли ответ в разумное время. Если модель не подойдёт, менять только `ROUTERAI_MODEL` в окружении — код трогать не нужно.

### Модель — параметр вызова, а не свойство клиента (BIL-42)

`model: str` просажен сквозь весь стек генерации: `generate_document(..., model=…)` → `generate_structured(..., model=…)` → `LlmClient.complete(..., model=…)`. Внутри `RouterAiLlmClient` модели в конструкторе больше **нет** — один клиент на процесс обслуживает любые модели, а `model` приходит с каждым запросом. Параметр не `str | None`: к этому слою значение уже резолвлено (§ 9.3), и опциональность здесь только маскировала бы, где на самом деле принимается решение о дефолте.

Чат моделей не выбирает: `chat_turn` передаёт `model=settings.routerai_model` явным аргументом. Раньше он полагался на дефолт внутри клиента — поведение то же самое, просто дефолт стал видимым в месте вызова.

### Форма запроса: по семейству модели, без лестницы (BIL-83)

Форма запроса выбирается **по префиксу модели, один раз, до первого запроса**, и не меняется от ответов шлюза:

| Модель | `response_format` | Почему |
|---|---|---|
| `anthropic/*` | не передаётся вовсе | strict-схему `AppDocument` Anthropic не принимает ни в каком виде, а `json_object` у Sonnet ломает форму ответа (см. BIL-83 ниже) |
| все остальные | `{"type": "json_schema", "strict": true, …}` | принимается всеми остальными моделями курируемого списка (проверено вживую в BIL-83) |

Список «без ограничения формата» — `UNCONSTRAINED_MODEL_PREFIXES` в `src/generation/llm_client.py`. Схема для strict-режима — `app_document_schema()` из `src/generation/prompt.py` (см. ниже про BIL-69), руками она нигде не переписана. Та же схема целиком вложена в системный промпт, поэтому и без `response_format` модель видит формат — меняется только то, навязывает ли его шлюз.

**Отказ шлюза от strict-схемы — сразу ошибка, а не спуск на ступень ниже.** 400/422 или ошибка провайдера, упакованная в ответ 200, на запросе с `json_schema` поднимают `StrictSchemaUnsupportedError` («Модель … не принимает строгую JSON-схему документа: <текст провайдера>») и пишутся в лог как `ERROR`. До BIL-83 здесь была лестница `json_schema → json_object → без response_format` с запоминанием ступени по модели. Её убрали: именно тихий спуск спрятал баг схемы из BIL-69 (`openai/*` незаметно жили на `json_object`), а в BIL-83 он же не сработал там, где был нужен (см. ниже). Добавили модель, которая strict не понимает, — это видно на первой же генерации, и решается осознанно: добавить её префикс в `UNCONSTRAINED_MODEL_PREFIXES`.

**`max_tokens` = 64000 на каждом запросе** (`MAX_OUTPUT_TOKENS`). Без явного лимита шлюз подставляет свой, и у части моделей его не хватает на документ целиком. Ответ с `finish_reason: "length"` — сразу `GenerationError` («Ответ модели обрезан по лимиту…»), а не повтор: обрезанный JSON не лечится просьбой «исправь», модель упрётся в тот же лимит.

**Это выбор формы запроса, а не запасной источник данных.** Документ в обоих случаях приходит от LLM.

### Strict-mode-совместимая JSON Schema для `openai/*` (BIL-69)

**Симптом.** Для моделей семейства OpenAI (`openai/*` — маршрутизируются RouterAI через Azure/OpenAI) первая ступень (`response_format=json_schema`, `strict: true`) отклонялась шлюзом на **каждом** запросе, и клиент молча и навсегда скатывался на `json_object` (см. лог из предыдущего раздела) — для всех моделей этого семейства сразу, поскольку ступень запоминается по модели, а причина отказа была в самой схеме, одинаковой для всех. `json_object` не принуждает модель к структуре вообще, поэтому итоговое качество документа для этого семейства держалось только на текстовом описании схемы в промпте, а не на валидации шлюзом.

**Причина.** `AppDocument.model_json_schema(by_alias=True)` — обычная Pydantic-схема, и OpenAI-ый strict-mode предъявляет к ней два структурных требования, которых Pydantic сам по себе не даёт **ни на одном уровне вложенности**, а не только в корне:

1. у каждой объектной схемы (корень, любой `$defs`, любой `items` массива, любая ветка `anyOf`) обязан быть `"additionalProperties": false`;
2. `required` каждой объектной схемы обязан перечислять **все** её `properties` — опциональность у OpenAI выражается через `anyOf: [..., {"type": "null"}]`, а не через отсутствие поля в `required`.

Живой запрос к `openai/gpt-5.6-terra` с непочиненной схемой подтвердил это буквально: шлюз (через Azure и через OpenAI напрямую — оба в `previous_errors`) отвечал `400 invalid_json_schema`, `"In context=(), 'additionalProperties' is required to be supplied and to be false"` — `context=()` означает, что схема отклонялась уже на **корневом** объекте, до того как валидатор вообще добирался до вложенных `$defs`. У самой схемы `AppDocument` в её нынешнем виде `additionalProperties: false` не стоит вообще нигде — ни в корне, ни в одном из 12 объектных `$defs` (проверено — единственное вхождение `additionalProperties` во всей схеме до фикса — это легитимная схема значения у `state: dict[str, AppStateValue]`, а не булево `false`).

После добавления `additionalProperties`/`required` тем же живым запросом обнаружилась вторая, отдельная причина отказа: `discriminator`/`oneOf`, которые Pydantic генерирует для `AppAction` (`Field(discriminator="type")`, стиль OpenAPI), — тоже отклоняются strict-mode: `"'oneOf' is not permitted"`. Обе причины закрываются одним и тем же проходом по дереву схемы, поэтому в одной задаче.

**Фикс.** `src/generation/json_schema.py` — `to_strict_json_schema(schema: JsonSchema) -> JsonSchema`, рекурсивный проход по всему дереву схемы (корень, `$defs`/`definitions`, `items` массивов, ветки `anyOf`/`allOf`, распакованные `$ref`), который:

- проставляет `additionalProperties: false` каждой объектной схеме, где его ещё нет (не трогает уже присутствующий — тем самым не ломает легитимный `dict[str, X]` у `state`, где `additionalProperties` — настоящая схема значения, а не `false`; OpenAI такую схему **принимает** — проверено тем же живым запросом);
- переписывает `required` каждой объектной схемы на полный список её `properties`;
- сворачивает `discriminator`+`oneOf` (дискриминированный union `AppAction`) в обычный `anyOf` — по вариантам это ничего не меняет (они и так взаимоисключающи по литералу `type`), просто strict-mode принимает только эту форму;
- по необходимости распаковывает `$ref` с соседними ключами (`allOf: [{$ref: …}]` + `description` — паттерн, которым Pydantic оборачивает поле-ссылку с `Field(description=...)`; сейчас ни в `AppDocument`, ни в `ChatTurnResponse` такого нет, но фикс рассчитан на то, что появится).

Это структурный, а не точечный фикс: правится не «схема `AppNode` и `AppAction`, у которых сейчас не хватает `additionalProperties`», а сама функция построения схемы — так что любая новая объектная модель или вложенный union в `AppDocument` автоматически получат то же самое, без отдельной правки под каждый новый объект.

`app_document_schema()` в `src/generation/prompt.py` и `RESPONSE_SCHEMA` в `src/chat/prompt.py` — **оба** оборачивают свой `model_json_schema(by_alias=True)` в `to_strict_json_schema` перед тем, как отдать схему `generate_structured`/`RouterAiLlmClient.complete`. Это один и тот же фикс на оба места, а не два похожих: `ChatTurnResponse.document` — это `AppDocument | None`, то есть `AppDocument` целиком лежит в `$defs` схемы `ChatTurnResponse`, и рекурсивный проход обрабатывает его ровно так же, как когда `AppDocument` — корень схемы. Юнит-тест `tests/generation/test_json_schema.py::test_chat_turn_response_schema_shares_the_same_fix_as_app_document` проверяет это явно (наличие `AppDocument` в `$defs` схемы чата плюс `additionalProperties: false` на нём), а не полагается на совпадение по построению.

**Живая проверка (BIL-69).** Прогнаны настоящие `generate_document` и ход чата с предложением документа (через `generate_structured` с `target_model=ChatTurnResponse`) на `openai/gpt-5.6-terra` — оба прошли без единого `WARNING` о даунгрейде `response_format`, то есть первая ступень (`json_schema`, strict) принимается шлюзом с первого запроса. До фикса тот же запрос с той же моделью падал на `additionalProperties` в корне; после фикса `additionalProperties`, но без свёртки `oneOf` — падал на `'oneOf' is not permitted` для `onPress`/`onChange`; с обоими исправлениями — проходит. Регрессии на `deepseek/*` (уже принимал `json_schema` до BIL-69, см. бенчмарк BIL-66) не обнаружено: `generate_document` и ход чата с предложением документа по-прежнему проходят первой ступенью без даунгрейда.

### Модели `anthropic/*`: пустой `{}` вместо документа (BIL-83)

**Симптом.** Генерация на `anthropic/claude-sonnet-5` и `anthropic/claude-opus-5` падала с «не вернула корректный документ за 3 попытки»: все три ответа — пустой объект `{}`.

**Причина — две, и вторая спрятала первую.**

1. **Strict-схему `AppDocument` Anthropic не принимает ни в каком виде.** Первой ломается рекурсия: `AppNode.children` ссылается на `AppNode`, и Fable отвечает честным 400 `Circular reference detected in schema definitions: AppNode -> AppNode`. Разворачивать рекурсию на фиксированную глубину бесполезно: развёрнутую схему все три модели отклоняют на **любой** глубине, включая 1 (то есть вообще без рекурсии), с ошибкой `The compiled grammar is too large`. У Anthropic есть документированный лимит в 16 полей с union-типом (nullable) на схему, а у `AppDocument` таких 47 (27 из них в `AppNodeStyle`). Для `openai/*` та же развёрнутая схема проходила на глубинах 4–16, так что проблема именно в Anthropic.
2. **Sonnet и Opus не отвечают ошибкой вовсе.** RouterAI отдаёт 200 с `{}` (Sonnet — после 11 токенов, Opus — после 4096). Лестница из прежней версии клиента спускалась только по ошибке, поэтому здесь не спускалась. А `generate_structured` трижды отправлял тот же `{}` на «исправление».

`json_object` Anthropic не спасает: Opus и Fable на нём отвечают валидно, а Sonnet заворачивает документ в `{"raw": "…"}` либо возвращает кусок схемы. Без `response_format` Sonnet такой обёртки не делает (проверено вживую в BIL-83).

**Фикс.**

- `anthropic/*` получают запрос без `response_format` с первого вызова: схема есть в системном промпте, результат проверяет наша валидация с повторами (см. «Форма запроса» выше).
- Отказ от strict-схемы у остальных моделей — сразу `StrictSchemaUnsupportedError`, без лестницы.
- `max_tokens=64000` на каждом запросе. Документы Anthropic занимают 20–48 тыс. токенов вывода: на 32000 Opus обрезался, а без явного лимита Sonnet обрывался уже на 144 токенах. Гипотеза «Opus упирается в 4096» не подтвердилась: без `response_format` Opus выдал 38 тыс. токенов за один вызов, а 4096 появлялось только на сломанном strict-пути. Значение 64000 принимают все 8 моделей (курируемые 7 и `deepseek-v4-flash`), проверено вживую.
- `generate_structured` прекращает повторы сразу при пустом `{}` и при ответе, дословно совпадающем с предыдущим: переспрашивать бессмысленно, модель вернёт то же самое, а деньги за каждую попытку уходят.

**Живая проверка (BIL-83)** — по одной генерации «Трекер привычек с напоминаниями и статистикой» через настоящие `RouterAiLlmClient` и `generate_document`. Стоимость — поле `usage.cost` из ответа RouterAI (рубли). У ответов, оборванных по `finish_reason: "length"`, это поле приходит `null`.

| Модель | `response_format` | Итог | Время | Токенов вывода | Стоимость |
|---|---|---|---|---|---|
| `deepseek/deepseek-v4-flash` | `json_schema` strict | ✅ 3 экрана | 98 с | 13 631 | 0.58 |
| `openai/gpt-5.6-terra` | `json_schema` strict | ✅ 3 экрана | 175 с | 8 211 | 13.32 |
| `anthropic/claude-opus-5` | нет | ✅ 4 экрана | 91 с | 45 549 | 127.54 |
| `anthropic/claude-fable-5` | нет | ✅ 4 экрана | 288 с | 30 659 | 202.77 |
| `anthropic/claude-sonnet-5` | нет | ❌ 3 из 3 попыток — невалидный JSON | 245 с | ~37 000 × 3 | 41.76 + 49.80 + 57.97 |

Strict-режим принимают и `deepseek/deepseek-v4-pro`, `openai/gpt-5.6-sol`, `x-ai/grok-4.6` (проверено коротким запросом со схемой). Одна оговорка: grok при strict начал ответ прозой («Извините…»), так что шлюз, похоже, не навязывает ему схему. Полной генерацией grok в BIL-83 не проверялся.

**Открыто: Sonnet.** На четвёртой попытке (отдельный прогон, сырой ответ сохранён) JSON снова ломается посреди документа: в `…]}]}}},{"id":"stats"…` на стыке экранов одна закрывающая скобка лишняя. Это не обрыв (`finish_reason: "stop"`) и не лишний текст после объекта. Ответ занимает 172 тыс. символов, из них 7 403 явных `null`. Причина объёма: в промпте лежит strict-вариант схемы, где **все** поля `required`, и модель без принуждения шлюзом послушно выписывает каждое. На таком объёме Sonnet сбивается в подсчёте вложенности. По той же причине дороги Opus и Fable. Направление, пока не проверенное: для `anthropic/*` класть в промпт обычную схему `AppDocument.model_json_schema(by_alias=True)`, где опциональные поля можно опускать. Вывод должен сократиться в разы, а с ним вероятность ошибки в скобках и стоимость. Проверить не удалось: баланс RouterAI кончился (402) на повторе этого прогона.

### Повторы и провал

Ответ модели парсится (с отрезанием markdown-ограждений и мусора вокруг JSON) и валидируется целевой Pydantic-моделью. Если валидация не прошла, в диалог добавляются **предыдущий невалидный ответ и текст ошибки** с просьбой исправить, и запрос повторяется — до `routerai_max_retries` попыток суммарно. Исчерпали — `GenerationError`.

Сам цикл живёт **не** в `generation/service.py`, а отдельно — `generate_structured` в `src/generation/structured_output.py`, параметризованная целевой моделью (`target_model: type[ModelT]`) и списком сообщений. У неё два потребителя: `generation.service.generate_document` (`target_model=AppDocument`) и задача `chat_turn` (`target_model=ChatTurnResponse`, см. § 9.2). Домен `chat` обращается только к публичному слою `generation` — `llm_client`, `structured_output`, `exceptions`; это разрешено контрактом границ доменов в `pyproject.toml`, и `src.chat.prompt` вписан в контракт инверсии зависимостей наравне с `src.generation.prompt`.

`GenerationError` переиспользуется обоими доменами как есть — отдельный тип исключения под чат не заводили: причина провала («модель не вернула валидный ответ за N попыток», «шлюз отклонил запрос», «нет ключа») одна и та же, меняется только то, что именно валидировали.

### Таймаут задачи генерации (BIL-66)

**Что было.** У задачи `generate_app_document` не было своего таймаута: `WorkerSettings` не задаёт `job_timeout`, а `func(generate_app_document, name=GENERATE_APP_DOCUMENT_JOB)` не передавал `timeout`. Поэтому действовал дефолт arq 0.28 — `job_timeout: 'SecondsTimedelta' = 300` (`arq/worker.py`), и `asyncio.wait_for(task, timeout_s)` снимал генерацию через 300 секунд, сколько бы попыток модели ни оставалось.

Хуже самого таймаута было то, что после него оставалось. `wait_for` отменяет задачу, внутрь неё прилетает `CancelledError` — это `BaseException`, а не `Exception`, поэтому ни одна ветка `except` в `generate_app_document` не срабатывала и `mark_generation_failed` не вызывался. arq записывал провал, не перезапуская задачу, а приложение **навсегда оставалось в `generationStatus: "pending"`**: фронт бесконечно поллил, а `PUT` вечно отвечал 409.

**Данные.** Перед выбором исправления генерация прогнана вживую на `deepseek/deepseek-v4-flash` (на неё резолвится `"auto"`) — 36 полных генераций, все четыре примера промпта с лендинга по три раза в трёх вариантах системного промпта, тем же `RouterAiLlmClient` и `generate_structured`, что в проде, с ограничением 900 с вместо 300 с, чтобы увидеть хвост, а не обрезать его. Варианты «без `title`» и «без схемы в промпте» — диагностика: `response_format: json_schema` со схемой уходил во всех трёх.

| Вариант системного промпта | Задача, с (мин / медиана / макс) | Дольше 300 с | Токены рассуждений (медиана / макс) |
|---|---|---|---|
| полная схема (как в проде) | 38 / 73 / 478 | 1 из 12 | 2974 / 6106 |
| схема без `title` | 19 / 70 / 413 | 2 из 12 | 2029 / 6438 |
| без схемы в промпте | 21 / 66 / 503 | 2 из 12 | 2442 / 6263 |

Схема в промпте рост рассуждений **не** объясняет: хвост дольше 300 с есть во всех трёх вариантах, диапазоны токенов рассуждений перекрываются, а самые долгие вызовы рассуждали мало — вызов на 478 с дал 0 токенов рассуждений. Всё время определяет **провайдер, к которому RouterAI маршрутизировал запрос** (он приходит в поле `provider` ответа), то есть скорость выдачи токенов:

| Провайдер | Вызовов | Скорость, ток/с (медиана) | Вызов, с (мин / макс) |
|---|---|---|---|
| Baidu | 16 | 111 | 18 / 87 |
| Alibaba | 2 | 117 | 31 / 40 |
| StreamLake | 6 | 79 | 47 / 127 |
| Venice | 7 | 49 | 113 / 503 |
| DigitalOcean | 3 | 23 | 107 / 478 |

Отсюда два вывода. Урезать схему (BIL-66 предлагал это как вариант) смысла нет — хвост от этого не уходит. Менять модель по умолчанию тоже не стали: это продуктовое решение, а не бэкенда, и дело не в модели, а в маршрутизации. Если хвост понадобится срезать, а не пережидать, — смотреть в сторону настроек маршрутизации провайдеров на стороне RouterAI; это не проверялось и не внедрено.

**Исправление — два таймаута вместо одного.**

| Константа | Значение | Где |
|---|---|---|
| `GENERATION_TIMEOUT_SECONDS` | 900 | `src/worker/tasks.py` — дедлайн генерации внутри задачи |
| `GENERATION_JOB_TIMEOUT_SECONDS` | 900 + 30, с BIL-86 — 120 + 900 + 30 | `src/worker/main.py` — `timeout` задачи в arq, только у `generate_app_document`; 120 — дедлайн обогащения промпта (см. BIL-86 ниже) |

900 с — самый долгий наблюдённый вызов (503 с) с запасом на одну повторную попытку модели. Остальные задачи очереди остаются на дефолте arq: экспорт ждёт синхронный HTTP-запрос с таймаутом 30 с, а долгий таймаут там только маскировал бы зависание.

Дедлайн внутри задачи — `asyncio.timeout` вокруг `generate_document`. Истёк — `TimeoutError` превращается в доменную `GenerationTimeoutError` («Модель не успела сгенерировать приложение за 900 секунд»), и дальше работает обычный путь провала: `mark_generation_failed` с этим текстом и `error` в `/api/tasks/{id}`. Таймаут arq на 30 с длиннее, чтобы до отмены задачи дело не доходило в штатном случае: он остался страховкой, а не механизмом.

Почему не ловить `CancelledError` в задаче и не помечать приложение `failed` там: отмену arq присылает не только по таймауту, но и при остановке воркера, и в этом случае задачу **перезапускает** («cancelled, will be run again»). Пометка `failed` при штатной остановке показала бы пользователю ошибку на генерацию, которая в этот момент уже идёт заново. Собственный дедлайн различает эти случаи сам: в `GenerationTimeoutError` превращается только `TimeoutError` истёкшего дедлайна (`deadline.expired()`), а `TimeoutError`, прилетевший изнутри генерации, уходит как есть, в обычную ветку непредвиденной ошибки.

**Проверка после исправления.** Двенадцать генераций (те же четыре промпта по три раза) прогнаны сквозь настоящий стек: локальные API и arq-воркер, `POST /api/apps` без `model` (то есть `"auto"` → `deepseek/deepseek-v4-flash`), поллинг `GET /api/apps/{id}`. Все 12 дошли до `ready`, ни одной отмены. Время работы задачи по логу воркера: 20 / 24 / 48 / 48 / 51 / 76 / 244 / 318 / 387 / 539 / 583 / 633 с — медиана около 160 с, **пять из двенадцати дольше 300 с**, то есть при старом таймауте провалились бы и остались в `pending`. Самая долгая (633 с) длиннее самой долгой из бенчмарка — хвост у маршрутизации длинный, и запас в 900 с не бесконечный: медленный провайдер плюс повторная попытка модели могут его исчерпать, но тогда приложение честно уходит в `failed`, а не зависает.

Что это **не** закрывает: `chat_turn` по-прежнему на дефолтных 300 с, хотя ответ с предложенным документом — такая же полная генерация `AppDocument`. У хода чата нет состояния, которое зависает (провал виден через `error` в `/api/tasks/{id}`), но таймаут ударит по нему так же — **закрыто в BIL-67, см. ниже**.

### Таймаут хода диалога с ассистентом (BIL-67)

**Что было.** `chat_turn` не был перечислен с собственным `timeout=` в `WorkerSettings.functions`, поэтому действовал тот же дефолт arq в 300 с, что до BIL-66 действовал и на `generate_app_document`. Механика провала та же: `wait_for` отменяет задачу, внутрь прилетает `CancelledError` (`BaseException`, не ловится веткой `except Exception`, которой у `chat_turn` к тому же и не было), наружу из `wait_for` выходит голый `TimeoutError`, и arq сохраняет его как результат упавшей задачи. Это не оставляет `chat_turn` в вечном `pending`, как было с генерацией приложения (у хода чата нет своего состояния, которое надо помечать — см. § 9.2), но и не даёт пользователю ничего, кроме случайного дефолта библиотеки в качестве бюджета на ответ.

Раскрывающий внутренности текст до фронта не доезжал и без этой задачи — `TaskService._describe` (BIL-63) уже прячет любое не-`DomainError` за общим `"Не удалось выполнить операцию"`. Смысл исправления не в том, чтобы закрыть утечку (её и не было), а в том, чтобы: (1) осознанно выбрать бюджет вместо чужого дефолта и (2) дать пользователю внятную причину («модель не успела ответить») вместо общей фразы, годной для любой непредвиденной ошибки.

**Почему бюджет тот же, что у генерации приложения, а не меньше.** `ChatTurnResponse.document`, когда он есть в ответе, — не облегчённая версия `AppDocument`, а тот же самый тип целиком (§ 9.2, «Документ приходит целиком, не патчем и не диффом»), и генерируется тем же `generate_structured` с тем же `max_attempts=settings.routerai_max_retries`. Ход чата, предлагающий правку, стоит LLM ровно столько же, сколько полная генерация, плюс `reply`. Хвост латентности из бенчмарка BIL-66 определяет провайдер, на который RouterAI маршрутизирует запрос, а не размер промпта или схемы (см. выше) — то есть тот же хвост угрожает и `chat_turn`. Сужать бюджет для чата не на чем: единственная структурная разница («иногда документа в ответе нет») делает *типичный* ответ короче, но не меняет *худший* случай.

**Исправление — тот же паттерн, что в BIL-66, отдельный дедлайн на функцию.**

| Константа | Значение | Где |
|---|---|---|
| `CHAT_TURN_TIMEOUT_SECONDS` | 900 | `src/worker/tasks.py` — дедлайн хода диалога внутри задачи |
| `CHAT_TURN_JOB_TIMEOUT_SECONDS` | 900 + 30 | `src/worker/main.py` — `timeout` задачи `chat_turn` в arq |

`asyncio.timeout(CHAT_TURN_TIMEOUT_SECONDS)` оборачивает только сам вызов `generate_structured` — сборка контекста (`build_context`) и запись сообщения в дедлайн не входят, потому что не ходят в сеть. Истёк — `TimeoutError` превращается в `GenerationTimeoutError(CHAT_TURN_TIMEOUT_SECONDS, subject="ответ ассистента")` («Модель не успела сгенерировать ответ ассистента за 900 секунд»); `TimeoutError`, пришедший не от этого дедлайна (`deadline.expired()` ложно — например, сетевой таймаут внутри клиента), уходит как есть, той же развилкой, что и в `generate_app_document`.

Ради этого `GenerationTimeoutError` получил необязательный параметр `subject` (по умолчанию «приложение» — текст и вызов у `generate_app_document` не изменились), а не отдельный класс исключения под чат: по той же причине, по которой чат не заводил собственный тип для `GenerationError` (см. выше) — причина отказа одна и та же, разнится только то, что генерировалось. `generate_structured(..., subject=...)` уже параметризован ровно так же для сообщения об исчерпанных попытках.

`chat_turn`, как и `generate_app_document`, не ловит `CancelledError` и не пытается ничего пометить при обычной остановке воркера (arq в этом случае перезапускает задачу, а не проваливает) — ловится только `TimeoutError` с истёкшим собственным дедлайном. Разбирать этот случай отдельным `try/except` вокруг всей функции не нужно: у хода чата и без того нет состояния уровня приложения, которое проваленный ход должен был бы пометить (§ 9.2) — непойманное исключение просто уходит в Arq и становится `error` в `GET /api/tasks/{id}`, тем же путём, что и любой другой провал `chat_turn` (`GenerationError`, `GenerationNotConfiguredError`) уже обрабатывался до этой задачи.

**Проверка.** Живым вызовом (`RouterAiLlmClient` + `generate_structured` с `target_model=ChatTurnResponse`, тот же RouterAI-ключ и модель, что в BIL-66) подтверждены оба конца, а не только код на бумаге: (1) `asyncio.timeout(3)` вокруг настоящего сетевого запроса корректно превращается в `GenerationTimeoutError` с внятным текстом вместо голого `TimeoutError`; (2) реалистичный ход с запросом на полную правку приложения («полностью пересобери и верни document») уложился в 71.7 с с предложенным документом (8 экранов) — на порядок меньше 900-секундного бюджета, а ходы без документа заняли 22–56 с. Отдельный 36-прогонный бенчмарк, как в BIL-66, не повторялся: `chat_turn` вызывает тот же `generate_structured` на том же провайдере, что уже измерено там, и не вносит новых переменных, влияющих на хвост латентности — бюджет унаследован, а не переизмерен с нуля. Юнит-тесты (`tests/worker/test_tasks.py`) с монки-патченным `generate_structured` закрывают то, что живым вызовом не проверить многократно: собственный дедлайн истёк → `GenerationTimeoutError`, сообщение ассистента не создаётся и транзакция не коммитится; `TimeoutError`, брошенный изнутри генерации, не переклеивается в `GenerationTimeoutError`; текст, дошедший до `GET /api/tasks/{id}`, — само сообщение `GenerationTimeoutError`, без traceback; `job.timeout_s` у `chat_turn` в `WorkerSettings` больше `CHAT_TURN_TIMEOUT_SECONDS`.

### Дизайн-принципы в системном промпте (BIL-72)

Структурные правила промпта (границы сцены, валидность навигации, типы узлов, уникальность `id`, число экранов, привязка к `state`) говорят модели, какой документ **валиден**, но ничего не говорят о том, какой документ **хорош**. Результат был предсказуемо однообразным: модель сходилась к своим дефолтам — один и тот же `borderRadius` на всём, дословно одинаковая палитра для разных тем, контент, зацентрованный по обеим осям на каждом экране. BIL-72 добавил к промпту дизайн-указания. Сейчас это три блока: изначально BIL-72 вписал их двумя, а BIL-73 выделил последнюю строку `DESIGN_RULES`, самопроверку, в отдельную константу `DESIGN_SELF_CHECK` (почему — в конце раздела). Текст блоков пришёл от команды готовым и вписан **дословно**, при выделении он тоже не менялся: переформулировать его не нужно, это не черновик.

| Константа | Где объявлена | Куда попадает |
|---|---|---|
| `DESIGN_RULES` | `src/generation/prompt.py` | системный промпт генерации без брифа **и** системный промпт чата |
| `DESIGN_SELF_CHECK` | `src/generation/prompt.py` | только системный промпт генерации без брифа |
| `DESIGN_VARIETY` | `src/generation/prompt.py` | только системный промпт генерации без брифа |

«Без брифа» здесь — с BIL-86: если обогащение промпта вернуло бриф, генерация получает только `RULES` и схему, без всех трёх дизайн-блоков (см. «Системный промпт генерации при брифе» в разделе BIL-86).

`DESIGN_RULES` — универсальные «избегай / применяй»: анти-паттерны, по которым видно AI-slop, и приёмы взамен (палитра под смысл приложения, иерархия размером, работа абсолютным позиционированием, «воздух», осмысленные подписи кнопок, оформленные пустые состояния). Это f-строка, а не обычная: в неё подставляется `{SCREEN_WIDTH}` — тем же способом и из той же константы, что и в `RULES`, чтобы правило про выход к краю сцены не разъезжалось с реальной шириной.

`DESIGN_SELF_CHECK` — одна строка самопроверки перед ответом: «если бы я сгенерировал экран для другого запроса на эту же тему, получился бы тот же layout и та же палитра? Если да — измени».

`DESIGN_VARIETY` — процедура выбора дизайн-направления перед генерацией: характер из запроса, затем по одному варианту на каждой из четырёх осей (layout-архетип, цветовая логика, плотность, роль изображений).

**Порядок сборки промпта генерации без брифа фиксирован:** `DESIGN_RULES` → `DESIGN_SELF_CHECK` → `DESIGN_VARIETY` → `RULES` → JSON Schema (`build_system_prompt` в `src/generation/prompt.py`). Дизайн-указания идут первыми, структурные правила и схема — последними, ближе всего к точке, где модель начинает писать JSON. Самопроверка стоит сразу после `DESIGN_RULES`, то есть там же, где была, пока была его последней строкой, поэтому промпт генерации от выделения не изменился.

**Почему в чат едет только `DESIGN_RULES`.** `DESIGN_VARIETY` сформулирован как выбор **нового** направления («определи дизайн-направление ЭТОГО приложения», «выбери по одному варианту на каждой оси»). В генерации это то, что нужно; в чате — прямое противоречие собственному правилу чата «возьми текущий документ и примени то, что просит пользователь, сохранив всё остальное как было»: ассистент на каждую правку заново перевыбирал бы палитру и архетип. `DESIGN_SELF_CHECK` противоречит этому правилу так же: в контексте правки «если да — измени» читается как указание менять существующий дизайн (BIL-73, см. замер в конце раздела). Универсальные же «избегай / применяй» к правке применимы ровно так же, как к генерации с нуля, поэтому `DESIGN_RULES` в чате есть. Системный промпт чата собирается как `DESIGN_RULES` → `EXPORT_RULES` → `RULES` чата → текущий документ → схема `ChatTurnResponse` (`build_system_prompt` в `src/chat/prompt.py`; `EXPORT_RULES` добавлен в BIL-86).

Вместо `DESIGN_VARIETY` в `RULES` чата добавлено обратное по смыслу правило: сохранять сложившееся в документе дизайн-направление (палитру темы, layout-архетип, плотность) и менять визуальный стиль только по прямой просьбе пользователя. Правка контента, текстов или логики поводом перебирать палитру не является.

Импорт `DESIGN_RULES` в `src/chat/prompt.py` — из `src.generation.prompt`, а не копия текста: `src/chat/prompt.py` уже импортирует оттуда `SCREEN_WIDTH`/`SCREEN_HEIGHT` (а теперь ещё `NODE_TYPE_RULES` и `EXPORT_RULES`), и контракты границ доменов это разрешают. `DESIGN_SELF_CHECK` и `DESIGN_VARIETY` чат не импортирует. Дублировать почти 20 строк дословного текста в двух файлах значило бы гарантировать, что однажды они разъедутся.

Изменение **аддитивное**: ни одно структурное правило в `RULES` обоих файлов не тронуто, `app_document_schema()`/`RESPONSE_SCHEMA` и весь strict-mode-фикс из BIL-69 не изменились — поменялся только текст системного сообщения.

**Проверка (BIL-72).** Прогнано вживую, по 6 промптов разных тематик на `openai/gpt-5.6-terra` и `deepseek/deepseek-v4-flash`, до и после изменения — 24 генерации, все успешные, плюс скриншоты первого экрана каждого приложения через настоящий `PhonePreview`. Однообразие действительно падает: различных палитр 9/12 → **12/12** (до изменения три приложения `deepseek` делили один и тот же набор токенов, ещё два — другой; после — ни одной пары), медиана различных `borderRadius` на приложение 2.5 → **6**, узлов, прижатых к краю сцены, 12 → **57**. Ступень `response_format` не изменилась: ни одного `WARNING` о даунгрейде и ни одного повтора валидации на все 24 генерации, то есть strict-схема из BIL-69 по-прежнему принимается с первого запроса.

Два следствия, которые важнее прироста разнообразия:

- **Промпт вырос в 1.42 раза (11546 → 16343 символов), и слабая модель стала хуже держать структурные правила.** У `deepseek/deepseek-v4-flash` 2 приложения из 6 после изменения невалидны так, как до изменения не были ни разу: корень экрана `360×800` вместо обязательных `370×640`, отсутствующий маршрут `index`, `navigation.roots` на несуществующие экраны, а в одном — `color`, равный цвету фона, то есть весь текст невидим. У `openai/gpt-5.6-terra` 6 из 6 структурно чисты в обеих фазах. Дизайн-указания не отменяют структурные правила, но конкурируют с ними за внимание модели — это цена, а не побочный эффект.
- **`DESIGN_RULES` в промпте чата работает против правила сохранения — у слабой модели систематически.** Парный замер на запрос, меняющий только контент (переименовать кнопку, добавить строку подсказки): по 4 хода на модель на каждый вариант промпта.

| Модель | Промпт | Палитра сохранена | Все 3 экрана сохранены |
|---|---|---|---|
| `openai/gpt-5.6-terra` | до BIL-72 | 4/4 | 4/4 |
| `openai/gpt-5.6-terra` | с `DESIGN_RULES` | 4/4 | 3/4 |
| `deepseek/deepseek-v4-flash` | до BIL-72 | 4/4 | 4/4 |
| `deepseek/deepseek-v4-flash` | с `DESIGN_RULES` | **0/4** | 1/4 |

  `deepseek` переписывает тему на каждом ходу — в одном из ходов заодно выбросил документ целиком и сгенерировал вместо кофейни приложение про тренировки. Правило «сохраняй сложившееся дизайн-направление» этого не удерживало, и понятно почему: во время замера `DESIGN_RULES` кончался строкой «если бы я сгенерировал экран … получился бы тот же layout и та же палитра? Если да — измени», а в контексте правки это читается как прямое указание менять существующий дизайн. Стояла она в промпте **раньше** правила сохранения. Дешёвых направлений было два: поставить `DESIGN_RULES` в чате после `RULES`, а не перед, либо не включать в чат эту последнюю строку.

  **BIL-73 выбрал второе:** строка выделена из `DESIGN_RULES` в `DESIGN_SELF_CHECK`, который в промпт чата не попадает, а промпт генерации без брифа получает её на прежнем месте. Таблица выше описывает промпт чата до этого разделения. Повторного замера после BIL-73 в документации нет.

### Обогащение промпта перед генерацией (BIL-86)

**Что это.** Перед генерацией документа сырой промпт пользователя отдельным LLM-вызовом переписывается в подробный технический бриф: что за приложение и для кого, дизайн-система под него (палитра с HEX и ролями цветов, подход к раскладке, плотность, характер типографики), список экранов с главным элементом каждого, тон текстов. Генерация получает в пользовательском сообщении **бриф вместо сырого промпта** — «Собери приложение по описанию:\n{бриф}», а системный промпт при брифе **сокращается до `RULES` и схемы**: дизайн-блоки BIL-72 не передаются, их работу сделал бриф (см. «Системный промпт генерации при брифе» ниже).

| Что | Где |
|---|---|
| системный промпт обогатителя (`ENRICHER_SYSTEM_PROMPT`), вызов `enrich_prompt` | `src/generation/prompt_enricher.py` |
| текстовый вызов без `response_format` — `LlmClient.complete_text(messages, *, model, max_tokens)` | `src/generation/llm_client.py` |
| бриф в запрос генерации — необязательный `brief` у `generate_document` | `src/generation/service.py` |
| место в пайплайне | `generate_app_document` в `src/worker/tasks.py` |
| где бриф лежит после генерации | колонка `apps.enriched_prompt`, ревизия `d6a0b3e91c57` |
| выбор системного промпта — `build_system_prompt(*, has_brief)` / `build_messages(..., has_brief=...)` | `src/generation/prompt.py` |
| факты экспорта, общие для генерации и чата — `EXPORT_RULES` | `src/generation/prompt.py` |
| проверка структуры документа — `check_document` (до BIL-91 — `check_navigation`), передаётся в `generate_structured(..., check=...)` | `src/generation/service.py`, `src/generation/structured_output.py` |

**Текст системного промпта обогатителя — дословный, кроме одной вычеркнутой фразы** про цвета успеха и ошибки (почему — ниже, в «Системном промпте генерации при брифе»). Он пришёл от команды проверенным вручную, как и блоки BIL-72; переформулировать его без отдельного решения не нужно. Промпт англоязычный, но просит отвечать на языке запроса пользователя, поэтому до генерации доезжает русский бриф на русский запрос.

**Почему в воркере, а не в `create_from_prompt`.** `POST /api/apps` обязан отвечать сразу (§ 9, «что уходит в Arq»), а обогащение — такой же поход в LLM. Поэтому оно стоит первым шагом задачи `generate_app_document`, до генерации. Клиент этого шага не видит: `generationStatus` остаётся `pending` и на время обогащения, форма ответов не менялась.

**Текстовый вызов — отдельный метод `LlmClient`, а не `complete` с пустой схемой.** Ответ обогатителя — проза, не JSON: ни `response_format`, ни strict-схема, ни цикл повторов `generate_structured` здесь не нужны. `complete_text` не передаёт `response_format` вовсе (для всех моделей, не только `anthropic/*`) и берёт лимит токенов параметром, а запрос и разбор ошибок шлюза делит с `complete` (`_request`), поэтому ошибки те же: отказ шлюза — `GenerationError` (не `StrictSchemaUnsupportedError`, схемы нет), `finish_reason: "length"` — `GenerationError` с тем лимитом, который передали. `ENRICHER_MAX_OUTPUT_TOKENS` = 8000: бриф — 150–300 слов, это около тысячи токенов, остальное — запас на рассуждения reasoning-моделей, которые у части провайдеров считаются в тот же лимит.

**Модель — `deepseek/deepseek-v4-flash`, отдельная настройка `ROUTERAI_ENRICHER_MODEL`.** Выбрана по цене из публичного каталога RouterAI (поле `pricing` в `GET /models`, цена за токен, на 2026-09-27):

| Модель | вход | выход |
|---|---|---|
| `deepseek/deepseek-v4-flash` | 5.9e-6 | 1.18e-5 |
| `deepseek/deepseek-v4-pro` — самая дешёвая из курируемых | 5.3e-5 | 1.06e-4 |
| `x-ai/grok-4.6` | 2.2e-4 | 6.6e-4 |
| `openai/gpt-5.6-sol`, `anthropic/claude-sonnet-5` | 2.2e-4 | 1.1e-3 |
| `openai/gpt-5.6-terra` | 2.2e-4 | 1.3e-3 |
| `anthropic/claude-opus-5` | 5.5e-4 | 2.7e-3 |
| `anthropic/claude-fable-5` | 1.3e-3 | 6.3e-3 |

Flash в курируемый список (§ 9.3) не входит, и это не противоречие: курируемый список — это модели, которые **пользователь** может выбрать для генерации, а обогатитель — внутренний шаг, который пользователь не выбирает. Flash и так модель по умолчанию для `"auto"`, то есть уже работает в проде через этот же шлюз, и strict-схема ей для этого вызова не нужна. Он в 9 раз дешевле самой дешёвой курируемой модели, а на бриф в тысячу токенов это копейки у обеих: выбор по цене здесь не про экономию, а про то, чтобы не платить за вызов, который можно отбросить без вреда. Модель в валидации каталога не участвует: это настройка окружения, а не ввод пользователя. Если flash окажется медленным на коротких ответах (см. хвост провайдеров в BIL-66), менять только `ROUTERAI_ENRICHER_MODEL`, например на `deepseek/deepseek-v4-pro`.

**Провал обогащения — не провал генерации.** `enrich_prompt` возвращает `str | None` и не бросает: любая ошибка (сеть, отказ шлюза, нет ключа, пустой ответ) и истечение собственного дедлайна `ENRICHER_TIMEOUT_SECONDS` = 120 дают `None` и `WARNING` в лог, и генерация идёт по сырому промпту, как до BIL-86. Ловится `Exception` целиком, а не только `GenerationError`: это необязательное улучшение, и падать из-за него генерации незачем. `CancelledError` (`BaseException`) не ловится — отмена задачи arq по-прежнему доходит до неё так же, как в BIL-66. Разбирать, чей `TimeoutError` (свой дедлайн или сетевой изнутри), здесь не нужно, в отличие от BIL-66/BIL-67: исход у обоих одинаковый — сырой промпт.

**Таймауты.** У обогащения свой дедлайн, **снаружи** дедлайна генерации, а не внутри его 900 секунд: медленное обогащение не должно отъедать бюджет у генерации, который BIL-66 подбирал по хвосту провайдеров. Поэтому `timeout` задачи в arq вырос на ту же величину: `GENERATION_JOB_TIMEOUT_SECONDS` = `ENRICHER_TIMEOUT_SECONDS` + `GENERATION_TIMEOUT_SECONDS` + 30 = 1050 с. Худший случай задачи удлинился ровно на 120 секунд и не больше: дольше обогащение не ждётся.

**Где хранится бриф — колонка, а не только лог.** `apps.enriched_prompt` (`TEXT`, nullable) заполняет `AppService.record_enriched_prompt`, а воркер **коммитит её сразу**, до генерации. Отдельный коммит — ради одного случая: генерация упала, а посмотреть, по какому брифу, хочется именно тогда. С записью в той же транзакции, что `mark_generated`, бриф упавшей генерации откатывался бы вместе с ней. Лог для этого хуже: он ротируется, по `app_id` его не найти, а сопоставлять бриф с получившимся документом (как в замерах ниже) удобнее одним `SELECT`. В лог пишется только длина брифа и время вызова.

| `enriched_prompt` | что значит |
|---|---|
| строка | обогащение прошло, генерация шла по этому брифу |
| `NULL` | обогащение упало или не уложилось в дедлайн (причина — в `WARNING` воркера), либо приложение создано до BIL-86 |

Сырой промпт остаётся где был: `apps.prompt` и `document.prompt` — то, что ввёл пользователь, бриф туда не попадает (`generate_document` кладёт в `prompt` документа исходный промпт, даже когда запрос собран из брифа). Наружу по HTTP бриф не выходит, `GET /api/apps/[id]` формы не меняет — поэтому `api-contract.md` эта задача не трогает.

Чат (`chat_turn`) обогатителем **не** пользуется: там сырой промпт — это реплика про правку существующего документа, а не идея приложения с нуля.

#### Системный промпт генерации при брифе — только `RULES` (итоговое решение BIL-86)

| Есть ли бриф | Системный промпт генерации |
|---|---|
| да — `enrich_prompt` вернул строку | `RULES` → JSON Schema |
| нет — обогащение упало, не уложилось в дедлайн | `DESIGN_RULES` → `DESIGN_SELF_CHECK` → `DESIGN_VARIETY` → `RULES` → JSON Schema, как до BIL-86 |

Решает `generate_document`: `has_brief` — это `bool(brief)`, а воркер передаёт в `brief` ровно то, что вернул `enrich_prompt` (`None` при откате). То есть промпт выбирается по тому, **получен ли бриф**, а не по тому, вызывался ли обогатитель: откат на сырой промпт автоматически возвращает полный набор дизайн-блоков. Без брифа их работу больше никто не делает.

Почему при брифе дизайн-блоки не нужны и вредны:

- **Бриф уже сделал их работу, и генератор ему следует.** По замерам ниже генератор берёт палитру темы из брифа (все 7 цветовых токенов — в 12 документах из 16, ещё в двух — все 5 цветов, которые в брифе были), а тексты кнопок, пустых состояний и ошибок переносит из брифа дословно. Опасение, что `DESIGN_VARIETY` («выбери направление сам») перебьёт бриф, в выводе не подтвердилось: бесполезен он не потому, что спорит с брифом, а потому, что его выбор уже сделан.
- **`DESIGN_RULES` противоречит брифам.** Бриф формы заявки прямо велит «форма центрирована по вертикали и горизонтали», `DESIGN_RULES` запрещает центрировать всё. Запрет на «кремовый + терракота» и «почти чёрный + неон» есть в обоих текстах — дубль.
- **Структура.** Главный аргумент — доля документов со структурными нарушениями (таблица в замерах): с `DESIGN_RULES` нарушения у 4 из 8 и 4 из 6 документов при любом наборе остальных блоков, без него — у 2 из 8, а без дизайн-блоков вовсе — у 1 из 7, меньше всего. У flash длинный промпт бьёт по структурным правилам, как видно ещё в BIL-72.

**Факты экспорта вынесены из `DESIGN_RULES` в `EXPORT_RULES`**, потому что это не вкус, а правда о схеме и экспорте, и терять её на пути с брифом нельзя: роли 7 цветовых токенов («других ролей у токенов нет»), «не задавай `borderRadius` на `Button`/`TextInput`, если он не отличается от `radiusBase`», «`shadow` работает только как переключатель на `Button`». `EXPORT_RULES` вписан в `RULES` генерации, поэтому попадает в оба варианта промпта, и в каждый — ровно один раз. Промпт чата (`src/chat/prompt.py`) импортирует `DESIGN_RULES`, но не `RULES` генерации — у него свой. Поэтому чат включает `EXPORT_RULES` сам, сразу после `DESIGN_RULES`: иначе перенос молча удалил бы эти факты из промпта чата. Промпт без брифа по содержанию не изменился — те же тексты, только три пункта переехали из `DESIGN_RULES` в `RULES`.

**Цвета успеха и ошибки.** Обогатитель просит столько цветов, сколько нужно приложению, «3 или 8», а у темы ровно 7 цветовых токенов, и других ролей у них нет. Поэтому из присланного командой промпта обогатителя вычеркнута фраза «states like success/error if relevant». Остальной текст дословный. Брифы всё равно иногда добавляют такие цвета сами (в 1 из 12 и 1 из 8, например форма заявки: `#D32F2F`, `#2E7D32`): генератору их просто некуда положить, а недостающие роли (например, `colorBorder`) он додумывает сам. Токены под успех и ошибку в `AppThemeTokens` — отдельное, более крупное изменение, в BIL-86 не входит.

#### Стартовый экран — `index` (регрессия и фикс)

В первом прогоне у 6 из 16 документов по брифу не было маршрута `index` (у сырого промпта — ни у одного из 7). Бриф перечисляет экраны по смыслу («Лента», «Главная/Форма», «Готово»), и модель называла маршруты по ним (`feed`, `form`, `today`). Это не косметика: `normalizeAppDocument` маршруты не чинит, кодоген пишет `app/index.tsx` только для экрана с маршрутом `index`, и в экспортированном проекте у expo-router нет корня `/`.

Фикс — в двух местах, и нужны оба:

- **`RULES`**: к «стартовый экран всегда имеет `id` и `route`, равные `index`» добавлено, что это буквально строка `index`, как бы экран ни называли бриф или запрос, и что смысловое название пишется в `name` экрана.
- **Проверка с повтором.** `generate_structured` принимает необязательный `check` — он вызывается после разбора ответа, и `ValueError` из него идёт тем же путём, что ошибка валидации Pydantic: невалидный ответ и текст проблемы возвращаются модели, запрос повторяется в пределах `routerai_max_retries`. Отдельного механизма починки нет. `generate_document` передаёт туда `check_document` (в BIL-86 она называлась `check_navigation` и проверяла только навигацию): есть экран с `route` `index`, `navigation.roots` не пуст, и каждый корень ссылается на существующий маршрут. С BIL-91 она проверяет ещё число экранов и геометрию их корней, см. ниже. Проверка стоит на **любой** генерации документа, с брифом и без. Промпт чата и `ChatTurnResponse.document` она не трогает.

После фикса (замер ниже) `index` был у всех документов **с первой попытки**, повтор по нему не понадобился ни разу — хватило правки `RULES`. Проверка сработала один раз, и не на `index`: модель вернула документ с `screens: []`, который Pydantic пропускает, а раньше он молча становился «готовым» пустым приложением.

#### Пустые экраны и геометрия корня (BIL-91)

У `check_navigation` было две дыры, обе видны в замерах ниже:

- **`screens: []` ловился случайно.** Pydantic пропускает пустой список, а навигационная проверка отказывала ему только потому, что без экранов нет и экрана `index`. Документ из одного экрана `index` с правильными `roots` проходил, хотя `RULES` требует от 2 до 5 экранов.
- **Геометрию корня не проверял никто.** `RULES` требует у корня каждого экрана `layout` ровно `0, 0, SCREEN_WIDTH, SCREEN_HEIGHT`, но корень `370×560` в прогоне 3 ушёл в «готовые».

Теперь проверка называется `check_document`. Все проблемы собираются в один `ValueError`, как раньше делала навигационная, чтобы модель получила всё сразу, а не по проблеме за повтор:

| Что проверяется | Когда проблема | Откуда порог |
|---|---|---|
| число экранов | меньше `MIN_SCREENS` = 2 | `RULES`, «Объём: от `MIN_SCREENS` до `MAX_SCREENS` экранов». Строка собирается из тех же констант в `src/generation/prompt.py`, так что промпт и проверка не разойдутся |
| навигация | как в BIL-86: нет `index`, пустые или висячие `navigation.roots` | — |
| корень каждого экрана | `layout` отсутствует или не равен ровно `0, 0, SCREEN_WIDTH, SCREEN_HEIGHT` | `RULES`; `SCREEN_WIDTH`/`SCREEN_HEIGHT` импортируются из `prompt.py`, а не повторяются числами |

**Верхнюю границу (`MAX_SCREENS` = 5) проверка не навязывает, и это сознательно.** Документ из 6 экранов работает, в нём ничего не сломано. Отказ стоил бы полной повторной генерации (медиана около 130 с и деньги за вызов), а если повтор тоже не уложится, приложение уйдёт в `failed` вместо рабочего. Нижняя граница — другое дело: документ без экранов или из одного — ровно тот «пустой» результат, который BIL-86 считал структурным нарушением.

Содержательность экрана (заголовок, основной контент из `RULES`) не проверяется: это вопрос качества, а не структуры, и формального признака у неё нет. Тип корня (`View` по `RULES`) тоже не проверяется: в замерах BIL-86 нарушений типа не было.

Что это значит для фикстур: шаблон `blank` из `tests/generation/template_fixtures.py` — один экран, поэтому проверку не проходит. Это не ложное срабатывание: `blank` — пустой фоллбэк прототипа, а не ответ модели по `RULES`, через проверку его никто не пропускает. `tests/codegen/max_coverage_document.py` не проходил и `check_navigation`: его `navigation.roots` не совпадают с маршрутами, а у корней нет `layout`, потому что он собран под покрытие кодогена, а не под правила генерации.

**Чат эту проверку не использует.** `chat_turn` вызывает `generate_structured` без `check`, и так и остаётся. Дело не в том, что предложенный документ не может быть битым (это тот же `AppDocument`), а в двух причинах. Первая: в `RULES` чата нет ни правила про `index`, ни про геометрию корня, ни про число экранов, и проверка отказывала бы по правилам, которых модель не видела. Вторая: минимум экранов в чате неверен по смыслу, ведь пользователь вправе попросить оставить один экран. К тому же предложение ассистента не уходит в документ само, его принимает пользователь. Если чату понадобится такая проверка, это отдельная задача: сначала правила в промпт чата, потом проверка без нижней границы экранов.

#### Замеры (BIL-86, 2026-09-27)

Все вызовы — `deepseek/deepseek-v4-flash` и для обогащения, и для генерации (модель по умолчанию для `"auto"`), настоящий `RouterAiLlmClient`, параллельно до 4 запросов. Выборки маленькие (6–8 на вариант), и, как в BIL-66, время почти целиком определяет провайдер, к которому RouterAI отправил запрос. Цифры — направление, а не точные значения. Во втором и третьем прогоне использованы **те же 8 брифов**, что в первом, так что варианты сравниваются на одинаковом входе.

**Повторяемость палитры (открытый вопрос 5a).** 12 обогащений одного промпта «трекер привычек»: **12/12 различных палитр** по точному набору HEX, та же методика «различных палитр / N», что в BIL-72. По точному HEX это разнообразие, по характеру — сходимость:

| Что | Из 12 |
|---|---|
| светлый почти белый фон (светлота 95–97%) и белые карточки | 12 |
| тёмная тема | 0 |
| акцент: зелёный / синий / коралл-терракота / сливовый | 5 / 3 / 3 / 1 |
| ровно запрещённая промптом пара «кремовый фон + терракота» (`#F9F6F0` + `#E67E6F`) | 1, и ещё 2 — терракота на почти белом |
| цвет успеха (прогон шёл уже после вычёркивания фразы о нём) | 1 |

То есть обогатитель уходит от дефолтов по оттенку акцента, но не по светлоте. «Трекер привычек» у него — всегда светлое приложение, в половине случаев зелёное. В 8 брифах пайплайна картина похожая: 6 из 8 светлые, в 3 из 8 — коралловый, терракотовый или кирпичный акцент на почти белом фоне, из них в 2 — на тёплом. Промпт обогатителя по этой находке не менялся.

**Структурные нарушения по вариантам системного промпта** (стартовый экран не `index`, `navigation.roots` пуст или ссылается на несуществующие экраны, корень не 370×640, меньше двух экранов, `radiusBase` с `px`):

| Прогон | Вариант промпта генерации | Документов с нарушениями | Каких |
|---|---|---|---|
| 1 | сырой промпт, полный набор блоков | 0 из 7 (восьмой — сбой шлюза) | — |
| 1 | бриф + `DESIGN_RULES` + `DESIGN_SELF_CHECK` + `DESIGN_VARIETY` + `RULES` | 4 из 8 | нет `index` во всех четырёх; корни `370×584` / `1214×1625` / без `layout`, один экран, `radiusBase: "12px"` |
| 1 | бриф + `DESIGN_SELF_CHECK` + `DESIGN_VARIETY` + `RULES` | 2 из 8 | только нет `index` |
| 2 | бриф + `DESIGN_RULES` + `RULES` | 4 из 6 | нет `index` в трёх, корни `390×844` (размер iPhone) и `370×600`, пустой `roots`, один экран, `radiusBase` в `px` |
| 3 | **бриф + `RULES` (итог)**, новые `RULES` и проверка навигации | **1 из 7** (восьмой — таймаут, см. ниже) | корень одного экрана `370×560` |

Прогон 2 — проверка варианта, который в первом прогоне не замеряли: убрать `DESIGN_VARIETY` и `DESIGN_SELF_CHECK`, оставив `DESIGN_RULES`. Он не лучше варианта со всеми блоками и заметно беднее: медиана 18 узлов на документ против 32–33, а на форме заявки — один экран из двух узлов. Отсюда вывод, что структуру ломает именно `DESIGN_RULES`, а не `DESIGN_VARIETY`, и что убирать его стоит вместе с остальными. Прогон 2 шёл на старых `RULES` и без проверки навигации — как первый, чтобы сравнение было честным.

**Задержка (вопрос 4).**

| Что | медиана | максимум |
|---|---|---|
| обогащение, 12 + 8 вызовов | 15–18 с | 94 с (OpenInference: 2.4 тыс. токенов рассуждений) |
| генерация по сырому промпту | 121 с | 486 с |
| генерация по брифу + `DESIGN_RULES` + остальные блоки (прогон 1) | 278 с | 1272 с |
| генерация по брифу без `DESIGN_RULES` (прогон 1) | 166 с | 319 с |
| генерация по брифу + `DESIGN_RULES` без остальных блоков (прогон 2) | 334 с | 793 с |
| **генерация по брифу, только `RULES` (прогон 3, итог)** | **132 с** | 585 с, и один таймаут в 900 с |

Итоговый путь — обогащение и генерация — выходит около 150 с в медиане против 121 с у сырого промпта. В прогоне 3 брифы переиспользованы, так что это сумма медиан, а не замер одним вызовом. Само обогащение — секунды: дедлайн в 120 с не превысил ни один из 20 вызовов, стоимость вызова 0.013–0.20 ₽. Документ по брифу больше, чем по сырому промпту (медиана 10.5–12.9 тыс. символов JSON против 6.7 тыс., 32–40 узлов против 20; беднее только прогон 2). Время на тысячу символов у вариантов одного порядка (14–20 с), так что рост времени генерации объясняется объёмом документа, а не медленным провайдером.

Таймаут прогона 3 (соцсеть, 900 с) — это тот самый случай с `screens: []`: проверка навигации отправила пустой документ на повтор, а повтор не уложился в дедлайн. В проде это приложение в `failed` вместо «готового» пустого — лучше, но стоит 900 с ожидания. `GENERATION_TIMEOUT_SECONDS` по этим данным не поднимали: в 900 с уложились все вызовы, кроме испорченных ответов (1272 с в прогоне 1, этот таймаут в прогоне 3), а их дедлайн и должен отсекать.

**Бедность вывода (открытый вопрос 5c, неформально).** Обогатитель вывод не обедняет, скорее наоборот: медиана узлов 32–40 у брифа против 20 у сырого промпта. Единственный по-настоящему пустой документ (по одному узлу на экран, магазин кроссовок) дал сырой промпт. На итоговом промпте документы конкретные и следуют брифу: экран `index` с именем «Лента», «Каталог» или «Заявка», реальные товары и цены, пустые состояния с текстом из брифа («По вашему запросу ничего не найдено. Попробуйте другие хештеги»). Скудный вывод дал только прогон 2 (с `DESIGN_RULES`, без остальных блоков). Промпт обогатителя по этому не менялся.

Замечено попутно, промпт по этому не менялся: брифы нарушают формат, который задаёт обогатитель. Markdown встретился в 6 из 8 (`**Лента**`), нумерованные списки — в 2, запрещённое «современный» — в 2, размеры в `px` — в 5, больше 300 слов — в 4. Генерации это не мешает. Без `DESIGN_RULES` один раз вернулся запрещённый им разделитель «123 подписчика · 56 публикаций» — единственный случай, где отсутствие блока было видно в выводе.

Стоимость: 20 обогащений — около 0.95 ₽ по `usage.cost`; прогоны 2 и 3 (14 генераций) — около 10 ₽ по балансу `GET /credits` до и после. Расход 24 генераций прогона 1 не записан.

**Попутно найдено, вынесено в BIL-89.** Один вызов генерации по сырому промпту шёл 1800 с и упал с `StrictSchemaUnsupportedError` «модель не принимает строгую JSON-схему: Provider connection error, please retry». Это временная ошибка провайдера, а `_rejection` (BIL-83) классифицировал её как отказ от схемы. Исправлено в BIL-89, см. следующий раздел: там же уточнено, откуда на самом деле взялись 1800 с.

### Таймаут запроса и временные ошибки провайдера (BIL-89)

Две независимые правки в `src/generation/llm_client.py`.

#### Как RouterAI держит соединение

Проверено живым запросом (`deepseek/deepseek-v4-flash`, без стриминга, 2026-09-29): **заголовки `200 OK` приходят через 0.3 с, а до готового ответа шлюз раз в секунду шлёт в тело пробельный keep-alive** (`\n         \n`, 11 байт). JSON ответа приходит одним куском в конце. Отсюда два следствия.

- **Таймаут SDK `openai` — это не таймаут запроса.** `DEFAULT_TIMEOUT` у SDK (`httpx.Timeout(600, connect=5)`) задаёт для httpx таймаут **простоя**, то есть сколько можно ждать очередного байта. Пока шлюз шлёт keep-alive, такой таймаут не сработает никогда, как бы долго ни шла генерация. Уменьшать его в расчёте на «зависший запрос» бесполезно: запрос, который шлюз держит открытым, этим таймаутом не ограничен ни при каком значении.
- **Ошибка, случившаяся после отправки заголовков, приходит только в теле `200`.** Статус уже ушёл, поэтому шлюз кладёт её в тело: `{"error": "<JSON строкой>"}`, где внутри `code` (HTTP-код провайдера), `metadata.raw` (сырой ответ провайдера) и `previous_errors`. SDK разбирает это как `ChatCompletion` с `choices: None`, и клиент ловит её через `_extract_provider_error`. Настоящие отказы от strict-схемы тоже приходят так: у `openai/gpt-5.6-terra` и `anthropic/claude-fable-5` это заняло 15–18 с.

**Откуда 1800 с — уточнение к записке выше.** «600 с SDK × 3 попытки `generate_structured`» не сходится с кодом. `generate_structured` не ловит исключения клиента и повторяет запрос только после невалидного ответа. Таймаут SDK кончился бы `APITimeoutError`, то есть `GenerationError` «RouterAI не ответил…», а не `StrictSchemaUnsupportedError`. Раз пришла ошибка с текстом провайдера, значит, ответ был получен. С keep-alive картина согласуется так: шлюз около 30 минут держал **один** запрос открытым, перебирая провайдеров (для этого в теле есть `previous_errors`), и в конце вернул ошибку в теле `200`. Логов того прогона нет, так что это вывод из поведения шлюза, а не наблюдение. На исправление он влияет прямо: ограничивать нужно полное время запроса, а не простой.

#### 1. Два таймаута на каждый запрос

| Константа | Значение | Что ограничивает | Где |
|---|---|---|---|
| `REQUEST_TIMEOUT_SECONDS` | 750 | **полное** время одного вызова `chat.completions.create`, вместе с повторами самого SDK | `asyncio.timeout` в `RouterAiLlmClient._request` |
| `IDLE_TIMEOUT_SECONDS` | 60 | простой: ни одного байта от шлюза, включая keep-alive | `AsyncOpenAI(timeout=…)` в `_ensure_client` |

Оба значения — параметры конструктора `RouterAiLlmClient`, по умолчанию берутся эти константы. Так же устроен `RouterAiModelCatalog`: тесты передают миллисекунды, а прод не трогает ничего.

**750 с на запрос.** Легитимный вызов генерации длится минуты, поэтому быстро падать здесь не получится. Значение подобрано по замерам из этого раздела:

- самый долгий одиночный вызов модели в бенчмарке BIL-66 — 503 с (провайдер Venice). Из 36 вызовов за 300 с вышли только 5 (Venice и DigitalOcean);
- самая долгая задача генерации в проверке BIL-66 заняла 633 с. Это время задачи, а не вызова: в него могли войти повторы после невалидного ответа. Но и за этот верхний предел 750 выходит с запасом 18 %, а за 503 с — с запасом 49 %;
- самая долгая генерация по сырому промпту в BIL-86 — 486 с. Вызовы Anthropic в BIL-83 — до 288 с.

Сверху значение ограничено дедлайном генерации в воркере (`GENERATION_TIMEOUT_SECONDS` = 900, BIL-66) и должно быть меньше его. Иначе в воркере оно не сработает никогда: дедлайн задачи снимет вызов раньше. При 750 зависший первый вызов падает с понятной причиной «RouterAI не ответил на запрос генерации за 750 секунд», а не общим таймаутом задачи. Вне воркера (скрипты, бенчмарки вроде BIL-86) это единственная граница: без неё запрос висел 1800 с. Неравенство `IDLE < REQUEST < GENERATION_TIMEOUT_SECONDS` закреплено тестом.

**Одно значение на оба вызова.** Для `complete_text` (обогащение промпта, BIL-86) отдельное значение не нужно. У `enrich_prompt` свой дедлайн в 120 с, а самый долгий из 20 замеренных вызовов обогащения занял 94 с. Любое значение больше 120 с до обогатителя просто не доходит, а меньше 120 с оно ничего не даёт: дедлайн обогатителя сработает почти тогда же и тоже уведёт на сырой промпт. Ход чата (`chat_turn`) идёт через `complete` с тем же бюджетом 900 с, что у генерации (BIL-67), и самый долгий замеренный ход занял 71.7 с. Поэтому хватает одной константы.

**60 с простоя.** Это значение считается не от длительности генерации, а от интервала keep-alive: 60 пропущенных подряд пингов при интервале в секунду означают, что соединение мертво, а не что модель медленная. Раньше мёртвое соединение ждало 600 с, а с двумя повторами SDK (`max_retries=2` по умолчанию, SDK повторяет запрос и после своего таймаута) — до 1800 с. Теперь это 60 с × 3 плюс паузы между повторами, около 3 минут, и в любом случае не больше `REQUEST_TIMEOUT_SECONDS`. `connect` при передаче одного числа тоже становится 60 с (у SDK он был 5 с). Это сознательное упрощение: неустановленное соединение ограничено тем же сроком.

`asyncio.timeout` стоит **внутри** дедлайнов воркера и обогатителя и с ними не конфликтует. Если первым истекает внешний дедлайн, внутрь приходит `CancelledError`, и внутренний `asyncio.timeout` пропускает его наружу, не превращая в свой `TimeoutError`. В `GenerationError` превращается только `TimeoutError` с `deadline.expired()`, так же как в BIL-66/BIL-67.

#### 2. Временная ошибка провайдера — не отказ от схемы

`StrictSchemaUnsupportedError` означает, что модель не принимает strict-схему и её префикс надо добавить в `UNCONSTRAINED_MODEL_PREFIXES` (BIL-83). До BIL-89 этой ошибкой становилась **любая** ошибка запроса с `json_schema`, в том числе «Provider connection error, please retry».

**Признак — слово «schema» или «grammar» в тексте ошибки, без учёта регистра** (`SCHEMA_REJECTION_MARKERS`, `_is_schema_rejection`). Проверяется весь текст, который получает `_rejection`: `str(BadRequestError)` вместе с телом ответа или строка `error` из тела `200` вместе с `metadata.raw` и `previous_errors`. Этот признак выбран по сырым ответам настоящих отказов, снятым 2026-09-29, и по случаям из BIL-69/BIL-83:

| Провайдер | Текст отказа (фрагмент) | Совпало |
|---|---|---|
| OpenAI / Azure | `Invalid schema for response_format 'T': In context=('properties', 'a'), 'oneOf' is not permitted.`, `"code": "invalid_json_schema"` | `schema` |
| Anthropic (Fable) | `output_config.format.schema: Invalid schema: Circular reference detected in schema definitions: N -> N` | `schema` |
| Anthropic (BIL-83, текст из заметок) | `The compiled grammar is too large` | `grammar` |
| временная ошибка | `Provider connection error, please retry` | — |

Направление проверки выбрано сознательно. `StrictSchemaUnsupportedError` ставится только при **положительном** признаке проблемы со схемой, а всё остальное становится обычным `GenerationError` «RouterAI отклонил запрос генерации: <текст провайдера>». Цена ошибки в двух направлениях разная:

- отказ от схемы с незнакомой формулировкой уйдёт в `GenerationError`. Текст провайдера останется в сообщении и в `error` задачи (он доменный, BIL-63), и причину будет видно при первой же генерации. Теряется только отдельная строка `ERROR` в логе;
- обратное направление (искать признаки временной ошибки: «retry», «connection», «timeout», …) при любой незнакомой формулировке вернуло бы ровно этот баг.

Ложное совпадение возможно, если временная ошибка упомянет схему. Тогда провайдер действительно что-то сказал о схеме, и если в `previous_errors` один провайдер отказал по схеме, а другой отвалился по сети, считать это отказом от схемы правильно. HTTP-код провайдера (поле `code` в теле `200`) как признак не используется: для «Provider connection error» живого образца с кодом нет, а у настоящих отказов он 400, как и у многих других ошибок.

Ветку без `response_format` (`anthropic/*` и `complete_text`) это не меняет: там `_rejection` и раньше возвращал обычный `GenerationError`.

**Что сознательно не менялось.** Временная ошибка теперь честно называется, но **повторно не запрашивается**. `generate_structured` исключения клиента не ловит, а SDK не повторяет ответ `200`, в теле которого лежит ошибка. Число попыток (`ROUTERAI_MAX_RETRIES`, цикл `generate_structured`) и `max_retries` SDK — политика повторов, в BIL-89 они не входят.

#### Тесты

`tests/generation/test_llm_client.py`:

- настоящие отказы (OpenAI `oneOf`, Anthropic `Circular reference`, `compiled grammar`) в теле `200` дают `StrictSchemaUnsupportedError`. Тела повторяют снятые с живого шлюза. Прежние тесты BIL-83 (400/422 и ошибка в теле `200`) не менялись и проходят;
- «Provider connection error, please retry» в теле `200` и с кодом 400/422 даёт `GenerationError`, не `StrictSchemaUnsupportedError`;
- два теста на настоящем сокете (локальный сервер на `asyncio.start_server`, не `MockTransport`: у мок-транспорта httpx таймауты не работают). Сервер, который молчит, упирается в таймаут простоя. Сервер, который, как RouterAI, отдаёт `200` и шлёт пробелы, таймаут простоя не задевает и упирается в `REQUEST_TIMEOUT_SECONDS`. Второй тест и показывает, зачем нужны оба таймаута.

---

## 9.2 Ход диалога с ассистентом: `chat_turn`

Задача `chat_turn(ctx, app_id, message_id)` в `src/worker/tasks.py` — тот же композиционный слой, что и `generate_app_document`: своя сессия через `async_session_factory`, DI собирается вручную, коммит свой. **`message_id` — идентификатор реплики пользователя, на которую отвечает этот ход**, и он нужен задаче по двум причинам сразу: по нему режется контекст (см. ниже) и по нему же ход становится идемпотентным.

Отличие от генерации приложения — **в обработке провала**. У `generate_app_document` есть `mark_generation_failed`, потому что приложение уже существует с документом-плейсхолдером и его надо пометить. Здесь помечать нечего: при провале сообщение ассистента просто не создаётся, в истории остаётся только реплика пользователя, а причина видна клиенту через `error` в `GET /api/tasks/{id}`. Поэтому `try/except` с записью статуса в БД в `chat_turn` нет — исключение уходит в Arq, и это единственный правильный путь.

Контекст для модели собирает `ChatService.build_context(app_id, up_to_message_id)`: текущий документ приложения (через `AppService`, всегда свежий) плюс **последние `CONTEXT_HISTORY_LIMIT` = 20 сообщений** истории — но не «последние на момент выполнения задачи», а **последние 20 из тех, что существовали на момент отправки `message_id`**. Репозиторий (`list_messages_up_to`) режет историю по самой реплике-якорю включительно и всё, что легло в базу позже, отбрасывает.

Разница не косметическая. Пользователь может отправить второе сообщение, не дождавшись ответа на первое: воркер только тогда возьмёт первую джобу, а в истории уже две реплики. Без среза первый ход отвечал бы на вопрос, которого при его постановке ещё не было, а второй ход повторил бы тот же контекст — оба ответа поехали бы.

В промпт из истории уходят только `role` и `content` — вложенные `proposedDocument` прошлых сообщений отбрасываются намеренно: каждый из них целый `AppDocument`, и пары таких хватило бы, чтобы разорвать окно модели. Актуальное состояние приложения ассистент видит из текущего документа, история нужна только как ход разговора.

**`revision` предложенного документа проставляет задача, а не модель.** Ответ `ChatTurnResponse` с непустым `document` перед записью в `ChatMessage.proposed_document` прогоняется через `model_copy(update={"revision": ...})` с ревизией того документа, который `build_context` отдал в промпт. Модель это поле видит в схеме и может скопировать что угодно — вплоть до чужого числа из примера, — а от него зависит, пройдёт ли потом `PUT` оптимистичную блокировку (BIL-46, [`../api-contract.md`](../api-contract.md#оптимистичная-блокировка--revision-bil-46)). Промпт просит `revision` не трогать, но это просьба, а не гарантия.

### Идемпотентность хода

Arq может перезапустить задачу — при падении воркера, по своим ретраям, при повторной постановке. Без защиты это второй ответ ассистента на одну и ту же реплику в истории.

Защита стоит в двух местах, и оба нужны:

- **В схеме.** У `chat_messages` есть self-referential `in_reply_to_id` (nullable) с **уникальным констрейнтом**: у одной реплики не может быть двух ответов. Заполняется он только у сообщений ассистента; `NULL` в уникальном индексе Postgres не сравнивается, поэтому сколько угодно реплик пользователя рядом друг другу не мешают.
- **В задаче.** `chat_turn` первым делом спрашивает `ChatService.has_reply(message_id)` и, если ответ уже есть, **выходит молча** — не создаёт ничего, не ходит в LLM, не считается провалом. Это дешёвый путь, который срабатывает в подавляющем большинстве повторов.

Сам FK на реплику — **составной**: `(app_id, in_reply_to_id) → (app_id, id)` той же таблицы (целью служит отдельный `UNIQUE (app_id, id)` — составному FK нужен констрейнт ровно в таком составе колонок, одного PK по `id` мало). Одиночного FK на `in_reply_to_id` больше нет: составной строго сильнее и заменяет его целиком. Смысл — БД сама гарантирует, что ответ ссылается на сообщение **того же приложения**: с одиночным FK ответ в приложении A мог указывать на реплику из приложения B, и ничто в схеме этому не мешало (регресс ловит `tests/chat/test_repository.py`). `NULL` в `in_reply_to_id` составной FK не проверяет — Postgres по умолчанию `MATCH SIMPLE`, а значит реплики пользователя, у которых ссылки нет, проходят как раньше. `ondelete="CASCADE"` тот же, что был.

Проверка перед вставкой — не гонко-безопасная сама по себе (два воркера могут пройти её одновременно), поэтому `IntegrityError` на вставке ловится и трактуется **так же, как «уже обработано»**: `rollback` и тихий выход, а не провал задачи. Гонку выигрывает тот, кто вставил первым, второй просто выбрасывает свой ответ.

**Источник правды о порядке сообщений — колонка `sequence`, а не `created_at`.** Это `BIGINT GENERATED ALWAYS AS IDENTITY`: значение выдаёт Postgres в момент вставки, монотонно и без дырок в порядке. По ней идёт и сортировка (`ORDER BY sequence`), и срез контекста (`sequence <= anchor.sequence`) — `created_at` в запросах не участвует вообще и остаётся чисто отображаемым полем.

Почему не время: время может совпасть. `now()` — это время начала транзакции, одно на все строки внутри неё, поэтому дефолт у `created_at` — `clock_timestamp()`; но и настоящий момент вставки двух строк может совпасть до микросекунды, и тогда тайбрейком становился бы случайный `uuid` — порядок сообщений определялся бы не тем, в каком порядке их отправили. Срез контекста для модели зависит от этого напрямую (§ 9.2), поэтому порядок отдан последовательности БД. Регресс ловится интеграционным тестом с искусственно одинаковым `created_at` (`tests/chat/test_repository.py`), который проверяет заодно, что `InMemoryChatRepository` воспроизводит ту же монотонность своим счётчиком, — иначе тесты сервиса и воркера врали бы про порядок.

**Фоллбэка на шаблоны в проде нет и не будет** — ни здесь, ни у генерации приложения. Нет ключа (`GenerationNotConfiguredError`), сеть упала, шлюз отклонил запрос, модель за все попытки не выдала валидный ответ — у `chat_turn` исключение просто уходит в Arq и доезжает до клиента как `error` в `GET /api/tasks/{id}` (`mark_generation_failed` здесь **не** зовётся — это путь только `generate_app_document`, где есть документ-плейсхолдер, который надо пометить `generationStatus: "failed"`). Отдать пользователю шаблон под видом ответа ассистента — хуже, чем честно показать ошибку.

Клиент живёт по одному на процесс воркера: создаётся в `on_startup` (`src/worker/main.py`), кладётся в `ctx["llm_client"]`, закрывается в `on_shutdown` — так же, как пул `ArqRedis` живёт в `app.state` у API. `AsyncOpenAI` внутри создаётся лениво, при первом запросе: воркер без ключа обязан стартовать и валить конкретные задачи, а не падать на старте.

### Коммит до постановки задачи

`ChatService.send_message` **явно коммитит транзакцию до `TaskQueue.enqueue`**, а не полагается на коммит в `get_session` при выходе из хендлера. Порядок «записали сообщение → поставили задачу → закоммитили» открывал реальное окно: воркер (отдельный процесс) может взять джобу раньше, чем `INSERT` виден в БД, и `build_context` не найдёт реплику-якорь, на которую отвечает, — вернёт пустую историю и отправит модель отвечать в пустоту.

Коммитить сервису нечем — `src.chat.service` по контракту инверсии зависимостей не видит SQLAlchemy. Поэтому в сервис инжектится `Transaction` — `Protocol` с единственным `commit()` (`src/transaction/base.py`), реализация `SessionTransaction` поверх `AsyncSession` (`src/transaction/session_transaction.py`) подставляется через DI ровно так же, как `ArqTaskQueue` под `TaskQueue`. В тестах вместо неё встаёт двойник, который просто записывает порядок вызовов.

**Компромисс с «одна транзакция на запрос».** Формально коммитов теперь два: явный в сервисе и тот, что делает `get_session` на выходе. Второй — no-op: после явного коммита в сессии не остаётся ни одного изменения, SQLAlchemy откладывает `BEGIN` до первого запроса и потому ничего в БД не отправляет. Модель «одна транзакция на запрос» не нарушена — сдвинулся только момент её закрытия, и сдвинулся осознанно: между коммитом и `enqueue` в `send_message` ничего не пишется. Ставить `enqueue` после `get_session` штатными средствами FastAPI нельзя — зависимости с `yield` выходят в обратном порядке, и любая зависимость, добавленная после сессии, закроется раньше неё.

Что этот порядок **не** решает: если `enqueue` упадёт уже после коммита, сообщение пользователя останется в истории, а хода не будет — клиент получит 500 и увидит свою реплику без ответа. Это обычная проблема двойной записи, и честно закрывается она только транзакционным outbox'ом. Такой размен выбран сознательно: осиротевшее сообщение пользователь видит и может повторить, а ход по невидимым данным ломается молча и невоспроизводимо.

**Тот же порядок теперь и в `AppService.create_from_prompt`** (BIL-39): `create` → `Transaction.commit()` → `enqueue`. Окно было такое же — воркер мог взять `generate_app_document` раньше, чем `INSERT` приложения виден в БД; до этого оно закрывалось только тем, что задача при `AppNotFound` падала, а не писала мусор.

Отличие от чата одно: у `AppService` `Transaction` — **обязательный параметр конструктора**, а не опциональный, как `TaskQueue` у `ChatService`. Причина в том, что у `AppService` и `TaskQueue` обязательна: воркер передаёт туда настоящую `ArqTaskQueue` даже там, где ничего не ставит в очередь, и два коллаборатора с разными правилами опциональности в одном классе читались бы хуже, чем расхождение между двумя классами. Опциональность у `ChatService` даёт осмысленное свойство — собранный в воркере `ChatService` структурно не способен отправить сообщение; для `Transaction` такого свойства нет, воркер и так коммитит через `SessionTransaction`. Плата — `SessionTransaction(session)` во всех сборках `AppService` в `src/worker/tasks.py`, хотя `create_from_prompt` воркер не вызывает; логика коммитов самого воркера при этом не изменилась.

Порядок закреплён тестами в `tests/apps/test_service.py` — тот же приём, что у `send_message` (`tests/chat/test_service.py`): общий журнал событий у фейковых `Transaction` и `TaskQueue`, плюс проверка, что при падении коммита `enqueue` не происходит вовсе.

### Куда переехали шаблоны

Пять шаблонов (`habits` / `social` / `shop` / `forms` / `blank`) и `select_template` из прода **удалены и лежат в `backend/tests/generation/template_fixtures.py`** как тестовая фикстура: `build_template_document(prompt, name)`. Они по-прежнему нужны — детерминированные валидные документы без сети, на которых работают cross-generator parity тест (§ 10.1), тесты `AppService` и тесты воркера. Продовый `generate_document` для этого больше не годится: он ходит в сеть.

Промпт (`src/generation/prompt.py`) — единственный файл, где RUF001 выключен в `per-file-ignores`: это двуязычный текст, где русские слова стоят вплотную к латинским идентификаторам модели, и правило ловит там только ложные срабатывания.

---

## 9.3 Курируемый список моделей и выбор модели на запрос (BIL-42, BIL-45)

Модель для генерации выбирает пользователь на каждый `POST /api/apps` (формы запросов и сам список из 7 моделей — в [`../api-contract.md`](../api-contract.md#выбор-модели-генерации-bil-42-bil-45)).

**В BIL-42 разрешённой считалась любая модель каталога RouterAI** (заказчик тогда подтвердил «все»), и валидация вырождалась в «модель есть в каталоге шлюза» — 468 значений. **В BIL-45 заказчик заменил это фиксированным списком из 7 моделей**, поэтому теперь источник правды — константа в коде, а не ответ шлюза.

### `CURATED_MODELS`

Список лежит константой `CURATED_MODELS: tuple[ModelInfo, ...]` в `src/generation/model_catalog.py`, рядом с самой `ModelInfo`. Отдельного модуля (и тем более таблицы в БД) под 7 строк не заводили: у списка ровно один потребитель — каталог, — а вынос в соседний файл дал бы либо циклический импорт из-за `ModelInfo`, либо третий модуль ради одного типа.

Порядок кортежа — **порядок отображения в селекте на фронте**, он часть контракта: `list_models()` отдаёт его как есть и ничего не сортирует. `name` и `pro` тоже берутся отсюда, а не из ответа RouterAI — у шлюза имена свои (`Anthropic: Claude Opus 5`, `DeepSeek: DeepSeek V4 Pro 0423`), и подставлять их вместо согласованных с заказчиком нельзя.

`id` всех семи сверены с живым каталогом (`GET https://routerai.ru/api/v1/models`) на момент BIL-45 — не выписаны по догадке из названий. Осторожно с двумя местами, где легко ошибиться:

- `deepseek/deepseek-v4-pro` — базовый алиас (у шлюза он называется «DeepSeek V4 Pro 0423»); рядом лежит датированный снапшот `deepseek/deepseek-v4-pro-0813`. Берём алиас — по той же логике, по которой `ROUTERAI_MODEL` по умолчанию указывает на `deepseek/deepseek-v4-flash`, а не на `-0731`.
- `openai/gpt-5.6-terra` и `openai/gpt-5.6-sol` — не путать с `-terra-pro` / `-sol-pro`: это отдельные модели шлюза с другими именами, в список они не входят.

### `ModelCatalog`

`src/generation/model_catalog.py` — `Protocol` `ModelCatalog` и реализация `RouterAiModelCatalog`, устроенные как `LlmClient`: домен `apps` знает только Protocol, конкретный класс подставляется через DI. Контракт нарочно разделён на асинхронное обновление и синхронное чтение:

| Метод | Что делает |
|---|---|
| `async ensure_fresh()` | сверяет курируемый список с живым каталогом шлюза, если кэш пуст или протух, и пересчитывает `_valid_ids`; на свежем кэше — no-op без сети |
| `is_valid(model_id)` | `model_id in self._valid_ids`, без сети и без `await` |
| `list_models()` | модели `CURATED_MODELS`, чей `id` есть в `_valid_ids`, как `list[ModelInfo]` (`id` / `name` / `pro`) |

**`is_valid` и `list_models` отвечают из `_valid_ids` — состояния экземпляра, а не из константы напрямую.** `_valid_ids` — это пересечение `CURATED_MODEL_IDS` с последним **успешным** ответом шлюза; до первой успешной сверки оно равно всему `CURATED_MODEL_IDS`. Живой каталог (`GET {routerai_base_url}/models`, публичный эндпоинт, **работающий без ключа** — проверено ещё в BIL-15) остался в классе не как источник данных (имена, порядок и `pro` берутся только из константы), а как **фильтр**: после успешного ответа `_store` пересчитывает пересечение и пишет `WARNING` со списком пропавших.

Почему пропавшая модель именно выпадает, а не просто логируется: предложить её в селекте и принять в `POST /api/apps` значило бы создать приложение, генерация которого гарантированно провалится на стороне шлюза, — 422 сразу честнее.

Три состояния `_valid_ids`, и все три намеренные:

| Состояние | `_valid_ids` |
|---|---|
| холодный старт, сверки ещё не было | всё `CURATED_MODEL_IDS` — базовая функциональность не ждёт первого похода в сеть |
| успешная сверка | `CURATED_MODEL_IDS & upstream_ids` |
| сверка не удалась | не трогается, остаётся последнее известное пересечение (stale-if-error) |

Последняя строка — почему `_valid_ids` инициализируется значением, а не пустым множеством: единственный писатель `_valid_ids` — `_store`, и вызывается он только на успешном ответе. Сбой сети не должен ни обнулять список (все модели стали бы невалидны), ни возвращать в него модель, которую предыдущая успешная сверка уже отбраковала. Ходит туда `httpx` напрямую, а не `openai`: это обычный REST-ответ, а не chat-completion, и гонять его через SDK незачем. Отсюда же рантайм-зависимость `httpx` в `pyproject.toml` и `src.generation.model_catalog` в контракте инверсии зависимостей рядом с `llm_client`.

Из ответа шлюза разбираются **только `id`** (`_valid_ids` — `frozenset[str]`): имена и цены ни на что не влияют, и парсить их значило бы держать код, вывод которого никуда не идёт.

**TTL кэша — час** (`CATALOG_TTL_SECONDS`) — не изменился. Смысл у него сменился с «не ходить в сеть на каждую валидацию» на «не ходить в сеть на каждую сверку»: каталог шлюза меняется днями, а проверка «наши семь ещё на месте» раз в час ловит пропажу достаточно быстро. Живёт кэш в памяти процесса: инстансов API может быть несколько, каждый сверяет свой — синхронизировать нечего.

Единственный экземпляр создаётся модульным синглтоном в `src/generation/dependencies.py` (`get_model_catalog()`), как `settings`. Иначе `Depends` собирал бы новый каталог на каждый запрос и кэш не существовал бы.

**Провал обновления больше не является ошибкой наружу.** Шлюз не ответил, вернул мусор или пустой список — пишем `WARNING` и выходим, не тронув `_valid_ids`; `_fetched_at` тоже не обновляется, так что следующий вызов попробует снова. Отдавать и проверять есть что и без сети, поэтому **исключение `ModelCatalogUnavailable` и ответ 502 у `GET /api/models` удалены** — вместе с веткой `try/except` в lifespan `src/main.py`, где прогрев теперь просто `await get_model_catalog().ensure_fresh()`. До BIL-45 502 был осмысленным: кэш был единственным источником списка, и «моделей нет» надо было отличать от «каталог не доехал».

### Резолв модели

Живёт в `AppService.create_from_prompt` (`model: str | None`), не в Pydantic-схеме: проверке нужен коллаборатор-каталог, а `field_validator` до него не дотягивается.

1. `None`, пустая строка или `"auto"` → `settings.routerai_model`, каталог даже не трогается.
2. Иначе `await ensure_fresh()` и `is_valid` — не прошло, `InvalidModel` (422, текст по-русски) **до** `repository.create`, то есть ни записи, ни задачи в очереди. `ensure_fresh()` здесь обязателен: именно он поддерживает `_valid_ids` в актуальном состоянии, по которому и отвечает `is_valid`. На свежем кэше он ничего не стоит, а упасть не может (см. выше), поэтому недоступный RouterAI создание приложения не ломает — просто валидация идёт по последнему известному пересечению.
3. В `App.model` и в kwargs задачи уходит уже резолвленное значение — в базе не бывает `"auto"`, и воркер получает `model: str` без права на догадки.

`App.model` (`String(200)`, nullable, ревизия `c4d9e1f70a26`) — фактическая модель генерации, историческая запись. Nullable — из-за строк, созданных до BIL-42; наружу поле пока не отдаётся.

`ModelCatalog` стал четвёртым обязательным параметром `AppService`, поэтому воркер тоже собирает его через `get_model_catalog()` — по той же логике, по которой `Transaction` там обязателен (§ 9.2, «Коммит до постановки задачи»), хотя `create_from_prompt` воркер не вызывает.

### Метка `pro`

`ModelInfo.pro` — **косметика**: ни доступ, ни поведение генерации она не меняет и меняться не должна. В BIL-42 метка выводилась эвристикой из `pricing.prompt` каталога (порог `1e-4`); **в BIL-45 эвристика и весь разбор цен удалены** — флаг проставлен в `CURATED_MODELS` руками, значениями от заказчика.

Главная ловушка: у `DeepSeek V4 Pro` стоит `pro: false`. «Pro» там — часть имени модели у вендора, а не наш бейдж; читать его как метку и «исправлять» флаг нельзя.

---

## 10. Генерация кода: важное предупреждение

`AppDocument` → файлы Expo-проекта нужен **в двух местах**:
- на фронте — живая панель кода и дерево файлов в редакторе (уже реализовано в TS: `frontend/apps/web/src/entities/app-document/lib/codegen.ts`);
- на бэке — zip для `GET /api/apps/{id}/export`.

**Решено: генератор продублирован на Python** (`src/codegen/service.py` — построчный порт `codegen.ts`, включая набор файлов проекта, их пути и содержимое). Вариант «держать один генератор» (гонять TS в отдельном процессе или вынести в общий сервис) отклонён: он тянет Node в прод-рантайм бэкенда ради одной чистой функции.

Плата за дублирование — расхождение генераторов, и закрывается оно **тестом на равенство вывода**: один и тот же `AppDocument` прогоняется через оба генератора, карты файлов сравниваются целиком. Node нужен только этому тесту в CI-шаге, в прод-образ бэкенда он не попадает. Правишь один генератор — правь второй в том же PR, иначе тест краснеет.

Что стоит помнить при сверке: порядок ключей в объекте стиля TS-генератор берёт из самого JSON (`Object.entries`), Python — из порядка полей Pydantic-модели. Для документов, приехавших с бэка, порядок совпадает (ответ пересобирается через `AppDocument`), для собранных на клиенте — может отличаться; на смысл сгенерированного кода это не влияет, но тест сравнения обязан это учитывать.

### 10.1 Механика теста на равенство

Тест — `backend/tests/codegen/test_cross_generator_parity.py`. Он не импортирует TS-код и не собирает фронт: TS-генератор вызывается как подпроцесс через тонкую обёртку `frontend/apps/web/scripts/codegen-cli.ts`, которая читает `AppDocument` в JSON со stdin и печатает в stdout `{"files": {...}}`.

```
subprocess.run([node, <repo>/frontend/apps/web/scripts/codegen-cli.ts], input=<json>, capture_output=True)
```

Что здесь важно и легко сломать:

- **Никаких флагов Node и никакой сборки.** Обёртка запускается как `node <путь>.ts` благодаря встроенному в Node стрипу типов. Работает начиная с **Node 22.18** (в 23.x — с 23.6), где стрип включён без `--experimental-strip-types`. Проверено на Node 24.19 и 26.7 — вывод совпадает.
- **`npm install` не нужен.** И обёртка, и `codegen.ts` тянут из `@bildo/api` только типы (`import type`), а они стираются вместе с остальной типовой разметкой — в рантайме алиас `@bildo/api` не резолвится. Поэтому в коде обёртки и генератора не должно появиться рантайм-импорта из `@bildo/api` (или любого другого пакета workspace) — тест сразу упадёт на резолве модуля. По той же причине в них нельзя использовать нестираемый TS-синтаксис (`enum`, `namespace`, параметры-свойства конструктора).
- **Путь к скрипту вычисляется от расположения теста** (`Path(__file__).resolve().parents[3]` — корень репозитория, где рядом лежат `backend/` и `frontend/`), абсолютные пути конкретной машины не хардкодятся.
- **На вход node уходит ровно то представление, которое отдаёт API**: `document.model_dump(mode="json", by_alias=True)`, то есть camelCase и без незаданных опциональных полей (`OmitNoneModel`). Гонять через node что-то другое бессмысленно — тест перестанет проверять реальный формат.
- **Документы для сверки**: все пять шаблонов из `tests/generation/template_fixtures.py` плюс собранный вручную документ максимального покрытия (`tests/codegen/max_coverage_document.py`) — все типы узлов, кроме `Icon` (он добавится вместе с BIL-92, см. § 10.4), все 4 действия, `textBind`/`valueBind`/`href`, вложенность, `hidden`/`locked`, `zIndex`, экранирование кавычек и переносов строк. Шаблоны сами по себе покрывают только `View`/`Text`/`Button`/`TextInput` и три действия из четырёх, поэтому одних их мало.
- **Нет Node в `PATH` — тест пропускается** (`pytest.mark.skipif`), а не падает: у разработчика без Node `make check` не должен ложно краснеть. Настоящая проверка идёт в CI, где Node есть всегда.

**Node ставится только в CI и только для шага тестов** — шагом `actions/setup-node` в `.github/workflows/backend.yml` перед `uv run pytest`. В прод-образ и рантайм бэкенда Node не попадает: единственный его потребитель — этот тест.

Там же в workflow к фильтру `paths` добавлены `frontend/apps/web/src/entities/app-document/lib/codegen.ts` и `frontend/apps/web/scripts/codegen-cli.ts`. Без этого правка одного только TS-генератора не запускала бы бэковый пайплайн, и расхождение проехало бы в `main` незамеченным.

### 10.2 React Native Paper: маппинг темы и стилей узлов (BIL-75)

Решено переводить экспортируемый Expo-проект на **React Native Paper** (MD3), чтобы поднять визуальное качество. Этот раздел — спецификация, по которой реализуют оба генератора: **BIL-76** (Python, `src/codegen/service.py`) и **BIL-77** (TS, `codegen.ts`), а **BIL-78** правит промпты. Выводить что-то заново им не нужно — всё решено здесь, и оба генератора обязаны реализовать это одинаково (тест на равенство из § 10.1 никуда не девается).

**Источник.** Всё ниже проверено по исходникам `react-native-paper@5.15.3` (npm `latest` на 2026-09-18; `6.0.0` пока только `alpha`), не по документации и не по памяти. Файлы, на которые опираются выводы: `src/types.tsx` (`MD3Colors`, `MD3Theme`), `src/styles/themes/v3/LightTheme.tsx`, `src/components/Button/Button.tsx` + `utils.tsx`, `src/components/Surface.tsx`, `src/components/TextInput/TextInputOutlined.tsx` + `helpers.tsx` + `Addons/Outline.tsx` + `constants.tsx`. Обновляете Paper — перепроверьте таблицы ниже по тем же файлам.

**Объём.** На Paper переезжают только `Button` → `<Button>` и `TextInput` → `<TextInput>`. Остальные шесть типов узлов остаются на голом RN. Тема Paper при этом строится целиком (все слоты), чтобы любой следующий компонент Paper получал осмысленные цвета, а не фиолетовые дефолты MD3.

#### Что уже сломано сегодня, до Paper

Три поля `AppNodeStyle` в экспорте **инертны уже сейчас**, в обоих генераторах: `styleToRN` / `_style_to_rn` выписывают их в RN-стиль как есть, а таких ключей у RN нет.

| Поле | Почему не работает |
|---|---|
| `shadow` | в документе это CSS-строка (`"0 6px 16px rgba(0,0,0,.3)"`), а ключ `shadow` в RN не существует (есть `shadow*`, `elevation`, в RN 0.76 с новой архитектурой — `boxShadow`) |
| `backgroundGradient` | CSS-градиент; у RN нет градиентной заливки без `expo-linear-gradient` |
| `animation` | пресеты движения есть только в превью редактора (`app-anim--*`), в экспорт не реализованы |

Отбросить их у Paper-узлов — значит **не потерять ничего, что работает сейчас**. В редакторе они при этом видны: превью и экспорт расходятся по этим полям уже до этой задачи.

Токены `fontBody`/`fontHeading` в экспорте тоже не применялись нигде: `theme.ts` их просто содержал. **С BIL-88 применяются — см. § 10.5.**

#### 1. Тема: 10 `AppThemeTokens` → `MD3Theme`

**Где считается.** Производные цвета вычисляются **в рантайме сгенерированного проекта**, в `theme.ts`, а не во время кодогенерации. Генераторы выписывают в `theme.ts` одну и ту же статичную строку-шаблон (маленькие хелперы + сборка `paperTheme`), меняется в ней только JSON с токенами — ровно как сейчас. Так в генераторах нет ни одной цветовой арифметики, и тесту на равенство нечему расходиться (округление, форматирование float в JS и Python). Внешних пакетов для цвета не тянем: `color` у Paper — транзитивная зависимость, полагаться на неё нельзя.

Экспорт `theme` остаётся как есть (им пользуются `_layout.tsx` и экраны), рядом добавляется `export const paperTheme: MD3Theme`, `_layout.tsx` оборачивает дерево в `<PaperProvider theme={paperTheme}>` внутри `SafeAreaProvider`. В `package.json` проекта — `"react-native-paper": "~5.15.3"`; `react-native-safe-area-context` (peer) уже есть. Paper на старте настраивает иконочный шрифт через `@expo/vector-icons` и грузит его через `expo-font` — оба нужны явными зависимостями в `package.json` проекта, а не только транзитивно через `expo`: `"@expo/vector-icons": "~14.0.4"`, `"expo-font": "~13.0.4"`.

Хелперы в `theme.ts` (контракт, реализация — на BIL-76/77, одна на оба генератора, потому что это шаблонный текст):

| Хелпер | Что делает | Невалидный вход |
|---|---|---|
| `mix(a, b, t)` | непрозрачный HEX: `a·(1−t) + b·t` по каналам sRGB, с округлением каналов | если `a` или `b` не `#rgb`/`#rrggbb` — возвращает `a` |
| `withAlpha(c, a)` | `rgba(r, g, b, a)` | возвращает `c` как есть |
| `isDarkColor(c)` | относительная яркость по WCAG `< 0.179` — порог, на котором белый и чёрный текст контрастны одинаково | `false` |

Валидным HEX токен должен быть и так (`RULES` требует HEX, `ColorPicker` выдаёт HEX), фоллбэки нужны, только чтобы один кривой токен не ронял приложение на старте.

**Корень темы.**

| Поле `MD3Theme` | Значение | Почему |
|---|---|---|
| база | `dark ? MD3DarkTheme : MD3LightTheme`, поверх — всё ниже | слоты, для которых мы сознательно берём базовый MD3, приходят отсюда |
| `dark` | `isDarkColor(colorBg)` | Paper читает `dark` при выборе базовых цветов и в части компонентов; угадывать по одному флагу из документа нечем, а фон — главный признак |
| `mode` | `'exact'` | в тёмной теме с `adaptive` часть компонентов (`Appbar`, `Card`, `Dialog`, `BottomNavigation`) подмешивает оверлеи к фону и сдвигает наши цвета |
| `roundness` | `parseFloat(radiusBase)`, если конечно и `>= 0`, иначе `12` | см. ниже |
| `fonts` | базовый `configureFonts()` без изменений | см. ниже |
| `animation` | из базы (`scale: 1`) | — |

**`roundness` = `radiusBase` один к одному, но Button его не умножает.** Paper масштабирует `roundness` по компонентам: V3-`Button` — `5 × roundness` (при дефолтных 4 это «пилюля» 20px), `Card` и малый `FAB` — `3×`, средний `FAB` — `4×`, большой — `7×`, outlined-`TextInput` — `1×`. Единого множителя, при котором все компоненты получают `radiusBase`, нет. Поэтому `roundness = radiusBase` (так он честно работает для `TextInput`), а у `Button` генератор **всегда** передаёт явный `borderRadius` (см. таблицу Button) — Paper это официально поддерживает, и множитель в игру не вступает. **Любой следующий компонент Paper, который будут внедрять, — сначала проверить его множитель `roundness` и при необходимости так же передавать радиус явно.**

`radiusBase` в документах бывает в двух форматах: `"14"` (бэкенд-плейсхолдер `"9"`, фикстуры) и `"12px"` (`DEFAULT_APP_THEME` во фронте). `parseFloat` понимает оба. Что с этим делать в промпте — см. п. 4.

**`fontBody`/`fontHeading` не маппятся в `paperTheme` — сознательно.** *(Абзац ниже — состояние на BIL-75. Загрузку шрифтов сделал BIL-88, и сделал её не через `configureFonts`, а явным `fontFamily` на узлах — см. § 10.5; `paperTheme.fonts` по-прежнему базовый.)* Шрифты в сгенерированном проекте не загружаются (`expo-font`/`@expo-google-fonts` в зависимостях нет), а `fontFamily: "Inter"` без загруженного файла не отрисуется этим шрифтом (iOS ругается «Unrecognized font family», Android молча берёт системный). Paper с типографикой по умолчанию (`System` на iOS, `sans-serif`/`sans-serif-medium` на Android) — ровно то, что экспорт показывает сегодня. Подключение шрифтов — отдельная задача: загрузка файлов + `configureFonts({ config: { fontFamily } })`; значение `"System"` при этом маппить не нужно.

**Цвета.** В `MD3Colors` 31 строковый слот плюс `elevation` (`level0`–`level5`). Прямых токенов у нас 7 цветовых, так что у каждого слота ниже записано, откуда он берётся. `mix(a, b, t)` — доля `b` равна `t`.

| Слот `MD3Colors` | Значение | Где Paper его читает / почему так |
|---|---|---|
| `primary` | `colorPrimary` | заливка contained-`Button`, активная обводка `TextInput`, курсор |
| `onPrimary` | `colorPrimaryFg` | текст contained-`Button` |
| `primaryContainer` | `mix(colorBg, colorPrimary, 0.16)` | лёгкая тонировка акцентом поверх фона |
| `onPrimaryContainer` | `colorText` | контейнер близок к фону, значит основной текст на нём читается |
| `secondary` | `colorPrimary` | второго акцента в теме нет; выдумывать оттенок — значит вводить цвет, который пользователь не выбирал. Все три акцентные роли MD3 сходятся на одном |
| `onSecondary` | `colorPrimaryFg` | то же |
| `secondaryContainer` | `mix(colorSurface, colorPrimary, 0.16)` | самый используемый «контейнер» Paper: contained-tonal `Button`, выбранные `Chip`/`SegmentedButtons`, индикатор `BottomNavigation`/`Drawer` |
| `onSecondaryContainer` | `colorText` | то же, что у `onPrimaryContainer` |
| `tertiary` | `colorPrimary` | см. `secondary` |
| `onTertiary` | `colorPrimaryFg` | — |
| `tertiaryContainer` | как `secondaryContainer` | — |
| `onTertiaryContainer` | `colorText` | — |
| `background` | `colorBg` | дефолтный фон outlined-`TextInput` и подложка его лейбла (генератор всё равно передаёт фон поля явно, см. TextInput) |
| `onBackground` | `colorText` | — |
| `surface` | `colorSurface` | — |
| `onSurface` | `colorText` | цвет вводимого текста `TextInput` |
| `surfaceVariant` | `mix(colorSurface, colorText, 0.08)` | фон flat-`TextInput`, `Searchbar`, `Chip`; чуть отличим от `surface` |
| `onSurfaceVariant` | `colorTextMuted` | цвет плейсхолдера `TextInput` — совпадает с превью редактора |
| `surfaceDisabled` | `withAlpha(colorText, 0.12)` | так же, как Paper строит его сам (нейтраль с прозрачностью `.12`), только от нашего текста |
| `onSurfaceDisabled` | `withAlpha(colorText, 0.38)` | то же, прозрачность `.38` |
| `outline` | `colorBorder` | обводка outlined-`TextInput` и outlined-`Button` в покое — как рамка поля в превью |
| `outlineVariant` | `colorBorder` | `Divider`; у токена `colorBorder` роль и есть «граница/разделитель», второй ступени нет |
| `inverseSurface` | `colorText` | `Snackbar`, `Tooltip` — инверсия темы |
| `inverseOnSurface` | `colorBg` | — |
| `inversePrimary` | `mix(colorPrimary, colorBg, 0.5)` | акцент на инверсной поверхности: в светлой теме светлеет, в тёмной темнеет — в обоих случаях от `inverseSurface` уходит |
| `error`, `onError`, `errorContainer`, `onErrorContainer` | из базовой темы (MD3 baseline, свой для светлой и тёмной) | токена ошибки у нас нет; ни один генерируемый узел состояние ошибки не выставляет (`error` у `TextInput` не пишем), так что выдумывать цвет не ради чего |
| `shadow`, `scrim` | `#000000` | как в MD3, тень от темы не зависит |
| `backdrop` | из базовой темы | нейтральное затемнение под модалками — наши токены тут ни о чём не говорят |
| `elevation.level0` | `'transparent'` | как в MD3 |
| `elevation.level1`…`level5` | `mix(colorSurface, colorPrimary, t)`, `t` = `0.05` / `0.08` / `0.11` / `0.12` / `0.14` | ровно формула Paper (`primary` поверх `surface` с этими долями), только от наших токенов. Значения обязаны быть **непрозрачными**: Paper прямо предупреждает, что полупрозрачный фон `Surface` ломает тени |

#### 2–3. `Button` → Paper `<Button>`

Генерируемый вид — `mode="contained"` (или `"elevated"`, см. `shadow`), либо `mode="outlined"`, если `backgroundColor` не задан, а `color` задан (BIL-80, см. ниже), всегда с `compact`, `buttonColor`, `textColor`, `style`, `contentStyle`, `labelStyle`, `onPress`, текст — `children`.

Как устроен Paper `Button` и почему это важно: снаружи `Surface` (к нему уходит `style`), в нём `TouchableRipple` (зона нажатия и ripple), в нём `View` контента (`contentStyle`, `flexDirection: 'row'`, центрирование) и `Text` лейбла (`labelStyle`, `numberOfLines={1}`, `labelLarge`: 14/20, вес 500, у V3 поля лейбла `marginVertical: 10`, `marginHorizontal: 24`). Высота кнопки сама по себе — 40px от лейбла; высота, заданная `Surface`, **не** растягивает контент — `TouchableRipple` не `flex: 1`. Документация Paper прямо говорит: высоту и отступы задавать через `contentStyle`.

| Поле | Что происходит в Paper, если выписать как сейчас в `style` | Решение |
|---|---|---|
| `layout.x/y/width/height/zIndex` | `position/left/top/width/height/zIndex` в `style` работают (на iOS уходят во внешний слой `Surface`), но контент остаётся высотой 40px и прижат к верху | `style` как сейчас **плюс** `contentStyle.height = layout.height − 2 × (style.borderWidth ?? 0)` — число считается в генераторе |
| `flex`, `flexDirection`, `alignItems`, `justifyContent`, `gap` | ложатся на `Surface`. Хуже всего `alignItems: 'center'`: `TouchableRipple` сжимается до ширины текста, и **нажимается только середина кнопки**. Этот `alignItems` стоит в дефолтном стиле кнопки в `component-registry.ts`, то есть почти в каждом документе | **выбросить** |
| `padding`, `paddingHorizontal` | `padding` на `Surface` сужает `TouchableRipple` (кольцо у края не нажимается) и сжимает контент; внутренние поля Paper остаются | в `style` не пишем; `labelStyle.marginHorizontal = paddingHorizontal ?? padding ?? 16` (16 — дефолтный `paddingHorizontal` кнопки в реестре) |
| `paddingVertical` (и вертикальная часть `padding`) | то же + лейбл с `marginVertical: 10` не влезает в кнопки ниже 40px | **выбросить**; `labelStyle.marginVertical = 0` всегда — вертикаль центрирует `contentStyle` высотой из `layout` |
| `margin`, `marginTop`, `marginBottom` | уходят во внешний слой `Surface`, ведут себя как у `View` | в `style` как есть |
| `backgroundColor` | `style` перекрыл бы фон `Surface`, но в обход API: ripple и логика `disabled` считаются от `buttonColor` | проп `buttonColor` — **всегда явно**. Задан `backgroundColor` → `buttonColor = backgroundColor`, режим `contained`/`elevated`. Не задан, но задан `color` → `buttonColor = 'transparent'`, режим переключается на `outlined` (BIL-80, см. ниже). Не заданы оба → `buttonColor = theme.colorPrimary`, `contained`/`elevated` — прежний дефолт |
| `backgroundGradient` | инертно уже сейчас | **выбросить** |
| `color` | `color` в `style` (ViewStyle) никуда не доходит; Paper красит лейбл сам: `onPrimary`, а в `elevated`/`outlined` — `primary` | проп `textColor = color ?? theme.colorPrimaryFg` — **всегда явно** |
| `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight` | в `style` инертны (это ViewStyle `Surface`), лейбл остаётся `labelLarge` | в `labelStyle`. `fontWeight = fontWeight ?? '600'` — так рисует превью редактора и так генерирует экспорт сейчас (у Paper по умолчанию 500). `lineHeight`: если задан — как есть; если задан только `fontSize` — `floor(fontSize × 1.4 + 0.5)` (иначе остаётся `labelLarge` 20px и крупный текст обрезается). В Python именно `math.floor(x + 0.5)`, не `round()`: у `round()` банковское округление, у JS `Math.round` — нет, и тест на равенство покраснеет |
| `textAlign` | лейбл однострочный, шириной по тексту и отцентрирован контентом — `textAlign` не виден | маппим в `contentStyle.justifyContent`: `left` → `'flex-start'`, `center` → `'center'`, `right` → `'flex-end'` |
| `borderRadius` | работает: Paper вынимает все `border*Radius` из `style` и применяет и к `Surface`, и к ripple. Без него — `5 × roundness` | `style.borderRadius = borderRadius ?? paperTheme.roundness` — **всегда явно** (в генерируемом коде — ссылка на `paperTheme.roundness`, не число: `radiusBase` разбирается в рантайме) |
| `borderWidth`, `borderColor` | работают: `style` идёт после вычисленных Paper `borderWidth: 0 / borderColor: transparent` и перекрывает их. Мелочь: радиус ripple Paper считает от своего `borderWidth` (0), так что при толстой рамке углы ripple чуть выходят за внутренний край | в `style`; если `borderWidth` задан без `borderColor` — `borderColor: theme.colorBorder` (как превью) |
| `shadow` | инертно уже сейчас. Тенью `Button` управляет сам: `Surface` получает `elevation` от `Button` поверх любого переданного, и она ненулевая только в `mode="elevated"` (уровень 1, при нажатии 2) | CSS-значение **выбросить**; наличие непустого `shadow` → `mode="elevated"` (поэтому `buttonColor`/`textColor` всегда явные — иначе elevated перекрасил бы кнопку) |
| `width`, `height` в `style` | уже пропускаются при наличии `layout` | без изменений |
| `opacity` | внешний слой `Surface`, работает | в `style` |
| `animation` | инертно уже сейчас | без изменений |

#### `backgroundColor` отсутствует, а `color` задан → `outlined`, а не залитая `colorPrimary` (BIL-80)

**Симптом.** До этой правки `buttonColor` всегда фоллбэчил на `theme.colorPrimary`, когда `style.backgroundColor` не задан, — независимо от того, задан ли `style.color`. Модель, оставляющая `backgroundColor` пустым и указывающая только `color` (обычный способ описать outline/ghost-кнопку — легитимный паттерн для второстепенного действия), получала не прозрачную кнопку с цветным текстом, а **залитую `colorPrimary`** с текстом заданного цвета поверх — в худшем случае тёмный текст на тёмной заливке, то есть невидимую кнопку. Баг не регрессия BIL-76: у дошедшего до Paper генератора была симметричная версия той же ошибки (в другую сторону), так что это старый класс бага, впервые закрытый здесь.

**Решение.** `background_color is None and color is not None` → кнопка рендерится `mode="outlined"`, `buttonColor={'transparent'}`, `textColor` как обычно — заданным `color`. Разбор `getButtonColors` в исходниках `react-native-paper@5.15.3` (`src/components/Button/utils.tsx`) подтверждает, почему нельзя просто не передавать `buttonColor`, а обязательно передать `'transparent'` явно: `customButtonColor` проверяется первым и **перебивает вычисленный дефолт режима для любого mode**, включая `outlined`/`text` — значит, если бы код продолжил слать `theme.colorPrimary` безусловно, кнопка оставалась бы залитой даже в `outlined`. Рамку при этом можно не выписывать вовсе: если `style.borderWidth`/`style.borderColor` у узла не заданы, Paper сам применяет для `outlined` `borderWidth: 1`, `borderColor: theme.colors.outline` (= `colorBorder`) — то есть видимая обводка появляется без единой лишней строчки в `style`, ровно как ожидается от outline-кнопки.

Остальные два случая не меняются: `backgroundColor` задан → как раньше, `contained`/`elevated` заливкой этим цветом; не задан ни `backgroundColor`, ни `color` → как раньше, `contained`/`elevated` заливкой `theme.colorPrimary` (это прежний дефолт для узлов вообще без цветовых пропов, а не признак outline-намерения).

`shadow` в этой ветке игнорируется — переключения в `elevated` не происходит, даже если `shadow` задан: `elevated` — залитый режим, а без фона переключать тень не на что.

**Проверка.** `tests/codegen/test_paper_codegen.py::test_button_text_color_without_background_renders_outlined_not_filled` и `::test_button_shadow_is_ignored_when_rendered_outlined`; живой прогон `generate_files` на документе с двумя кнопками (`color` без `backgroundColor` / без обоих) подтвердил вывод `mode="outlined"` + `buttonColor={'transparent'}` + заданный `textColor` для первой и прежний `mode="contained"` + `theme.colorPrimary` для второй.

**Только бэкенд.** TS-генератор (`frontend/apps/web/src/entities/app-document/lib/codegen.ts`) ещё не портирован на Paper вообще (это BIL-77) — сравнивать не с чем, тест на равенство генераторов (§ 10.1) по кнопкам сейчас в любом случае не про паритет с Paper. Когда BIL-77 дойдёт до `Button`, то же правило (`backgroundColor` не задан + `color` задан → `outlined`/прозрачный `buttonColor`) обязано появиться и там — иначе панель кода в редакторе и экспортированный проект снова разойдутся по видимому результату для этого случая, просто на новом уровне (Paper vs Paper), а не как раньше (голый RN vs Paper).

Ещё два свойства Paper-кнопки, которые меняют результат:

- **`minWidth: 64`** у `Surface` — кнопки уже 64px растягиваются. Поэтому `compact` всегда: он снимает `minWidth`, а горизонтальные поля лейбла всё равно задаём сами через `labelStyle`.
- **Лейбл однострочный** (`numberOfLines={1}`): длинный текст обрезается многоточием, а не переносится, как у голого `Text`. Это в промпт (п. 4).

#### 2–3. `TextInput` → Paper `<TextInput>`

Генерируемый вид — `mode="outlined"`, **без `label`**, только `placeholder`. Почему outlined: превью редактора рисует поле как залитый прямоугольник со скруглением и рамкой в 1px (`NodeBody.tsx`); outlined-вариант Paper — ровно это. Flat — подчёркивание и скругление только сверху. `label` не используем: плавающий лейбл добавляет отступ сверху (`LABEL_PADDING_TOP`), вырезает «окно» в обводке и меняет геометрию относительно `layout`, а плейсхолдер без лейбла Paper показывает всегда.

Как устроен outlined `TextInput`: из `style` Paper **вынимает** `fontSize`, `fontWeight`, `lineHeight`, `height`, `backgroundColor`, `textAlign`; всё остальное уходит на внешнюю обёртку `View`. Видимая рамка — отдельный абсолютный `Outline` (`borderRadius: roundness`, `borderWidth` 1, в фокусе 2, цвет `outline`/`primary`), стилизуется `outlineStyle`. Нативный инпут получает `paddingHorizontal: 16` и вычисленные вертикальные поля; последним к нему применяется `contentStyle`.

| Поле | Что происходит в Paper, если выписать как сейчас в `style` | Решение |
|---|---|---|
| `layout.x/y/width/zIndex` | на обёртку, работают | в `style` как сейчас |
| `layout.height` | вынимается и становится высотой инпута (для однострочного — ровно она); вертикально текст центрируется сам | в `style` как сейчас |
| `flex`, `flexDirection`, `alignItems`, `justifyContent`, `gap` | на обёртку, внутри которой Paper раскладывает свои слои; `alignItems: 'center'` сузил бы инпут до ширины текста | **выбросить** |
| `padding`, `paddingHorizontal` | на обёртку: сдвигают инпут внутрь от рамки, а свои 16px Paper добавляет сверху | в `style` не пишем; `contentStyle.paddingHorizontal = paddingHorizontal ?? padding ?? 10` (10 — дефолт превью редактора) |
| `paddingVertical` (и вертикальная часть `padding`) | вертикальные поля Paper считает сам из высоты | **выбросить** |
| `margin`, `marginTop`, `marginBottom` | на обёртку, работают | в `style` |
| `backgroundColor` | вынимается и становится фоном `Outline` — работает. Но без него Paper берёт `colors.background` (`colorBg`), а превью — `colorSurface` | `style.backgroundColor = backgroundColor ?? theme.colorSurface` — **всегда явно** |
| `backgroundGradient` | инертно уже сейчас | **выбросить** |
| `color` | не вынимается → на обёртку `View` → **инертно**. Цвет текста Paper берёт из `textColor` или `onSurface` | проп `textColor`, только если `color` задан (иначе `onSurface` = `colorText`) |
| плейсхолдер | генератор сейчас зашивает `placeholderTextColor="#71717A"` | **убрать хардкод**: Paper берёт `onSurfaceVariant` = `colorTextMuted`, как превью |
| `fontSize`, `fontWeight`, `lineHeight`, `textAlign` | вынимаются и применяются к инпуту — работают. Дефолт `fontSize` у Paper 16, у превью 14 | в `style`; `fontSize = fontSize ?? 14` явно |
| `letterSpacing` | не вынимается → на обёртку → **инертно** | в `contentStyle.letterSpacing` |
| `borderRadius` | на обёртку: скругляет невидимый контейнер, видимая рамка `Outline` остаётся с `roundness` | в `style` не пишем; `outlineStyle.borderRadius = borderRadius ?? paperTheme.roundness` явно |
| `borderColor` | на обёртку → инертно (рамка — это `Outline`) | проп `outlineColor = borderColor` (если не задан — `outline` = `colorBorder` из темы) |
| `borderWidth` | на обёртку → лишняя вторая рамка вокруг `Outline` | в `style` не пишем. `borderWidth: 0` → `outlineColor="transparent"` (поле без рамки в покое, но с рамкой 2px `primary` в фокусе). `borderWidth > 0` → `outlineStyle.borderWidth` — **ценой утолщения в фокусе**: `outlineStyle` применяется после фокусной ширины и фиксирует её; цвет в фокусе по-прежнему меняется |
| `shadow` | инертно уже сейчас; API тени у `TextInput` нет | **выбросить** |
| `width`, `height` в `style` | уже пропускаются при наличии `layout` | без изменений |
| `opacity` | на обёртку, работает | в `style` |
| `animation` | инертно уже сейчас | без изменений |

`activeOutlineColor` не передаём — фокус красится в `primary`, это единственная видимая реакция поля на фокус, и она нужна.

#### Расхождения превью и экспорта, которые остаются (для BIL-77)

Решения выше подогнаны под то, как рисует превью редактора. Остались места, где уже *сейчас* превью и экспорт расходятся, и Paper этого не чинит — это правки канваса, не кодогена, и в BIL-77 их можно сделать заодно, раз задача всё равно фронтовая:

- **Дефолтный радиус.** Экспорт после Paper: `borderRadius ?? radiusBase` у обоих типов. Превью: у `Button` нет фоллбэка вообще (`borderRadius` не задан → 0), у `TextInput` — зашитые `10`. Лучше перевести оба фоллбэка превью на `radiusBase`.
- **`textAlign` у `Button`**: превью выравнивает текст внутри кнопки, экспорт после маппинга в `justifyContent` — сдвигает однострочный лейбл целиком. На кнопке по ширине текста это одно и то же, на переносящемся тексте — нет (в экспорте переноса нет).
- **`alignItems: 'center'` в `defaultStyle` кнопки** в `component-registry.ts`: генератор его выбрасывает, но убрать его из дефолтов имеет смысл, чтобы он не копился в документах.

#### 4. Что поменять в промптах (для BIL-78)

Промпты в этой задаче не трогались. Что в них расходится с решениями выше:

1. **`DESIGN_RULES`, пункт про палитру, уже сейчас врёт**: перечисляет роли «успех, ошибка, дополнительный/приглушённый», а таких токенов в `AppThemeTokens` нет. Переписать под фактические 10 и их роли в Paper: `colorBorder` — обводка полей ввода и разделители, `colorTextMuted` — плейсхолдеры и вторичный текст, `colorPrimaryFg` — текст на залитых кнопках (обязан контрастировать с `colorPrimary`), `colorSurface` — заливка полей ввода и карточек.
2. **`DESIGN_RULES`, «один и тот же `borderRadius` на всём»**: теперь `radiusBase` — радиус по умолчанию для `Button` и `TextInput`. Сказать модели, что ставить `borderRadius` на них нужно, только когда радиус осознанно отличается от `radiusBase`; различие радиусов по ролям остаётся актуальным для `View`/`Image`.
3. **`DESIGN_RULES`, пункт про тени**: у `Button` тень — только вкл/выкл (любое непустое значение `shadow` = поднятая кнопка MD3, само значение игнорируется), у `TextInput` не работает вовсе. Честнее прямо сказать, что на остальных узлах `shadow` в экспорте сейчас не работает тоже (см. «Что уже сломано сегодня»), — или заодно чинить экспорт теней отдельной задачей.
4. **`radiusBase` — формат**: в `RULES` требовать число без единиц (`"12"`, не `"12px"`). `parseFloat` переварит и то и другое, но строка с единицами — источник будущих расхождений; при желании можно поправить и `DEFAULT_APP_THEME` во фронте (это `model.ts`, форма документа не меняется).
5. **`Button`**: подпись в одну строку, длинная обрезается многоточием — короткие подписи по действию (с пунктом «называй по действию» из `DESIGN_RULES` это согласуется); `paddingVertical`, `alignItems`, `justifyContent`, `gap`, `flex*`, `backgroundGradient` на кнопке игнорируются; высота кнопки берётся из `layout.height`.
6. **`TextInput`**: `paddingVertical`, `backgroundGradient`, `shadow` игнорируются; рамка поля — `borderColor`/`borderWidth` (0 — без рамки), цвет текста — `color`, плейсхолдер красится `colorTextMuted`.
7. **`fontBody`/`fontHeading`**: в экспорте не применяются. Решить в BIL-78, говорить ли об этом модели или оставить как есть до задачи про шрифты. *(Закрыто в BIL-88: шрифты применяются, правила для модели — в `EXPORT_RULES`, см. § 10.5.)*

Промпт чата импортирует `DESIGN_RULES` из `src.generation.prompt` (§ 9.1, BIL-72), так что пп. 1–3 попадут в чат автоматически; отдельных правил про стили в `RULES` чата нет.

### 10.3 Недостающие зависимости экспорта: `expo-asset`, `query-string`, `react-native-web` (BIL-79)

**Симптом.** Найдено при проверке BIL-76: свежий экспортированный проект (`npm install` без ручных правок) падал уже на старте Metro — `Error: The required package 'expo-asset' cannot be found` (`@expo/metro-config` читает `expo-asset` в `getAssetPlugins`, а его не было ни в `dependencies`, ни транзитивно). Экспорт для `web` падал отдельно и по другой причине: `expo export --platform web` отказывался стартовать без `react-native-web` («Please install react-native-web@~0.19.13»).

**Причина — не одна, все три пакета выпали по-разному:**

- **`expo-asset`** генератор никогда не перечислял явно — раньше сходило с рук, потому что какой-то другой пакет тянул его транзитивно; в текущем графе SDK 52 транзитивной цепочки к нему нет, а `@expo/metro-config` требует его напрямую при любой сборке (`expo start`, `expo export`, оба платформы).
- **`query-string`** — не наша недоглядка, а чужой breaking change без объявления зависимости. `expo-router` (`build/fork/getPathFromState*.js`, `build/global-state/routeInfo.js`) делает `require("query-string")` напрямую, но сам его в `dependencies` не перечисляет — рассчитывает, что пакет придёт транзитивно через `@react-navigation/core`. До `@react-navigation/native@7.4` `core` действительно тянул `query-string@^7.1.3`; начиная с 7.4.1 (на неё резолвится диапазон `^7.0.14`, который просит `expo-router@~4.0.20`/`4.0.22`) `core` его больше не зависит — `require` в `expo-router` не находит пакет вообще.
- **`react-native-web`** — не транзитивная недостача, а осознанно заявленная в `README.md` (`Отсканируйте QR ... или нажмите w для web`) возможность, для которой зависимость никогда не добавлялась. Без `--platform` явно не запрашивается, но `app.json` объявляет секцию `web`, и генерируемый проект недвусмысленно обещает пользователю рабочий web-запуск.

**Версии** — не подобраны на глаз, а взяты из `bundledNativeModules.json` официального SDK 52 (`https://raw.githubusercontent.com/expo/expo/sdk-52/packages/expo/bundledNativeModules.json`) и дефолтного шаблона Expo (`templates/expo-template-default/package.json` на той же ветке): `expo-asset: ~11.0.5`, `react-native-web: ~0.19.13`. Для `query-string` ориентир — версия, которую `@react-navigation/core` пинил до 7.4 (`^7.1.3`, CommonJS-сборка — совместима с `require()` в `expo-router`; `query-string@8+` — pure ESM без CJS-экспорта, `require` её не найдёт).

**Проверка — реальная сборка, не разбор дерева зависимостей на глаз.** Прогнано сквозь настоящий `npm install` (без единой ручной правки) и `npx expo export --platform <android|ios|web>` для: документа максимального покрытия (`tests/codegen/max_coverage_document.py`, 8 типов узлов) и всех пяти шаблонов из `tests/generation/template_fixtures.py`. До фикса — `expo-asset` валит любую сборку (все платформы, весь набор документов), `web`-экспорт падает отдельно на `react-native-web` даже после добавления `expo-asset`. После фикса — все комбинации документ×платформа экспортируются чисто, `npx tsc --noEmit` проходит без ошибок на всех пяти шаблонах.

**Что не входит в этот фикс.** На документе максимального покрытия (не на шаблонах) `tsc --noEmit` даёт две ошибки `TS2769` — узел `Text` со стилем `animation: 'rise'` не проходит типы `TextStyle`, потому что `animation` в принципе не входит в тип стиля RN. Это не связано с недостающими зависимостями: код, дословно выписывающий все ключи `AppNodeStyle` в сырой RN-стиль (`_style_to_rn`), не трогался с самого первого коммита кодогена, задолго до Paper и до этой задачи, — и `animation` там и тогда был документирован как «инертно» (раздел 10.2, «Что уже сломано сегодня, до Paper»), но не как «ломает компиляцию». Затрагивает только узлы `Text`/`View`/… с непустым `style.animation` вне Paper-компонентов (`Button`/`TextInput` фильтруют `PAPER_PASSTHROUGH_KEYS`, у обычных узлов фильтра нет) — ни один из пяти шаблонов такого стиля не генерирует, только синтетическая фикстура. Отдельная задача, не эта.

---

### 10.4 Иконки Lucide: узел `Icon` (BIL-87)

**Что это.** Девятый тип узла `Icon` — отдельный, самостоятельный узел наравне с `Text`/`Spacer`, а не проп у существующих типов: его можно положить куда угодно, в том числе рядом с `Text` внутри одного `View` (паттерн «иконка + подпись»). Задача разделена на две половины: бэкенд (схема, Python-кодоген, промпт) — BIL-87, фронт (`model.ts`, `component-registry.ts`, TS-кодоген, превью) — BIL-92. Решения ниже — общий контракт обеих половин, а не локальный выбор бэкенда.

| Что | Решение |
|---|---|
| Имя иконки | `props.icon`, тип `AppIconName` — `Literal` из 100 курируемых имён (см. таблицу ниже), по тому же образцу, что `AppNodeAnimation`. Отсутствие — `null`/ключа нет |
| Размер | `min(layout.width, layout.height)`; без `layout` — 24 |
| Цвет | `style.color`, без него — `theme.colorText` (так же, как у `Text`) |
| Новые поля стиля | нет, `AppNodeStyle` не менялся |

**Почему 100 имён, а не весь каталог Lucide.** В `lucide-react-native@1.48.0` 1854 иконки. Enum на весь каталог лёг бы в JSON Schema, которая целиком уходит в системный промпт генерации и чата. BIL-72 и BIL-86 показали, что длинный промпт измеримо портит структурную корректность у модели по умолчанию (`deepseek-v4-flash`). Курируемые 100 имён добавили к промпту генерации с брифом 1222 символа (13256 → 14478), а с правилами про `Icon` в `RULES` — 2091 (→ 15347, +16%). Замеров качества генерации после этого изменения не проводилось.

**Список сверен с установленным пакетом, а не написан по памяти.** Источник канонических имён — файлы `dist/esm/icons/<kebab>.mjs` в `lucide-react-native@1.48.0` (по файлу на иконку, без алиасов), проверено, что для **всех 1854** файлов `PascalCase(kebab)` — объявленный экспорт в `dist/types/lucide-react-native.d.ts`, и для каждого из 100 курируемых имён есть экспорт-алиас `<Pascal>Icon`. Осторожно со старыми именами из документации и памяти: в 1.x алиасы удалены, поэтому `home`, `edit`, `filter`, `alert-circle`, `check-circle`, `trash-2`, `unlock`, `help-circle` **не существуют** — канонические имена `house`, `pencil`, `funnel`, `circle-alert`, `circle-check`, `trash`, `lock-open`, `circle-question-mark`. Обновляете Lucide — перепроверьте список тем же способом: у пакета частые минорные релизы, и переименования иконок в них бывают.

**Маппинг имени в компонент** (`_icon_component` в `src/codegen/service.py`): разбить kebab-имя по `-`, у каждой части заглавная первая буква, склеить и **добавить суффикс `Icon`**: `arrow-left` → `ArrowLeftIcon`, `share-2` → `Share2Icon`, `circle-question-mark` → `CircleQuestionMarkIcon`. Суффикс обязателен, это не косметика: без него `image` дал бы `Image` и столкнулся бы с `Image` из `react-native`, который импортируется в тот же файл экрана (так же `Text`/`View`, если их когда-нибудь добавят в список). С BIL-93 иконка импортируется по умолчанию из своего файла (см. «Импорт по иконке» ниже), так что `<Pascal>Icon` — локальное имя, которое выбирает генератор. Оно совпадает с экспортом-алиасом корня пакета, поэтому код экрана читается так же, как до BIL-93.

**Что генерирует экспорт.** Позиционированный контейнер — тот же путь `_position_entries`/`_passthrough_entries`, что у `Button`/`TextInput` — с центрированием, внутри компонент иконки:

```tsx
<View style={{
  position: 'absolute',
  left: 16,
  top: 24,
  width: 40,
  height: 28,
  alignItems: 'center',
  justifyContent: 'center'
}}>
  <ArrowLeftIcon
    size={28}
    color={'#FF0000'}
  />
</View>
```

- Из `style` в контейнер проходит только `opacity` (и `width`/`height` для узла без `layout`, как у всех). Фон, рамка, радиус, отступы, `flex*`, шрифтовые поля, `shadow`, `backgroundGradient`, `animation` отбрасываются: у квадратной иконки размером в меньшую сторону `layout` отступы и рамка выталкивали бы её за край, а `animation` не входит в типы стилей RN и ломает `tsc` (см. § 10.3). Иконка в цветном кружке — это `Icon` внутри `View` с фоном. `onPress` на `Icon` не работает — он декоративный, как `Text`. Всё это записано в `EXPORT_RULES` промпта.
- `Icon` без `props.icon` — пустой контейнер без импорта, скрытый (`hidden`) — `{null}`, как у остальных узлов.
- Импорт — **по строке на иконку, из подпути `lucide-react-native/icons/<kebab>`, никогда из корня пакета** (BIL-93). Импортируются только иконки, использованные на экране, по алфавиту kebab-имени, сразу после импорта `react-native-paper`:

  ```tsx
  import HouseIcon from 'lucide-react-native/icons/house';
  import Share2Icon from 'lucide-react-native/icons/share-2';
  ```

**Зависимости — только когда иконки есть.** В `package.json` добавляются `"lucide-react-native": "~1.48.0"` и `"react-native-svg": "15.8.0"`, **только если** в документе есть хотя бы один `Icon` с непустым `props.icon` (включая скрытые — их импорт тоже собирается), и **последними** в `dependencies`, в этом порядке. Условно, а не всегда, по двум причинам: не тянуть нативный `react-native-svg` в приложения без иконок и не ломать тест на равенство генераторов (§ 10.1) на документах без иконок, пока TS-половина (BIL-92) не сделана. BIL-92 обязан повторить то же условие и тот же порядок ключей — `package.json` сравнивается тестом целиком.

С BIL-93 при том же условии меняются ещё два файла проекта: появляется `metro.config.js`, а в `compilerOptions` у `tsconfig.json` добавляется `"moduleResolution": "bundler"`. Зачем они нужны, описано в «Импорт по иконке» ниже. Без иконок оба файла такие же, как до BIL-93: `metro.config.js` нет, `tsconfig.json` — `{"extends": "expo/tsconfig.base", "compilerOptions": {"strict": true}}`. Причина та же, что у зависимостей: тест на равенство (§ 10.1) сравнивает набор файлов целиком, а TS-генератор ни того, ни другого пока не выпускает.

| Пакет | Версия | Источник |
|---|---|---|
| `react-native-svg` | `15.8.0` | `bundledNativeModules.json` SDK 52 (`https://raw.githubusercontent.com/expo/expo/sdk-52/packages/expo/bundledNativeModules.json`) — тем же способом, что `expo-asset`/`react-native-web` в § 10.3; `npx expo install --check` на собранном проекте отвечает «Dependencies are up to date» |
| `lucide-react-native` | `~1.48.0` | в `bundledNativeModules.json` его нет — это чистый JS, не нативный модуль. Совместимость с SDK 52 — по его `peerDependencies`: `react ^16.5.1 \|\| … \|\| ^19`, `react-native *`, `react-native-svg ^12 \|\| … \|\| ^15` — все три закрываются версиями проекта (`react 18.3.1`, `react-native 0.76.9`, `react-native-svg 15.8.0`). 1.48.0 — `latest` на 2026-09-28. Тильда, а не каретка: список имён завязан на экспорты конкретной версии, а переименования случаются в минорных релизах |

**Проверка — реальная сборка.** Документ ручной сборки на два экрана (`tabs`) с 12 разными иконками: в шапке (`menu`, `search` с цветом, `bell` с `opacity`), пара «иконка + подпись» (`map-pin` + `Text` внутри `View`), `image` рядом с узлом `Image` (проверка коллизии имён), скрытая иконка (`trash`), `Icon` без имени, крупная иконка 80×80 (`shopping-cart`), составные имена (`circle-question-mark`, `layout-grid`, `share-2`, `arrow-left`, `circle-check`). Сквозь `generate_files` → `npm install` (без ручных правок, exit 0) → `npx tsc --noEmit` (exit 0, без ошибок) → `npx expo export --platform android|ios|web` (все три exit 0). Иконки в бандле есть: в web-бандле `(0,h.jsx)(l.ShoppingCartIcon,{size:80,color:'#16A34A'})`. Это состояние BIL-87, с импортом из корня пакета; проверка после перехода на подпути — в «Импорт по иконке» ниже.

Осторожно при повторении: сгенерированный `tsconfig.json` включает `allowJs` без `include`, а наследуемый из `expo/tsconfig.base` `exclude` не исключает папки сборки (в том числе `dist/` по умолчанию у `expo export`). Если прогнать `tsc` после `expo export` внутри папки проекта, он начнёт проверять собранные бандлы и упадёт с `RangeError: Maximum call stack size exceeded` — это артефакт проверки, а не кода экрана.

#### Импорт по иконке, а не из корня пакета (BIL-93)

**Что было.** Metro в SDK 52 не делает tree-shaking, поэтому импорт из корня `lucide-react-native` тянул в бандл **весь** каталог из 1854 иконок, хотя импортировались только нужные имена. Это фиксированный налог: он платился за первую же иконку и от их числа почти не зависел. Замер BIL-93 на приложении с одной иконкой против того же приложения, где вместо неё пустой `View`: web 1.71 МБ → 3.67 МБ, Android (Hermes) 3.28 МБ → 5.68 МБ. Это совпадает с замером BIL-87 на 12 иконках (3.68 и 5.69 МБ).

**Почему подпуть не резолвился.** Пакет отдаёт каждую иконку через `exports` (`"./icons/*"` → `dist/esm/icons/*.mjs`, типы — `dist/types/icons/*.d.ts`). Файлов по этому пути на диске нет, путь существует только в `exports`. Проверено на версиях сгенерированного проекта (`expo` 52.0.49, `metro` 0.81.5, `typescript` 5.3.3):

- Metro: `resolver.unstable_enablePackageExports` в SDK 52 по умолчанию выключен, без него `Unable to resolve module lucide-react-native/icons/arrow-left`;
- `tsc`: `moduleResolution: "node"` из `expo/tsconfig.base` поле `exports` не читает, отсюда `TS2307`.

**Фикс — три правки в сгенерированном проекте, все только при наличии иконок** (условие то же, что у зависимостей).

1. Экран импортирует каждую иконку по умолчанию из её подпути: `import ArrowLeftIcon from 'lucide-react-native/icons/arrow-left';`. Kebab-имя генератор знает из `props.icon`, поэтому обратное преобразование `PascalCase` → kebab не нужно. Оно было бы неоднозначным на цифрах (`Share2`).
2. `metro.config.js` включает разрешение по `exports` **только для запросов `lucide-react-native/…`**:

   ```js
   const { getDefaultConfig } = require('expo/metro-config');

   const config = getDefaultConfig(__dirname);

   config.resolver.resolveRequest = (context, moduleName, platform) =>
     context.resolveRequest(
       moduleName.startsWith('lucide-react-native/') ? { ...context, unstable_enablePackageExports: true } : context,
       moduleName,
       platform
     );

   module.exports = config;
   ```

3. `tsconfig.json` получает `"moduleResolution": "bundler"`, и `tsc` видит типы подпути через `exports`. `module` отдельно задавать не нужно: при `target: "ESNext"` из базового конфига он по умолчанию ES2015, а `bundler` это допускает. `"preserve"` в TS 5.3 ещё нет.

**Почему не глобальный `unstable_enablePackageExports = true`.** Проверено: он тоже чинит иконки, но заодно меняет разрешение для других пакетов. В web-бандле приложения **без иконок** появляется второй экземпляр `use-latest-callback` (зависимость `@react-navigation`): к уже загруженному CJS-файлу добавляется `esm.mjs`, то есть одна и та же библиотека грузится дважды. Вариант с условием по имени модуля не меняет ничего, кроме запросов к Lucide: web-бандл приложения без иконок с таким `metro.config.js` побайтно совпадает с бандлом без него (тот же хэш содержимого). Файлы внутри Lucide (`../createLucideIcon.mjs` и т. п.) резолвятся обычным путём, потому что это относительные запросы, а не `lucide-react-native/…`.

**Что отброшено.**

- **Обновить SDK.** В более новых SDK Expo разрешение по `exports`, насколько известно, включено по умолчанию (в этой задаче не проверялось), но это переезд всего сгенерированного проекта (React, RN, Paper, expo-router), несоразмерный задаче. Когда проект переедет, `metro.config.js` из п. 2 станет лишним.
- **Импорт по пути файла** (`lucide-react-native/dist/esm/icons/arrow-left.mjs`). Metro его резолвит и без настроек, но это непубличная раскладка `dist`, а `tsc` не находит к файлу типов (`.d.mts` рядом нет) и при `strict` падает. Пришлось бы генерировать свой `.d.ts`.
- **Алиас через `paths` в `tsconfig.json`.** Expo CLI применяет `paths` и к резолву Metro, так что импорт указал бы бандлеру на `.d.ts`.
- **Babel-плагин переписывания импортов.** Нужна лишняя dev-зависимость, а PascalCase → kebab неоднозначен (см. п. 1). Генератор и так знает kebab-имя.

**Замер после фикса** — те же документы, `generate_files` → `npm install` → `npx expo export`, размер JS-бандла (web) и Hermes-байткода (Android, iOS):

| Документ | web | Android | iOS |
|---|---|---|---|
| без иконок | 1.71 МБ (1 706 987 Б) | 3.28 МБ (3 283 771 Б) | 3.28 МБ (3 282 172 Б) |
| 1 иконка, до BIL-93 (импорт из корня) | 3.67 МБ (3 674 337 Б) | 5.68 МБ (5 684 778 Б) | — |
| **1 иконка, после BIL-93** | **1.79 МБ (1 786 722 Б)** | **3.52 МБ (3 523 558 Б)** | **3.52 МБ (3 521 755 Б)** |
| 12 иконок, после BIL-93 | 1.80 МБ (1 795 843 Б) | 3.53 МБ (3 533 297 Б) | 3.53 МБ (3 531 433 Б) |

Налог за первую иконку упал с +1.97 МБ до +80 КБ на web и с +2.40 МБ до +240 КБ на Android. Остаток — это `react-native-svg` и рантайм Lucide: `createLucideIcon`, `Icon`, `context` и около десятка утилит. Из самих иконок в бандл попадают только использованные: по source map web-бандла из `lucide-react-native` в него входят `icons/arrow-left.mjs` и эти 14 модулей рантайма. Каждая следующая иконка стоит меньше килобайта (12 иконок против одной: +9 КБ web, +10 КБ Android).

**Проверка.**

- `npx tsc --noEmit` проходит, и типы подпути настоящие, а не `any`: лишний проп на иконке даёт `TS2322 … not assignable to type 'IntrinsicAttributes & LucideProps'`.
- `npx expo export --platform web|android|ios` проходит на всех трёх платформах. Кроме документов из таблицы, так проверен документ максимального покрытия (все типы узлов) плюс иконки (пара «иконка + подпись», `image` рядом с `Image`, скрытая иконка), шрифты `PT Serif`/`Unbounded` и навигация `tabs`. `tsc` на нём даёт ровно те же две ошибки `TS2769` про `animation`, что и без иконок (см. § 10.3), новых нет.
- Web-экспорт открыт в Chrome: `outerHTML` отрисованного `<svg>` иконки до и после BIL-93 совпадает побайтно.
- `tests/codegen/test_icon_codegen.py`: правила рендера и условие добавления зависимостей не менялись. Изменились только ожидаемые строки импорта, и добавлены тесты на подпуть и на условные `metro.config.js`/`tsconfig.json`.

**BIL-92 обязан повторить то же самое в TS-генераторе**, когда добавит `Icon`: импорт по умолчанию из `lucide-react-native/icons/<kebab>`, по строке на иконку и по алфавиту kebab-имени, `metro.config.js` дословно как в п. 2 и `"moduleResolution": "bundler"` в `tsconfig.json`, всё при том же условии, что и зависимости. Тест на равенство (§ 10.1) сравнивает все три файла целиком, так что расхождение он поймает, как только иконка появится в `max_coverage_document.py`.

**Порядок мержа.** Код и схема этой задачи корректны и проверены независимо, но как только правка промпта попадёт в `main`, генерация начнёт выдавать узлы `Icon`, а панель кода и превью в редакторе строятся TS-кодогеном и схемой `model.ts`, которые узнают про `Icon` только в BIL-92. До его мержа такие документы на фронте, скорее всего, не пройдут zod-валидацию или отрисуются неверно. Разумный порядок — BIL-87 не раньше BIL-92 или одновременно с ним; решение за владельцем бэкенда.

`tests/codegen/max_coverage_document.py` (общая фикстура теста на равенство) `Icon` пока **не содержит** — там стоит TODO на BIL-92: TS-генератор его ещё не рендерит, и тест покраснел бы из-за очерёдности задач, а не из-за бага. Ветку рендера покрывает отдельный бэкенд-тест `tests/codegen/test_icon_codegen.py`.

#### Курируемый список `AppIconName` (100 имён)

Порядок — как в `Literal` в `src/apps/schemas.py`; он же порядок `enum` в JSON Schema. `appIconNameSchema` в BIL-92 обязан содержать ровно эти значения.

| `props.icon` | Компонент |
|---|---|
| `house` | `HouseIcon` |
| `search` | `SearchIcon` |
| `settings` | `SettingsIcon` |
| `menu` | `MenuIcon` |
| `arrow-left` | `ArrowLeftIcon` |
| `arrow-right` | `ArrowRightIcon` |
| `arrow-up` | `ArrowUpIcon` |
| `arrow-down` | `ArrowDownIcon` |
| `chevron-left` | `ChevronLeftIcon` |
| `chevron-right` | `ChevronRightIcon` |
| `chevron-up` | `ChevronUpIcon` |
| `chevron-down` | `ChevronDownIcon` |
| `x` | `XIcon` |
| `plus` | `PlusIcon` |
| `minus` | `MinusIcon` |
| `check` | `CheckIcon` |
| `ellipsis` | `EllipsisIcon` |
| `ellipsis-vertical` | `EllipsisVerticalIcon` |
| `external-link` | `ExternalLinkIcon` |
| `log-out` | `LogOutIcon` |
| `pencil` | `PencilIcon` |
| `trash` | `TrashIcon` |
| `share-2` | `Share2Icon` |
| `download` | `DownloadIcon` |
| `upload` | `UploadIcon` |
| `copy` | `CopyIcon` |
| `heart` | `HeartIcon` |
| `star` | `StarIcon` |
| `bookmark` | `BookmarkIcon` |
| `funnel` | `FunnelIcon` |
| `refresh-cw` | `RefreshCwIcon` |
| `send` | `SendIcon` |
| `link` | `LinkIcon` |
| `flag` | `FlagIcon` |
| `thumbs-up` | `ThumbsUpIcon` |
| `bell` | `BellIcon` |
| `mail` | `MailIcon` |
| `lock` | `LockIcon` |
| `lock-open` | `LockOpenIcon` |
| `eye` | `EyeIcon` |
| `eye-off` | `EyeOffIcon` |
| `circle-alert` | `CircleAlertIcon` |
| `triangle-alert` | `TriangleAlertIcon` |
| `info` | `InfoIcon` |
| `circle-check` | `CircleCheckIcon` |
| `circle-x` | `CircleXIcon` |
| `circle-question-mark` | `CircleQuestionMarkIcon` |
| `user` | `UserIcon` |
| `users` | `UsersIcon` |
| `calendar` | `CalendarIcon` |
| `clock` | `ClockIcon` |
| `map-pin` | `MapPinIcon` |
| `map` | `MapIcon` |
| `navigation` | `NavigationIcon` |
| `globe` | `GlobeIcon` |
| `camera` | `CameraIcon` |
| `image` | `ImageIcon` |
| `video` | `VideoIcon` |
| `mic` | `MicIcon` |
| `music` | `MusicIcon` |
| `play` | `PlayIcon` |
| `pause` | `PauseIcon` |
| `file` | `FileIcon` |
| `file-text` | `FileTextIcon` |
| `folder` | `FolderIcon` |
| `book-open` | `BookOpenIcon` |
| `shopping-cart` | `ShoppingCartIcon` |
| `shopping-bag` | `ShoppingBagIcon` |
| `credit-card` | `CreditCardIcon` |
| `wallet` | `WalletIcon` |
| `tag` | `TagIcon` |
| `gift` | `GiftIcon` |
| `dollar-sign` | `DollarSignIcon` |
| `store` | `StoreIcon` |
| `package` | `PackageIcon` |
| `truck` | `TruckIcon` |
| `trending-up` | `TrendingUpIcon` |
| `chart-bar` | `ChartBarIcon` |
| `chart-pie` | `ChartPieIcon` |
| `activity` | `ActivityIcon` |
| `target` | `TargetIcon` |
| `award` | `AwardIcon` |
| `trophy` | `TrophyIcon` |
| `phone` | `PhoneIcon` |
| `message-circle` | `MessageCircleIcon` |
| `message-square` | `MessageSquareIcon` |
| `list` | `ListIcon` |
| `layout-grid` | `LayoutGridIcon` |
| `sun` | `SunIcon` |
| `moon` | `MoonIcon` |
| `cloud` | `CloudIcon` |
| `flame` | `FlameIcon` |
| `zap` | `ZapIcon` |
| `dumbbell` | `DumbbellIcon` |
| `utensils` | `UtensilsIcon` |
| `coffee` | `CoffeeIcon` |
| `car` | `CarIcon` |
| `plane` | `PlaneIcon` |
| `graduation-cap` | `GraduationCapIcon` |
| `briefcase` | `BriefcaseIcon` |

### 10.5 Шрифты Google Fonts: `fontBody` / `fontHeading` (BIL-88)

**Что это.** До BIL-88 токены `fontBody`/`fontHeading` были свободной строкой и в экспорте не применялись нигде (§ 10.2). Теперь это перечисление из `System` и 10 семейств Google Fonts. Экспорт загружает выбранные семейства пакетами `@expo-google-fonts/*` через `useFonts` из `expo-font` и ставит `fontFamily` на `Text`, подпись `Button` и `TextInput`. Задача разделена так же, как BIL-87/BIL-92: бэкенд (схема, Python-кодоген, промпт, миграция) — BIL-88, фронт (`model.ts`, TS-кодоген, превью редактора) — BIL-94. Всё ниже — общий контракт обеих половин.

| Что | Решение |
|---|---|
| Тип | `AppFontFamily` в `src/apps/schemas.py` — `Literal` из 11 значений (таблица ниже), по образцу `AppIconName`. Другое значение — ошибка валидации (на `PUT` — 422) |
| `System` | системный шрифт платформы: ничего не грузится, вывод узлов **байт в байт как до BIL-88** (`fontWeight` как есть, без `fontFamily`) |
| Начертания | по семейству грузятся ровно два файла: `400Regular` и `700Bold` |
| Какой токен у узла | `Text` с `fontSize >= 20` — `fontHeading`, всё остальное — `fontBody` |
| Новые поля документа | нет |

#### Курируемый список

Критерии отбора, все проверены по самим пакетам, а не по каталогу Google Fonts:

1. Пакет `@expo-google-fonts/<slug>` существует на npm (проверено `npm view` 2026-09-28; у всех `latest` — 0.4.x).
2. В пакете есть статические `400Regular` и `700Bold` (проверено по содержимому tarball'а).
3. **Полная кириллица плюс `№` и `₽`** — проверено по таблице `cmap` самих TTF через `fontTools`. Приложения генерируются на языке запроса, а это почти всегда русский: семейство без кириллицы нарисует русский текст системным шрифтом (web) или квадратами.
4. Вес файла разумный (для сравнения: Merriweather весит 1 МБ на начертание).

| Значение `fontBody`/`fontHeading` | Пакет | Версия | Префикс экспорта | Стиль | Файл 400 / 700 |
|---|---|---|---|---|---|
| `System` | — | — | — | системный | — |
| `Inter` | `@expo-google-fonts/inter` | `~0.4.2` | `Inter` | нейтральный гротеск | 334 / 336 КБ |
| `Manrope` | `@expo-google-fonts/manrope` | `~0.4.2` | `Manrope` | современный гротеск | 94 / 94 КБ |
| `Montserrat` | `@expo-google-fonts/montserrat` | `~0.4.2` | `Montserrat` | геометрический | 323 / 327 КБ |
| `Rubik` | `@expo-google-fonts/rubik` | `~0.4.2` | `Rubik` | мягкий, скруглённые углы | 202 / 203 КБ |
| `Nunito` | `@expo-google-fonts/nunito` | `~0.4.2` | `Nunito` | округлый | 129 / 129 КБ |
| `Comfortaa` | `@expo-google-fonts/comfortaa` | `~0.4.2` | `Comfortaa` | округлый геометрический | 108 / 108 КБ |
| `Unbounded` | `@expo-google-fonts/unbounded` | `~0.4.1` | `Unbounded` | широкий акцидентный | 356 / 362 КБ |
| `Lora` | `@expo-google-fonts/lora` | `~0.4.2` | `Lora` | антиква для текста | 130 / 130 КБ |
| `PT Serif` | `@expo-google-fonts/pt-serif` | `~0.4.1` | `PTSerif` | классическая антиква | 210 / 191 КБ |
| `JetBrains Mono` | `@expo-google-fonts/jetbrains-mono` | `~0.4.1` | `JetBrainsMono` | моноширинный | 112 / 112 КБ |

Порядок — как в `Literal`, он же порядок `enum` в JSON Schema; `appFontFamilySchema` в BIL-94 обязан содержать ровно эти значения. Значения — отображаемые имена Google Fonts (с пробелом: `PT Serif`), а не слаги: так их естественно пишет модель, и так же их примет CSS превью редактора. Таблица «значение → пакет, версия, префикс» живёт в `GOOGLE_FONTS` в `src/codegen/service.py`. Версии разные (0.4.2 и 0.4.1), поэтому они выписаны явно, а не выводятся. Тест `test_every_curated_family_has_a_package` сверяет ключи `GOOGLE_FONTS` с `Literal`.

Отброшены при проверке: `DM Sans`, `Poppins`, `Syne` — **нет кириллицы вовсе** (Syne — брендовый шрифт самого Bildo и раньше стоял в `max_coverage_document`); `Merriweather` — 1 МБ на начертание; `Playfair Display`, `Roboto Slab` — нет `₽`; `Jost` — нет `№`. `Roboto` не нужен: это и есть системный шрифт Android.

**Версии.** Пакетов `@expo-google-fonts/*` нет в `bundledNativeModules.json` SDK 52: это чистый JS плюс ассеты TTF, нативного кода нет. Зависимостей и `peerDependencies` у них нет вовсе; единственный внешний импорт — `loadAsync` из `expo-font` в их собственном `useFonts.js`, а мы берём `useFonts` прямо из `expo-font`. `expo-font` (`~13.0.4`) и так стоит безусловной зависимостью с BIL-76. Тильда, а не каретка — по той же причине, что у `lucide-react-native` в § 10.4: у пакетов 0.x минорный релиз может менять состав файлов.

#### Импорт по начертанию, а не из корня пакета

Корневой `index.js` пакета делает `require` **всех** начертаний (у Inter — 18 TTF, включая курсивы), а Metro в SDK 52 не делает tree-shaking: импорт `Inter_400Regular` из `@expo-google-fonts/inter` утянул бы в бандл все 18 файлов (это та же проблема, что с иконками в § 10.4). Поэтому импорт идёт из подпапки начертания — `@expo-google-fonts/inter/400Regular`. Это обычная папка с `index.js` и `index.d.ts`, поля `exports` в `package.json` пакета нет, так что её резолвят и Metro, и `tsc` с `moduleResolution: "node"` — в отличие от подпутей Lucide, которым для этого нужны `metro.config.js` и `moduleResolution: "bundler"` (§ 10.4, BIL-93). Проверено сборкой: в `expo export` на всех трёх платформах попадают ровно 4 TTF (2 семейства × 2 начертания) плюс шрифт иконок Paper.

#### Начертания: только 400 и 700

Ради размера бандла по каждому семейству грузятся два файла, а `style.fontWeight` узла отображается на ближайший из них:

| `fontWeight` узла | Файл |
|---|---|
| не задан, `400`, `500` | `400Regular` |
| `600`, `700` | `700Bold` |

Ничьих нет: 500 ближе к 400, 600 ближе к 700. Для подписи `Button` без `fontWeight` берётся `600` — тот же дефолт, что экспорт ставил подписи и до BIL-88, поэтому кнопка по умолчанию жирная. Все семейства списка поставляют все четыре веса 400–700, так что ограничение — осознанный выбор, а не вынужденный.

Каждый загруженный файл регистрируется как **отдельное семейство** с именем экспорта: `Inter_700Bold` — это `fontFamily`, а не пара «семейство + вес». Поэтому на узле с Google-шрифтом `fontWeight` из документа **не выводится**, вместо него всегда пишется пара:

```ts
fontFamily: 'Inter_700Bold',
fontWeight: 'normal'
```

`fontWeight: 'normal'` явно, а не просто без веса, из-за Paper: `Button` подмешивает к подписи `theme.fonts.labelLarge` с весом `500`, а `TextInput` — вес из своего `style`. Вес, отличный от начертания файла, на web даёт синтетическое полужирное поверх уже жирного файла (`@font-face` у `expo-font` на web объявлен без `font-weight`, то есть `normal`), на Android — `Typeface.create` с чужим весом. `normal` совпадает с объявленным начертанием файла на всех платформах. Проверено в собранном web-бандле: вычисленный `font-weight` у всех узлов — 400.

#### Какой узел получает `fontHeading`

Признака «это заголовок» у узла нет, и BIL-88 его не вводит. Правило: **`Text` с `style.fontSize >= 20` получает `fontHeading`, остальные `Text`, подпись `Button` и `TextInput` получают `fontBody`**. `Text` без `fontSize` — основной текст (в RN это 14). Константа — `HEADING_MIN_FONT_SIZE` в `src/codegen/service.py`, промпт берёт её оттуда же. Вес на выбор токена не влияет: крупный заголовок весом 400 — это `fontHeading` в начертании `400Regular`.

Почему размер, а не вес: правило «`fontWeight == 700` → заголовок» проверено на документах из локальной БД (20 приложений в статусе `ready`, сгенерированных LLM, 706 узлов `Text`) и не подходит. Вес 700 модель массово ставит мелким ярлыкам, процентам и чипам размером 10–15 (около 70 узлов: «ПРОМОКОД», «80%», «Продуктивность»), и все они получили бы акцидентный шрифт. Размер от 20 отбирает ровно заголовки экранов и крупные числа: «Лента», «Мои привычки», «Запишитесь на консультацию», «14 дней», «68%». `Text` без веса, но размером 20 и больше, в этих данных — только эмодзи, на них шрифт не влияет. Порог и правило есть в `EXPORT_RULES`, так что модель знает, как получить шрифт заголовка.

`fontFamily` ставится **только** этим трём типам. `FlatList` (его строки рисуются захардкоженным `Text` без темы), заголовки навигатора и подписи таб-бара в `_layout.tsx` в BIL-88 остались на системном шрифте. **Закрыто в BIL-96, см. § 10.7.**

#### Куда ставится `fontFamily`

Места выбраны по исходникам `react-native-paper@5.15.3`, а не по документации:

| Узел | Куда | Почему |
|---|---|---|
| `Text` | в конец объекта `style`, `fontWeight` из стиля пропускается | обычный RN `Text` |
| `Button` | в `labelStyle` на месте прежнего `fontWeight` | `Button.tsx` кладёт `labelStyle` последним поверх `theme.fonts.labelLarge` |
| `TextInput` | в конец `contentStyle`; `fontWeight` убирается из `style` | `TextInputOutlined.tsx` вынимает из `style` только `fontSize`/`fontWeight`/`lineHeight`/`height`/`backgroundColor`/`textAlign`, а всё остальное, включая `fontFamily`, уходит на внешнюю `View` и ни на что не влияет. `contentStyle` применяется к нативному инпуту последним, после `theme.fonts.bodyLarge` |

`paperTheme.fonts` не трогается (`configureFonts` не используется): шрифт явно задан на каждом узле, который рисует экспорт, а тема Paper влияла бы только на компоненты, которых генератор не выпускает.

#### Загрузка: `useFonts` и гейт в `_layout.tsx`

Семейства для загрузки — `[fontBody, fontHeading]` без `System` и без повторов, в этом порядке. Решение принимается **по теме, а не по узлам**: если `fontHeading` задан, а крупного `Text` в документе нет, семейство всё равно грузится. Так проще и одинаково в обоих генераторах. Если список пуст, `_layout.tsx` и `package.json` те же, что до BIL-88. Иначе в оба варианта layout (`tabs` и `stack`) сразу после импорта `../theme` добавляется:

```tsx
import { useFonts } from 'expo-font';
import { PTSerif_400Regular } from '@expo-google-fonts/pt-serif/400Regular';
import { PTSerif_700Bold } from '@expo-google-fonts/pt-serif/700Bold';
import { Unbounded_400Regular } from '@expo-google-fonts/unbounded/400Regular';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';

export default function Layout() {
  const [fontsLoaded, fontError] = useFonts({
    PTSerif_400Regular,
    PTSerif_700Bold,
    Unbounded_400Regular,
    Unbounded_700Bold,
  });
  if (!fontsLoaded && !fontError) return null;
  return (
```

Импорты идут по семействам в порядке списка, внутри семейства сначала `400Regular`, потом `700Bold`; ключи `useFonts` — в том же порядке. Пока шрифты грузятся, корневой layout возвращает `null` — это стандартный паттерн expo-router + expo-font. Если загрузка упала (`fontError`), приложение рендерится системным шрифтом, а не висит на пустом экране. `expo-splash-screen` не подключаем: нативный сплэш и так держится до первого кадра, а новая зависимость ради удержания сплэша на время загрузки — отдельное решение.

**`package.json`.** Пакеты семейств добавляются в `dependencies` **последними**, после пакетов иконок из § 10.4, в порядке списка семейств и без повторов (`fontBody === fontHeading` даёт один пакет). BIL-94 обязан повторить тот же порядок ключей: `package.json` тест на равенство (§ 10.1) сравнивает целиком.

#### Промпт

В `EXPORT_RULES` (попадают и в генерацию, и в чат) добавлены два пункта: перечень допустимых значений, где список семейств собирается из `AppFontFamily`, а не переписан руками, с короткой характеристикой стилей; и правило выбора токена с порогом `HEADING_MIN_FONT_SIZE` и отображением весов. JSON Schema и так ограничивает значения через `enum` (для strict-моделей его навязывает шлюз), а проза нужна `anthropic/*`, которые идут без `response_format` (§ 9.1): иначе модель узнает про ограничение только из ошибки валидации, ценой повтора. Промпт генерации с брифом (правила плюс JSON Schema, где у двух токенов появился `enum`) вырос с 15347 до 16469 символов (+7%); замеров качества генерации после этого не проводилось.

#### Миграция существующих документов

Документы в БД раньше хранили что угодно — в локальной базе нашлись `System`, `system`, `Inter`, `Manrope`, `Montserrat`, `Roboto`, `Roboto-Bold`. Со строгим `Literal` такой документ не прочитался бы: `GET /api/apps/[id]`, экспорт и сборка контекста чата валидируют документ из БД через `AppDocument` и упали бы с 500. Поэтому по § 11 добавлена data-миграция `e1ab16a64eeb` (`alembic/versions/e1ab16a64eeb_normalize_theme_fonts.py`). Она нормализует `theme.fontBody`/`theme.fontHeading` в `apps.document` и `chat_messages.proposed_document`:

- совпадение с курируемым значением **без учёта регистра** → каноническое написание (`system` → `System`, `pt serif` → `PT Serif`);
- всё остальное (`Roboto`, `Roboto-Bold`, `Syne`, `Inter, sans-serif`) → `System`.

`revision` документа миграция не трогает, строки, где менять нечего, не обновляет. Список значений в миграции — замороженная копия, а не импорт из `src`: будущая правка `AppFontFamily` не должна менять уже применённую миграцию. `downgrade` пустой: исходные значения не восстановить, а старый код принимает любую строку, в том числе нормализованную. Проверено: тест `tests/apps/test_font_migration.py` на реальном Postgres и прогон на копии локальной БД — после миграции все 26 документов (23 приложения и 3 предложения ассистента) проходят `AppDocument.model_validate` и `generate_files`.

`DEFAULT_THEME` плейсхолдера (`src/apps/service.py`) остался `Inter`/`Inter`: значение валидно, а документ заменяется генерацией.

#### Проверка — реальная сборка

Два документа ручной сборки, на каждом `Text` обоих токенов с весами 400/500/600/700, `Text` с `textBind`, `Button` с весом по умолчанию и 500, `TextInput` с весом 700, текст с `№` и `₽`:

- `tabs`, `fontBody: "PT Serif"`, `fontHeading: "Unbounded"` — многословные имена и версии 0.4.1;
- `stack`, `fontBody: "Inter"`, `fontHeading: "Lora"`.

Каждый прошёл `generate_files` → `npm install` → `npx tsc --noEmit` → `npx expo export --platform android|ios|web`, все шаги с exit 0. Что проверено сверх «собралось»:

- **ассеты**: в `dist` каждой платформы ровно 4 TTF шрифтов (на Android/iOS — по `metadata.json` экспорта, хэши совпадают с web) плюс `MaterialCommunityIcons` Paper; других начертаний и курсивов нет;
- **бандл**: имена `PTSerif_400Regular` … `Unbounded_700Bold` есть в Hermes-бандлах Android и iOS и в web-бандле;
- **рендер**: web-экспорт открыт в Chrome. `document.fonts` — четыре `@font-face` в статусе `loaded`. Вычисленный `font-family` у каждого узла — ожидаемый файл: заголовки 32/700 и 22/700 (привязанный) → `Unbounded_700Bold`, 24/400 → `Unbounded_400Regular`, текст 15 → `PTSerif_400Regular`, 13/600 → `PTSerif_700Bold`, кнопка по умолчанию → `PTSerif_700Bold`, кнопка 500 → `PTSerif_400Regular`, `TextInput` 700 → `PTSerif_700Bold`. Вычисленный `font-weight` везде 400 (синтетического полужирного нет). По скриншоту кириллица, `№` и `₽` нарисованы самим шрифтом.

Нативный рендер на устройстве или симуляторе не проверялся — только сборка бандлов Android/iOS.

#### Порядок мержа и тест на равенство

Как и в § 10.4: пока TS-генератор не умеет шрифты (BIL-94), тест на равенство (§ 10.1) покраснел бы на любом документе с Google-шрифтом. Поэтому общие фикстуры переведены на `System`: `max_coverage_document.py` (где был `Inter`/`Syne`, а `Syne` теперь и вовсе невалиден) с TODO на BIL-94 и `tests/generation/template_fixtures.py`. С `System` вывод Python-генератора не изменился, и тест на равенство зелёный. Ветки со шрифтами покрывает отдельный бэкенд-тест `tests/codegen/test_font_codegen.py`.

Фронт при этом не ломается: редактор токены шрифта не правит, только возвращает на `PUT` то, что пришло с бэка, а после миграции там только допустимые значения. Но пока BIL-94 не смержен, панель кода в редакторе (TS-кодоген) не показывает загрузку шрифтов, а превью рисует системным шрифтом — расхождение с экспортом по этим полям, как было с `Icon` до BIL-92.

### 10.6 Модуль состояния — `lib/state.ts`, вне `app/` (BIL-95)

**Симптом.** Генератор клал модуль состояния (`AppStateProvider`, `useAppState`) в `app/state.tsx`. Но `app/` у expo-router — каталог маршрутов: всё, что в нём лежит, становится экраном. В экспортированном приложении с навигацией `tabs` появлялась лишняя вкладка `state` (видно на скриншотах проверки BIL-88). Проверено на web-экспорте: в карте маршрутов бандла (`require.context`) был ключ `./state.tsx`, а в таб-баре — ссылка `/state`.

**Решение.** Модуль лежит в `lib/state.ts`, рядом с `app/`, а не внутри него, так что expo-router его не видит. `app/_layout.tsx` и экраны импортируют его как `'../lib/state'`. Экраны лежат плоско (`app/<route>.tsx`), поэтому относительный путь у всех один.

**Расширение `.ts`, поэтому без JSX.** В файле `.ts` JSX не парсят ни Babel, ни `tsc`, поэтому провайдер возвращает `createElement(Ctx.Provider, { value }, children)`, а не `<Ctx.Provider …>`. Импорт `React` по умолчанию убран: он нужен был только под JSX. Остальное содержимое модуля не менялось.

**Тест на равенство и TS-генератор.** TS-генератор (`codegen.ts`) переезжает отдельной задачей, заблокированной этой. До её мержа он выпускает старую раскладку, поэтому тест на равенство (§ 10.1) приводит его вывод к новой функцией `adopt_bil95_state_layout`: переносит `app/state.tsx` в `lib/state.ts`, делает в нём две замены (импорт и JSX-строка провайдера) и переписывает `'./state'` на `'../lib/state'` в файлах `app/`. Каждая замена проверяется на ровно одно вхождение: если TS-вывод поменяется иначе, тест упадёт, а не пропустит расхождение молча. Если в TS-выводе уже есть `lib/state.ts`, функция ничего не делает. После мержа фронтовой задачи её нужно удалить. Фронтовая задача обязана выпустить ровно то, что выпускает Python: путь `lib/state.ts`, содержимое с `createElement` и импорты `'../lib/state'`.

**Проверка — реальная сборка.** Два документа из `tests/codegen/test_state_module_codegen.py` (`tabs` и `stack`: экраны `index` и `profile`, `textBind` и `setVar`) плюс документ максимального покрытия, генератор до и после правки. Цепочка `generate_files` → `npm install` → `npx tsc --noEmit` → `npx expo export --platform android|ios|web`: на новом генераторе все экспорты завершились с exit 0. `tsc` чистый на `tabs`/`stack`. На документе максимального покрытия остаются две ошибки `TS2769` про `animation` (§ 10.3), до и после правки одинаковые. Карта маршрутов web-бандла `tabs`: до правки `_layout`, `index`, `profile`, `state`, после — без `state`. Web-экспорт `tabs` открыт в Chrome: до правки в таб-баре три вкладки (`/`, `/profile`, `/state`), после — две. Кнопка с `setVar` меняет текст, привязанный через `textBind` («Гость» → «Аня»), то есть провайдер из `lib/state.ts` работает.

### 10.7 Тема на строках `FlatList`, заголовках навигатора и подписях таб-бара (BIL-96)

**Что было.** BIL-88 применил `fontBody`/`fontHeading` только к `Text`, подписи `Button` и `TextInput` (§ 10.5). Ещё три видимые поверхности экспорта тему игнорировали: текст строк `FlatList`, заголовок навигатора и подписи таб-бара. Строки `FlatList` к тому же красились зашитыми цветами `#18181B` (фон строки) и `#FAFAFA` (текст), то есть тёмной палитрой при любой теме: на светлой теме получалась тёмная плашка посреди светлого экрана.

**Правило выбора токена то же, что в § 10.5**: `fontSize >= HEADING_MIN_FONT_SIZE` (20) — `fontHeading`, иначе `fontBody`; начертание — по весу, `400`/`500` → `400Regular`, `600`/`700` → `700Bold`. У этих трёх поверхностей нет `fontSize` из документа, поэтому для каждой взяты размер и вес, которыми её рисует сама библиотека, и уже они прогоняются через общее правило (`_theme_font_family` в `src/codegen/service.py`). Значения по умолчанию сверены по исходникам установленных в сгенерированный проект пакетов: `@react-navigation/elements@2.9.44` (`Header/HeaderTitle.tsx`), `@react-navigation/bottom-tabs@7.20.0` (`views/BottomTabItem.tsx`), `@react-navigation/native-stack@7.20.0` (`views/useHeaderConfigProps.tsx`).

| Поверхность | Размер по умолчанию | Вес по умолчанию | Константы | Итог |
|---|---|---|---|---|
| текст строки `FlatList` | 14 — обычный RN `Text` без `fontSize` | не задан | `FLATLIST_ROW_FONT_SIZE` = 14, `FLATLIST_ROW_FONT_WEIGHT` = `None` | `fontBody`, `400Regular` |
| заголовок навигатора (`Stack`, `Tabs`, `drawer` идёт через `Stack`) | 17 iOS / 20 Android / 18 web | `600` iOS (`fonts.bold`), `500` Android и web (`fonts.medium`) | `HEADER_TITLE_FONT_SIZE` = 20, `HEADER_TITLE_FONT_WEIGHT` = `"600"` | `fontHeading`, `700Bold` |
| подпись таб-бара | 10 под иконкой; 13 (12 в компактном виде) рядом с иконкой — на широком экране | `500` (`fonts.medium`) | `TAB_LABEL_FONT_SIZE` = 10, `TAB_LABEL_FONT_WEIGHT` = `"500"` | `fontBody`, `400Regular` |

Почему так:

- **Строка `FlatList`** — рядовой основной текст, ровно тот случай, который правило отдаёт `fontBody`. Вес не задан, как у `Text` без `fontWeight`.
- **Заголовок навигатора** — единственная поверхность, где размер по умолчанию стоит на пороге: 20 на Android, 17–18 на iOS и web. По смыслу это заголовок экрана, а правило «от 20» в § 10.5 подбиралось как раз под заголовки экранов, поэтому `fontHeading`. Шрифт по платформам не делится (через `Platform.select`): иначе один и тот же заголовок выглядел бы на iOS и Android разными гарнитурами. Число 20 — размер Android, при котором правило даёт тот же ответ без исключений. Вес тоже расходится по платформам (600 и 500). Взят iOS-вариант 600, то есть жирный файл: заголовок в шапке выделен на всех платформах, а обычное начертание акцидентного шрифта в шапке читалось бы как основной текст.
- **Подпись таб-бара** — мелкий текст (10–13, а 17 только в боковой панели на планшете, которую генератор не включает), значит `fontBody`. Вес 500 → `400Regular`, так же как у `Button` с весом 500 в § 10.5.

**Что генерируется.** Как везде в § 10.5, вместе с `fontFamily` всегда пишется `fontWeight: 'normal'`: библиотека сама подмешивает вес 500/600, и без этого на web получилось бы синтетическое полужирное поверх уже жирного файла. `headerTitleStyle` и `tabBarLabelStyle` в React Navigation применяются после встроенных `fonts.*`, так что они их перекрывают. `headerTintColor` (цвет заголовка) уже был из темы, его не трогали.

```tsx
screenOptions={{
  headerStyle: { backgroundColor: theme.colorSurface },
  headerTintColor: theme.colorText,
  headerTitleStyle: { fontFamily: 'Unbounded_700Bold', fontWeight: 'normal' },
  tabBarStyle: { backgroundColor: theme.colorSurface, borderTopColor: theme.colorBorder },
  tabBarActiveTintColor: theme.colorPrimary,
  tabBarInactiveTintColor: theme.colorTextMuted,
  tabBarLabelStyle: { fontFamily: 'PTSerif_400Regular', fontWeight: 'normal' },
  sceneStyle: { backgroundColor: theme.colorBg },
}}
```

`tabBarLabelStyle` есть только в варианте `tabs`. Если нужный токен — `System`, соответствующей строки нет вовсе, а при `System` в обоих токенах `_layout.tsx` совпадает с выводом до BIL-96 байт в байт. Отдельной загрузки шрифтов не нужно: гейт `useFonts` из § 10.5 уже грузит оба начертания обоих семейств темы.

**Цвета строки `FlatList`** — по ролям токенов из `EXPORT_RULES` (§ 9.1, BIL-86): фон строки — это карточка, то есть `colorSurface`, текст — основной, то есть `colorText`. В коде это ссылки `theme.colorSurface` / `theme.colorText`, а не подставленные HEX, как и у остальных цветов из темы в экспорте. Отступ, радиус 10 и зазор между строками не менялись. Поля `style` самого узла `FlatList` (`color`, `fontSize` и т. п.) на строки по-прежнему не влияют: они уходят в стиль контейнера списка, как и до этой задачи. Старые зашитые цвета совпадали с тёмной темой по умолчанию (`#18181B` — это `colorSurface`, `#FAFAFA` — `colorText` фикстуры `max_coverage_document`), так что на тёмной теме вид строк не изменился.

**Тест на равенство и TS-генератор.** TS-генератор (`codegen.ts`) переезжает отдельной задачей, заблокированной этой. Шрифтов в фикстурах теста на равенство (§ 10.1) нет, там `System`, так что `_layout.tsx` не расходится. Расходятся только цвета строк `FlatList`, и тест приводит к ним вывод TS функцией `adopt_bil96_flatlist_rows`, тем же приёмом, что `adopt_bil95_state_layout` (§ 10.6): в каждом экране она заменяет две зашитые строки на ссылки на тему и проверяет, что каждая встречается ровно по разу на каждый `FlatList`. Если TS-вывод уже ссылается на тему, функция ничего не делает. После мержа фронтовой задачи её нужно удалить. Фронтовая задача обязана выпустить ровно то, что выпускает Python: строки `FlatList` с `theme.colorSurface`/`theme.colorText` и шрифтом `fontBody`, `headerTitleStyle` с `fontHeading`/`700Bold` и `tabBarLabelStyle` с `fontBody`/`400Regular`, в тех же местах `screenOptions`.

**Проверка — реальная сборка.** Два документа (`tabs` и `stack`: светлая тема, `fontBody: "PT Serif"`, `fontHeading: "Unbounded"`, на первом экране `FlatList` с `№` и `₽` и кнопка перехода на второй экран) прошли `generate_files` → `npm install` → `npx tsc --noEmit` → `npx expo export --platform web|android|ios`, все шаги с exit 0. `headerTitleStyle`, `tabBarLabelStyle` и имена файлов шрифтов есть в web-бандле и в Hermes-бандлах Android и iOS. Web-экспорт открыт в Chrome, вычисленные стили:

| Узел | `font-family` | Цвет |
|---|---|---|
| заголовок навигатора (`tabs`; `stack` — и на втором экране после перехода) | `Unbounded_700Bold`, 18px | `#2B1D12` = `colorText` |
| подписи таб-бара | `PTSerif_400Regular`, 13px (широкий экран, подпись рядом с иконкой) | активная `colorPrimary`, неактивная `colorTextMuted` |
| текст строк `FlatList` | `PTSerif_400Regular`, 14px | `#2B1D12` = `colorText`, фон строки `#F3E6D8` = `colorSurface` |

Вычисленный `font-weight` везде 400, синтетического полужирного нет. Нативный рендер на устройстве или симуляторе не проверялся, только сборка бандлов Android/iOS. Юнит-тесты — `tests/codegen/test_theme_surfaces_codegen.py`.

## 11. Миграции

Каждое изменение `models.py` — новая ревизия Alembic. Автогенерация (`alembic revision --autogenerate`) как черновик: сгенерированный файл читается глазами до коммита, потому что Alembic не видит переименований и часто предлагает `drop + create` вместо `alter`.

Изменения `JSONB`-документа миграциями не описываются — форма документа живёт в Pydantic-схемах. Если форма меняется несовместимо, нужна отдельная data-миграция, прогоняющая существующие документы через нормализацию.

---

## 12. Кодстайл и инструменты

Конфиг — `backend/pyproject.toml`, команды — `backend/Makefile`. Имена команд намеренно совпадают с фронтендом, чтобы не держать в голове два набора:

```bash
make check   # формат + линт + типы + архитектура — перед коммитом и в CI
make fix     # отформатировать и починить всё автоисправимое
```

Плюс по отдельности: `lint`, `lint-fix`, `format`, `format-check`, `typecheck`, `arch`.

- **Ruff** — линтер и форматтер в одном, заменяет black + isort + flake8 с плагинами.
- **mypy** в режиме `strict` с плагином `pydantic.mypy`. SQLAlchemy 2.0 типизирован нативно через `Mapped[...]`, отдельный плагин ему не нужен.
- **import-linter** (`make arch`) — архитектурные контракты: слои, инверсия зависимостей, границы доменов. Подробности и что именно он ловит — § 5.1.
- Ширина строки **120** — как на фронте. Единый диффы-формат на весь репозиторий важнее следования дефолту black (88).
- `.editorconfig` в корне репозитория задаёт отступ 4 пробела для `.py`.

Что включено в линтер и почему именно это:

- `ASYNC` (flake8-async) — **самое ценное правило для этого проекта**. Бэкенд полностью асинхронный, и один блокирующий вызов (`time.sleep`, синхронный клиент БД, `requests`) внутри `async def` встаёт колом весь event loop. Проверено: `time.sleep(1)` в корутине ловится как `ASYNC251`.
- `B` (bugbear), `SIM`, `C4`, `RUF` — реальные ловушки и упрощения, а не вкусовщина.
- `S` (bandit) — безопасность; в `tests/**` отключён `S101`, потому что там `assert` это инструмент, а не проблема.
- `T20` — `print()` не место в проде, для этого есть логгер.
- `I`, `N`, `UP` — порядок импортов, именование, современный синтаксис.

Две настройки, без которых линтер мешал бы работать — не убирай, не разобравшись:

- `flake8-bugbear.extend-immutable-calls` со списком `fastapi.Depends`, `Query`, `Body` и т.д. FastAPI задаёт зависимости вызовом в значении по умолчанию (`dep: str = Depends(get_service)`), а правило `B008` считает вызов в дефолте ловушкой изменяемого аргумента. Без этого списка ругань шла бы на каждый эндпоинт. Проверено: `Depends(...)` пропускается, произвольный вызов в дефолте по-прежнему ловится.
- `flake8-tidy-imports.ban-relative-imports = "all"` — относительные импорты запрещены осознанно: они маскируют нарушение границ доменов (`from ..apps.repository import ...` выглядит безобидно, абсолютный путь сразу видно на ревью). См. правило междоменных импортов в разделе 3.

## 13. Тесты

Все три уровня закрыты (BIL-24):

- **Сервисы** — с репозиторием в памяти, без БД. Именно ради этого нужен Protocol: `InMemoryAppRepository` реализует те же методы, и `AppService` не замечает подмены.
- **Репозитории** — на реальном PostgreSQL через testcontainers (`tests/apps/test_repository.py`, `tests/conftest.py`). Мокать SQLAlchemy бессмысленно: так проверяется только то, что мок настроен.
- **Роутеры** — через `httpx.AsyncClient` с in-memory репозиторием, проверяются коды ответов и формы тел из [`../api-contract.md`](../api-contract.md).
- **Integration/e2e** (`tests/integration/`) — полный HTTP-стек (`httpx.AsyncClient` + ASGI-транспорт) поверх реального PostgreSQL: создание приложения → генерация → сохранение документа → чтение → удаление, 409 на `PUT` во время `pending`, 404 с телом ошибки, экспорт (реальный zip-архив через inline-прогон `build_export_zip`).

### Маркер `integration` и Docker

Тесты, которым нужен реальный Postgres (репозитории и `tests/integration/`) или реальный Redis (`tests/worker/test_export_result_retention.py`), помечены `@pytest.mark.integration` и требуют Docker — `tests/conftest.py` поднимает `PostgresContainer` и `RedisContainer` через testcontainers и сам определяет доступность Docker (`requires_docker = pytest.mark.skipif(...)`). Без Docker эти тесты **скипаются**, а не падают — `pnpm`-эквивалент здесь, `make check`/`make coverage`, остаётся зелёным и у тех, кто Docker не поставил.

В CI (`.github/workflows/backend.yml`) Docker на хостед `ubuntu-latest` раннере доступен из коробки для джобов, идущих прямо на хосте (не в `container:`) — подтверждено официальным software-манифестом `actions/runner-images` для Ubuntu 24.04 (Docker Client/Server/Compose/Buildx предустановлены) и независимо блогом Docker Inc. про testcontainers на GitHub Actions. Никаких `services:`-блоков, `docker:dind` или Ryuk-специфичных переменных окружения (`TESTCONTAINERS_RYUK_DISABLED` и т.п. — это workaround для rootless/ограниченных сред, не для стандартных hosted-раннеров) не нужно. Перед шагом тестов в workflow стоит диагностический шаг `docker info` — чтобы недоступность демона (если раннер вдруг изменится) падала явной ошибкой, а не непрозрачным сбоем Ryuk/testcontainers внутри pytest. Перепроверить на практике после пуша: открыть последний прогон джоба `check` в Actions и убедиться, что шаг «Tests with coverage» показывает **150 passed**, а не 137 (137 — признак того, что integration-тесты скипнулись бы из-за недоступности Docker).

### Покрытие

`make coverage` (или `make check`, который его включает) — `pytest --cov=src --cov-report=term-missing`, порог из `[tool.coverage.report].fail_under` в `backend/pyproject.toml`. Порог **84%** подобран с запасом в несколько пунктов вниз от обеих измеренных базовых линий: ~91.7% с Docker (все 150 тестов, включая integration) и ~87.7% без Docker (137 тестов, integration скипнуты) — обе цифры измерены на реальном прогоне, не оценены на глаз. Запас нужен именно из-за этого разрыва: локальный прогон без Docker закономерно даёт меньший процент (не выполняются строки, которые покрывают только integration-тесты), и порог обязан проходить в обоих случаях, иначе `make check` ломался бы просто потому, что у разработчика не поставлен Docker.

Не покрыто сознательно: `src/worker/main.py` (сборка `WorkerSettings`, `on_startup`/`on_shutdown` — инфраструктурная обвязка Arq, тестируется бы только против настоящего Redis) и часть `src/queue/arq_queue.py`/`src/dependencies.py` (создание реального пула соединений) — оба не участвуют ни в одном юнит- или integration-сценарии и не влияют на бизнес-логику.

---

## 14. Что ещё не решено

Эти вопросы нельзя закрыть в одиночку — по каждому решение фиксируется в [`../api-contract.md`](../api-contract.md), иначе фронт и бэк разъедутся:

- **Авторизация.** В ТЗ не упомянута вообще, в прототипе был фейковый заголовок `x-user-id` со значением `anonymous`. Нужна настоящая: как минимум владелец у приложения и запрет читать чужие. Пока её нет — `owner_id` уже заложен в таблицу, чтобы потом не мигрировать данные.
- **Протокол чата с ассистентом — закрыто в BIL-36 (история, решения) и BIL-37 (сам разговор с LLM).** Решение: `POST /api/apps/{id}/chat/messages` отвечает 202 с `taskId`, клиент поллит `/api/tasks/{id}` — та же схема, что у генерации приложения, без SSE и WebSocket. Формы запросов и ответов — в [`../api-contract.md`](../api-contract.md#чат-ассистента-bil-36-bil-37).
- **Загрузка файлов и изображений.** В прототипе только метаданные, без реального хранилища.
- **Генерация документа из промпта — закрыто в BIL-15**, шаблоны заменены на LLM-генерацию через RouterAI, см. § 9.1. Открытым остаётся только одно: **модель по умолчанию не проверена вживую**, ключа не было. Появится ключ — перепроверить `deepseek/deepseek-v4-flash` и то, доезжает ли до неё `response_format: json_schema`.

---

## 15. Запуск через Docker Compose

`docker-compose.yml` в корне репозитория (BIL-65) — способ поднять весь бэкенд одной командой, без `brew services` и локального `uv` на хосте. Это dev-инструмент для быстрого локального старта, не прод-артефакт.

### Сервисы

| Сервис | Что делает |
|---|---|
| `postgres` | `postgres:16`, healthcheck `pg_isready`, данные в именованном volume `bildo_postgres_data` (не anonymous — переживает `down` без `-v`) |
| `redis` | официальный `redis:7`, healthcheck `redis-cli ping` |
| `migrate` | одноразовый сервис: собирается из `backend/Dockerfile`, `command: alembic upgrade head`, ждёт `postgres` healthy, завершается после применения миграций и не остаётся висеть |
| `api` | тот же образ, `uvicorn src.main:app --host 0.0.0.0 --reload`, порт 8000, ждёт `postgres`/`redis` healthy и `migrate` — `condition: service_completed_successfully` |
| `worker` | тот же образ, `command: arq src.worker.main.WorkerSettings`, те же зависимости, что у `api` |

### Почему миграции — отдельный сервис, а не `sh -c "alembic upgrade head && uvicorn ..."` в `api`

Обёртка в command `api` заставила бы миграции гоняться при каждом рестарте API-контейнера (в том числе при падении и авторестарте) и создала бы гонку с `worker`, который стартует параллельно и тоже бы претендовал на то же самое, если бы обёртку повесили на оба. Отдельный `migrate` с `condition: service_completed_successfully` у `api` и `worker` — миграция ровно одна на `docker compose up`, оба потребителя ждут её результата, а не гадают, кто успел первым.

### `backend/Dockerfile`

Один стейдж на `python:3.12-slim` (в `pyproject.toml` — `requires-python >= 3.12`) с `uv`: сначала `uv sync --locked --no-dev --no-install-project` по одним `pyproject.toml`/`uv.lock` (кэшируется, пока зависимости не меняются), потом копируются `src/`/`alembic/`/`alembic.ini` и `uv sync --locked --no-dev` докладывает сам пакет. `--no-dev` — в образ, который реально исполняется (`api`/`worker`/`migrate` все три из него собраны), группа `dev` (ruff/mypy/pytest/testcontainers) не нужна и не ставится.

### `DATABASE_URL`/`REDIS_URL` — сервисные имена, а не `localhost`

Внутри сети Docker Compose контейнеры видят друг друга по имени сервиса, не по `localhost` хоста (тот всегда указывает на сам контейнер). `backend/.env` для локального запуска без Docker (см. [README](../../README.md#бэкенд-локально-postgresredis-через-brew-services)) держит `localhost` — он и остаётся неизменным для этого сценария. Заводить отдельный `backend/.env.docker` не стали: `docker-compose.yml` подключает `backend/.env` через `env_file` (оттуда берутся `ROUTERAI_*` и всё остальное) и тут же перебивает `DATABASE_URL`/`REDIS_URL` явным `environment:` — `environment:` в Compose имеет приоритет над `env_file`, так что один и тот же `.env` работает и для локального запуска, и как база для Docker, без дублирования файла.

### Volumes для live reload

`api` и `worker` монтируют `./backend/src` в `/app/src` — `uvicorn --reload` и правка кода воркера подхватываются без пересборки образа. Это единственный смысл `--reload` в команде `api`, который просил заказчик задачи.

### Запуск и остановка

```bash
docker compose up            # поднять всё, миграции применяются автоматически
docker compose down          # остановить, данные Postgres остаются в volume
docker compose down -v       # остановить и стереть данные (только это удаляет volume)
```

Проверено вживую (BIL-65): чистый старт после `down -v` поднимает Postgres/Redis healthy, `migrate` проходит все ревизии и завершается, `api` отвечает на `GET /docs`, `worker` стартует без ошибок. Полный сценарий через этот compose — `POST /api/apps` → воркер догенерировал документ → `GET /api/apps/{id}/export` отдал валидный zip Expo-проекта — воспроизведён curl'ом целиком. `down` (без `-v`) и повторный `up` — данные (созданные приложения) на месте, миграции не переигрываются (уже на `head`, `alembic upgrade head` — no-op). Локальный `make check` (без Docker) этой задачей не затронут.
