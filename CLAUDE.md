# Bildo

Веб-редактор для создания мобильных приложений: пользователь описывает идею словами, система собирает приложение из экранов, дальше он правит его визуально на бесконечной доске или через AI-чат, смотрит превью, делится ссылкой и экспортирует Expo-проект.

Весь контекст для работы над проектом разложен по темам — не дублируй его здесь, читай по ссылкам:

| Файл | О чём |
|---|---|
| [product.md](.claude/knowledge/product.md) | что за продукт, модель данных `AppDocument`, все экраны, сохранение и история |
| [design-system.md](.claude/knowledge/design-system.md) | цвета, типографика, геометрия, компоненты, анимация — значения обязательны |
| [api-contract.md](.claude/knowledge/api-contract.md) | эндпоинты, формы запросов и ответов, что ещё не специфицировано |
| [frontend/overview.md](.claude/knowledge/frontend/overview.md) | стек, структура монорепо, что перенесено из прототипа, кодстайл, команды |
| [frontend/fsd.md](.claude/knowledge/frontend/fsd.md) | слои FSD, сегменты, публичный API слайса, правила стилей |
| [frontend/state-management.md](.claude/knowledge/frontend/state-management.md) | Zustand против TanStack Query — чей какой кусок состояния |
| [backend/overview.md](.claude/knowledge/backend/overview.md) | стек бэкенда и с чем интегрируется фронт |
| [backend/architecture.md](.claude/knowledge/backend/architecture.md) | слои, Repository + Interface, SOLID, скелеты кода |
| [CONTRIBUTING.md](CONTRIBUTING.md) | ветки, Conventional Commits, задачи в Jira, пул-реквесты |

Строки ниже — те же файлы директивами импорта Claude Code. Кликать по ним не нужно и не получится: это не ссылки, а команда подставить содержимое файлов в начало сессии. Кликабельные — в таблице выше. Добавляешь файл в таблицу — добавь и сюда, иначе агент его не прочитает.

@.claude/knowledge/product.md
@.claude/knowledge/design-system.md
@.claude/knowledge/api-contract.md
@.claude/knowledge/frontend/overview.md
@.claude/knowledge/frontend/fsd.md
@.claude/knowledge/frontend/state-management.md
@.claude/knowledge/backend/overview.md
@.claude/knowledge/backend/architecture.md
@CONTRIBUTING.md

## Расположение кода

- `frontend/` — весь фронтенд (веб сейчас, мобильное приложение позже). Монорепо на pnpm + Turborepo.
- `backend/` — бэкенд на Python/FastAPI. Чужая территория: не пиши и не меняй код здесь, если явно не попросили. Контекст о нём — только для того, чтобы фронтенд проектировался совместимо с ним.

## Правила, общие для всего репозитория

- Комментариев в коде не пишем, только там, где неочевидна причина (не что, а зачем).
- Только TypeScript на фронтенде, строгая типизация, без `any`.
- Не создавай абстракции сверх того, что нужно для текущей задачи.
- Перед реализацией ищи существующий паттерн в `frontend/` и переиспользуй его — не изобретай новый без причины.
- Ветки, сообщения коммитов и пул-реквесты — строго по [CONTRIBUTING.md](CONTRIBUTING.md): Conventional Commits, весь текст коммита на английском (документация в репозитории остаётся на русском), тип и область по-английски, ключ задачи Jira `BIL-<номер>` в имени ветки, футере коммита и заголовке PR. Ключа не знаешь — спроси, не выдумывай номер. Там же список файлов, которые обязаны меняться в одном коммите (форма `AppDocument`, эндпоинты, контракты import-linter) — эти пары расходятся молча, поэтому сверяйся с ним перед тем, как предлагать коммит.
