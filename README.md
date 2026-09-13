# bildo

Веб-редактор для создания мобильных приложений: пользователь описывает идею словами, система собирает приложение из экранов, дальше он правит его визуально на бесконечной доске или через AI-чат, смотрит превью, делится ссылкой и экспортирует Expo-проект.

<div align="center">

![React](https://img.shields.io/badge/-React_19-61DAFB?logo=react&logoColor=black&style=for-the-badge)
![React Compiler](https://img.shields.io/badge/-React_Compiler-1E1E24?logo=react&logoColor=61DAFB&style=for-the-badge)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white&style=for-the-badge)
![Vite](https://img.shields.io/badge/-Vite-646CFF?logo=vite&logoColor=white&style=for-the-badge)
![React Router](https://img.shields.io/badge/-React_Router-CA4245?logo=reactrouter&logoColor=white&style=for-the-badge)
![TanStack Query](https://img.shields.io/badge/-TanStack_Query-FF4154?logo=reactquery&logoColor=white&style=for-the-badge)
![Zustand](https://img.shields.io/badge/-Zustand-2D2A26?style=for-the-badge)
![CSS Modules](https://img.shields.io/badge/-CSS_Modules-1572B6?logo=css&logoColor=white&style=for-the-badge)
![pnpm](https://img.shields.io/badge/-pnpm-F69220?logo=pnpm&logoColor=white&style=for-the-badge)
![Turborepo](https://img.shields.io/badge/-Turborepo-EF4444?logo=turborepo&logoColor=white&style=for-the-badge)
![ESLint](https://img.shields.io/badge/-ESLint-4B32C3?logo=eslint&logoColor=white&style=for-the-badge)
![Prettier](https://img.shields.io/badge/-Prettier-F7B93E?logo=prettier&logoColor=black&style=for-the-badge)

![Python](https://img.shields.io/badge/-Python_3.12-3776AB?logo=python&logoColor=white&style=for-the-badge)
![FastAPI](https://img.shields.io/badge/-FastAPI-009688?logo=fastapi&logoColor=white&style=for-the-badge)
![Pydantic](https://img.shields.io/badge/-Pydantic_v2-E92063?logo=pydantic&logoColor=white&style=for-the-badge)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?logo=postgresql&logoColor=white&style=for-the-badge)
![SQLAlchemy](https://img.shields.io/badge/-SQLAlchemy_2.0-D71F00?logo=sqlalchemy&logoColor=white&style=for-the-badge)
![Alembic](https://img.shields.io/badge/-Alembic-6BA81E?style=for-the-badge)
![Redis](https://img.shields.io/badge/-Redis-FF4438?logo=redis&logoColor=white&style=for-the-badge)
![Arq](https://img.shields.io/badge/-Arq-1F6FEB?style=for-the-badge)
![Ruff](https://img.shields.io/badge/-Ruff-D7FF64?logo=ruff&logoColor=black&style=for-the-badge)
![mypy](https://img.shields.io/badge/-mypy_strict-2A6DB2?style=for-the-badge)

</div>

## Структура

```
frontend/   монорепо на pnpm + Turborepo
  apps/web        редактор и лендинг (Vite + React 19 + React Compiler, FSD)
  apps/mobile     зарезервировано под RN, кода пока нет
  packages/api    модели AppDocument + REST-клиент, общее для web и mobile
backend/    FastAPI + PostgreSQL + Arq
```

## Запуск

```bash
cd frontend && pnpm install && pnpm dev
```

Фронт ждёт бэкенд на `VITE_API_BASE_URL` (см. `frontend/apps/web/.env.example`).

### Бэкенд локально (Postgres/Redis через brew services)

```bash
brew services start postgresql@16
brew services start redis
cd backend && uv sync --group dev
cp .env.example .env   # заполнить ROUTERAI_API_KEY при необходимости
uv run alembic upgrade head
uv run uvicorn src.main:app --reload
uv run arq src.worker.main.WorkerSettings   # в отдельном терминале
```

### Бэкенд через Docker Compose

Не нужно ставить Postgres/Redis/uv на хост — поднимается всё сразу:

```bash
docker compose up
```

Что при этом происходит: `postgres`/`redis` стартуют и ждут healthcheck, одноразовый сервис `migrate` прогоняет `alembic upgrade head` и завершается, только после этого стартуют `api` (http://localhost:8000, `--reload`, живая перезагрузка по `backend/src` через volume) и `worker`. `backend/.env` подхватывается через `env_file` — `DATABASE_URL`/`REDIS_URL` в нём переопределены на имена сервисов (`postgres`/`redis`) прямо в `docker-compose.yml`, остальные переменные (`ROUTERAI_*`) берутся из файла как есть.

Остановить — `docker compose down` (данные Postgres остаются в volume `bildo_postgres_data`). Стереть данные — `docker compose down -v`.

Подробнее — [`.claude/knowledge/backend/architecture.md`](.claude/knowledge/backend/architecture.md#15-запуск-через-docker-compose).

## Перед коммитом

```bash
cd frontend && pnpm check    # формат + линт + типы
cd backend && make check     # формат + линт + типы + архитектурные контракты
```

`pnpm fix` и `make fix` чинят всё автоисправимое.

Ветки, коммиты и пул-реквесты — [CONTRIBUTING.md](CONTRIBUTING.md).

## Контекст проекта

Вся документация — в [`.claude/knowledge/`](.claude/knowledge/): продукт и модель данных, дизайн-система, контракт API, правила фронтенда (FSD, состояние) и бэкенда (слои, Repository + Interface, SOLID). Оглавление с описанием каждого файла — в [CLAUDE.md](CLAUDE.md); оттуда же их подхватывает ИИ-ассистент. Держите в актуальном состоянии вместе с кодом.
