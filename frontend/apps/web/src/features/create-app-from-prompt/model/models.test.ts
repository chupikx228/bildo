import { describe, expect, it } from "vitest";
import { ICON_REGISTRY } from "@/shared/ui";
import { DEFAULT_MODEL_ID, MODELS } from "./models";

describe("MODELS", () => {
  it("references only registered icons", () => {
    for (const model of MODELS) {
      expect(ICON_REGISTRY).toHaveProperty(model.icon);
    }
  });

  it("has Auto as the default and unique ids", () => {
    expect(MODELS.some((m) => m.id === DEFAULT_MODEL_ID)).toBe(true);
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });
});
