import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { current, isDraft, type Draft } from "immer";
import { nanoid } from "nanoid";
import {
  APP_STAGE_HEIGHT,
  APP_STAGE_WIDTH,
  APP_COMPONENT_REGISTRY,
  clampLayout,
  cloneNodeDeep,
  defaultLayoutForType,
  findAppNode,
  findParentNode,
  insertChild,
  normalizeAppDocument,
  updateNodeById,
  type AppAction,
  type AppComponentDef,
  type AppComponentType,
  type AppDocument,
  type AppNode,
  type AppNodeLayout,
  type AppScreen,
  type AppThemeTokens,
} from "@bildo/api";

const HISTORY_LIMIT = 50;
const COALESCE_MS = 900;

export type AppSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface HistoryEntry {
  id: string;
  label: string;
  at: string;
  document: AppDocument;
  coalesceKey?: string;
}

interface AppStore {
  document: AppDocument | null;
  selectedScreenId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  clipboard: AppNode | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  saveStatus: AppSaveStatus;
  saveError: string | null;
  lastErrors: string[];
  aiBatch: boolean;

  setDocument(doc: AppDocument): void;
  setSaveStatus(status: AppSaveStatus, error?: string | null): void;
  selectScreen(id: string | null): void;
  selectNode(id: string | null, opts?: { additive?: boolean }): void;
  clearSelection(): void;

  updateTheme(patch: Partial<AppThemeTokens>): void;
  renameApp(name: string): void;
  updateNode(screenId: string, nodeId: string, patch: Partial<AppNode>): void;
  setNodeText(screenId: string, nodeId: string, text: string): void;
  setNodeLayout(screenId: string, nodeId: string, layout: Partial<AppNodeLayout>, coalesce?: boolean): void;
  moveNodes(screenId: string, nodeIds: string[], dx: number, dy: number, coalesce?: boolean): void;
  resizeNode(screenId: string, nodeId: string, layout: AppNodeLayout, coalesce?: boolean): void;
  addComponent(screenId: string, parentId: string, type: AppComponentType): boolean;
  removeNode(screenId: string, nodeId: string): void;
  removeSelected(): void;
  duplicateSelected(): void;
  copySelected(): void;
  pasteClipboard(): void;
  setNodeActions(screenId: string, nodeId: string, event: "onPress" | "onChange", actions: AppAction[]): void;
  setAppVar(name: string, value: string | number | boolean): void;
  addScreen(name?: string): string | null;
  removeScreen(screenId: string): void;
  renameScreen(screenId: string, name: string): void;

  undo(): void;
  redo(): void;
  createCheckpoint(label?: string): void;
  beginAiTurn(label?: string): void;
  endAiTurn(label?: string): void;
}

function toPlain<T>(value: T): T {
  return isDraft(value) ? current(value as Draft<T>) : value;
}

function cloneDoc(doc: AppDocument): AppDocument {
  return JSON.parse(JSON.stringify(toPlain(doc))) as AppDocument;
}

function cloneNode(node: AppNode): AppNode {
  return JSON.parse(JSON.stringify(toPlain(node))) as AppNode;
}

