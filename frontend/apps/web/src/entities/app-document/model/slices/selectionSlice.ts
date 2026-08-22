import { findAppNode } from "@bildo/api";
import { getScreen } from "../helpers";
import type { AppSlice } from "../types";

export interface SelectionSlice {
  selectedScreenId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];

  selectScreen(id: string | null): void;
  selectNode(id: string | null, opts?: { additive?: boolean }): void;
  clearSelection(): void;
}

export const createSelectionSlice: AppSlice<SelectionSlice> = (set) => ({
  selectedScreenId: null,
  selectedNodeId: null,
  selectedNodeIds: [],

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
});
