import type { AppDocument } from "@bildo/api";

interface MockApp {
  id: string;
  name: string;
  updatedAt: string;
}

const ACCENTS: Record<string, string> = {
  "mock-catalog": "#E4580C",
  "mock-social": "#5C6CF5",
  "mock-habits": "#16A34A",
  "mock-shop": "#0B0B0D",
  "mock-forms": "#7C3AED",
};

function buildMockDocument(id: string, name: string): AppDocument {
  const accent = ACCENTS[id] ?? "#5C6CF5";
  const now = new Date().toISOString();
  const theme = {
    colorBg: "#FFFFFF",
    colorSurface: "#F4F4F5",
    colorBorder: "#E4E4EA",
    colorText: "#101014",
    colorTextMuted: "#5B5B66",
    colorPrimary: accent,
    colorPrimaryFg: "#FFFFFF",
    radiusBase: "14px",
    fontBody: "System",
    fontHeading: "System",
  };

  return {
    id,
    name,
    theme,
    navigation: { type: "tabs", roots: ["index", "profile"] },
    createdAt: now,
    updatedAt: now,
    screens: [
      {
        id: "index",
        name: "Главная",
        route: "index",
        icon: "home",
        root: {
          id: "root-index",
          type: "View",
          layout: { x: 0, y: 0, width: 370, height: 640 },
          style: { backgroundColor: theme.colorBg },
          children: [
            {
              id: "title",
              type: "Text",
              layout: { x: 24, y: 72, width: 322, height: 40 },
              style: { fontSize: 26, fontWeight: "700", color: theme.colorText },
              props: { text: name },
            },
            {
              id: "subtitle",
              type: "Text",
              layout: { x: 24, y: 116, width: 322, height: 44 },
              style: { fontSize: 15, color: theme.colorTextMuted },
              props: { text: "Демо-превью для проверки флоу." },
            },
            {
              id: "card",
              type: "View",
              layout: { x: 24, y: 184, width: 322, height: 168 },
              style: {
                backgroundColor: theme.colorSurface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colorBorder,
              },
            },
            {
              id: "card-label",
              type: "Text",
              layout: { x: 44, y: 300, width: 240, height: 28 },
              style: { fontSize: 18, fontWeight: "600", color: theme.colorText },
              props: { text: "Карточка контента" },
            },
            {
              id: "cta",
              type: "Button",
              layout: { x: 24, y: 560, width: 322, height: 52 },
              style: { borderRadius: 14, fontSize: 15, fontWeight: "600" },
              props: { text: "Нажми меня", onPress: [{ type: "toast", message: "Работает 🎉" }] },
            },
          ],
        },
      },
      {
        id: "profile",
        name: "Профиль",
        route: "profile",
        icon: "user",
        root: {
          id: "root-profile",
          type: "View",
          layout: { x: 0, y: 0, width: 370, height: 640 },
          style: { backgroundColor: theme.colorBg },
          children: [
            {
              id: "p-title",
              type: "Text",
              layout: { x: 24, y: 72, width: 322, height: 40 },
              style: { fontSize: 26, fontWeight: "700", color: theme.colorText },
              props: { text: "Профиль" },
            },
            {
              id: "p-note",
              type: "Text",
              layout: { x: 24, y: 116, width: 322, height: 60 },
              style: { fontSize: 15, color: theme.colorTextMuted },
              props: { text: "Второй экран. Тапай по табам внизу — навигация живая." },
            },
            {
              id: "back",
              type: "Button",
              layout: { x: 24, y: 560, width: 322, height: 52 },
              style: { borderRadius: 14, fontSize: 15, fontWeight: "600" },
              props: { text: "На главную", onPress: [{ type: "navigate", route: "index" }] },
            },
          ],
        },
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function installApiMocks(): void {
  const now = Date.now();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  let apps: MockApp[] = [
    { id: "mock-catalog", name: "Каталог", updatedAt: iso(3) },
    { id: "mock-social", name: "Соцсеть с лентой, поиском и профилем", updatedAt: iso(28) },
    { id: "mock-habits", name: "Трекер привычек", updatedAt: iso(1500) },
    { id: "mock-shop", name: "Магазин кроссовок", updatedAt: iso(2880) },
    { id: "mock-forms", name: "Опросник для мероприятия", updatedAt: iso(20000) },
  ];

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.endsWith("/api/apps") && method === "GET") {
      await delay(600);
      return jsonResponse({ apps });
    }

    const idMatch = /\/api\/apps\/([^/?]+)$/.exec(url);

    if (idMatch && method === "GET") {
      await delay(500);
      const id = idMatch[1] ?? "";
      const name = apps.find((app) => app.id === id)?.name ?? "Приложение";
      return jsonResponse({ id, name, document: buildMockDocument(id, name) });
    }

    if (idMatch && method === "DELETE") {
      await delay(400);
      apps = apps.filter((app) => app.id !== idMatch[1]);
      return jsonResponse({ ok: true });
    }

    return original(input, init);
  };
}
