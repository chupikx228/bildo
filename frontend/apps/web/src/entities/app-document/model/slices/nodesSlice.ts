import {
  APP_COMPONENT_REGISTRY,
  APP_STAGE_WIDTH,
  clampLayout,
  cloneNodeDeep,
  findAppNode,
  findParentNode,
  insertChild,
  updateNodeById,
  type AppAction,
  type AppComponentType,
  type AppNode,
  type AppNodeLayout,
} from "@bildo/api";
import { containsNode, getScreen, isLockedInTree, makeNode, parentBounds, pushPast, touch } from "../helpers";
import type { AppSlice } from "../types";

export interface NodesSlice {
  updateNode(screenId: string, nodeId: string, patch: Partial<AppNode>): void;
  setNodeText(screenId: string, nodeId: string, text: string): void;
  setNodeLayout(screenId: string, nodeId: string, layout: Partial<AppNodeLayout>, coalesce?: boolean): void;
  moveNodes(screenId: string, nodeIds: string[], dx: number, dy: number, coalesce?: boolean): void;
  resizeNode(screenId: string, nodeId: string, layout: AppNodeLayout, coalesce?: boolean): void;
  addComponent(screenId: string, parentId: string, type: AppComponentType): boolean;
  removeNode(screenId: string, nodeId: string): void;
  removeSelected(): void;
  duplicateSelected(): void;
  setNodeActions(screenId: string, nodeId: string, event: "onPress" | "onChange", actions: AppAction[]): void;
}

export const createNodesSlice: AppSlice<NodesSlice> = (set, get) => ({
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
});
