import type { AppAction, AppDocument, AppNode, AppScreen } from "@bildo/api";

export type ExpoFileMap = Record<string, string>;

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function num(value: number): string {
  return String(value);
}

function lit(value: string | number): string {
  return typeof value === "string" ? `'${esc(value)}'` : num(value);
}

function objectLiteral(entries: [string, string][]): string {
  if (!entries.length) return "{}";
  return `{\n${entries.map(([key, value]) => `  ${key}: ${value}`).join(",\n")}\n}`;
}

function jsxElement(pad: string, tag: string, attributes: string[], children: string | null): string {
  const lines = [`${pad}<${tag}`, ...attributes.map((attribute) => `${pad}  ${attribute}`)];
  if (children === null) return [...lines, `${pad}/>`].join("\n");
  return [...lines, `${pad}>`, `${pad}  ${children}`, `${pad}</${tag}>`].join("\n");
}

const PAPER_PASSTHROUGH_KEYS = new Set([
  "margin",
  "marginTop",
  "marginBottom",
  "width",
  "height",
  "opacity",
  "animation",
]);
const PAPER_TEXT_INPUT_KEYS = new Set([...PAPER_PASSTHROUGH_KEYS, "fontWeight", "lineHeight", "textAlign"]);
const BUTTON_DEFAULT_LABEL_MARGIN = 16;
const TEXT_INPUT_DEFAULT_PADDING = 10;
const TEXT_INPUT_DEFAULT_FONT_SIZE = 14;
const BUTTON_LINE_HEIGHT_RATIO = 1.4;
const TEXT_ALIGN_TO_JUSTIFY: Record<"left" | "center" | "right", string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

function positionEntries(node: AppNode, isRoot: boolean): [string, string][] {
  if (isRoot) return [["flex", "1"]];
  if (!node.layout) return [];
  const entries: [string, string][] = [
    ["position", "'absolute'"],
    ["left", num(node.layout.x)],
    ["top", num(node.layout.y)],
    ["width", num(node.layout.width)],
    ["height", num(node.layout.height)],
  ];
  if (node.layout.zIndex != null) entries.push(["zIndex", String(node.layout.zIndex)]);
  return entries;
}

function passthroughEntries(node: AppNode, isRoot: boolean, keys: Set<string>): [string, string][] {
  const style = node.style;
  if (!style) return [];
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;
    if (!keys.has(key)) continue;
    if (!isRoot && node.layout && (key === "width" || key === "height")) continue;
    entries.push([key, lit(value)]);
  }
  return entries;
}

function routePath(route: string): string {
  return route === "index" ? "/" : `/${route}`;
}

