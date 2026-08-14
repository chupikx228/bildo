# backend

Территория Егора — FastAPI (async) + Pydantic v2, PostgreSQL + SQLAlchemy 2.0 (async) + Alembic, Redis, Arq.

**Перед тем как писать код, прочитай [`.claude/knowledge/backend/architecture.md`](../.claude/knowledge/backend/architecture.md)** — там зафиксированы слои (router → service → repository), паттерн Repository + Interface, применение SOLID к этому проекту, структура каталогов и скелеты кода для копирования.

Контракт с фронтендом — [`.claude/knowledge/api-contract.md`](../.claude/knowledge/api-contract.md). Меняешь форму запроса или ответа — правь контракт в том же коммите, иначе фронт и бэк разъедутся.

## Кодстайл

Ruff (линтер + форматтер) и mypy в strict-режиме, конфиг в `pyproject.toml`. Команды названы так же, как на фронте:

```bash
make check   # формат + линт + типы — перед коммитом и в CI
make fix     # отформатировать и починить всё автоисправимое
```

Почему выбраны именно эти правила и какие две настройки нельзя убирать не разобравшись — [architecture.md §12](../.claude/knowledge/backend/architecture.md#12-кодстайл-и-инструменты).

Фронтенд-агент код в этой папке не пишет и не меняет без явной просьбы пользователя.
