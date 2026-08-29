import { findAppNode, flattenAppNodes, type AppComponentType, type AppThemeTokens } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";

export type CommandResult = { ok: true; summary: string } | { ok: false; errors: string[] };

export type AppPatch =
  | { op: "addScreen"; name?: string }
  | { op: "removeScreen" }
  | { op: "renameScreen"; name: string }
  | { op: "setTheme"; theme: Partial<AppThemeTokens> }
  | { op: "renameApp"; name: string }
  | { op: "setText"; text: string }
  | { op: "addComponent"; type: AppComponentType; text?: string };

const HELP =
  "Примеры: «добавь экран», «удали экран», «тёмная тема», «зелёный акцент», «кнопка: Сохранить», «текст: Привет», «назови FitApp».";

export function parseRefineMessage(message: string): AppPatch[] {
  const text = message.trim();
  const lower = text.toLowerCase();
  const patches: AppPatch[] = [];

  if (/добав(ь|ить)\s+экран|new screen|ещё экран|новый экран/.test(lower)) {
    const named =
      /(?:экран|screen)\s*[«":]\s*[«"]?([^»"]+)[»"]?/i.exec(text) ?? /назван[иея]*\s+[«"]([^»"]+)[»"]/i.exec(text);
    const name = named?.[1]?.trim();
    patches.push(name ? { op: "addScreen", name } : { op: "addScreen" });
  }

  if (/удал(и|ить)\s+экран|remove screen|убери экран/.test(lower)) {
    patches.push({ op: "removeScreen" });
  }

  if (/темн|dark|чёрн|night mode/.test(lower)) {
    patches.push({
      op: "setTheme",
      theme: {
        colorBg: "#09090B",
        colorSurface: "#18181B",
        colorText: "#FAFAFA",
        colorTextMuted: "#A1A1AA",
        colorBorder: "#27272A",
      },
    });
  }

  if (/светл|light|бел(?!ое)/.test(lower)) {
    patches.push({
      op: "setTheme",
      theme: {
        colorBg: "#FFFFFF",
        colorSurface: "#F4F4F5",
        colorText: "#09090B",
        colorTextMuted: "#52525B",
        colorBorder: "#E4E4E7",
      },
    });
  }

  if (/зелён|green|изумруд/.test(lower)) {
    patches.push({ op: "setTheme", theme: { colorPrimary: "#22C55E" } });
  } else if (/оранж|amber|жёлт/.test(lower)) {
    patches.push({ op: "setTheme", theme: { colorPrimary: "#F59E0B" } });
  } else if (/красн|rose|coral/.test(lower)) {
    patches.push({ op: "setTheme", theme: { colorPrimary: "#F43F5E" } });
  } else if (/акцент|primary|indigo|фиолет|синий/.test(lower)) {
    patches.push({ op: "setTheme", theme: { colorPrimary: "#5C6CF5" } });
  }

  const renameApp =
    /(?:назван|переимен|назови|имя)\s*(?:приложен\w*)?\s*[:=]?\s*[«"](.+?)[»"]/i.exec(text) ??
    /(?:назван|переимен|назови)\s+(\S.{1,40})$/i.exec(text);
  if (renameApp?.[1] && !/экран/i.test(renameApp[0])) {
    patches.push({ op: "renameApp", name: renameApp[1].trim() });
  }

  const renameScreen = /(?:экран\s+)?(?:назови|переименуй)\s+экран\s+[«"](.+?)[»"]/i.exec(text);
  if (renameScreen?.[1]) {
    patches.push({ op: "renameScreen", name: renameScreen[1].trim() });
  }

  const setText =
    /(?:текст|напиши|заголовок|title)\s*[:=]?\s*[«"](.+?)[»"]/i.exec(text) ??
    /(?:текст|напиши|заголовок)\s*[:=]\s*(.+)$/i.exec(text);
  if (setText?.[1]) {
    patches.push({ op: "setText", text: setText[1].trim() });
  }

  const btn = /(?:кнопк[а-яё]*|button)\s*[:=]?\s*[«"](.+?)[»"]/i.exec(text);
  if (btn?.[1]) {
    patches.push({ op: "addComponent", type: "Button", text: btn[1].trim() });
  } else if (/добав(ь|ить)\s+кнопк/.test(lower)) {
    patches.push({ op: "addComponent", type: "Button", text: "OK" });
  }

  if (/добав(ь|ить)\s+(поле|инпут|input)/.test(lower)) {
    patches.push({ op: "addComponent", type: "TextInput" });
  }

  if (/добав(ь|ить)\s+(карточк|блок|view)/.test(lower)) {
    patches.push({ op: "addComponent", type: "View" });
  }

  if (/добав(ь|ить)\s+(текст|заголовок)/.test(lower) && !setText) {
    patches.push({ op: "addComponent", type: "Text", text: "Новый текст" });
  }

  return patches;
}

export function applyAppPatches(patches: AppPatch[]): CommandResult {
  const state = useAppDocumentStore.getState();
  if (!state.document) return { ok: false, errors: ["Нет документа"] };
  if (patches.length === 0) return { ok: false, errors: [HELP] };

  state.beginAiTurn("До AI");
  const summaries: string[] = [];

  try {
    for (const patch of patches) {
      switch (patch.op) {
        case "addScreen": {
          const id = state.addScreen(patch.name);
          if (!id) return { ok: false, errors: ["Не удалось добавить экран"] };
          summaries.push(patch.name ? `экран «${patch.name}»` : "новый экран");
          break;
        }
        case "removeScreen": {
          const sid = state.selectedScreenId;
          if (!sid) return { ok: false, errors: ["Нет выбранного экрана"] };
          state.removeScreen(sid);
          summaries.push("удалил экран");
          break;
        }
        case "renameScreen": {
          const sid = state.selectedScreenId;
          if (!sid) return { ok: false, errors: ["Нет выбранного экрана"] };
          state.renameScreen(sid, patch.name);
          summaries.push(`экран → «${patch.name}»`);
          break;
        }
        case "setTheme": {
          state.updateTheme(patch.theme);
          summaries.push("тема");
          break;
        }
        case "renameApp": {
          state.renameApp(patch.name);
          summaries.push(`имя «${patch.name}»`);
          break;
        }
        case "setText": {
          const sid = state.selectedScreenId;
          const current = useAppDocumentStore.getState().document;
          if (!sid || !current) return { ok: false, errors: ["Нет экрана"] };
          const screen = current.screens.find((s) => s.id === sid);
          if (!screen) return { ok: false, errors: ["Экран не найден"] };
          const nodes = flattenAppNodes(screen.root);
          const selected = state.selectedNodeId ? findAppNode(screen.root, state.selectedNodeId) : null;
          const targetId =
            (selected && (selected.type === "Text" || selected.type === "Button")
              ? selected.id
              : nodes.find((n) => n.type === "Text" || n.type === "Button")?.id) ?? null;
          if (!targetId) return { ok: false, errors: ["Не найден Text/Button"] };
          state.setNodeText(sid, targetId, patch.text);
          summaries.push("текст");
          break;
        }
        case "addComponent": {
          const sid = state.selectedScreenId;
          const current = useAppDocumentStore.getState().document;
          if (!sid || !current) return { ok: false, errors: ["Нет экрана"] };
          const screen = current.screens.find((s) => s.id === sid);
          if (!screen) return { ok: false, errors: ["Экран не найден"] };
          const selected = state.selectedNodeId ? findAppNode(screen.root, state.selectedNodeId) : null;
          const hostId =
            selected && (selected.type === "View" || selected.type === "ScrollView") ? selected.id : screen.root.id;
          const ok = state.addComponent(sid, hostId, patch.type);
          if (!ok) return { ok: false, errors: ["Не удалось добавить компонент"] };
          if (patch.text) {
            const after = useAppDocumentStore.getState();
            if (after.selectedNodeId && after.selectedScreenId) {
              after.setNodeText(after.selectedScreenId, after.selectedNodeId, patch.text);
            }
          }
          summaries.push(`+ ${patch.type}`);
          break;
        }
      }
    }

    state.endAiTurn(`AI: ${summaries.join(", ")}`);
    return { ok: true, summary: summaries.join(", ") };
  } catch (err) {
    state.endAiTurn("AI: ошибка");
    return { ok: false, errors: [err instanceof Error ? err.message : "Не удалось применить"] };
  }
}

export function refineAppFromMessage(message: string): CommandResult {
  return applyAppPatches(parseRefineMessage(message));
}
