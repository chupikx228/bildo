import io
import json
import re
import zipfile
from dataclasses import dataclass
from typing import Any

from src.apps.schemas import (
    AppAction,
    AppDocument,
    AppNode,
    AppScreen,
    NavigateAction,
    OpenUrlAction,
    SetVarAction,
    ToastAction,
)

ExpoFileMap = dict[str, str]


def slugify(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"^-|-$", "", slug)
    return slug[:32] or "app"


def _esc(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")


def _route_path(route: str) -> str:
    return "/" if route == "index" else f"/{route}"


def _number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def _json_compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_pretty(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def _style_to_rn(node: AppNode, is_root: bool) -> str:
    parts: list[str] = []
    if is_root:
        parts.append("  flex: 1")
    elif node.layout is not None:
        parts.append("  position: 'absolute'")
        parts.append(f"  left: {_number(node.layout.x)}")
        parts.append(f"  top: {_number(node.layout.y)}")
        parts.append(f"  width: {_number(node.layout.width)}")
        parts.append(f"  height: {_number(node.layout.height)}")
        if node.layout.z_index is not None:
            parts.append(f"  zIndex: {node.layout.z_index}")
    if node.style is not None:
        for key, value in node.style.model_dump(by_alias=True, exclude_none=True).items():
            if not is_root and node.layout is not None and key in {"width", "height"}:
                continue
            if isinstance(value, str):
                parts.append(f"  {key}: '{_esc(value)}'")
            else:
                parts.append(f"  {key}: {_number(value)}")
    if not parts:
        return "{}"
    return "{\n" + ",\n".join(parts) + "\n}"


def _actions_to_handler(actions: list[AppAction] | None, href: str | None = None) -> str:
    items: list[AppAction] = list(actions or [])
    if href and not any(isinstance(action, NavigateAction) and action.route == href for action in items):
        items.append(NavigateAction(type="navigate", route=href))
    if not items:
        return "() => {}"
    lines: list[str] = []
    for action in items:
        if isinstance(action, NavigateAction):
            lines.append(f"router.push('{_esc(_route_path(action.route))}')")
        elif isinstance(action, SetVarAction):
            lines.append(f"setVar('{_esc(action.name)}', {_json_compact(action.value)})")
        elif isinstance(action, ToastAction):
            lines.append(f"Alert.alert('', '{_esc(action.message)}')")
        elif isinstance(action, OpenUrlAction):
            lines.append(f"Linking.openURL('{_esc(action.url)}')")
    return "() => {\n    " + ";\n    ".join(lines) + ";\n  }"


@dataclass
class _ScreenNeeds:
    alert: bool = False
    linking: bool = False
    router: bool = False
    state: bool = False


def _collect_needs(node: AppNode, needs: _ScreenNeeds) -> None:
    props = node.props
    if props is not None:
        if props.on_press or props.href:
            needs.router = True
            for action in props.on_press or []:
                if isinstance(action, ToastAction):
                    needs.alert = True
                if isinstance(action, OpenUrlAction):
                    needs.linking = True
                if isinstance(action, SetVarAction):
                    needs.state = True
        if props.value_bind or props.text_bind:
            needs.state = True
    for child in node.children:
        _collect_needs(child, needs)


def _collect_imports(node: AppNode, names: set[str]) -> None:
    if node.type == "Button":
        names.add("Pressable")
        names.add("Text")
    elif node.type == "Spacer":
        names.add("View")
    elif node.type == "Image":
        names.add("Image")
        names.add("View")
        names.add("Text")
    else:
        names.add(node.type)
    for child in node.children:
        _collect_imports(child, names)


def _render_node_tsx(node: AppNode, indent: int, is_root: bool) -> str:
    pad = " " * indent
    if node.hidden:
        return f"{pad}{{null}}"
    style = _style_to_rn(node, is_root)
    props = node.props

    if node.type == "Text":
        bind = props.text_bind if props else None
        if bind:
            return pad + "<Text style={" + style + "}>{String(state['" + _esc(bind) + "'] ?? '')}</Text>"
        text = props.text if props is not None and props.text is not None else ""
        return pad + "<Text style={" + style + "}>" + _esc(text) + "</Text>"

    if node.type == "Button":
        handler = _actions_to_handler(props.on_press if props else None, props.href if props else None)
        if props and props.text_bind:
            label = "{String(state['" + _esc(props.text_bind) + "'] ?? '')}"
        else:
            label = _esc(props.text if props is not None and props.text is not None else "OK")
        return (
            pad
            + "<Pressable style={"
            + style
            + "} onPress={"
            + handler
            + "}>\n"
            + pad
            + "  <Text style={{ color: theme.colorPrimaryFg, fontWeight: '600', textAlign: 'center' }}>"
            + label
            + "</Text>\n"
            + pad
            + "</Pressable>"
        )

    if node.type == "Image":
        source = props.source if props else None
        if not source:
            return (
                pad
                + "<View style={["
                + style
                + ", { backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center' }]}>"
                + "<Text style={{ color: '#71717A' }}>Image</Text></View>"
            )
        return pad + "<Image source={{ uri: '" + _esc(source) + "' }} style={" + style + "} />"

    if node.type == "TextInput":
        bind = props.value_bind if props else None
        placeholder = _esc(props.placeholder if props and props.placeholder else "")
        if bind:
            return (
                pad
                + "<TextInput\n"
                + pad
                + '  placeholder="'
                + placeholder
                + '"\n'
                + pad
                + '  placeholderTextColor="#71717A"\n'
                + pad
                + "  style={"
                + style
                + "}\n"
                + pad
                + "  value={String(state['"
                + _esc(bind)
                + "'] ?? '')}\n"
                + pad
                + "  onChangeText={(t) => setVar('"
                + _esc(bind)
                + "', t)}\n"
                + pad
                + "/>"
            )
        return (
            pad + '<TextInput placeholder="' + placeholder + '" placeholderTextColor="#71717A" style={' + style + "} />"
        )

    if node.type == "Spacer":
        return pad + "<View style={" + style + "} />"

    if node.type == "FlatList":
        data = _json_compact(props.data if props and props.data is not None else ["Item"])
        return (
            pad
            + "<FlatList\n"
            + pad
            + "  style={"
            + style
            + "}\n"
            + pad
            + "  data={"
            + data
            + "}\n"
            + pad
            + "  keyExtractor={(item, i) => String(i)}\n"
            + pad
            + "  renderItem={({ item }) => (\n"
            + pad
            + "    <View style={{ padding: 12, backgroundColor: '#18181B', borderRadius: 10, marginBottom: 8 }}>\n"
            + pad
            + "      <Text style={{ color: '#FAFAFA' }}>{String(item)}</Text>\n"
            + pad
            + "    </View>\n"
            + pad
            + "  )}\n"
            + pad
            + "/>"
        )

    if node.type in {"ScrollView", "View"}:
        tag = "ScrollView" if node.type == "ScrollView" else "View"
        kids = "\n".join(_render_node_tsx(child, indent + 2, False) for child in node.children)
        scroll_extra = " contentContainerStyle={{ flexGrow: 1 }}" if node.type == "ScrollView" else ""
        return pad + "<" + tag + " style={" + style + "}" + scroll_extra + ">\n" + kids + "\n" + pad + "</" + tag + ">"

    return pad + "<View />"


def _route_to_component(route: str) -> str:
    if route == "index":
        return "IndexScreen"
    return "".join(part[:1].upper() + part[1:] for part in re.split(r"[-_]", route)) + "Screen"


def _screen_file(screen: AppScreen) -> str:
    needs = _ScreenNeeds()
    _collect_needs(screen.root, needs)
    imports = {"View"}
    _collect_imports(screen.root, imports)
    if needs.alert:
        imports.add("Alert")
    if needs.linking:
        imports.add("Linking")
    unique = sorted(imports)
    body = _render_node_tsx(screen.root, 4, True)

    hooks: list[str] = []
    if needs.router:
        hooks.append("  const router = useRouter();")
    if needs.state:
        hooks.append("  const { state, setVar } = useAppState();")

    router_import = "import { useRouter } from 'expo-router';\n" if needs.router else ""
    state_import = "import { useAppState } from './state';\n" if needs.state else ""
    hooks_block = "\n".join(hooks) + "\n" if hooks else ""

    return (
        "import { " + ", ".join(unique) + " } from 'react-native';\n"
        "import { SafeAreaView } from 'react-native-safe-area-context';\n"
        "import { StatusBar } from 'expo-status-bar';\n"
        + router_import
        + "import { theme } from '../theme';\n"
        + state_import
        + "\n"
        + "export default function "
        + _route_to_component(screen.route)
        + "() {\n"
        + hooks_block
        + "  return (\n"
        + "    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colorBg }} edges={['top', 'left', 'right']}>\n"
        + '      <StatusBar style="auto" />\n'
        + body
        + "\n"
        + "    </SafeAreaView>\n"
        + "  );\n"
        + "}\n"
    )


def _package_json(document: AppDocument) -> str:
    return _json_pretty(
        {
            "name": slugify(document.name),
            "version": "1.0.0",
            "main": "expo-router/entry",
            "scripts": {
                "start": "expo start",
                "android": "expo start --android",
                "ios": "expo start --ios",
                "web": "expo start --web",
            },
            "dependencies": {
                "expo": "~52.0.46",
                "expo-router": "~4.0.20",
                "expo-status-bar": "~2.0.1",
                "expo-linking": "~7.0.5",
                "expo-constants": "~17.0.8",
                "react": "18.3.1",
                "react-native": "0.76.9",
                "react-native-safe-area-context": "4.12.0",
                "react-native-screens": "~4.4.0",
                "react-native-gesture-handler": "~2.20.2",
            },
            "devDependencies": {
                "@babel/core": "^7.25.0",
                "babel-preset-expo": "~12.0.0",
                "typescript": "~5.3.3",
                "@types/react": "~18.3.12",
            },
            "private": True,
        }
    )


def _app_json(document: AppDocument) -> str:
    bundle_id = f"com.bildo.{slugify(document.name).replace('-', '') or 'app'}"
    return _json_pretty(
        {
            "expo": {
                "name": document.name,
                "slug": slugify(document.name),
                "version": "1.0.0",
                "orientation": "portrait",
                "scheme": slugify(document.name),
                "userInterfaceStyle": "automatic",
                "newArchEnabled": True,
                "ios": {"supportsTablet": True, "bundleIdentifier": bundle_id},
                "android": {"package": bundle_id, "adaptiveIcon": {"backgroundColor": document.theme.color_bg}},
                "web": {"bundler": "metro"},
                "plugins": ["expo-router"],
            }
        }
    )


def _state_file(document: AppDocument) -> str:
    initial = _json_pretty(document.state if document.state is not None else {})
    return (
        "import React, { createContext, useCallback, useContext, useMemo, useState,"
        " type ReactNode } from 'react';\n"
        "\n"
        "type Vars = Record<string, string | number | boolean>;\n"
        "\n"
        "type CtxValue = {\n"
        "  state: Vars;\n"
        "  setVar: (k: string, v: string | number | boolean) => void;\n"
        "};\n"
        "\n"
        "const Ctx = createContext<CtxValue | null>(null);\n"
        "\n"
        "const initial: Vars = " + initial + ";\n"
        "\n"
        "export function AppStateProvider({ children }: { children: ReactNode }) {\n"
        "  const [state, setState] = useState<Vars>(initial);\n"
        "  const setVar = useCallback((k: string, v: string | number | boolean) => {\n"
        "    setState(s => ({ ...s, [k]: v }));\n"
        "  }, []);\n"
        "  const value = useMemo(() => ({ state, setVar }), [state, setVar]);\n"
        "  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;\n"
        "}\n"
        "\n"
        "export function useAppState(): CtxValue {\n"
        "  const ctx = useContext(Ctx);\n"
        "  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');\n"
        "  return ctx;\n"
        "}\n"
    )


def _tabs_layout(roots: list[AppScreen]) -> str:
    screens = "\n".join(
        '            <Tabs.Screen name="'
        + ("index" if screen.route == "index" else screen.route)
        + "\" options={{ title: '"
        + _esc(screen.name)
        + "' }} />"
        for screen in roots
    )
    return (
        "import { Tabs } from 'expo-router';\n"
        "import { GestureHandlerRootView } from 'react-native-gesture-handler';\n"
        "import { SafeAreaProvider } from 'react-native-safe-area-context';\n"
        "import { AppStateProvider } from './state';\n"
        "import { theme } from '../theme';\n"
        "\n"
        "export default function Layout() {\n"
        "  return (\n"
        "    <GestureHandlerRootView style={{ flex: 1 }}>\n"
        "      <SafeAreaProvider>\n"
        "        <AppStateProvider>\n"
        "          <Tabs\n"
        "            screenOptions={{\n"
        "              headerStyle: { backgroundColor: theme.colorSurface },\n"
        "              headerTintColor: theme.colorText,\n"
        "              tabBarStyle: { backgroundColor: theme.colorSurface,"
        " borderTopColor: theme.colorBorder },\n"
        "              tabBarActiveTintColor: theme.colorPrimary,\n"
        "              tabBarInactiveTintColor: theme.colorTextMuted,\n"
        "              sceneStyle: { backgroundColor: theme.colorBg },\n"
        "            }}\n"
        "          >\n" + screens + "\n"
        "          </Tabs>\n"
        "        </AppStateProvider>\n"
        "      </SafeAreaProvider>\n"
        "    </GestureHandlerRootView>\n"
        "  );\n"
        "}\n"
    )


def _stack_layout(screens_list: list[AppScreen]) -> str:
    screens = "\n".join(
        '            <Stack.Screen name="'
        + ("index" if screen.route == "index" else screen.route)
        + "\" options={{ title: '"
        + _esc(screen.name)
        + "' }} />"
        for screen in screens_list
    )
    return (
        "import { Stack } from 'expo-router';\n"
        "import { GestureHandlerRootView } from 'react-native-gesture-handler';\n"
        "import { SafeAreaProvider } from 'react-native-safe-area-context';\n"
        "import { AppStateProvider } from './state';\n"
        "import { theme } from '../theme';\n"
        "\n"
        "export default function Layout() {\n"
        "  return (\n"
        "    <GestureHandlerRootView style={{ flex: 1 }}>\n"
        "      <SafeAreaProvider>\n"
        "        <AppStateProvider>\n"
        "          <Stack\n"
        "            screenOptions={{\n"
        "              headerStyle: { backgroundColor: theme.colorSurface },\n"
        "              headerTintColor: theme.colorText,\n"
        "              contentStyle: { backgroundColor: theme.colorBg },\n"
        "            }}\n"
        "          >\n" + screens + "\n"
        "          </Stack>\n"
        "        </AppStateProvider>\n"
        "      </SafeAreaProvider>\n"
        "    </GestureHandlerRootView>\n"
        "  );\n"
        "}\n"
    )


def _readme(document: AppDocument) -> str:
    return (
        f"# {document.name}\n"
        "\n"
        "Сгенерировано bildo (AppDocument → Expo).\n"
        "\n"
        "## Запуск\n"
        "\n"
        "```bash\n"
        "npm install\n"
        "npx expo start\n"
        "```\n"
        "\n"
        "Отсканируйте QR в **Expo Go** (iOS/Android) или нажмите `w` для web.\n"
        "\n"
        f"Промпт: {document.prompt if document.prompt is not None else '—'}\n"
    )


GITIGNORE = """node_modules/
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
"""

BABEL_CONFIG = """module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
"""


def generate_files(document: AppDocument) -> ExpoFileMap:
    files: ExpoFileMap = {}

    files["package.json"] = _package_json(document)
    files["app.json"] = _app_json(document)
    files["tsconfig.json"] = _json_pretty({"extends": "expo/tsconfig.base", "compilerOptions": {"strict": True}})
    files["babel.config.js"] = BABEL_CONFIG
    files[".gitignore"] = GITIGNORE
    files["theme.ts"] = (
        "export const theme = " + _json_pretty(document.theme.model_dump(by_alias=True)) + " as const;\n"
    )
    files["app/state.tsx"] = _state_file(document)

    screens_by_id = {screen.id: screen for screen in document.screens}
    roots = [screens_by_id[root_id] for root_id in document.navigation.roots if root_id in screens_by_id]

    if document.navigation.type == "tabs":
        files["app/_layout.tsx"] = _tabs_layout(roots)
    else:
        files["app/_layout.tsx"] = _stack_layout(document.screens)

    for screen in document.screens:
        file_name = "app/index.tsx" if screen.route == "index" else f"app/{screen.route}.tsx"
        files[file_name] = _screen_file(screen)

    files["README.md"] = _readme(document)

    return files


def build_zip(files: ExpoFileMap) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return buffer.getvalue()
