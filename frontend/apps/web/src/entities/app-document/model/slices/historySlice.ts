import { nanoid } from "nanoid";
import { cloneDoc, HISTORY_LIMIT, pruneSelection } from "../helpers";
import type { AppSlice, HistoryEntry } from "../types";

export interface HistorySlice {
  past: HistoryEntry[];
  future: HistoryEntry[];
  aiBatch: boolean;

  undo(): void;
  redo(): void;
  createCheckpoint(label?: string): void;
  beginAiTurn(label?: string): void;
  endAiTurn(): void;
}

export const createHistorySlice: AppSlice<HistorySlice> = (set, get) => ({
  past: [],
  future: [],
  aiBatch: false,

  undo: () =>
    set((state) => {
      if (!state.document || state.past.length === 0) return;
      const revision = state.document.revision;
      const entry = state.past.pop()!;
      state.future.push({
        id: nanoid(),
        label: "Redo",
        at: new Date().toISOString(),
        document: cloneDoc(state.document),
      });
      state.document = entry.document;
      state.document.revision = revision;
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
      const revision = state.document.revision;
      const entry = state.future.pop()!;
      state.past.push({
        id: nanoid(),
        label: "Undo",
        at: new Date().toISOString(),
        document: cloneDoc(state.document),
      });
      state.document = entry.document;
      state.document.revision = revision;
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

  endAiTurn: () => {
    set((s) => {
      s.aiBatch = false;
    });
  },
});
