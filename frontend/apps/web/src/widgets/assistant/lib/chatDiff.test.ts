import { describe, expect, it } from "vitest";
import { DEFAULT_APP_THEME, type AppDocument } from "@bildo/api";
import { chatDiff } from "./chatDiff";

function doc(): AppDocument {
  return {
    id: "app1",
    name: "App",
    theme: DEFAULT_APP_THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [{ id: "s1", name: "Home", route: "index", root: { id: "root1", type: "View" } }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("chatDiff", () => {
  it("reports no changes for identical documents", () => {
    const result = chatDiff(doc(), doc());
    expect(result.diff).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("reports an added file when a screen is added", () => {
    const current = doc();
    const proposed: AppDocument = {
      ...doc(),
      navigation: { type: "stack", roots: ["s1", "s2"] },
      screens: [...doc().screens, { id: "s2", name: "Profile", route: "profile", root: { id: "root2", type: "View" } }],
    };
    const result = chatDiff(current, proposed);
    expect(result.files.some((f) => f.path === "app/profile.tsx")).toBe(true);
    expect(result.diff.some((d) => d.tone === "add")).toBe(true);
  });

  it("reports a modified file when the theme changes", () => {
    const current = doc();
    const proposed: AppDocument = { ...doc(), theme: { ...DEFAULT_APP_THEME, colorBg: "#000000" } };
    const result = chatDiff(current, proposed);
    expect(result.files.some((f) => f.path === "theme.ts" && f.stat === "~")).toBe(true);
    expect(result.diff.some((d) => d.tone === "mod")).toBe(true);
  });
});
