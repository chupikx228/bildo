import { describe, expect, it } from "vitest";
import { DEFAULT_APP_THEME, type AppDocument, type ChatMessage } from "@bildo/api";
import { mapMessages } from "./messages";

function doc(name = "App"): AppDocument {
  return {
    id: "app1",
    name,
    theme: DEFAULT_APP_THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [{ id: "s1", name: "Home", route: "index", root: { id: "root1", type: "View" } }],
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "content">): ChatMessage {
  return {
    proposedDocument: null,
    accepted: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("mapMessages", () => {
  it("maps a user message to a user turn", () => {
    const turns = mapMessages([msg({ id: "m1", role: "user", content: "привет" })], null);
    expect(turns).toEqual([{ id: "m1", role: "user", text: "привет" }]);
  });

  it("maps a plain assistant reply to an ai turn without a proposal", () => {
    const turns = mapMessages([msg({ id: "m2", role: "assistant", content: "готово" })], null);
    expect(turns).toEqual([{ id: "m2", role: "ai", text: "готово" }]);
  });

  it("maps an undecided proposal to an ai turn carrying a proposal", () => {
    const turns = mapMessages(
      [msg({ id: "m3", role: "assistant", content: "предложение", proposedDocument: doc("Changed") })],
      doc("App"),
    );
    expect(turns).toHaveLength(1);
    const turn = turns[0]!;
    expect(turn.role === "ai" && turn.proposal?.id).toBe("m3");
    expect(turn.role === "ai" && (turn.proposal?.diff.length ?? 0)).toBeGreaterThan(0);
  });

  it("maps an accepted proposal to an ai turn plus a commit card", () => {
    const turns = mapMessages(
      [msg({ id: "m4", role: "assistant", content: "принято", proposedDocument: doc(), accepted: true })],
      doc(),
    );
    expect(turns.map((t) => t.role)).toEqual(["ai", "commit"]);
  });

  it("maps a rejected proposal to an ai turn plus a note", () => {
    const turns = mapMessages(
      [msg({ id: "m5", role: "assistant", content: "отклонено", proposedDocument: doc(), accepted: false })],
      doc(),
    );
    expect(turns.map((t) => t.role)).toEqual(["ai", "note"]);
  });
});
