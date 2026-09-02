import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type * as BildoApi from "@bildo/api";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, DEFAULT_APP_THEME, type AppDocument, type ChatMessage } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { useAssistantThread } from "./useAssistantThread";
import type { Proposal } from "./planner";

const hoisted = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  decide: vi.fn<(input: { messageId: string; accepted: boolean }) => void>(),
}));

vi.mock("@bildo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof BildoApi>();
  return {
    ...actual,
    useChatMessages: () => ({ data: hoisted.messages, refetch: vi.fn() }),
    useSendChatMessage: () => ({ mutate: vi.fn(), isPending: false }),
    useChatDecision: () => ({ mutate: hoisted.decide }),
    useTaskStatus: () => ({ data: undefined }),
  };
});

function makeDoc(revision: number, name = "Test App"): AppDocument {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "app1",
    name,
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
    revision,
    createdAt: now,
    updatedAt: now,
  };
}

function proposalMessage(proposed: AppDocument): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "Обновление",
    proposedDocument: proposed,
    accepted: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const store = () => useAppDocumentStore.getState();
const FAKE_PROPOSAL = { id: "m1" } as Proposal;

beforeEach(() => {
  hoisted.decide.mockReset();
  act(() => {
    store().setDocument(makeDoc(2));
  });
});

describe("useAssistantThread.resolve — stale proposal guard", () => {
  it("blocks a proposal generated against an older revision and surfaces a note", () => {
    hoisted.messages = [proposalMessage(makeDoc(1, "Proposed"))];
    const { result } = renderHook(() => useAssistantThread("app1"));

    act(() => {
      result.current.resolve("m1", FAKE_PROPOSAL, true);
    });

    expect(store().document!.name).toBe("Test App");
    expect(hoisted.decide).not.toHaveBeenCalled();
    expect(result.current.turns.some((t) => t.role === "note" && t.text.includes("устарело"))).toBe(true);
  });

  it("applies a proposal whose revision matches the current document", () => {
    hoisted.messages = [proposalMessage(makeDoc(2, "Proposed"))];
    const { result } = renderHook(() => useAssistantThread("app1"));

    act(() => {
      result.current.resolve("m1", FAKE_PROPOSAL, true);
    });

    expect(store().document!.name).toBe("Proposed");
    expect(hoisted.decide).toHaveBeenCalledWith({ messageId: "m1", accepted: true });
  });

  it("still records a rejection without touching the document", () => {
    hoisted.messages = [proposalMessage(makeDoc(1, "Proposed"))];
    const { result } = renderHook(() => useAssistantThread("app1"));

    act(() => {
      result.current.resolve("m1", FAKE_PROPOSAL, false);
    });

    expect(store().document!.name).toBe("Test App");
    expect(hoisted.decide).toHaveBeenCalledWith({ messageId: "m1", accepted: false });
  });
});
