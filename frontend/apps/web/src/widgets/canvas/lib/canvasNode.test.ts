import { describe, expect, it } from "vitest";
import type { AppNode, AppThemeTokens } from "@bildo/api";
import { isOutlineButton, paperRoundness, shellStyle } from "./canvasNode";

const THEME: AppThemeTokens = {
  colorBg: "#09090B",
  colorSurface: "#18181B",
  colorBorder: "#27272A",
  colorText: "#FAFAFA",
  colorTextMuted: "#A1A1AA",
  colorPrimary: "#5C6CF5",
  colorPrimaryFg: "#FFFFFF",
  radiusBase: "12px",
  fontBody: "System",
  fontHeading: "System",
};

function button(style?: AppNode["style"]): AppNode {
  return { id: "b", type: "Button", props: { text: "Go" }, style };
}

describe("paperRoundness", () => {
  it("parses the theme radius token", () => {
    expect(paperRoundness(THEME)).toBe(12);
  });

  it("falls back to 12 for a non-numeric token", () => {
    expect(paperRoundness({ ...THEME, radiusBase: "auto" })).toBe(12);
  });
});

describe("isOutlineButton", () => {
  it("is an outline button when a color is set without a background", () => {
    expect(isOutlineButton(button({ color: "#5C6CF5" }))).toBe(true);
  });

  it("is not an outline button when a background is present", () => {
    expect(isOutlineButton(button({ color: "#5C6CF5", backgroundColor: "#000000" }))).toBe(false);
  });

  it("is not an outline button without a color", () => {
    expect(isOutlineButton(button())).toBe(false);
  });
});

describe("shellStyle — Paper approximation", () => {
  it("fills a plain button with the theme primary and rounds it to the theme radius", () => {
    const style = shellStyle(THEME, button(), false, false);
    expect(style.background).toBe(THEME.colorPrimary);
    expect(style.borderRadius).toBe(12);
    expect(style.border).toBeUndefined();
  });

  it("renders an outline button as transparent with a theme-border outline", () => {
    const style = shellStyle(THEME, button({ color: "#5C6CF5" }), false, false);
    expect(style.background).toBeUndefined();
    expect(style.border).toBe(`1px solid ${THEME.colorBorder}`);
    expect(style.borderRadius).toBe(12);
  });

  it("rounds a text input to the theme radius by default", () => {
    const input: AppNode = { id: "i", type: "TextInput", props: { placeholder: "Name" } };
    expect(shellStyle(THEME, input, false, false).borderRadius).toBe(12);
  });

  it("leaves a plain view unrounded when no radius is set", () => {
    const view: AppNode = { id: "v", type: "View" };
    expect(shellStyle(THEME, view, true, false).borderRadius).toBeUndefined();
  });
});
