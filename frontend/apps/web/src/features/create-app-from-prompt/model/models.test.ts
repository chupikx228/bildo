import { describe, expect, it } from "vitest";
import { ICON_REGISTRY } from "@/shared/ui";
import { DEFAULT_MODEL_ID, modelIcon, toModels } from "./models";

describe("modelIcon", () => {
  it("maps known provider prefixes to registered brand icons", () => {
    expect(modelIcon("anthropic/claude-opus-5")).toBe("claude");
    expect(modelIcon("openai/gpt-5")).toBe("openai");
    expect(modelIcon("deepseek/deepseek-v4-flash")).toBe("deepseek");
    expect(modelIcon("x-ai/grok-4")).toBe("grok");
  });

  it("falls back to the generic mark for unknown providers and malformed ids", () => {
    expect(modelIcon("google/gemini-3-pro")).toBe("model-generic");
    expect(modelIcon("")).toBe("model-generic");
    expect(modelIcon("no-slash")).toBe("model-generic");
  });

  it("only returns registered icons", () => {
    for (const id of ["anthropic/claude-opus-5", "google/gemini-3-pro", ""]) {
      expect(ICON_REGISTRY).toHaveProperty(modelIcon(id));
    }
  });
});

describe("toModels", () => {
  it("puts Auto first and keeps it the default", () => {
    const models = toModels([{ id: "openai/gpt-5", name: "OpenAI: GPT-5", pro: true }]);
    expect(models[0]?.id).toBe(DEFAULT_MODEL_ID);
    expect(models).toHaveLength(2);
  });

  it("carries the catalog name and the pro flag through as given", () => {
    const models = toModels([
      { id: "openai/gpt-5", name: "OpenAI: GPT-5", pro: true },
      { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", pro: false },
    ]);
    expect(models[1]).toEqual({ id: "openai/gpt-5", name: "OpenAI: GPT-5", icon: "openai", pro: true });
    expect(models[2]?.pro).toBe(false);
  });

  it("offers Auto alone while the catalog is unavailable", () => {
    expect(toModels(undefined)).toEqual([{ id: DEFAULT_MODEL_ID, name: "Auto", icon: "auto" }]);
    expect(toModels([])).toHaveLength(1);
  });
});
