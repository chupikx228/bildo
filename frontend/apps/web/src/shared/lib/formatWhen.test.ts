import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatWhen } from "./formatWhen";

const NOW = new Date(2026, 5, 15, 14, 30, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatWhen", () => {
  it("returns an empty string for an unparseable date", () => {
    expect(formatWhen("not-a-date")).toBe("");
    expect(formatWhen("")).toBe("");
  });

  it("labels a timestamp from today", () => {
    const iso = new Date(2026, 5, 15, 9, 5, 0).toISOString();
    expect(formatWhen(iso)).toMatch(/^сегодня, \d{2}:\d{2}$/);
  });

  it("labels a timestamp from yesterday", () => {
    const iso = new Date(2026, 5, 14, 22, 0, 0).toISOString();
    expect(formatWhen(iso)).toMatch(/^вчера, \d{2}:\d{2}$/);
  });

  it("falls back to an absolute date for anything older", () => {
    const iso = new Date(2026, 2, 3, 8, 0, 0).toISOString();
    const result = formatWhen(iso);
    expect(result).not.toBe("");
    expect(result.startsWith("сегодня")).toBe(false);
    expect(result.startsWith("вчера")).toBe(false);
  });
});