function styleToRN(node: AppNode, isRoot: boolean): string {
  const parts: string[] = [];
  if (isRoot) {
    parts.push("  flex: 1");
  } else if (node.layout) {
    parts.push(`  position: 'absolute'`);
    parts.push(`  left: ${node.layout.x}`);
    parts.push(`  top: ${node.layout.y}`);
    parts.push(`  width: ${node.layout.width}`);
    parts.push(`  height: ${node.layout.height}`);
    if (node.layout.zIndex != null) parts.push(`  zIndex: ${node.layout.zIndex}`);
  }
  const style = node.style;
  if (style) {
    for (const [k, v] of Object.entries(style)) {
      if (v === undefined) continue;
      if (!isRoot && node.layout && (k === "width" || k === "height")) continue;
      if (typeof v === "string") parts.push(`  ${k}: '${esc(v)}'`);
      else parts.push(`  ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (!parts.length) return "{}";
  return `{\n${parts.join(",\n")}\n}`;
}

function actionsToHandler(actions: AppAction[] | undefined, href?: string): string {
  const list: AppAction[] = [...(actions ?? [])];
  if (href && !list.some((a) => a.type === "navigate" && a.route === href)) {
    list.push({ type: "navigate", route: href });
  }
  if (!list.length) return "() => {}";
  const lines = list
    .map((a) => {
      if (a.type === "navigate") return `router.push('${esc(routePath(a.route))}')`;
      if (a.type === "setVar") return `setVar('${esc(a.name)}', ${JSON.stringify(a.value)})`;
      if (a.type === "toast") return `Alert.alert('', '${esc(a.message)}')`;
      if (a.type === "openUrl") return `Linking.openURL('${esc(a.url)}')`;
      return "";
    })
    .filter(Boolean);
  return `() => {\n    ${lines.join(";\n    ")};\n  }`;
}

interface ScreenNeeds {
  alert: boolean;
  linking: boolean;
  router: boolean;
  state: boolean;
}

function collectNeeds(node: AppNode, needs: ScreenNeeds) {
  if (node.props?.onPress?.length || node.props?.href) {
    needs.router = true;
    for (const a of node.props.onPress ?? []) {
      if (a.type === "toast") needs.alert = true;
      if (a.type === "openUrl") needs.linking = true;
      if (a.type === "setVar") needs.state = true;
    }
  }
  if (node.props?.valueBind || node.props?.textBind) needs.state = true;
  for (const c of node.children ?? []) collectNeeds(c, needs);
}

function collectImports(node: AppNode, set: Set<string>, paperSet: Set<string>): void {
  if (node.type === "Button" || node.type === "TextInput") {
    paperSet.add(node.type);
  } else if (node.type === "Spacer") {
    set.add("View");
  } else if (node.type === "Image") {
    set.add("Image");
    set.add("View");
    set.add("Text");
  } else {
    set.add(node.type);
  }
  for (const c of node.children ?? []) collectImports(c, set, paperSet);
}

function renderButton(node: AppNode, pad: string, isRoot: boolean): string {
  const props = node.props;
  const style = node.style;
  const handler = actionsToHandler(props?.onPress, props?.href);
  let label: string;
  if (props?.textBind) label = `{String(state['${esc(props.textBind)}'] ?? '')}`;
  else if (props?.text != null) label = `{${JSON.stringify(props.text)}}`;
  else label = "OK";

  const styleEntries = [...positionEntries(node, isRoot), ...passthroughEntries(node, isRoot, PAPER_PASSTHROUGH_KEYS)];
  styleEntries.push(["borderRadius", style?.borderRadius != null ? num(style.borderRadius) : "paperTheme.roundness"]);
  if (style?.borderWidth != null) {
    styleEntries.push(["borderWidth", num(style.borderWidth)]);
    styleEntries.push(["borderColor", style.borderColor != null ? lit(style.borderColor) : "theme.colorBorder"]);
  } else if (style?.borderColor != null) {
    styleEntries.push(["borderColor", lit(style.borderColor)]);
  }

  const contentEntries: [string, string][] = [];
  if (!isRoot && node.layout) {
    contentEntries.push(["height", num(node.layout.height - 2 * (style?.borderWidth ?? 0))]);
  }
  if (style?.textAlign != null) {
    contentEntries.push(["justifyContent", lit(TEXT_ALIGN_TO_JUSTIFY[style.textAlign])]);
  }

  const labelMargin = style?.paddingHorizontal ?? style?.padding ?? BUTTON_DEFAULT_LABEL_MARGIN;
  const labelEntries: [string, string][] = [
    ["marginHorizontal", num(labelMargin)],
    ["marginVertical", "0"],
  ];
  if (style?.fontSize != null) labelEntries.push(["fontSize", num(style.fontSize)]);
  labelEntries.push(["fontWeight", lit(style?.fontWeight ?? "600")]);
  if (style?.letterSpacing != null) labelEntries.push(["letterSpacing", num(style.letterSpacing)]);
  if (style?.lineHeight != null) labelEntries.push(["lineHeight", num(style.lineHeight)]);
  else if (style?.fontSize != null)
    labelEntries.push(["lineHeight", num(Math.floor(style.fontSize * BUTTON_LINE_HEIGHT_RATIO + 0.5))]);

  const isOutlineIntent = style?.backgroundColor == null && style?.color != null;
  let modeAttr: string;
  let buttonColorExpr: string;
  if (isOutlineIntent) {
    modeAttr = 'mode="outlined"';
    buttonColorExpr = lit("transparent");
  } else {
    modeAttr = style?.shadow ? 'mode="elevated"' : 'mode="contained"';
    buttonColorExpr = style?.backgroundColor != null ? lit(style.backgroundColor) : "theme.colorPrimary";
  }

  const attributes = [
    modeAttr,
    "compact",
    `buttonColor={${buttonColorExpr}}`,
    `textColor={${style?.color != null ? lit(style.color) : "theme.colorPrimaryFg"}}`,
    `style={${objectLiteral(styleEntries)}}`,
    `contentStyle={${objectLiteral(contentEntries)}}`,
    `labelStyle={${objectLiteral(labelEntries)}}`,
    `onPress={${handler}}`,
  ];
  return jsxElement(pad, "Button", attributes, label);
}

function renderTextInput(node: AppNode, pad: string, isRoot: boolean): string {
  const props = node.props;
  const style = node.style;
  const bind = props?.valueBind;
  const placeholder = props?.placeholder ? `{${JSON.stringify(props.placeholder)}}` : '""';

  const styleEntries = [...positionEntries(node, isRoot), ...passthroughEntries(node, isRoot, PAPER_TEXT_INPUT_KEYS)];
  styleEntries.push(["fontSize", num(style?.fontSize ?? TEXT_INPUT_DEFAULT_FONT_SIZE)]);
  styleEntries.push([
    "backgroundColor",
    style?.backgroundColor != null ? lit(style.backgroundColor) : "theme.colorSurface",
  ]);

  const padding = style?.paddingHorizontal ?? style?.padding ?? TEXT_INPUT_DEFAULT_PADDING;
  const contentEntries: [string, string][] = [["paddingHorizontal", num(padding)]];
  if (style?.letterSpacing != null) contentEntries.push(["letterSpacing", num(style.letterSpacing)]);

  const outlineEntries: [string, string][] = [
    ["borderRadius", style?.borderRadius != null ? num(style.borderRadius) : "paperTheme.roundness"],
  ];
  if (style?.borderWidth != null && style.borderWidth > 0) outlineEntries.push(["borderWidth", num(style.borderWidth)]);

  const attributes = ['mode="outlined"', `placeholder=${placeholder}`];
  attributes.push(`style={${objectLiteral(styleEntries)}}`);
  attributes.push(`contentStyle={${objectLiteral(contentEntries)}}`);
  attributes.push(`outlineStyle={${objectLiteral(outlineEntries)}}`);
  if (style?.borderWidth === 0) attributes.push('outlineColor="transparent"');
  else if (style?.borderColor != null) attributes.push(`outlineColor={${lit(style.borderColor)}}`);
  if (style?.color != null) attributes.push(`textColor={${lit(style.color)}}`);
  if (bind) {
    attributes.push(`value={String(state['${esc(bind)}'] ?? '')}`);
    attributes.push(`onChangeText={(t) => setVar('${esc(bind)}', t)}`);
  }
  return jsxElement(pad, "TextInput", attributes, null);
}

function renderNodeTSX(node: AppNode, indent: number, isRoot: boolean): string {
  const pad = " ".repeat(indent);
  if (node.hidden) return `${pad}{null}`;
  const style = styleToRN(node, isRoot);
  switch (node.type) {
    case "Text": {
      const bind = node.props?.textBind;
      if (bind) {
        return `${pad}<Text style={${style}}>{String(state['${esc(bind)}'] ?? '')}</Text>`;
      }
      return `${pad}<Text style={${style}}>{${JSON.stringify(node.props?.text ?? "")}}</Text>`;
    }
    case "Button":
      return renderButton(node, pad, isRoot);
    case "Image": {
      const src = node.props?.source ? `{ uri: '${esc(node.props.source)}' }` : undefined;
      if (!src) {
        return `${pad}<View style={[${style}, { backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#71717A' }}>Image</Text></View>`;
      }
      return `${pad}<Image source={${src}} style={${style}} />`;
    }
    case "TextInput":
      return renderTextInput(node, pad, isRoot);
    case "Spacer":
      return `${pad}<View style={${style}} />`;
    case "FlatList": {
      const data = JSON.stringify(node.props?.data ?? ["Item"]);
      return `${pad}<FlatList\n${pad}  style={${style}}\n${pad}  data={${data}}\n${pad}  keyExtractor={(item, i) => String(i)}\n${pad}  renderItem={({ item }) => (\n${pad}    <View style={{ padding: 12, backgroundColor: '#18181B', borderRadius: 10, marginBottom: 8 }}>\n${pad}      <Text style={{ color: '#FAFAFA' }}>{String(item)}</Text>\n${pad}    </View>\n${pad}  )}\n${pad}/>`;
    }
    case "ScrollView":
    case "View": {
      const Tag = node.type === "ScrollView" ? "ScrollView" : "View";
      const kids = (node.children ?? []).map((c) => renderNodeTSX(c, indent + 2, false)).join("\n");
      const scrollExtra = node.type === "ScrollView" ? " contentContainerStyle={{ flexGrow: 1 }}" : "";
      return `${pad}<${Tag} style={${style}}${scrollExtra}>\n${kids}\n${pad}</${Tag}>`;
    }
    default:
      return `${pad}<View />`;
  }
}

function routeToComponent(route: string): string {
  if (route === "index") return "IndexScreen";
  return (
    route
      .split(/[-_]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("") + "Screen"
  );
}

function screenFile(screen: AppScreen): string {
  const needs: ScreenNeeds = { alert: false, linking: false, router: false, state: false };
  collectNeeds(screen.root, needs);
  const imports = new Set<string>(["View"]);
  const paperImports = new Set<string>();
  collectImports(screen.root, imports, paperImports);
  if (needs.alert) imports.add("Alert");
  if (needs.linking) imports.add("Linking");
  const unique = [...imports].sort();
  const body = renderNodeTSX(screen.root, 4, true);

  const hooks: string[] = [];
  if (needs.router) hooks.push("  const router = useRouter();");
  if (needs.state) hooks.push("  const { state, setVar } = useAppState();");

  const paperImport = paperImports.size
    ? `import { ${[...paperImports].sort().join(", ")} } from 'react-native-paper';\n`
    : "";
  const themeNames = paperImports.size ? "paperTheme, theme" : "theme";

  return `import { ${unique.join(", ")} } from 'react-native';
${paperImport}import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
${needs.router ? `import { useRouter } from 'expo-router';\n` : ""}import { ${themeNames} } from '../theme';
${needs.state ? `import { useAppState } from './state';\n` : ""}
export default function ${routeToComponent(screen.route)}() {
${hooks.length ? `${hooks.join("\n")}\n` : ""}  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colorBg }} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
${body}
    </SafeAreaView>
  );
}
`;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "app"
  );
}

const PAPER_THEME = `
function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function mix(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return a;
  return (
    '#' +
    from
      .map((channel, i) => Math.round(channel * (1 - t) + to[i] * t).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  return \`rgba(\${rgb[0]}, \${rgb[1]}, \${rgb[2]}, \${alpha})\`;
}

function isDarkColor(color: string): boolean {
  const rgb = parseHex(color);
  if (!rgb) return false;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179;
}

const dark = isDarkColor(theme.colorBg);
const base = dark ? MD3DarkTheme : MD3LightTheme;
const radius = parseFloat(theme.radiusBase);

export const paperTheme: MD3Theme = {
  ...base,
  dark,
  mode: 'exact',
  roundness: Number.isFinite(radius) && radius >= 0 ? radius : 12,
  colors: {
    ...base.colors,
    primary: theme.colorPrimary,
    onPrimary: theme.colorPrimaryFg,
    primaryContainer: mix(theme.colorBg, theme.colorPrimary, 0.16),
    onPrimaryContainer: theme.colorText,
    secondary: theme.colorPrimary,
    onSecondary: theme.colorPrimaryFg,
    secondaryContainer: mix(theme.colorSurface, theme.colorPrimary, 0.16),
    onSecondaryContainer: theme.colorText,
    tertiary: theme.colorPrimary,
    onTertiary: theme.colorPrimaryFg,
    tertiaryContainer: mix(theme.colorSurface, theme.colorPrimary, 0.16),
    onTertiaryContainer: theme.colorText,
    background: theme.colorBg,
    onBackground: theme.colorText,
    surface: theme.colorSurface,
    onSurface: theme.colorText,
    surfaceVariant: mix(theme.colorSurface, theme.colorText, 0.08),
    onSurfaceVariant: theme.colorTextMuted,
    surfaceDisabled: withAlpha(theme.colorText, 0.12),
    onSurfaceDisabled: withAlpha(theme.colorText, 0.38),
    outline: theme.colorBorder,
    outlineVariant: theme.colorBorder,
    inverseSurface: theme.colorText,
    inverseOnSurface: theme.colorBg,
    inversePrimary: mix(theme.colorPrimary, theme.colorBg, 0.5),
    shadow: '#000000',
    scrim: '#000000',
    elevation: {
      level0: 'transparent',
      level1: mix(theme.colorSurface, theme.colorPrimary, 0.05),
      level2: mix(theme.colorSurface, theme.colorPrimary, 0.08),
      level3: mix(theme.colorSurface, theme.colorPrimary, 0.11),
      level4: mix(theme.colorSurface, theme.colorPrimary, 0.12),
      level5: mix(theme.colorSurface, theme.colorPrimary, 0.14),
    },
  },
};
`;

export function codegenExpoProject(doc: AppDocument): ExpoFileMap {
  const files: ExpoFileMap = {};
  const bundleId = `com.bildo.${slugify(doc.name).replace(/-/g, "") || "app"}`;

  files["package.json"] = JSON.stringify(
    {
      name: slugify(doc.name),
      version: "1.0.0",
      main: "expo-router/entry",
      scripts: {
        start: "expo start",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
      },
      dependencies: {
        expo: "~52.0.46",
        "expo-asset": "~11.0.5",
        "expo-router": "~4.0.20",
        "expo-status-bar": "~2.0.1",
        "expo-linking": "~7.0.5",
        "expo-constants": "~17.0.8",
        react: "18.3.1",
        "react-native": "0.76.9",
        "react-native-safe-area-context": "4.12.0",
        "react-native-screens": "~4.4.0",
        "react-native-gesture-handler": "~2.20.2",
        "react-native-paper": "~5.15.3",
        "react-native-web": "~0.19.13",
        "@expo/vector-icons": "~14.0.4",
        "expo-font": "~13.0.4",
        "query-string": "^7.1.3",
      },
      devDependencies: {
        "@babel/core": "^7.25.0",
        "babel-preset-expo": "~12.0.0",
        typescript: "~5.3.3",
        "@types/react": "~18.3.12",
      },
      private: true,
    },
    null,
    2,
  );

  files["app.json"] = JSON.stringify(
    {
      expo: {
        name: doc.name,
        slug: slugify(doc.name),
        version: "1.0.0",
        orientation: "portrait",
        scheme: slugify(doc.name),
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        ios: { supportsTablet: true, bundleIdentifier: bundleId },
        android: { package: bundleId, adaptiveIcon: { backgroundColor: doc.theme.colorBg } },
        web: { bundler: "metro" },
        plugins: ["expo-router"],
      },
    },
    null,
    2,
  );

  files["tsconfig.json"] = JSON.stringify(
    { extends: "expo/tsconfig.base", compilerOptions: { strict: true } },
    null,
    2,
  );

  files["babel.config.js"] = `module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
`;

  files[".gitignore"] = `node_modules/
.expo/
dist/
npm-debug.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/
`;

  files["theme.ts"] = `import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const theme = ${JSON.stringify(doc.theme, null, 2)} as const;
${PAPER_THEME}`;

  files["app/state.tsx"] =
    `import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Vars = Record<string, string | number | boolean>;

type CtxValue = {
  state: Vars;
  setVar: (k: string, v: string | number | boolean) => void;
};

const Ctx = createContext<CtxValue | null>(null);

const initial: Vars = ${JSON.stringify(doc.state ?? {}, null, 2)};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Vars>(initial);
  const setVar = useCallback((k: string, v: string | number | boolean) => {
    setState(s => ({ ...s, [k]: v }));
  }, []);
  const value = useMemo(() => ({ state, setVar }), [state, setVar]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): CtxValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
`;

  const roots = doc.navigation.roots
    .map((id) => doc.screens.find((s) => s.id === id))
    .filter((s): s is AppScreen => Boolean(s));

  if (doc.navigation.type === "tabs") {
    files["app/_layout.tsx"] = `import { Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from './state';
import { paperTheme, theme } from '../theme';

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <AppStateProvider>
            <Tabs
              screenOptions={{
                headerStyle: { backgroundColor: theme.colorSurface },
                headerTintColor: theme.colorText,
                tabBarStyle: { backgroundColor: theme.colorSurface, borderTopColor: theme.colorBorder },
                tabBarActiveTintColor: theme.colorPrimary,
                tabBarInactiveTintColor: theme.colorTextMuted,
                sceneStyle: { backgroundColor: theme.colorBg },
              }}
            >
${roots.map((sc) => `              <Tabs.Screen name="${sc.route === "index" ? "index" : sc.route}" options={{ title: '${esc(sc.name)}' }} />`).join("\n")}
            </Tabs>
          </AppStateProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
`;
  } else {
    files["app/_layout.tsx"] = `import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from './state';
import { paperTheme, theme } from '../theme';

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <AppStateProvider>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.colorSurface },
                headerTintColor: theme.colorText,
                contentStyle: { backgroundColor: theme.colorBg },
              }}
            >
${doc.screens.map((sc) => `              <Stack.Screen name="${sc.route === "index" ? "index" : sc.route}" options={{ title: '${esc(sc.name)}' }} />`).join("\n")}
            </Stack>
          </AppStateProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
`;
  }

  for (const sc of doc.screens) {
    const fileName = sc.route === "index" ? "app/index.tsx" : `app/${sc.route}.tsx`;
    files[fileName] = screenFile(sc);
  }

  files["README.md"] = `# ${doc.name}

Сгенерировано bildo (AppDocument → Expo).

## Запуск

\`\`\`bash
npm install
npx expo start
\`\`\`

Отсканируйте QR в **Expo Go** (iOS/Android) или нажмите \`w\` для web.

Промпт: ${doc.prompt ?? "—"}
`;

  return files;
}
