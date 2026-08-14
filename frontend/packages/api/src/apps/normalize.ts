import { nanoid } from "nanoid";
import type { AppDocument, AppNode, AppNodeLayout } from "./model";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, DEFAULT_APP_THEME, DEFAULT_NODE_SIZE } from "./model";

function sizeOf(type: AppNode["type"]): { width: number; height: number } {
  return { ...DEFAULT_NODE_SIZE[type] };
}

function layoutOrDefault(node: AppNode, x: number, y: number, parentW: number): AppNodeLayout {
  if (node.layout) {
    return {
      x: node.layout.x,
      y: node.layout.y,
      width: Math.max(8, node.layout.width),
      height: Math.max(8, node.layout.height),
      zIndex: node.layout.zIndex,
    };
  }
  const s = sizeOf(node.type);
  const w =
    typeof node.style?.width === "number"
      ? node.style.width
      : node.style?.width === "100%"
        ? Math.max(40, parentW - 32)
        : Math.min(s.width, parentW - 32);
  const h = typeof node.style?.height === "number" ? node.style.height : s.height;
  return { x, y, width: w, height: h };
}

function migrateNode(node: AppNode, isRoot: boolean, parentW: number, stackY: { y: number }): AppNode {
  let layout: AppNodeLayout;
  if (isRoot) {
    layout = { x: 0, y: 0, width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT, zIndex: 0 };
  } else {
    layout = layoutOrDefault(node, 16, stackY.y, parentW);
    if (!node.layout) stackY.y += layout.height + 12;
  }

  const nextChildren = (node.children ?? []).map((child, i) => {
    const nestedStack = { y: 12 };
    const withHint: AppNode = child.layout
      ? child
      : {
          ...child,
          layout: {
            x: 12,
            y: 12 + i * (sizeOf(child.type).height + 10),
            width: Math.min(sizeOf(child.type).width, layout.width - 24),
            height: sizeOf(child.type).height,
          },
        };
    return migrateNode(withHint, false, layout.width, nestedStack);
  });

  return { ...node, layout, children: nextChildren.length ? nextChildren : node.children };
}

export function normalizeAppDocument(raw: AppDocument): AppDocument {
  const doc: AppDocument = structuredClone(raw);
  doc.theme = { ...DEFAULT_APP_THEME, ...doc.theme };
  doc.state = doc.state ?? {};
  if (!Array.isArray(doc.screens)) doc.screens = [];
  if (!doc.navigation) {
    doc.navigation = { type: "stack", roots: doc.screens.map((s) => s.id) };
  }

  const used = new Set<string>();
  for (const sc of doc.screens) {
    let route = sc.route || `screen-${nanoid(4)}`;
    let n = 1;
    while (used.has(route)) route = `${sc.route || "screen"}-${n++}`;
    used.add(route);
    sc.route = route;
  }

  const screenIds = new Set(doc.screens.map((s) => s.id));
  doc.navigation.roots = (doc.navigation.roots ?? []).filter((id) => screenIds.has(id));
  for (const sc of doc.screens) {
    if (!doc.navigation.roots.includes(sc.id)) doc.navigation.roots.push(sc.id);
  }

  for (const sc of doc.screens) {
    const stack = { y: 16 };
    sc.root = migrateNode(sc.root, true, APP_STAGE_WIDTH, stack);
    sc.root.style = {
      ...sc.root.style,
      backgroundColor: sc.root.style?.backgroundColor ?? doc.theme.colorBg,
    };
  }

  return doc;
}

export function clampLayout(
  layout: AppNodeLayout,
  parentW = APP_STAGE_WIDTH,
  parentH = APP_STAGE_HEIGHT,
): AppNodeLayout {
  const width = Math.max(8, Math.min(layout.width, parentW));
  const height = Math.max(8, Math.min(layout.height, parentH));
  const x = Math.max(0, Math.min(layout.x, parentW - width));
  const y = Math.max(-parentH, Math.min(layout.y, parentH - Math.min(8, height)));
  return { ...layout, x, y, width, height };
}

export function defaultLayoutForType(type: AppNode["type"], index: number): AppNodeLayout {
  const size = sizeOf(type);
  return {
    x: 16,
    y: 16 + index * (size.height + 12),
    width: Math.min(size.width, APP_STAGE_WIDTH - 32),
    height: size.height,
  };
}
