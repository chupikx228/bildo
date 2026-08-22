# Тесты фронтенда

Как запускать тесты, где они лежат и как устроен тулинг. Актуально на BIL-23.

## Команды

Из `frontend/`:

- `pnpm test` — юнит- и компонентные тесты один раз (Turbo раскидает по пакетам: `@bildo/api` и `@bildo/web`).
- `pnpm --filter @bildo/web test:watch` / `pnpm --filter @bildo/api test:watch` — watch-режим по конкретному пакету.
- `pnpm test:e2e` — Playwright e2e (`@bildo/web`). Поднимает dev-сервер сам, ставить руками ничего не нужно; из свежего клона один раз выполнить `pnpm --filter @bildo/web exec playwright install chromium`, чтобы скачать браузер.
- `pnpm --filter @bildo/web test:e2e:ui` — Playwright в интерактивном UI-режиме для отладки.

CI (`.github/workflows/frontend.yml`) — два джоба: `check` гоняет `pnpm check`, `pnpm test` и `pnpm build`; отдельный `e2e` ставит chromium (`playwright install --with-deps chromium`) и гоняет `pnpm test:e2e`. Оба должны быть зелёными.

## Стек

- **Vitest** — раннер для unit- и component-тестов, естественный выбор для Vite-проекта (переиспользует `vite.config.ts`).
- **React Testing Library** (`@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`) — компонентные тесты.
- **happy-dom** — DOM-окружение для компонентных тестов (легче jsdom).
- **Playwright** (`@playwright/test`, только chromium) — e2e против запущенного приложения.

## Где лежат тесты

Юниты/компоненты — рядом с кодом, который проверяют, по FSD-слайсам: `*.test.ts` / `*.test.tsx` в той же папке, что и модуль. Слайсы импортируются как обычно (через публичный API или относительным путём внутри слайса).

E2e-спеки — отдельно, в `apps/web/e2e/*.spec.ts` (не в `src`, поэтому Vitest их не подхватывает, а Playwright — только их). Конфиг — `apps/web/playwright.config.ts`; `e2e/` и `playwright.config.ts` добавлены в `include` `tsconfig.json`, чтобы их покрывали типы и линт.

Что покрыто сейчас:

| Файл | Что проверяет |
|---|---|
| `packages/api/src/apps/model.test.ts` | zod-схемы `AppDocument`: валидные документы, отсутствующие опциональные поля vs `null` (контракт: `.optional()`, не `.nullable()`), битые документы, дискриминированный union действий |
| `packages/api/src/apps/tree.test.ts` | операции над деревом узлов: `findAppNode`/`findParentNode`, `updateNodeById` (частичный merge), `insertChild`, `cloneNodeDeep` (новые id, offset) |
| `packages/api/src/apps/normalize.test.ts` | `normalizeAppDocument` (дедуп маршрутов, починка `navigation.roots`, merge темы, миграция layout), `clampLayout`, `defaultLayoutForType` |
| `apps/web/src/entities/app-document/model/store.test.ts` | стор редактора: выделение, история undo/redo, склейка правок, AI-батч, guard-сообщения |
| `apps/web/src/features/refine-app-from-chat/model/commands.test.ts` | парсер команд ассистента `parseRefineMessage` (текст → патчи, крайние случаи) и применение к стору через `refineAppFromMessage` |
| `apps/web/src/entities/app-document/lib/codegen.test.ts` | `AppDocument` → файлы Expo: снапшот вывода на документе максимального покрытия (дополняет backend cross-generator parity тест) |
| `apps/web/src/shared/lib/*.test.ts` | `buildFileTree`/`fileAccent`, `clamp`, `formatWhen` |
| `apps/web/src/shared/ui/*.test.tsx` | контролы `NumberField` (`StepNumber`/`CompactNumber`) и `AlignPad` |

Тесты покрывают не только happy path: крайние случаи, границы, невалидный ввод.

E2e-спеки (`apps/web/e2e/`) покрывают основные пользовательские потоки:

| Спека | Поток |
|---|---|
| `landing.spec.ts` | лендинг: кнопка «Создать» активна от 3 символов, отправка промпта → редактор, пример в один клик |
| `editor.spec.ts` | редактор: выделение узла → инспектор показывает его свойства; undo/redo правки текста |
| `apps-modal.spec.ts` | модалка «Мои приложения»: список карточек, удаление с подтверждением, пустое состояние |
| `public-preview.spec.ts` | публичное превью `/p/[id]`: приложение рендерится read-only, без редактора |

## E2e: мок API и dev-сервер

E2e не ходят на реальный бэкенд — HTTP-слой мокается на уровне браузера. Хелпер `apps/web/e2e/mock.ts` (`installApiMocks`) перехватывает запросы по `url.pathname.startsWith("/api/")` и отвечает фикстурами (создание, чтение, сохранение, список, удаление со stateful-списком в замыкании).

**Важно про матчер:** нельзя ловить по глобу `**/api/**` — под него попадает и модуль воркспейса `@bildo/api`, который Vite отдаёт с пути `.../packages/api/src/...`; тогда мок вернёт 404 на собственный код приложения, и страница не поднимется. Матчить только префикс пути `/api/`.

Playwright сам поднимает dev-сервер (`webServer: pnpm dev`, порт 5173) и переиспользует уже запущенный локально (`reuseExistingServer` вне CI). Клики по узлам на канвасе идут с `{ force: true }` — узел перекрыт собственными вложенными слоями, но событие всплывает к его обработчику (это ожидаемо, а не хак вокруг бага). Тяжёлые взаимодействия канваса (drag/resize) намеренно не в e2e — логику, которую они дёргают, покрывает юнит-тест стора.

## Два окружения по расширению файла

В `apps/web` Vitest настроен через `test.projects` в `vite.config.ts` — окружение выбирается по расширению теста:

- **`*.test.ts` → node** (проект `unit`): чистая логика без DOM (стор, кодоген, утилиты). Быстро, без лишнего окружения.
- **`*.test.tsx` → happy-dom** (проект `dom`): компонентные тесты, `setupFiles: ./src/test/setup.ts`.

`src/test/setup.ts` подключает матчеры `@testing-library/jest-dom` (`toBeInTheDocument`, `toHaveValue`, …) и регистрирует `afterEach(cleanup)` — авто-очистка RTL не включается, потому что `globals` намеренно выключены (хелперы импортируются из `vitest`/`@testing-library/react` явно, как в существующих тестах).

`packages/api` не зависит от Vite, поэтому у него собственный минимальный `vitest.config.ts` (node-окружение) и свои скрипты `test`/`test:watch`. Модель — чистый zod, DOM ему не нужен.

## React Compiler и тесты

Компилятор (`babel-plugin-react-compiler`) применяется и к тестам через `extends: true` в проектах — компоненты в тестах прогоняются скомпилированными. Правило то же, что уже проверяет ESLint: компоненты и хуки только на верхнем уровне модуля, никаких определений внутри тела компонента.
