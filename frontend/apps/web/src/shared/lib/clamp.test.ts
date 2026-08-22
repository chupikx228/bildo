import { describe, expect, it } from "vitest";
import { clamp } from "./clamp";

describe("clamp", () => {
  it("returns the value when it is within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to the boundaries", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("keeps the value when it sits exactly on a boundary", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("collapses an inverted range to its max", () => {
    expect(clamp(5, 10, 0)).toBe(0);
  });

  it("supports negative and fractional ranges", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0.4, 0, 0.3)).toBeCloseTo(0.3);
  });
});
