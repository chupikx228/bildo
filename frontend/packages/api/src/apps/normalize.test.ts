import { describe, expect, it } from "vitest";
import { clampLayout, defaultLayoutForType, normalizeAppDocument } from "./normalize";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, DEFAULT_APP_THEME, type AppDocument, type AppThemeTokens } from "./model";

describe("clampLayout", () => {
  it("leaves a layout that already fits untouched", () => {
    expect(clampLayout({ x: 10, y: 10, width: 100, height: 50 })).toMatchObject({
      x: 10,
      y: 10,
      width: 100,
      height: 50,
    });
  });

  it("clamps an oversized width to the parent and pulls x back into view", () => {
    const out = clampLayout({ x: 300, y: 0, width: 9999, height: 50 });
    expect(out.width).toBe(APP_STAGE_WIDTH);
    expect(out.x).toBe(0);
  });

  it("enforces the minimum width and a non-negative x", () => {
    const out = clampLayout({ x: -50, y: 0, width: 2, height: 50 });
    expect(out.width).toBe(8);
    expect(out.x).toBe(0);
  });

  it("keeps a sliver of the node on screen vertically", () => {
    expect(clampLayout({ x: 0, y: 99999, width: 100, height: 50 }).y).toBe(APP_STAGE_HEIGHT - 8);
    expect(clampLayout({ x: 0, y: -99999, width: 100, height: 50 }).y).toBe(-APP_STAGE_HEIGHT);
  });
});

describe("defaultLayoutForType", () => {
  it("stacks by index and caps width to the stage", () => {
    expect(defaultLayoutForType("Text", 0)).toEqual({ x: 16, y: 16, width: 280, height: 36 });
    expect(defaultLayoutForType("Text", 2).y).toBe(16 + 2 * (36 + 12));
    expect(defaultLayoutForType("ScrollView", 0).width).toBe(APP_STAGE_WIDTH - 32);
  });
});

function baseDoc(overrides: Partial<AppDocument> = {}): AppDocument {
  return {
    id: "app1",
    name: "App",
    theme: DEFAULT_APP_THEME,
    revision: 1,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [{ id: "s1", name: "Home", route: "index", root: { id: "r1", type: "View" } }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeAppDocument", () => {
  it("fills missing theme tokens from the defaults", () => {
    const doc = baseDoc({ theme: { colorPrimary: "#123456" } as AppThemeTokens });
    const out = normalizeAppDocument(doc);
    expect(out.theme.colorPrimary).toBe("#123456");
    expect(out.theme.colorBg).toBe(DEFAULT_APP_THEME.colorBg);
  });

  it("defaults an absent state to an empty object", () => {
    expect(normalizeAppDocument(baseDoc()).state).toEqual({});
  });

  it("deduplicates colliding screen routes", () => {
    const doc = baseDoc({
      screens: [
        { id: "s1", name: "Home", route: "index", root: { id: "r1", type: "View" } },
        { id: "s2", name: "Home2", route: "index", root: { id: "r2", type: "View" } },
      ],
    });
    const routes = normalizeAppDocument(doc).screens.map((s) => s.route);
    expect(routes[0]).toBe("index");
    expect(routes[1]).not.toBe("index");
    expect(new Set(routes).size).toBe(2);
  });

  it("repairs navigation roots: drops unknown ids and appends missing screens", () => {
    const doc = baseDoc({
      navigation: { type: "stack", roots: ["ghost"] },
      screens: [
        { id: "s1", name: "A", route: "a", root: { id: "r1", type: "View" } },
        { id: "s2", name: "B", route: "b", root: { id: "r2", type: "View" } },
      ],
    });
    expect(normalizeAppDocument(doc).navigation.roots).toEqual(["s1", "s2"]);
  });

  it("forces each screen root to fill the stage and take the theme background", () => {
    const out = normalizeAppDocument(baseDoc());
    const root = out.screens[0]!.root;
    expect(root.layout).toEqual({ x: 0, y: 0, width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT, zIndex: 0 });
    expect(root.style?.backgroundColor).toBe(out.theme.colorBg);
  });

  it("gives layout-less children a concrete layout", () => {
    const doc = baseDoc({
      screens: [
        {
          id: "s1",
          name: "Home",
          route: "index",
          root: { id: "r1", type: "View", children: [{ id: "c1", type: "Text", props: { text: "hi" } }] },
        },
      ],
    });
    const child = normalizeAppDocument(doc).screens[0]!.root.children![0]!;
    expect(child.layout).toBeDefined();
    expect(child.layout!.width).toBeGreaterThan(0);
  });

  it("does not mutate the input document", () => {
    const doc = baseDoc();
    const snapshot = structuredClone(doc);
    normalizeAppDocument(doc);
    expect(doc).toEqual(snapshot);
  });
});
