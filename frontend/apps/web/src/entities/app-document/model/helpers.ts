import { current, isDraft, type Draft } from "immer";
import { nanoid } from "nanoid";
import {
  APP_COMPONENT_REGISTRY,
  APP_STAGE_HEIGHT,
  APP_STAGE_WIDTH,
  defaultLayoutForType,
  findAppNode,
  findParentNode,
  type AppComponentDef,
  type AppComponentType,
  type AppDocument,
  type AppNode,
  type AppScreen,
  type AppThemeTokens,
} from "@bildo/api";
import type { HistoryEntry } from "./types";

export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 900;

function toPlain<T>(value: T): T {
  return isDraft(value) ? current(value as Draft<T>) : value;
}

export function cloneDoc(doc: AppDocument): AppDocument {
  return JSON.parse(JSON.stringify(toPlain(doc))) as AppDocument;
}

export function cloneNode(node: AppNode): AppNode {
  return JSON.parse(JSON.stringify(toPlain(node))) as AppNode;
}

export function pushPast(
  state: {
    document: AppDocument | null;
    past: HistoryEntry[];
    future: HistoryEntry[];
    aiBatch?: boolean;
  },
  label: string,
  coalesceKey?: string,
): void {
  if (!state.document || state.aiBatch) return;
  const now = Date.now();
  if (coalesceKey && state.past.length > 0) {
    const last = state.past[state.past.length - 1]!;
    if (last.coalesceKey === coalesceKey && now - new Date(last.at).getTime() < COALESCE_MS) {
      state.future = [];
      return;
    }
  }
  state.past.push({
    id: nanoid(),
    label,
    at: new Date().toISOString(),
    document: cloneDoc(state.document),
    coalesceKey,
  });
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.future = [];
}

export function touch(doc: AppDocument): void {
  doc.updatedAt = new Date().toISOString();
}

export function getScreen(doc: AppDocument, screenId: string): AppScreen | undefined {
  return doc.screens.find((s) => s.id === screenId);
}

export function isLockedInTree(root: AppNode, nodeId: string): boolean {
  let node = findAppNode(root, nodeId);
  if (!node) return true;
  if (node.locked) return true;
  while (node.id !== root.id) {
    const parent = findParentNode(root, node.id);
    if (!parent) break;
    if (parent.locked) return true;
    node = parent;
  }
  return false;
}

export function containsNode(root: AppNode, nodeId: string): boolean {
  return Boolean(findAppNode(root, nodeId));
}

export function pruneSelection(
  document: AppDocument,
  screenId: string | null,
  nodeId: string | null,
  nodeIds: string[],
): { screenId: string | null; nodeId: string | null; nodeIds: string[] } {
  const screen = (screenId && getScreen(document, screenId)) ?? document.screens[0];
  if (!screen) return { screenId: null, nodeId: null, nodeIds: [] };
  const validIds = nodeIds.filter((id) => {
    const n = findAppNode(screen.root, id);
    return n && !n.hidden && n.id !== screen.root.id;
  });
  const primary =
    (nodeId && findAppNode(screen.root, nodeId) && !findAppNode(screen.root, nodeId)!.hidden ? nodeId : validIds[0]) ??
    null;
  return { screenId: screen.id, nodeId: primary, nodeIds: validIds };
}

export function parentBounds(root: AppNode, nodeId: string): { w: number; h: number } {
  const parent = findParentNode(root, nodeId);
  if (!parent?.layout) return { w: APP_STAGE_WIDTH, h: APP_STAGE_HEIGHT };
  return { w: parent.layout.width, h: parent.layout.height };
}

export function makeNode(type: AppComponentType, theme: AppThemeTokens, index: number): AppNode {
  const def: AppComponentDef = APP_COMPONENT_REGISTRY[type];
  const style: AppNode["style"] = def.defaultStyle || def.themeStyle ? { ...def.defaultStyle } : undefined;
  if (style && def.themeStyle) {
    if (def.themeStyle.color) style.color = theme[def.themeStyle.color];
    if (def.themeStyle.backgroundColor) style.backgroundColor = theme[def.themeStyle.backgroundColor];
  }
  return {
    id: nanoid(8),
    type,
    name: def.displayName,
    props: def.defaultProps ? { ...def.defaultProps } : undefined,
    style,
    layout: defaultLayoutForType(type, index),
    children: def.canHaveChildren ? [] : undefined,
  };
}
