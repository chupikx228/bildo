import type { AppComponentType, AppNodeStyle, AppThemeTokens } from "./model";

export interface AppComponentDef {
  type: AppComponentType;
  displayName: string;
  canHaveChildren: boolean;
  defaultProps?: { text?: string; placeholder?: string; data?: string[]; source?: string };
  defaultStyle?: AppNodeStyle;
  themeStyle?: Partial<Record<"color" | "backgroundColor", keyof AppThemeTokens>>;
}

export const APP_COMPONENT_REGISTRY: Record<AppComponentType, AppComponentDef> = {
  View: {
    type: "View",
    displayName: "Контейнер",
    canHaveChildren: true,
    defaultStyle: { flexDirection: "column", gap: 12, padding: 16 },
  },
  Text: {
    type: "Text",
    displayName: "Текст",
    canHaveChildren: false,
    defaultProps: { text: "Текст" },
    defaultStyle: { fontSize: 16 },
    themeStyle: { color: "colorText" },
  },
  Button: {
    type: "Button",
    displayName: "Кнопка",
    canHaveChildren: false,
    defaultProps: { text: "Продолжить" },
    defaultStyle: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: "center",
    },
    themeStyle: { backgroundColor: "colorPrimary" },
  },
  Image: {
    type: "Image",
    displayName: "Картинка",
    canHaveChildren: false,
    defaultProps: { source: "" },
    defaultStyle: { width: "100%", height: 160, borderRadius: 12, backgroundColor: "#27272A" },
  },
  TextInput: {
    type: "TextInput",
    displayName: "Поле ввода",
    canHaveChildren: false,
    defaultProps: { placeholder: "Введите…" },
    defaultStyle: {
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
    },
    themeStyle: { backgroundColor: "colorSurface", color: "colorText" },
  },
  ScrollView: {
    type: "ScrollView",
    displayName: "Скролл",
    canHaveChildren: true,
    defaultStyle: { flex: 1, padding: 16, gap: 12 },
  },
  FlatList: {
    type: "FlatList",
    displayName: "Список",
    canHaveChildren: false,
    defaultProps: { data: ["Элемент 1", "Элемент 2", "Элемент 3"] },
    defaultStyle: { gap: 8 },
  },
  Spacer: {
    type: "Spacer",
    displayName: "Отступ",
    canHaveChildren: false,
    defaultStyle: { height: 16 },
  },
};

export const ADDABLE_COMPONENTS: AppComponentType[] = [
  "View",
  "Text",
  "Button",
  "Image",
  "TextInput",
  "ScrollView",
  "FlatList",
  "Spacer",
];
