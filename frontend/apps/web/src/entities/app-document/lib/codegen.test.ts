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
    revision: 1,
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
      "lib/state.ts",
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

  it("wraps text in a JSON-encoded JSX expression so quotes, newlines and backslashes render correctly", () => {
    expect(index).toContain(`{${JSON.stringify("He said 'hi'\nnext\\end")}}`);
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

describe("codegenExpoProject — navigation roots", () => {
  function navDoc(): AppDocument {
    const now = "2026-01-01T00:00:00.000Z";
    return {
      id: "app2",
      name: "Nav",
      theme: DEFAULT_APP_THEME,
      navigation: { type: "tabs", roots: ["scr-b", "scr-a"] },
      screens: [
        {
          id: "scr-a",
          name: "Home",
          route: "index",
          root: { id: "ra", type: "View", layout: { x: 0, y: 0, width: 370, height: 640 } },
        },
        {
          id: "scr-b",
          name: "Stats",
          route: "stats",
          root: { id: "rb", type: "View", layout: { x: 0, y: 0, width: 370, height: 640 } },
        },
      ],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  it("orders tabs by navigation.roots (screen ids), with route as name and screen name as title", () => {
    const layout = codegenExpoProject(navDoc())["app/_layout.tsx"]!;
    const statsAt = layout.indexOf('<Tabs.Screen name="stats"');
    const indexAt = layout.indexOf('<Tabs.Screen name="index"');
    expect(statsAt).toBeGreaterThan(-1);
    expect(indexAt).toBeGreaterThan(-1);
    expect(statsAt).toBeLessThan(indexAt);
    expect(layout).toContain("title: 'Stats'");
    expect(layout).toContain("title: 'Home'");
  });

  it("emits href: null for a screen left out of navigation.roots, and only for it", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const doc: AppDocument = {
      id: "app3",
      name: "Partial",
      theme: DEFAULT_APP_THEME,
      navigation: { type: "tabs", roots: ["scr-a", "scr-b"] },
      screens: [
        {
          id: "scr-a",
          name: "Home",
          route: "index",
          root: { id: "ra", type: "View", layout: { x: 0, y: 0, width: 370, height: 640 } },
        },
        {
          id: "scr-b",
          name: "Stats",
          route: "stats",
          root: { id: "rb", type: "View", layout: { x: 0, y: 0, width: 370, height: 640 } },
        },
        {
          id: "scr-c",
          name: "Detail",
          route: "detail",
          root: { id: "rc", type: "View", layout: { x: 0, y: 0, width: 370, height: 640 } },
        },
      ],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const layout = codegenExpoProject(doc)["app/_layout.tsx"]!;
    expect(layout).toContain(`<Tabs.Screen name="detail" options={{ href: null, title: 'Detail' }} />`);
    expect(layout).toContain(`<Tabs.Screen name="index" options={{ title: 'Home' }} />`);
    expect(layout).toContain(`<Tabs.Screen name="stats" options={{ title: 'Stats' }} />`);
    expect(layout.match(/href: null/g) ?? []).toHaveLength(1);
    const detailAt = layout.indexOf('name="detail"');
    const statsAt = layout.indexOf('name="stats"');
    expect(detailAt).toBeGreaterThan(statsAt);
  });
});

describe("codegenExpoProject — Google Fonts", () => {
  function fontDoc(): AppDocument {
    const now = "2026-01-01T00:00:00.000Z";
    return {
      id: "fonts",
      name: "Fonts",
      theme: { ...DEFAULT_APP_THEME, fontBody: "PT Serif", fontHeading: "Unbounded" },
      navigation: { type: "stack", roots: ["s1"] },
      screens: [
        {
          id: "s1",
          name: "Home",
          route: "index",
          root: {
            id: "r",
            type: "View",
            layout: { x: 0, y: 0, width: 370, height: 640 },
            children: [
              {
                id: "head",
                type: "Text",
                props: { text: "Заголовок" },
                layout: { x: 8, y: 8, width: 300, height: 40 },
                style: { fontSize: 24, fontWeight: "700" },
              },
              {
                id: "body",
                type: "Text",
                props: { text: "Текст" },
                layout: { x: 8, y: 60, width: 300, height: 24 },
                style: { fontSize: 14 },
              },
              { id: "btn", type: "Button", props: { text: "Жми" }, layout: { x: 8, y: 100, width: 160, height: 46 } },
              {
                id: "inp",
                type: "TextInput",
                props: { placeholder: "Имя" },
                layout: { x: 8, y: 160, width: 260, height: 46 },
              },
            ],
          },
        },
      ],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  const files = codegenExpoProject(fontDoc());
  const index = files["app/index.tsx"]!;
  const layout = files["app/_layout.tsx"]!;
  const pkg = files["package.json"]!;

  it("picks fontHeading for a Text with fontSize >= 20 and fontBody otherwise", () => {
    expect(index).toContain("fontFamily: 'Unbounded_700Bold'");
    expect(index).toContain("fontFamily: 'PTSerif_400Regular'");
  });

  it("drops the node fontWeight and writes fontWeight: 'normal' next to fontFamily", () => {
    expect(index).not.toContain("fontWeight: '700'");
    expect(index).toContain("fontWeight: 'normal'");
  });

  it("gives a Button label fontBody in its default-600 (bold) file", () => {
    expect(index).toMatch(/labelStyle=\{[\s\S]*fontFamily: 'PTSerif_700Bold'/);
  });

  it("loads the theme families via useFonts in the layout", () => {
    expect(layout).toContain("import { useFonts } from 'expo-font';");
    expect(layout).toContain("import { PTSerif_400Regular } from '@expo-google-fonts/pt-serif/400Regular';");
    expect(layout).toContain("import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';");
    expect(layout).toContain("const [fontsLoaded, fontError] = useFonts({");
    expect(layout).toContain("if (!fontsLoaded && !fontError) return null;");
  });

  it("adds the font packages to package.json", () => {
    expect(pkg).toContain('"@expo-google-fonts/pt-serif": "~0.4.1"');
    expect(pkg).toContain('"@expo-google-fonts/unbounded": "~0.4.1"');
  });

  it("emits no font code when both tokens are System", () => {
    const sys = codegenExpoProject({ ...fontDoc(), theme: DEFAULT_APP_THEME });
    expect(sys["app/_layout.tsx"]).not.toContain("useFonts");
    expect(sys["app/index.tsx"]).not.toContain("fontFamily:");
    expect(sys["package.json"]).not.toContain("@expo-google-fonts");
  });
});

describe("codegenExpoProject — theme on lists, headers and tabs", () => {
  function surfaceDoc(font: "System" | "Unbounded"): AppDocument {
    const now = "2026-01-01T00:00:00.000Z";
    return {
      id: "surf",
      name: "Surfaces",
      theme: { ...DEFAULT_APP_THEME, fontBody: font === "System" ? "System" : "PT Serif", fontHeading: font },
      navigation: { type: "tabs", roots: ["s1"] },
      screens: [
        {
          id: "s1",
          name: "Home",
          route: "index",
          root: {
            id: "r",
            type: "View",
            layout: { x: 0, y: 0, width: 370, height: 640 },
            children: [
              {
                id: "lst",
                type: "FlatList",
                props: { data: ["a", "b"] },
                layout: { x: 8, y: 8, width: 300, height: 120 },
              },
            ],
          },
        },
      ],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  it("themes FlatList rows with surface/text colors and the theme radius", () => {
    const index = codegenExpoProject(surfaceDoc("System"))["app/index.tsx"]!;
    expect(index).toContain("backgroundColor: theme.colorSurface, borderRadius: paperTheme.roundness");
    expect(index).toContain("<Text style={{ color: theme.colorText }}>{String(item)}</Text>");
    expect(index).not.toContain("#18181B");
  });

  it("imports paperTheme on a screen that only has a FlatList", () => {
    const index = codegenExpoProject(surfaceDoc("System"))["app/index.tsx"]!;
    expect(index).toContain("import { paperTheme, theme } from '../theme';");
  });

  it("applies theme fonts to header title, tab label and FlatList rows", () => {
    const files = codegenExpoProject(surfaceDoc("Unbounded"));
    const layout = files["app/_layout.tsx"]!;
    const index = files["app/index.tsx"]!;
    expect(layout).toContain("headerTitleStyle: { fontFamily: 'Unbounded_700Bold', fontWeight: 'normal' }");
    expect(layout).toContain("tabBarLabelStyle: { fontFamily: 'PTSerif_400Regular', fontWeight: 'normal' }");
    expect(index).toContain(
      "<Text style={{ color: theme.colorText, fontFamily: 'PTSerif_400Regular', fontWeight: 'normal' }}>",
    );
  });

  it("emits no header/tab font options when fonts are System", () => {
    const layout = codegenExpoProject(surfaceDoc("System"))["app/_layout.tsx"]!;
    expect(layout).not.toContain("headerTitleStyle");
    expect(layout).not.toContain("tabBarLabelStyle");
  });
});

describe("codegenExpoProject — Icon", () => {
  function iconDoc(): AppDocument {
    const now = "2026-01-01T00:00:00.000Z";
    return {
      id: "ic",
      name: "Icons",
      theme: DEFAULT_APP_THEME,
      navigation: { type: "stack", roots: ["s1"] },
      screens: [
        {
          id: "s1",
          name: "Home",
          route: "index",
          root: {
            id: "r",
            type: "View",
            layout: { x: 0, y: 0, width: 370, height: 640 },
            children: [
              { id: "i1", type: "Icon", props: { icon: "arrow-left" }, layout: { x: 8, y: 8, width: 28, height: 28 } },
              {
                id: "i2",
                type: "Icon",
                props: { icon: "share-2" },
                layout: { x: 40, y: 8, width: 32, height: 24 },
                style: { color: "#FF0000" },
              },
              { id: "i3", type: "Icon", props: { icon: "image" }, layout: { x: 80, y: 8, width: 24, height: 24 } },
              { id: "i4", type: "Icon", layout: { x: 120, y: 8, width: 24, height: 24 } },
            ],
          },
        },
      ],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  const files = codegenExpoProject(iconDoc());
  const index = files["app/index.tsx"]!;
  const pkg = files["package.json"]!;

  it("renders an Icon as a centered View wrapping the Lucide component", () => {
    expect(index).toContain("<ArrowLeftIcon");
    expect(index).toContain("size={28}");
    expect(index).toContain("color={theme.colorText}");
  });

  it("uses min(width, height) for the size and the node color", () => {
    expect(index).toContain("size={24}"); // share-2 is 32x24 -> 24
    expect(index).toContain("color={'#FF0000'}");
  });

  it("suffixes the component name to avoid colliding with RN Image", () => {
    expect(index).toContain("import ImageIcon from 'lucide-react-native/icons/image';");
    expect(index).toContain("<ImageIcon");
  });

  it("imports each used icon from its per-icon subpath, sorted", () => {
    expect(index).toContain("import ArrowLeftIcon from 'lucide-react-native/icons/arrow-left';");
    expect(index).toContain("import Share2Icon from 'lucide-react-native/icons/share-2';");
    const arrowAt = index.indexOf("icons/arrow-left");
    const shareAt = index.indexOf("icons/share-2");
    expect(arrowAt).toBeLessThan(shareAt);
  });

  it("renders an iconless Icon as an empty View, with no import", () => {
    expect(index).not.toContain("undefinedIcon");
  });

  it("adds lucide-react-native and react-native-svg, metro.config.js and bundler resolution", () => {
    expect(pkg).toContain('"lucide-react-native": "~1.48.0"');
    expect(pkg).toContain('"react-native-svg": "15.8.0"');
    expect(files["metro.config.js"]).toContain("unstable_enablePackageExports");
    expect(files["tsconfig.json"]).toContain('"moduleResolution": "bundler"');
  });

  it("omits icon deps, metro.config.js and bundler resolution when no icon is used", () => {
    const noIcons = codegenExpoProject({
      ...iconDoc(),
      screens: [{ id: "s1", name: "Home", route: "index", root: { id: "r", type: "View" } }],
    });
    expect(noIcons["package.json"]).not.toContain("lucide-react-native");
    expect(noIcons["metro.config.js"]).toBeUndefined();
    expect(noIcons["tsconfig.json"]).not.toContain("moduleResolution");
  });
});
