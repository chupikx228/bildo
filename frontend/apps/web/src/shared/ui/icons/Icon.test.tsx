import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders an svg with the registered viewBox and size", () => {
    const { container } = render(<Icon name="check" size={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg.getAttribute("width")).toBe("20");
  });

  it("applies the brand color for a brand icon, and drops it in mono mode", () => {
    const { container: brand } = render(<Icon name="claude" />);
    expect(brand.querySelector("svg")!.getAttribute("style") ?? "").toContain("color");

    const { container: mono } = render(<Icon name="claude" mono />);
    expect(mono.querySelector("svg")!.getAttribute("style") ?? "").not.toContain("color");
  });
});
