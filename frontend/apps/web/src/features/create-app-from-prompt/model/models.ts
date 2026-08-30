import type { ModelInfo } from "@bildo/api";
import type { IconName } from "@/shared/ui";

export interface Model {
  id: string;
  name: string;
  icon: IconName;
  pro?: boolean;
}

export type ModelId = string;

export const DEFAULT_MODEL_ID: ModelId = "auto";

const AUTO_MODEL: Model = { id: DEFAULT_MODEL_ID, name: "Auto", icon: "auto" };

const PROVIDER_ICONS: Record<string, IconName> = {
  anthropic: "claude",
  deepseek: "deepseek",
  openai: "openai",
  "x-ai": "grok",
};

export function modelIcon(id: string): IconName {
  return PROVIDER_ICONS[id.split("/")[0] ?? ""] ?? "model-generic";
}

export function toModels(catalog: readonly ModelInfo[] | undefined): Model[] {
  if (!catalog) return [AUTO_MODEL];
  return [
    AUTO_MODEL,
    ...catalog.map((info) => ({ id: info.id, name: info.name, icon: modelIcon(info.id), pro: info.pro })),
  ];
}
