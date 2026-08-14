# apps/mobile

Зарезервировано под будущее мобильное приложение (Expo/React Native). Кода пока нет.

Когда дойдёт очередь — контекст и правила в [.claude/knowledge/frontend/overview.md](../../../.claude/knowledge/frontend/overview.md). Коротко: переиспользуется `frontend/packages/api` (модели `AppDocument`/`AppNode`, REST-клиент, TanStack Query хуки) как есть — это единственный общий слой с `apps/web`. Весь UI (доска, инспектор, чат, слои) пишется заново под RN-примитивы, не переносится из веба.
