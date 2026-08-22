import {
  APP_COMPONENT_REGISTRY,
  cloneNodeDeep,
  findAppNode,
  findParentNode,
  insertChild,
  type AppNode,
} from "@bildo/api";
import { cloneNode, getScreen, isLockedInTree, pushPast, touch } from "../helpers";
import type { AppSlice } from "../types";

export interface ClipboardSlice {
  clipboard: AppNode | null;

  copySelected(): void;
  pasteClipboard(): void;
}

export const createClipboardSlice: AppSlice<ClipboardSlice> = (set) => ({
  clipboard: null,

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
});
