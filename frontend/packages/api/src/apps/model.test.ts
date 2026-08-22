import { describe, expect, it } from "vitest";
import {
  appActionSchema,
  appDetailSchema,
  appDocumentSchema,
  appSummarySchema,
  DEFAULT_APP_THEME,
  type AppDocument,
} from "./model";

function minimalDoc(): AppDocument {
  return {
    id: "app1",
    name: "App",
    theme: DEFAULT_APP_THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [
      {
        id: "s1",
        name: "Home",
        route: "index",
        root: { id: "root1", type: "View" },
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("appDocumentSchema — happy path", () => {
  it("parses a minimal valid document", () => {
    const parsed = appDocumentSchema.parse(minimalDoc());
    expect(parsed.screens).toHaveLength(1);
    expect(parsed.navigation.type).toBe("stack");
  });

  it("parses a document exercising every optional branch", () => {
    const doc: AppDocument = {
      ...minimalDoc(),
      slug: "my-app",
      prompt: "make me an app",
      state: { count: 0, name: "x", ready: true },
      screens: [
        {
          id: "s1",
          name: "Home",
          route: "index",
          icon: "home",
          root: {
            id: "root1",
            type: "View",
            style: { flexDirection: "row", gap: 8, backgroundColor: "#000", width: "100%", animation: "float" },
            layout: { x: 0, y: 0, width: 370, height: 640, zIndex: 2 },
            children: [
              {
                id: "n1",
                type: "Button",
                props: {
                  text: "Go",
                  href: "/next",
                  onPress: [
                    { type: "navigate", route: "next" },
                    { type: "setVar", name: "count", value: 1 },
                    { type: "toast", message: "hi" },
                    { type: "openUrl", url: "https://x.dev" },
                  ],
                },
              },
            ],
          },
        },
      ],
    };
    const parsed = appDocumentSchema.parse(doc);
    expect(parsed.screens[0]?.root.children?.[0]?.props?.onPress).toHaveLength(4);
    expect(parsed.state?.count).toBe(0);
  });
});

describe("appDocumentSchema — absent vs null optionals (api-contract: optional, never nullable)", () => {
  it("accepts a document with every optional key simply absent", () => {
    const doc = minimalDoc();
    expect("slug" in doc).toBe(false);
    expect("prompt" in doc).toBe(false);
    expect(appDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects null in place of an absent optional string", () => {
    const doc = { ...minimalDoc(), slug: null };
    const result = appDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("rejects null for a nested optional node field", () => {
    const doc = minimalDoc();
    const withNullStyle = {
      ...doc,
      screens: [{ ...doc.screens[0]!, root: { id: "root1", type: "View", style: null } }],
    };
    expect(appDocumentSchema.safeParse(withNullStyle).success).toBe(false);
  });

  it("strips unknown keys rather than failing on them", () => {
    const doc = { ...minimalDoc(), somethingExtra: true };
    const parsed = appDocumentSchema.parse(doc);
    expect("somethingExtra" in parsed).toBe(false);
  });
});

describe("appDocumentSchema — malformed input", () => {
  it("rejects a missing required top-level field", () => {
    const { name: _name, ...rest } = minimalDoc();
    expect(appDocumentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a theme missing one of its ten tokens", () => {
    const { colorPrimary: _drop, ...partialTheme } = DEFAULT_APP_THEME;
    const doc = { ...minimalDoc(), theme: partialTheme };
    expect(appDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects an unknown navigation type", () => {
    const doc = { ...minimalDoc(), navigation: { type: "carousel", roots: [] } };
    expect(appDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects an unknown node type", () => {
    const doc = minimalDoc();
    const bad = { ...doc, screens: [{ ...doc.screens[0]!, root: { id: "r", type: "Widget" } }] };
    expect(appDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a layout with a non-numeric coordinate", () => {
    const doc = minimalDoc();
    const bad = {
      ...doc,
      screens: [{ ...doc.screens[0]!, root: { id: "r", type: "View", layout: { x: "0", y: 0, width: 1, height: 1 } } }],
    };
    expect(appDocumentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("appActionSchema — discriminated union", () => {
  it("parses each of the four action shapes", () => {
    expect(appActionSchema.parse({ type: "navigate", route: "index" }).type).toBe("navigate");
    expect(appActionSchema.parse({ type: "setVar", name: "n", value: true }).type).toBe("setVar");
    expect(appActionSchema.parse({ type: "toast", message: "m" }).type).toBe("toast");
    expect(appActionSchema.parse({ type: "openUrl", url: "u" }).type).toBe("openUrl");
  });

  it("accepts string, number and boolean setVar values", () => {
    for (const value of ["s", 3, false]) {
      expect(appActionSchema.safeParse({ type: "setVar", name: "n", value }).success).toBe(true);
    }
  });

  it("rejects setVar with an object value", () => {
    expect(appActionSchema.safeParse({ type: "setVar", name: "n", value: {} }).success).toBe(false);
  });

  it("rejects navigate missing its route and an unknown action type", () => {
    expect(appActionSchema.safeParse({ type: "navigate" }).success).toBe(false);
    expect(appActionSchema.safeParse({ type: "reload" }).success).toBe(false);
  });
});

describe("appSummarySchema", () => {
  it("parses with and without the optional slug", () => {
    expect(appSummarySchema.safeParse({ id: "1", name: "n", updatedAt: "t" }).success).toBe(true);
    expect(appSummarySchema.safeParse({ id: "1", name: "n", slug: "s", updatedAt: "t" }).success).toBe(true);
  });

  it("rejects a null slug", () => {
    expect(appSummarySchema.safeParse({ id: "1", name: "n", slug: null, updatedAt: "t" }).success).toBe(false);
  });
});

describe("appDetailSchema — generationError is the one nullable field", () => {
  it("accepts a null generationError", () => {
    const detail = { document: minimalDoc(), generationStatus: "ready", generationError: null };
    expect(appDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("accepts a string generationError", () => {
    const detail = { document: minimalDoc(), generationStatus: "failed", generationError: "boom" };
    expect(appDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("rejects a missing generationError key", () => {
    const detail = { document: minimalDoc(), generationStatus: "pending" };
    expect(appDetailSchema.safeParse(detail).success).toBe(false);
  });

  it("rejects an unknown generationStatus", () => {
    const detail = { document: minimalDoc(), generationStatus: "queued", generationError: null };
    expect(appDetailSchema.safeParse(detail).success).toBe(false);
  });
});