function pushPast(
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

function touch(doc: AppDocument): void {
  doc.updatedAt = new Date().toISOString();
}

function getScreen(doc: AppDocument, screenId: string): AppScreen | undefined {
  return doc.screens.find((s) => s.id === screenId);
}

function isLockedInTree(root: AppNode, nodeId: string): boolean {
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

function containsNode(root: AppNode, nodeId: string): boolean {
  return Boolean(findAppNode(root, nodeId));
}

function pruneSelection(
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

function parentBounds(root: AppNode, nodeId: string): { w: number; h: number } {
  const parent = findParentNode(root, nodeId);
  if (!parent?.layout) return { w: APP_STAGE_WIDTH, h: APP_STAGE_HEIGHT };
  return { w: parent.layout.width, h: parent.layout.height };
}

function makeNode(type: AppComponentType, theme: AppThemeTokens, index: number): AppNode {
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

export const useAppDocumentStore = create<AppStore>()(
  immer((set, get) => ({
    document: null,
    selectedScreenId: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    clipboard: null,
    past: [],
    future: [],
    saveStatus: "idle",
    saveError: null,
    lastErrors: [],
    aiBatch: false,

    setDocument: (doc) =>
      set((state) => {
        const normalized = normalizeAppDocument(doc);
        state.document = normalized;
        state.selectedScreenId = normalized.screens[0]?.id ?? null;
        state.selectedNodeId = null;
        state.selectedNodeIds = [];
        state.past = [];
        state.future = [];
        state.saveStatus = "saved";
        state.saveError = null;
        state.lastErrors = [];
        state.aiBatch = false;
      }),

    setSaveStatus: (status, error = null) =>
      set((state) => {
        state.saveStatus = status;
        state.saveError = status === "error" ? (error ?? "Ошибка сохранения") : null;
      }),

    selectScreen: (id) =>
      set((state) => {
        if (id && (!state.document || !getScreen(state.document, id))) return;
        state.selectedScreenId = id;
        state.selectedNodeId = null;
        state.selectedNodeIds = [];
      }),

    selectNode: (id, opts) =>
      set((state) => {
        if (!id) {
          state.selectedNodeId = null;
          state.selectedNodeIds = [];
          return;
        }
        if (!state.document || !state.selectedScreenId) return;
        const screen = getScreen(state.document, state.selectedScreenId);
        const node = screen ? findAppNode(screen.root, id) : null;
        if (!node || node.hidden || node.id === screen?.root.id) return;
        if (opts?.additive) {
          const setIds = new Set(state.selectedNodeIds);
          if (setIds.has(id)) setIds.delete(id);
          else setIds.add(id);
          state.selectedNodeIds = [...setIds];
          state.selectedNodeId = id;
        } else {
          state.selectedNodeId = id;
          state.selectedNodeIds = [id];
        }
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedNodeId = null;
        state.selectedNodeIds = [];
      }),

    updateTheme: (patch) =>
      set((state) => {
        if (!state.document) return;
        pushPast(state, "Тема");
        const previousBg = state.document.theme.colorBg;
        Object.assign(state.document.theme, patch);
        if (patch.colorBg) {
          for (const sc of state.document.screens) {
            if (!sc.root.style?.backgroundColor || sc.root.style.backgroundColor === previousBg) {
              sc.root.style = { ...sc.root.style, backgroundColor: patch.colorBg };
            }
          }
        }
        touch(state.document);
      }),

    renameApp: (name) =>
      set((state) => {
        if (!state.document) return;
        pushPast(state, "Имя", "rename-app");
        state.document.name = name.trim() || state.document.name;
        touch(state.document);
      }),

    updateNode: (screenId, nodeId, patch) =>
      set((state) => {
        if (!state.document) return;
        const screen = getScreen(state.document, screenId);
        if (!screen) return;
        const target = findAppNode(screen.root, nodeId);
        if (!target || target.locked) {
          state.lastErrors = ["Слой закреплён"];
          return;
        }
        pushPast(state, "Свойства");
        if (patch.name !== undefined) target.name = patch.name;
        if (patch.hidden !== undefined) target.hidden = patch.hidden;
        if (patch.locked !== undefined) target.locked = patch.locked;
        if (patch.groupId !== undefined) target.groupId = patch.groupId;
        if (patch.field !== undefined) target.field = patch.field;
        if (patch.props) target.props = { ...target.props, ...patch.props };
        if (patch.style) {
          target.style = { ...target.style, ...patch.style };
          if (patch.style.padding !== undefined && target.style) {
            delete target.style.paddingHorizontal;
            delete target.style.paddingVertical;
          }
        }
        if (patch.layout) target.layout = { ...target.layout!, ...patch.layout };
        if (patch.children) target.children = patch.children;
        if (patch.type) target.type = patch.type;
        state.lastErrors = [];
        touch(state.document);
      }),

    setNodeText: (screenId, nodeId, text) =>
      set((state) => {
        if (!state.document) return;
        const screen = getScreen(state.document, screenId);
        if (!screen) return;
        const target = findAppNode(screen.root, nodeId);
        if (!target || target.locked) {
          state.lastErrors = ["Слой закреплён"];
          return;
        }
        pushPast(state, "Текст", `text:${nodeId}`);
        target.props ??= {};
        target.props.text = text;
        if (target.type === "Text" || target.type === "Button") {
          target.name = text.trim() || undefined;
        }
        state.lastErrors = [];
        touch(state.document);
      }),

    setNodeLayout: (screenId, nodeId, layout, coalesce) =>
      set((state) => {
        if (!state.document) return;
        const screen = getScreen(state.document, screenId);
        if (!screen) return;
        const node = findAppNode(screen.root, nodeId);
        if (!node || node.id === screen.root.id || node.locked) return;
        pushPast(state, "Позиция", coalesce ? `layout:${nodeId}` : undefined);
        const bounds = parentBounds(screen.root, nodeId);
        const next = clampLayout(
          { ...(node.layout ?? { x: 0, y: 0, width: 100, height: 40 }), ...layout },
          bounds.w,
          bounds.h,
        );
        node.layout = next;
        state.lastErrors = [];
        touch(state.document);
      }),

    moveNodes: (screenId, nodeIds, dx, dy, coalesce) =>
      set((state) => {
        if (!state.document || (!dx && !dy)) return;
        const screen = getScreen(state.document, screenId);
        if (!screen) return;
        const movable = nodeIds
          .map((id) => findAppNode(screen.root, id))
          .filter((n): n is NonNullable<typeof n> => Boolean(n?.layout && !n.locked && n.id !== screen.root.id));
        if (!movable.length) return;
        pushPast(
          state,
          "Перемещение",
          coalesce
            ? `move:${movable
                .map((n) => n.id)
                .sort()
                .join(",")}`
            : undefined,
        );
        for (const node of movable) {
          const bounds = parentBounds(screen.root, node.id);
          node.layout = clampLayout(
            { ...node.layout!, x: node.layout!.x + dx, y: node.layout!.y + dy },
            bounds.w,
            bounds.h,
          );
        }
        state.lastErrors = [];
        touch(state.document);
      }),

    resizeNode: (screenId, nodeId, layout, coalesce) =>
      set((state) => {
        if (!state.document) return;
        const screen = getScreen(state.document, screenId);
        if (!screen) return;
        const node = findAppNode(screen.root, nodeId);
        if (!node || node.locked) return;
        pushPast(state, "Размер", coalesce ? `resize:${nodeId}` : undefined);
        const bounds = parentBounds(screen.root, nodeId);
        node.layout = clampLayout(layout, bounds.w, bounds.h);
        state.lastErrors = [];
        touch(state.document);
      }),

    addComponent: (screenId, parentId, type) => {
      const { document } = get();
      if (!document) return false;
      const screen = getScreen(document, screenId);
      if (!screen) return false;
      const parent = findAppNode(screen.root, parentId) ?? screen.root;
      const hostDef = APP_COMPONENT_REGISTRY[parent.type];
      if (!hostDef.canHaveChildren || parent.locked) {
        set((s) => {
          s.lastErrors = ["Сюда нельзя вложить компонент"];
        });
        return false;
      }
      set((state) => {
        if (!state.document) return;
        const sc = getScreen(state.document, screenId);
        if (!sc) return;
        const host = findAppNode(sc.root, parent.id) ?? sc.root;
        pushPast(state, `+ ${APP_COMPONENT_REGISTRY[type].displayName}`);
        const idx = host.children?.length ?? 0;
        const child = makeNode(type, state.document.theme, idx);
        const pw = host.layout?.width ?? APP_STAGE_WIDTH;
        child.layout = {
          x: 16,
          y: 16 + idx * 24,
          width: Math.min(child.layout!.width, pw - 32),
          height: child.layout!.height,
        };
        host.children ??= [];
        host.children.push(child);
        state.selectedNodeId = child.id;
        state.selectedNodeIds = [child.id];
        touch(state.document);
        state.lastErrors = [];
      });
      return true;
    },

    removeNode: (screenId, nodeId) =>
      set((state) => {
        if (!state.document) return;
        const screen = getScreen(state.document, screenId);
        if (!screen) return;
        if (screen.root.id === nodeId) {
          state.lastErrors = ["Нельзя удалить корень экрана"];
          return;
        }
        const target = findAppNode(screen.root, nodeId);
        if (!target || target.locked) {
          state.lastErrors = ["Слой закреплён"];
          return;
        }
        pushPast(state, "Удаление");
        const parent = findParentNode(screen.root, nodeId);
        if (parent?.children) {
          parent.children = parent.children.filter((c) => c.id !== nodeId);
        }
        state.selectedNodeIds = state.selectedNodeIds.filter((id) => id !== nodeId && !containsNode(target, id));
        if (state.selectedNodeId === nodeId || (state.selectedNodeId && containsNode(target, state.selectedNodeId))) {
          state.selectedNodeId = state.selectedNodeIds[0] ?? null;
        }
        state.lastErrors = [];
        touch(state.document);
      }),

    removeSelected: () => {
      const { document, selectedScreenId, selectedNodeIds, selectedNodeId } = get();
      if (!document || !selectedScreenId) return;
      const ids = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
      for (const id of ids) get().removeNode(selectedScreenId, id);
    },

    duplicateSelected: () =>
      set((state) => {
        if (!state.document || !state.selectedScreenId) return;
        const screen = getScreen(state.document, state.selectedScreenId);
        if (!screen) return;
        const ids = state.selectedNodeIds.length
          ? state.selectedNodeIds
          : state.selectedNodeId
            ? [state.selectedNodeId]
            : [];
        if (!ids.length) return;
        pushPast(state, "Дублировать");
        const newIds: string[] = [];
        for (const id of ids) {
          const node = findAppNode(screen.root, id);
          const parent = findParentNode(screen.root, id);
          if (!node || !parent || isLockedInTree(screen.root, parent.id)) continue;
          const clone = cloneNodeDeep(node);
          screen.root = insertChild(screen.root, parent.id, clone);
          newIds.push(clone.id);
        }
        state.selectedNodeIds = newIds;
        state.selectedNodeId = newIds[0] ?? null;
        touch(state.document);
      }),

    copySelected: () =>
      set((state) => {
        if (!state.document || !state.selectedScreenId) return;
        const id = state.selectedNodeId ?? state.selectedNodeIds[0] ?? null;
        if (!id) return;
        const screen = getScreen(state.document, state.selectedScreenId);
        const node = screen ? findAppNode(screen.root, id) : null;
        if (!node || node.id === screen?.root.id) return;
        state.clipboard = cloneNode(node);
        if (!state.selectedNodeId) {
          state.selectedNodeId = id;
          state.selectedNodeIds = [id];
        }
      }),

    pasteClipboard: () =>
      set((state) => {
        if (!state.document || !state.selectedScreenId || !state.clipboard) return;
        const screen = getScreen(state.document, state.selectedScreenId);
        if (!screen) return;

        const selectedId = state.selectedNodeId ?? state.selectedNodeIds[0] ?? null;
        const selected = selectedId ? findAppNode(screen.root, selectedId) : null;

        let parent: AppNode = screen.root;
        let index: number | undefined;

        if (selected && selected.id !== screen.root.id) {
          if (APP_COMPONENT_REGISTRY[selected.type].canHaveChildren) {
            parent = selected;
          } else {
            const p = findParentNode(screen.root, selected.id);
            if (p) {
              parent = p;
              const idx = (p.children ?? []).findIndex((c) => c.id === selected.id);
              index = idx >= 0 ? idx + 1 : undefined;
            }
          }
        }

        if (!APP_COMPONENT_REGISTRY[parent.type].canHaveChildren || isLockedInTree(screen.root, parent.id)) {
          state.lastErrors = ["Сюда нельзя вставить"];
          return;
        }
        pushPast(state, "Вставить");
        const clone = cloneNodeDeep(state.clipboard);
        screen.root = insertChild(screen.root, parent.id, clone, index);
        state.selectedNodeId = clone.id;
        state.selectedNodeIds = [clone.id];
        state.lastErrors = [];
        touch(state.document);
      }),

    setNodeActions: (screenId, nodeId, event, actions) =>
      set((state) => {
        if (!state.document) return;
        const screen = getScreen(state.document, screenId);
        if (!screen || isLockedInTree(screen.root, nodeId)) return;
        pushPast(state, "Логика");
        const node = findAppNode(screen.root, nodeId);
        const props = { ...node?.props, [event]: actions };
        screen.root = updateNodeById(screen.root, nodeId, { props });
        touch(state.document);
      }),

    setAppVar: (name, value) =>
      set((state) => {
        if (!state.document) return;
        state.document.state ??= {};
        state.document.state[name] = value;
        touch(state.document);
      }),

    addScreen: (name) => {
      const { document } = get();
      if (!document) return null;
      const id = nanoid(8);
      const route = `screen-${document.screens.length + 1}`;
      set((state) => {
        if (!state.document) return;
        pushPast(state, "Новый экран");
        const title = name?.trim() || `Экран ${state.document.screens.length + 1}`;
        const root = makeNode("View", state.document.theme, 0);
        root.layout = { x: 0, y: 0, width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT };
        root.style = { backgroundColor: state.document.theme.colorBg };
        const titleNode = makeNode("Text", state.document.theme, 0);
        titleNode.props = { text: title };
        titleNode.style = {
          fontSize: 22,
          fontWeight: "700",
          color: state.document.theme.colorText,
        };
        titleNode.layout = { x: 16, y: 24, width: 300, height: 40 };
        root.children = [titleNode];
        state.document.screens.push({
          id,
          name: title,
          route,
          icon: "apps",
          root,
        });
        state.document.navigation.roots.push(id);
        state.selectedScreenId = id;
        state.selectedNodeId = null;
        state.selectedNodeIds = [];
        state.lastErrors = [];
        touch(state.document);
      });
      return id;
    },

    removeScreen: (screenId) =>
      set((state) => {
        if (!state.document) return;
        if (state.document.screens.length <= 1) {
          state.lastErrors = ["Нужен хотя бы один экран"];
          return;
        }
        pushPast(state, "Удалить экран");
        state.document.screens = state.document.screens.filter((s) => s.id !== screenId);
        state.document.navigation.roots = state.document.navigation.roots.filter((id) => id !== screenId);
        if (state.selectedScreenId === screenId) {
          state.selectedScreenId = state.document.screens[0]?.id ?? null;
        }
        state.selectedNodeId = null;
        state.selectedNodeIds = [];
        touch(state.document);
      }),

    renameScreen: (screenId, name) =>
      set((state) => {
        if (!state.document) return;
        const sc = getScreen(state.document, screenId);
        if (!sc) return;
        pushPast(state, "Имя экрана", `rename-screen:${screenId}`);
        sc.name = name.trim() || sc.name;
        touch(state.document);
      }),

    undo: () =>
      set((state) => {
        if (!state.document || state.past.length === 0) return;
        const entry = state.past.pop()!;
        state.future.push({
          id: nanoid(),
          label: "Redo",
          at: new Date().toISOString(),
          document: cloneDoc(state.document),
        });
        state.document = entry.document;
        const selection = pruneSelection(
          state.document,
          state.selectedScreenId,
          state.selectedNodeId,
          state.selectedNodeIds,
        );
        state.selectedScreenId = selection.screenId;
        state.selectedNodeId = selection.nodeId;
        state.selectedNodeIds = selection.nodeIds;
      }),

    redo: () =>
      set((state) => {
        if (!state.document || state.future.length === 0) return;
        const entry = state.future.pop()!;
        state.past.push({
          id: nanoid(),
          label: "Undo",
          at: new Date().toISOString(),
          document: cloneDoc(state.document),
        });
        state.document = entry.document;
        const selection = pruneSelection(
          state.document,
          state.selectedScreenId,
          state.selectedNodeId,
          state.selectedNodeIds,
        );
        state.selectedScreenId = selection.screenId;
        state.selectedNodeId = selection.nodeId;
        state.selectedNodeIds = selection.nodeIds;
      }),

    createCheckpoint: (label) =>
      set((state) => {
        if (!state.document) return;
        state.past.push({
          id: nanoid(),
          label: label?.trim() || "Checkpoint",
          at: new Date().toISOString(),
          document: cloneDoc(state.document),
        });
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        state.future = [];
      }),

    beginAiTurn: (label = "До AI") => {
      get().createCheckpoint(label);
      set((s) => {
        s.aiBatch = true;
      });
    },
    endAiTurn: (label = "После AI") => {
      set((s) => {
        s.aiBatch = false;
      });
      get().createCheckpoint(label);
    },
  })),
);
