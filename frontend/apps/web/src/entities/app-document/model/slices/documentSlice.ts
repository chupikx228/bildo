import { normalizeAppDocument, type AppDocument, type AppThemeTokens } from "@bildo/api";
import { pushPast, touch } from "../helpers";
import type { AppSaveStatus, AppSlice } from "../types";

export interface DocumentSlice {
  document: AppDocument | null;
  saveStatus: AppSaveStatus;
  saveError: string | null;
  lastErrors: string[];

  setDocument(doc: AppDocument): void;
  setSaveStatus(status: AppSaveStatus, error?: string | null): void;
  updateTheme(patch: Partial<AppThemeTokens>): void;
  renameApp(name: string): void;
  setAppVar(name: string, value: string | number | boolean): void;
}

export const createDocumentSlice: AppSlice<DocumentSlice> = (set) => ({
  document: null,
  saveStatus: "idle",
  saveError: null,
  lastErrors: [],

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
      state.document.name = name.trim() === "" ? state.document.name : name;
      touch(state.document);
    }),

  setAppVar: (name, value) =>
    set((state) => {
      if (!state.document) return;
      state.document.state ??= {};
      state.document.state[name] = value;
      touch(state.document);
    }),
});
