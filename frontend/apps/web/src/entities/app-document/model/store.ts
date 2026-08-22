import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createDocumentSlice } from "./slices/documentSlice";
import { createSelectionSlice } from "./slices/selectionSlice";
import { createNodesSlice } from "./slices/nodesSlice";
import { createClipboardSlice } from "./slices/clipboardSlice";
import { createScreensSlice } from "./slices/screensSlice";
import { createHistorySlice } from "./slices/historySlice";
import type { AppStore } from "./types";

export type { AppSaveStatus } from "./types";

export const useAppDocumentStore = create<AppStore>()(
  immer((...a) => ({
    ...createDocumentSlice(...a),
    ...createSelectionSlice(...a),
    ...createNodesSlice(...a),
    ...createClipboardSlice(...a),
    ...createScreensSlice(...a),
    ...createHistorySlice(...a),
  })),
);
