import type { AppAction, AppDocument, AppNode, AppScreen } from "@bildo/api";

export type ExpoFileMap = Record<string, string>;

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
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

function collectImports(node: AppNode, set: Set<string>): void {
  if (node.type === "Button") {
    set.add("Pressable");
    set.add("Text");
  } else if (node.type === "Spacer") {
    set.add("View");
  } else if (node.type === "Image") {
    set.add("Image");
    set.add("View");
    set.add("Text");
  } else {
    set.add(node.type);
  }
  for (const c of node.children ?? []) collectImports(c, set);
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
      return `${pad}<Text style={${style}}>${esc(node.props?.text ?? "")}</Text>`;
    }
    case "Button": {
      const handler = actionsToHandler(node.props?.onPress, node.props?.href);
      const label = node.props?.textBind
        ? `{String(state['${esc(node.props.textBind)}'] ?? '')}`
        : esc(node.props?.text ?? "OK");
      return `${pad}<Pressable style={${style}} onPress={${handler}}>\n${pad}  <Text style={{ color: theme.colorPrimaryFg, fontWeight: '600', textAlign: 'center' }}>${label}</Text>\n${pad}</Pressable>`;
    }
    case "Image": {
      const src = node.props?.source ? `{ uri: '${esc(node.props.source)}' }` : undefined;
      if (!src) {
        return `${pad}<View style={[${style}, { backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#71717A' }}>Image</Text></View>`;
      }
      return `${pad}<Image source={${src}} style={${style}} />`;
    }
    case "TextInput": {
      const bind = node.props?.valueBind;
      const ph = esc(node.props?.placeholder ?? "");
      if (bind) {
        return `${pad}<TextInput\n${pad}  placeholder="${ph}"\n${pad}  placeholderTextColor="#71717A"\n${pad}  style={${style}}\n${pad}  value={String(state['${esc(bind)}'] ?? '')}\n${pad}  onChangeText={(t) => setVar('${esc(bind)}', t)}\n${pad}/>`;
      }
      return `${pad}<TextInput placeholder="${ph}" placeholderTextColor="#71717A" style={${style}} />`;
    }
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
  collectImports(screen.root, imports);
  if (needs.alert) imports.add("Alert");
  if (needs.linking) imports.add("Linking");
  const unique = [...imports].sort();
  const body = renderNodeTSX(screen.root, 4, true);

  const hooks: string[] = [];
  if (needs.router) hooks.push("  const router = useRouter();");
  if (needs.state) hooks.push("  const { state, setVar } = useAppState();");

  return `import { ${unique.join(", ")} } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
${needs.router ? `import { useRouter } from 'expo-router';\n` : ""}import { theme } from '../theme';
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
        "expo-router": "~4.0.20",
        "expo-status-bar": "~2.0.1",
        "expo-linking": "~7.0.5",
        "expo-constants": "~17.0.8",
        react: "18.3.1",
        "react-native": "0.76.9",
        "react-native-safe-area-context": "4.12.0",
        "react-native-screens": "~4.4.0",
        "react-native-gesture-handler": "~2.20.2",
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

  files["theme.ts"] = `export const theme = ${JSON.stringify(doc.theme, null, 2)} as const;
`;

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
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from './state';
import { theme } from '../theme';

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
${roots.map((sc) => `            <Tabs.Screen name="${sc.route === "index" ? "index" : sc.route}" options={{ title: '${esc(sc.name)}' }} />`).join("\n")}
          </Tabs>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
`;
  } else {
    files["app/_layout.tsx"] = `import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from './state';
import { theme } from '../theme';

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppStateProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.colorSurface },
              headerTintColor: theme.colorText,
              contentStyle: { backgroundColor: theme.colorBg },
            }}
          >
${doc.screens.map((sc) => `            <Stack.Screen name="${sc.route === "index" ? "index" : sc.route}" options={{ title: '${esc(sc.name)}' }} />`).join("\n")}
          </Stack>
        </AppStateProvider>
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
