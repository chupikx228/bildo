import type { Page, Route } from "@playwright/test";

const THEME = {
  colorBg: "#09090B",
  colorSurface: "#18181B",
  colorBorder: "#27272A",
  colorText: "#FAFAFA",
  colorTextMuted: "#A1A1AA",
  colorPrimary: "#5C6CF5",
  colorPrimaryFg: "#FFFFFF",
  radiusBase: "12px",
  fontBody: "System",
  fontHeading: "System",
};

export const NEW_APP_ID = "app-new";

export interface AppSummaryFixture {
  id: string;
  name: string;
  updatedAt: string;
}

export function makeDocument(id: string, name = "Demo App") {
  return {
    id,
    name,
    theme: THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [
      {
        id: "s1",
        name: "Home",
        route: "index",
        root: {
          id: "root1",
          type: "View",
          layout: { x: 0, y: 0, width: 370, height: 640 },
          children: [
            {
              id: "n-hello",
              type: "Text",
              name: "Hello",
              props: { text: "Hello" },
              layout: { x: 24, y: 60, width: 180, height: 40 },
            },
            { id: "n-tap", type: "Button", props: { text: "Tap" }, layout: { x: 24, y: 120, width: 160, height: 48 } },
          ],
        },
      },
    ],
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function readyDetail(id: string, name = "Demo App") {
  return { id, name, document: makeDocument(id, name), generationStatus: "ready", generationError: null };
}

interface ChatMessageFixture {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposedDocument: ReturnType<typeof makeDocument> | null;
  accepted: boolean | null;
  createdAt: string;
}

function makeChatMessage(id: string, role: "user" | "assistant", content: string): ChatMessageFixture {
  return { id, role, content, proposedDocument: null, accepted: null, createdAt: "2026-01-01T00:00:00.000Z" };
}

interface MockOptions {
  apps?: AppSummaryFixture[];
}

export async function installApiMocks(page: Page, options: MockOptions = {}): Promise<void> {
  const apps = new Map<string, AppSummaryFixture>();
  for (const app of options.apps ?? []) apps.set(app.id, app);

  const chats = new Map<string, ChatMessageFixture[]>();
  const getChat = (id: string) => {
    const existing = chats.get(id);
    if (existing) return existing;
    const fresh: ChatMessageFixture[] = [];
    chats.set(id, fresh);
    return fresh;
  };

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname.replace(/^\/api/, "");
      const idMatch = /^\/apps\/([^/]+)$/.exec(path);
      const chatMatch = /^\/apps\/([^/]+)\/chat\/messages$/.exec(path);
      const decisionMatch = /^\/apps\/([^/]+)\/chat\/messages\/([^/]+)\/decision$/.exec(path);
      const taskMatch = /^\/tasks\/([^/]+)$/.exec(path);

      if (method === "GET" && chatMatch) {
        await json(route, 200, { messages: getChat(chatMatch[1]!) });
        return;
      }
      if (method === "POST" && chatMatch) {
        const appId = chatMatch[1]!;
        const content = (request.postDataJSON() as { content: string }).content;
        const chat = getChat(appId);
        chat.push(makeChatMessage(`${appId}-u${chat.length}`, "user", content));
        chat.push({
          ...makeChatMessage(`${appId}-a${chat.length}`, "assistant", "Готово — предлагаю переименовать приложение."),
          proposedDocument: makeDocument(appId, "Renamed"),
        });
        await json(route, 202, { taskId: `task-${chat.length}` });
        return;
      }
      if (method === "POST" && decisionMatch) {
        const chat = getChat(decisionMatch[1]!);
        const accepted = (request.postDataJSON() as { accepted: boolean }).accepted;
        const message = chat.find((m) => m.id === decisionMatch[2]!);
        if (!message) {
          await json(route, 404, { error: "Сообщение не найдено" });
          return;
        }
        message.accepted = accepted;
        await json(route, 200, { ok: true, message });
        return;
      }
      if (method === "GET" && taskMatch) {
        await json(route, 200, { id: taskMatch[1]!, status: "complete", result: null, error: null });
        return;
      }

      if (method === "POST" && path === "/apps") {
        await json(route, 201, { id: NEW_APP_ID });
        return;
      }
      if (method === "GET" && path === "/models") {
        await json(route, 200, {
          models: [
            { id: "openai/gpt-5", name: "OpenAI: GPT-5", pro: true },
            { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", pro: false },
          ],
        });
        return;
      }
      if (method === "GET" && path === "/apps") {
        await json(route, 200, { apps: [...apps.values()] });
        return;
      }
      if (method === "GET" && idMatch) {
        const id = idMatch[1]!;
        const known = apps.get(id);
        await json(route, 200, readyDetail(id, known?.name));
        return;
      }
      if (method === "PUT" && idMatch) {
        await json(route, 200, { ok: true, document: makeDocument(idMatch[1]!) });
        return;
      }
      if (method === "DELETE" && idMatch) {
        apps.delete(idMatch[1]!);
        await json(route, 200, { ok: true });
        return;
      }
      await json(route, 404, { error: "Не найдено" });
    },
  );
}
