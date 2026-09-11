import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ApiClientProvider,
  APP_STAGE_HEIGHT,
  APP_STAGE_WIDTH,
  appsKeys,
  createApiClient,
  DEFAULT_APP_THEME,
  useSaveApp,
  type AppDocument,
  type AppSummary,
} from "@bildo/api";

function makeDoc(overrides: Partial<AppDocument> = {}): AppDocument {
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
          children: [],
        },
      },
    ],
    revision: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSaveApp", () => {
  it("updates the apps-list cache in place on a successful save without refetching the list", async () => {
    const saved = makeDoc({ name: "Renamed", updatedAt: "2026-02-02T00:00:00.000Z" });
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, document: saved }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({
      defaultOptions: { queries: { networkMode: "always" }, mutations: { networkMode: "always" } },
    });
    qc.setQueryData<AppSummary[]>(appsKeys.list(), [
      { id: "app1", name: "Old name", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "app2", name: "Other", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);

    const client = createApiClient({ baseUrl: "" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ApiClientProvider client={client}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useSaveApp("app1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(saved);
    });

    const list = qc.getQueryData<AppSummary[]>(appsKeys.list());
    expect(list?.find((a) => a.id === "app1")).toEqual({
      id: "app1",
      name: "Renamed",
      updatedAt: "2026-02-02T00:00:00.000Z",
    });
    expect(list?.find((a) => a.id === "app2")).toEqual({
      id: "app2",
      name: "Other",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
  });
});
