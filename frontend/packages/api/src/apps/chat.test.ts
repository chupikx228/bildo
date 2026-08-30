import { describe, expect, it } from "vitest";
import { chatMessageSchema, taskStatusSchema } from "./chat";
import { DEFAULT_APP_THEME, type AppDocument } from "./model";

function doc(): AppDocument {
  return {
    id: "app1",
    name: "App",
    theme: DEFAULT_APP_THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [{ id: "s1", name: "Home", route: "index", root: { id: "root1", type: "View" } }],
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("chatMessageSchema", () => {
  it("parses a user message with null proposal and decision", () => {
    const parsed = chatMessageSchema.parse({
      id: "m1",
      role: "user",
      content: "привет",
      proposedDocument: null,
      accepted: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.proposedDocument).toBeNull();
    expect(parsed.accepted).toBeNull();
  });

  it("parses an assistant proposal carrying a full document and a decision", () => {
    const parsed = chatMessageSchema.parse({
      id: "m2",
      role: "assistant",
      content: "предлагаю",
      proposedDocument: doc(),
      accepted: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.proposedDocument?.screens).toHaveLength(1);
    expect(parsed.accepted).toBe(true);
  });

  it("requires proposedDocument and accepted keys to be present (null, not absent)", () => {
    const base = { id: "m3", role: "assistant", content: "x", createdAt: "2026-01-01T00:00:00.000Z" };
    expect(() => chatMessageSchema.parse({ ...base, accepted: null })).toThrow();
    expect(() => chatMessageSchema.parse({ ...base, proposedDocument: null })).toThrow();
  });

  it("rejects an unknown role", () => {
    expect(() =>
      chatMessageSchema.parse({
        id: "m4",
        role: "system",
        content: "x",
        proposedDocument: null,
        accepted: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("taskStatusSchema", () => {
  it("parses a completed task with a null error", () => {
    const parsed = taskStatusSchema.parse({ id: "t1", status: "complete", result: null, error: null });
    expect(parsed.status).toBe("complete");
    expect(parsed.error).toBeNull();
  });

  it("parses a failed task carrying an error string", () => {
    const parsed = taskStatusSchema.parse({ id: "t2", status: "complete", result: null, error: "boom" });
    expect(parsed.error).toBe("boom");
  });

  it("accepts not_found and rejects an unknown status", () => {
    expect(taskStatusSchema.parse({ id: "t3", status: "not_found", result: null, error: null }).status).toBe(
      "not_found",
    );
    expect(() => taskStatusSchema.parse({ id: "t4", status: "running", result: null, error: null })).toThrow();
  });
});
