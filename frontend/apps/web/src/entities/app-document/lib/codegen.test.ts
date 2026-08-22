import { describe, expect, it } from "vitest";
import { DEFAULT_APP_THEME, type AppDocument } from "@bildo/api";
import { codegenExpoProject } from "./codegen";

function coverageDoc(): AppDocument {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "app1",
    name: "Cover App!",
    theme: DEFAULT_APP_THEME,
    navigation: { type: "tabs", roots: ["s1", "s2"] },
    screens: [
      {
        id: "s1",
        name: "Home",
        route: "index",
        root: {
          id: "root1",
          type: "View",
          layout: { x: 0, y: 0, width: 370, height: 640 },
          children: [
            {
              id: "text1",
              type: "Text",
              props: { text: "He said 'hi'\nnext\\end" },
              layout: { x: 8, y: 8, width: 200, height: 30, zIndex: 3 },
              style: { color: "#fff", fontWeight: "600" },
            },
            {
              id: "bound1",
              type: "Text",
              props: { textBind: "title" },
              layout: { x: 8, y: 40, width: 200, height: 30 },
            },
            {
              id: "btn1",
              type: "Button",
              props: {
                text: "Go",
                onPress: [
                  { type: "navigate", route: "profile" },
                  { type: "setVar", name: "count", value: 1 },
                  { type: "toast", message: "done" },
                  { type: "openUrl", url: "https://x.dev" },
                ],
              },
              layout: { x: 8, y: 80, width: 120, height: 44 },
            },
            {
              id: "btn2",
              type: "Button",
              props: { text: "Profile", href: "profile" },
              layout: { x: 140, y: 80, width: 120, height: 44 },
            },
            {
              id: "input1",
              type: "TextInput",
              props: { placeholder: "Name", valueBind: "name" },
              layout: { x: 8, y: 130, width: 200, height: 44 },
            },
            {
              id: "hidden1",
              type: "Text",
              props: { text: "secret" },
              hidden: true,
              layout: { x: 8, y: 180, width: 100, height: 20 },
            },
            { id: "spacer1", type: "Spacer", layout: { x: 8, y: 210, width: 200, height: 16 } },
            {
              id: "img1",
              type: "Image",
              props: { source: "https://img.dev/a.png" },
              layout: { x: 8, y: 230, width: 200, height: 100 },
            },
            { id: "imgEmpty", type: "Image", layout: { x: 8, y: 340, width: 200, height: 100 } },
            {
              id: "list1",
              type: "FlatList",
              props: { data: ["a", "b"] },
              layout: { x: 8, y: 450, width: 200, height: 120 },
            },
          ],
        },
      },
      {
        id: "s2",
        name: "Profile",
        route: "profile",
        root: {
          id: "root2",
          type: "ScrollView",
          layout: { x: 0, y: 0, width: 370, height: 640 },
          children: [
            { id: "p1", type: "Text", props: { text: "Profile" }, layout: { x: 8, y: 8, width: 100, height: 20 } },
          ],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

describe("codegenExpoProject — project shape", () => {
  const files = codegenExpoProject(coverageDoc());

  it("emits the full set of scaffold files", () => {
    for (const path of [
      "package.json",
      "app.json",
      "tsconfig.json",
      "babel.config.js",
      ".gitignore",
      "theme.ts",
      "app/state.tsx",
      "app/_layout.tsx",
      "README.md",
    ]) {
      expect(Object.keys(files)).toContain(path);
    }
  });

  it("maps the index route to app/index.tsx and other routes to their slug", () => {
    expect(Object.keys(files)).toContain("app/index.tsx");
    expect(Object.keys(files)).toContain("app/profile.tsx");
    expect(Object.keys(files)).not.toContain("app/s1.tsx");
  });

  it("matches the recorded snapshot of every generated file", () => {
    expect(files).toMatchSnapshot();
  });
});

describe("codegenExpoProject — node rendering details", () => {
  const files = codegenExpoProject(coverageDoc());
  const index = files["app/index.tsx"]!;

  it("escapes quotes, newlines and backslashes in text", () => {
    expect(index).toContain("He said \\'hi\\'\\nnext\\\\end");
  });

  it("renders a hidden node as a null placeholder, not its text", () => {
    expect(index).toContain("{null}");
    expect(index).not.toContain("secret");
  });

  it("wires button actions into router, state, alert and linking calls", () => {
    expect(index).toContain("router.push('/profile')");
    expect(index).toContain("setVar('count', 1)");
    expect(index).toContain("Alert.alert('', 'done')");
    expect(index).toContain("Linking.openURL('https://x.dev')");
  });

  it("turns an href into a single clean navigate", () => {
    expect(index).toContain("router.push('/profile')");
    expect(index).not.toContain("//profile");
  });

  it("imports Alert and Linking only in the screen that needs them", () => {
    expect(index).toContain("Alert");
    expect(index).toContain("Linking");
    expect(files["app/profile.tsx"]).not.toContain("Alert");
  });

  it("binds text and input values through app state", () => {
    expect(index).toContain("String(state['title'] ?? '')");
    expect(index).toContain("onChangeText={(t) => setVar('name', t)}");
  });

  it("falls back to a placeholder box for an image without a source", () => {
    const imageBoxes = index.match(/backgroundColor: '#27272A'/g) ?? [];
    expect(imageBoxes.length).toBe(1);
  });
});
