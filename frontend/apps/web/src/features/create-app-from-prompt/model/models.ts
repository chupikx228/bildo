import type { IconName } from "@/shared/ui";

export interface Model {
  id: string;
  name: string;
  icon: IconName;
  pro?: boolean;
}

export const MODELS = [
  { id: "auto", name: "Auto", icon: "auto" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", icon: "deepseek" },
  { id: "gpt-5.6-terra", name: "OpenAI GPT-5.6 Terra", icon: "openai" },
  { id: "claude-opus-5", name: "Claude Opus 5", icon: "claude", pro: true },
  { id: "claude-fable-5", name: "Claude Fable 5", icon: "claude", pro: true },
  { id: "gpt-5.6-sol", name: "OpenAI GPT-5.6 Sol", icon: "openai", pro: true },
  { id: "grok-4.6", name: "Grok 4.6", icon: "grok", pro: true },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", icon: "claude", pro: true },
] as const satisfies readonly Model[];

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL_ID: ModelId = "auto";
