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
│   ├── generation/              # ДОМЕН: промпт → AppDocument (пока шаблоны, потом LLM)
│   │   └── service.py           # чистая функция, ничего не знает о персистентности
│   ├── codegen/                 # ДОМЕН: AppDocument → файлы Expo → zip
│   ├── tasks/                   # ДОМЕН: статус фоновой задачи (GET /api/tasks/{id})
│   ├── files/                   # ДОМЕН: загрузка файлов (не специфицирован)
│   ├── chat/                    # ДОМЕН: ассистент (не специфицирован)
│   │
│   ├── queue/                   # НЕ домен: Protocol TaskQueue + реализация на Arq
│   │   ├── base.py              # Protocol TaskQueue — без arq, fastapi и sqlalchemy
│   │   ├── arq_queue.py         # ArqTaskQueue, RedisSettings, создание пула
│   │   ├── jobs.py              # имена задач — общий контракт продюсера и воркера
│   │   └── dependencies.py      # ArqRedis из app.state → Depends
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
| Сборка Expo-проекта и zip | Arq | CPU + память, растёт с размером приложения |

Для долгих операций фронту нужен статус. Решено поллингом, без SSE: `POST /api/apps` форму ответа не меняет (`{ id }`, 201), задача ставится в очередь с `job_id`, равным `id` приложения, а статус читается двумя способами — `generationStatus` в `GET /api/apps/{id}` (источник правды, лежит в БД) и генерический `GET /api/tasks/{id}` поверх состояния джобы в Redis. Формы ответов — в [`../api-contract.md`](../api-contract.md).

Задачи ставятся в очередь **через `Protocol` `TaskQueue`** (`src/queue/base.py`), реализация `ArqTaskQueue` подставляется через DI ровно так же, как `SqlAlchemyAppRepository` под `AppRepository`: сервис не знает про Arq, а тесты подставляют очередь в памяти. Пул `ArqRedis` создаётся один раз в lifespan-обработчике `src/main.py` и живёт в `app.state`.

Воркер (`src/worker/tasks.py`) — единственное место, где домены сшиваются: он открывает сессию сам через `async_session_factory` (Depends вне запроса не работает), зовёт `generation.service.generate_document`, потом `apps.service.mark_generated` / `mark_generation_failed` и сам коммитит. Поэтому на него не распространяется запрет сервисам знать про SQLAlchemy — это композиционный инфраструктурный код, а не слой домена.

---

## 10. Генерация кода: важное предупреждение

`AppDocument` → файлы Expo-проекта нужен **в двух местах**:
- на фронте — живая панель кода и дерево файлов в редакторе (уже реализовано в TS: `frontend/apps/web/src/entities/app-document/lib/codegen.ts`);
- на бэке — zip для `GET /api/apps/{id}/export`.

Значит, есть два варианта, и выбор надо сделать осознанно, а не по ходу:
1. **Продублировать генератор на Python.** Быстро, но два генератора неизбежно разъезжаются, и тогда «код на экране» перестаёт совпадать со скачанным архивом — а это прямое обещание продукта.
2. **Держать один генератор** (например, гонять TS-генератор в отдельном процессе или вынести в общий сервис). Дороже в инфраструктуре, но расхождение невозможно by design.

Если выбран вариант 1 — нужны тесты, сверяющие вывод обоих генераторов на одинаковых документах.

---

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

Минимум, который должен быть:

- **Сервисы** — с репозиторием в памяти, без БД. Именно ради этого нужен Protocol: `InMemoryAppRepository` реализует те же методы, и `AppService` не замечает подмены.
- **Репозитории** — на реальном PostgreSQL (testcontainers или отдельная тестовая БД). Мокать SQLAlchemy бессмысленно: так проверяется только то, что мок настроен.
- **Роутеры** — через `httpx.AsyncClient`, проверяются коды ответов и формы тел из [`../api-contract.md`](../api-contract.md).

---

## 14. Что ещё не решено

Эти вопросы нельзя закрыть в одиночку — по каждому решение фиксируется в [`../api-contract.md`](../api-contract.md), иначе фронт и бэк разъедутся:

- **Авторизация.** В ТЗ не упомянута вообще, в прототипе был фейковый заголовок `x-user-id` со значением `anonymous`. Нужна настоящая: как минимум владелец у приложения и запрет читать чужие. Пока её нет — `owner_id` уже заложен в таблицу, чтобы потом не мигрировать данные.
- **Протокол чата с ассистентом.** В прототипе чат вообще не ходил в LLM (локальный regex поверх стора), копировать нечего — проектируется с нуля.
- **Загрузка файлов и изображений.** В прототипе только метаданные, без реального хранилища.
- **Генерация документа из промпта.** Отправной точкой решено оставить шаблоны, как в прототипе: пять категорий (`habits` / `social` / `shop` / `forms` / `blank`), выбор по ключевым словам в промпте, дефолт — `blank`. Реализовано в `src/generation/service.py` и заведомо является заглушкой. Открытым остаётся переход на настоящую LLM-генерацию JSON — тогда обязательна валидация ответа моделью `AppDocument` и повтор при невалидном ответе; снаружи контракт от этого не меняется, меняется только начинка `generate_document`.
