import { beforeEach, describe, expect, it } from "vitest";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, DEFAULT_APP_THEME, type AppDocument } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { parseRefineMessage, refineAppFromMessage } from "./commands";

describe("parseRefineMessage — screens", () => {
  it("adds a screen, with and without a name", () => {
    expect(parseRefineMessage("добавь экран")).toEqual([{ op: "addScreen" }]);
    expect(parseRefineMessage("добавь экран: «Профиль»")).toEqual([{ op: "addScreen", name: "Профиль" }]);
  });

  it("removes a screen", () => {
    expect(parseRefineMessage("удали экран")).toEqual([{ op: "removeScreen" }]);
  });

  it("renames a screen without also renaming the app", () => {
    const patches = parseRefineMessage("назови экран «Настройки»");
    expect(patches).toContainEqual({ op: "renameScreen", name: "Настройки" });
    expect(patches.some((p) => p.op === "renameApp")).toBe(false);
  });
});

describe("parseRefineMessage — theme", () => {
  it("switches to a dark palette", () => {
    const patches = parseRefineMessage("сделай dark theme");
    expect(patches).toContainEqual(expect.objectContaining({ op: "setTheme" }));
    const theme = patches.find((p) => p.op === "setTheme");
    expect(theme?.op === "setTheme" && theme.theme.colorBg).toBe("#09090B");
  });

  it("switches to a light palette", () => {
    const theme = parseRefineMessage("светлая тема").find((p) => p.op === "setTheme");
    expect(theme?.op === "setTheme" && theme.theme.colorBg).toBe("#FFFFFF");
  });

  it("maps accent colours by keyword", () => {
    const primary = (m: string) => {
      const p = parseRefineMessage(m).find((x) => x.op === "setTheme");
      return p?.op === "setTheme" ? p.theme.colorPrimary : undefined;
    };
    expect(primary("зелёный акцент")).toBe("#22C55E");
    expect(primary("оранжевый акцент")).toBe("#F59E0B");
    expect(primary("красный акцент")).toBe("#F43F5E");
  });
});

describe("parseRefineMessage — content", () => {
  it("sets text from a quoted or a colon form", () => {
    expect(parseRefineMessage("текст: «Привет»")).toContainEqual({ op: "setText", text: "Привет" });
    expect(parseRefineMessage("текст: Привет мир")).toContainEqual({ op: "setText", text: "Привет мир" });
  });

  it("adds a named button, and a default one from an imperative", () => {
    expect(parseRefineMessage("button «Save»")).toContainEqual({
      op: "addComponent",
      type: "Button",
      text: "Save",
    });
    expect(parseRefineMessage("добавь кнопку")).toContainEqual({ op: "addComponent", type: "Button", text: "OK" });
  });

  it("adds input, container and text components", () => {
    expect(parseRefineMessage("добавь поле")).toContainEqual({ op: "addComponent", type: "TextInput" });
    expect(parseRefineMessage("добавь карточку")).toContainEqual({ op: "addComponent", type: "View" });
    expect(parseRefineMessage("добавь текст")).toContainEqual({
      op: "addComponent",
      type: "Text",
      text: "Новый текст",
    });
  });

  it("renames the app", () => {
    expect(parseRefineMessage("назови «FitApp»")).toContainEqual({ op: "renameApp", name: "FitApp" });
    expect(parseRefineMessage("назови FitApp")).toContainEqual({ op: "renameApp", name: "FitApp" });
  });
});

describe("parseRefineMessage — misses and combinations", () => {
  it("returns no patches for an unrecognized message", () => {
    expect(parseRefineMessage("как дела?")).toEqual([]);
    expect(parseRefineMessage("   ")).toEqual([]);
  });

  it("collects several commands from one message", () => {
    const ops = parseRefineMessage("светлая тема, зелёный акцент, назови «FitApp»").map((p) => p.op);
    expect(ops).toEqual(["setTheme", "setTheme", "renameApp"]);
  });
});

function makeDoc(): AppDocument {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "app1",
    name: "Original",
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
          layout: { x: 0, y: 0, width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT },
          children: [{ id: "t1", type: "Text", props: { text: "Hi" }, layout: { x: 8, y: 8, width: 120, height: 30 } }],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

const store = () => useAppDocumentStore.getState();

describe("refineAppFromMessage — applied against the store", () => {
  beforeEach(() => {
    store().setDocument(makeDoc());
  });

  it("renames the app inside a closed, undoable AI turn", () => {
    const result = refineAppFromMessage("назови «FitApp»");
    expect(result.ok).toBe(true);
    expect(store().document!.name).toBe("FitApp");
    expect(store().aiBatch).toBe(false);
    expect(store().past.length).toBeGreaterThan(0);
  });

  it("applies several commands from a single message", () => {
    refineAppFromMessage("светлая тема, назови «FitApp»");
    expect(store().document!.name).toBe("FitApp");
    expect(store().document!.theme.colorBg).toBe("#FFFFFF");
  });

  it("fully unwinds an assistant turn once its checkpoints are drained", () => {
    refineAppFromMessage("назови «FitApp»");
    store().undo();
    store().undo();
    expect(store().document!.name).toBe("Original");
  });

  it("returns an error with help and touches nothing when nothing matches", () => {
    const result = refineAppFromMessage("привет");
    expect(result.ok).toBe(false);
    expect(store().document!.name).toBe("Original");
    expect(store().past).toHaveLength(0);
  });
});
