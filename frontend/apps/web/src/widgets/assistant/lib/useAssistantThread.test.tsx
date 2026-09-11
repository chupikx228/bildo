import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as BildoApi from "@bildo/api";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, DEFAULT_APP_THEME, type AppDocument, type ChatMessage } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { useAssistantThread } from "./useAssistantThread";
import type { Proposal } from "./planner";

const hoisted = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  decisionMutate: vi.fn<(input: { messageId: string; accepted: boolean }) => void>(),
}));

vi.mock("@bildo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof BildoApi>();
  return {
    ...actual,
    useChatMessages: () => ({ data: hoisted.messages, refetch: vi.fn() }),
    useSendChatMessage: () => ({ mutate: vi.fn(), isPending: false }),
    useChatDecision: () => ({ mutate: hoisted.decisionMutate }),
    useTaskStatus: () => ({ data: undefined }),
  };
});

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
    revision: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function assistantMessage(proposed: AppDocument): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "Готово",
    proposedDocument: proposed,
    accepted: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const store = () => useAppDocumentStore.getState();
const dummyProposal = {} as unknown as Proposal;

beforeEach(() => {
  hoisted.decisionMutate.mockReset();
  store().setDocument(makeDoc({ name: "Test App", revision: 5 }));
});

afterEach(() => {
  hoisted.messages = [];
});

describe("useAssistantThread.resolve", () => {
  it("does not apply a stale proposal and surfaces a conflict note", () => {
    hoisted.messages = [assistantMessage(makeDoc({ name: "Proposed", revision: 3 }))];
    const { result } = renderHook(() => useAssistantThread("app1"));

    act(() => {
      result.current.resolve("m1", dummyProposal, true);
    });

    expect(store().document?.name).toBe("Test App");
    expect(store().document?.revision).toBe(5);
    expect(hoisted.decisionMutate).not.toHaveBeenCalled();
    expect(result.current.turns.some((t) => t.role === "note")).toBe(true);
  });

  it("applies a proposal whose revision matches the current document", () => {
    hoisted.messages = [assistantMessage(makeDoc({ name: "Proposed", revision: 5 }))];
    const { result } = renderHook(() => useAssistantThread("app1"));

    act(() => {
      result.current.resolve("m1", dummyProposal, true);
    });

    expect(store().document?.name).toBe("Proposed");
    expect(hoisted.decisionMutate).toHaveBeenCalledWith({ messageId: "m1", accepted: true });
  });
});
