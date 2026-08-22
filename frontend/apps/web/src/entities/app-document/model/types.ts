import type { StateCreator } from "zustand";
import type { AppDocument } from "@bildo/api";
import type { DocumentSlice } from "./slices/documentSlice";
import type { SelectionSlice } from "./slices/selectionSlice";
import type { NodesSlice } from "./slices/nodesSlice";
import type { ClipboardSlice } from "./slices/clipboardSlice";
import type { ScreensSlice } from "./slices/screensSlice";
import type { HistorySlice } from "./slices/historySlice";

export type AppSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface HistoryEntry {
  id: string;
  label: string;
  at: string;
  document: AppDocument;
  coalesceKey?: string;
}

export type AppStore = DocumentSlice & SelectionSlice & NodesSlice & ClipboardSlice & ScreensSlice & HistorySlice;

export type AppSlice<T> = StateCreator<AppStore, [["zustand/immer", never]], [], T>;
