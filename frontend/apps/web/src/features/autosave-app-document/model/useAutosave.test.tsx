import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as BildoApi from "@bildo/api";
import {
  APP_STAGE_HEIGHT,
  APP_STAGE_WIDTH,
  ApiError,
  DEFAULT_APP_THEME,
  appsKeys,
  findAppNode,
  type AppDetail,
  type AppDocument,
} from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { useAutosave } from "./useAutosave";

const AUTOSAVE_MS = 1200;

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

const hoisted = vi.hoisted(() => ({
  mutateAsync: vi.fn<(doc: AppDocument) => Promise<AppDocument>>(),
}));

vi.mock("@bildo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof BildoApi>();
  return { ...actual, useSaveApp: () => ({ mutateAsync: hoisted.mutateAsync }) };
});

interface PendingSave {
  doc: AppDocument;
  resolve: (document: AppDocument) => void;
  reject: (error: unknown) => void;
}

const pending: PendingSave[] = [];

function makeDoc(): AppDocument {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "app1",
    name: "Test App",
    theme: DEFAULT_APP_THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [
      {
        id: "s1",
        name: "Home",
        route: "index",
        root: {
          id: "root1",
          type: "View",
          name: "Root",
          layout: { x: 0, y: 0, width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT },
          children: [
            {
              id: "n1",
              type: "Text",
              name: "Hello",
              props: { text: "Hello" },
              layout: { x: 16, y: 24, width: 120, height: 36 },
            },
          ],
        },
      },
    ],
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

const store = () => useAppDocumentStore.getState();
const textOf = (doc: AppDocument) => findAppNode(doc.screens[0]!.root, "n1")?.props?.text;

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function tick(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
  });
}

async function respond(save: PendingSave, revision: number): Promise<void> {
  save.resolve({ ...save.doc, revision });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  pending.length = 0;
  hoisted.mutateAsync.mockReset();
  hoisted.mutateAsync.mockImplementation(
    (doc) =>
      new Promise<AppDocument>((resolve, reject) => {
        pending.push({ doc, resolve, reject });
      }),
  );
  act(() => {
    store().setDocument(makeDoc());
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("сохраняет документ после дебаунса и берёт ревизию из ответа", async () => {
    renderHook(() => useAutosave("app1"), { wrapper });

    act(() => {
      store().setNodeText("s1", "n1", "Правка");
    });
    expect(store().saveStatus).toBe("dirty");

    await tick();

    expect(pending).toHaveLength(1);
    expect(pending[0]!.doc.revision).toBe(1);
    expect(textOf(pending[0]!.doc)).toBe("Правка");
    expect(store().saveStatus).toBe("saving");

    await respond(pending[0]!, 2);

    expect(store().document?.revision).toBe(2);
    expect(store().saveStatus).toBe("saved");

    await tick();
    expect(pending).toHaveLength(1);
  });

  it("не теряет правку, сделанную пока PUT был в полёте", async () => {
    renderHook(() => useAutosave("app1"), { wrapper });

    act(() => {
      store().setNodeText("s1", "n1", "Первая правка");
    });
    await tick();
    expect(pending).toHaveLength(1);
    expect(textOf(pending[0]!.doc)).toBe("Первая правка");

    act(() => {
      store().setNodeText("s1", "n1", "Правка во время запроса");
    });

    await respond(pending[0]!, 2);

    expect(store().document?.revision).toBe(2);
    expect(textOf(store().document!)).toBe("Правка во время запроса");
    expect(store().saveStatus).not.toBe("saved");
    expect(store().saveStatus).toBe("dirty");

    await tick();

    expect(pending).toHaveLength(2);
    expect(pending[1]!.doc.revision).toBe(2);
    expect(textOf(pending[1]!.doc)).toBe("Правка во время запроса");

    await respond(pending[1]!, 3);
    expect(store().saveStatus).toBe("saved");
    expect(store().document?.revision).toBe(3);
  });

  it("не отправляет второй PUT поверх летящего и шлёт самое актуальное состояние", async () => {
    const { result } = renderHook(() => useAutosave("app1"), { wrapper });

    act(() => {
      store().setNodeText("s1", "n1", "A");
    });
    await tick();
    expect(pending).toHaveLength(1);

    act(() => {
      store().setNodeText("s1", "n1", "B");
    });

    let flushed: Promise<boolean> | null = null;
    act(() => {
      flushed = result.current.flush();
    });
    await settle();
    expect(pending).toHaveLength(1);

    await respond(pending[0]!, 2);

    expect(pending).toHaveLength(2);
    expect(pending[1]!.doc.revision).toBe(2);
    expect(textOf(pending[1]!.doc)).toBe("B");

    await respond(pending[1]!, 3);
    await expect(flushed).resolves.toBe(true);
    expect(store().saveStatus).toBe("saved");
  });

  it("показывает ошибку и оставляет документ несохранённым, если PUT отклонён", async () => {
    renderHook(() => useAutosave("app1"), { wrapper });

    act(() => {
      store().setNodeText("s1", "n1", "Правка");
    });
    await tick();

    pending[0]!.reject(new Error("boom"));
    await settle();

    expect(store().saveStatus).toBe("error");
    expect(store().saveError).toBe("Не удалось сохранить");
  });

  it("на 412 загружает серверную версию и помечает ошибку, отдельно от 409", async () => {
    renderHook(() => useAutosave("app1"), { wrapper });

    act(() => {
      store().setNodeText("s1", "n1", "Локальная правка поверх устаревшей ревизии");
    });
    await tick();
    expect(pending).toHaveLength(1);

    const serverDetail: AppDetail = {
      document: { ...makeDoc(), name: "Серверная версия", revision: 5 },
      generationStatus: "ready",
      generationError: null,
    };
    queryClient.setQueryData(appsKeys.detail("app1"), serverDetail);

    pending[0]!.reject(new ApiError("stale", 412));
    await settle();

    expect(store().saveStatus).toBe("error");
    expect(store().document?.name).toBe("Серверная версия");
    expect(store().document?.revision).toBe(5);
  });
});
