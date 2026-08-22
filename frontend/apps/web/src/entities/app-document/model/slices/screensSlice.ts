import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH } from "@bildo/api";
import { nanoid } from "nanoid";
import { getScreen, makeNode, pushPast, touch } from "../helpers";
import type { AppSlice } from "../types";

export interface ScreensSlice {
  addScreen(name?: string): string | null;
  removeScreen(screenId: string): void;
  renameScreen(screenId: string, name: string): void;
}

export const createScreensSlice: AppSlice<ScreensSlice> = (set, get) => ({
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
});
