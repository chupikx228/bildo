import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders nothing without a message", () => {
    const { container } = render(<Toast message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the message with the success tone by default", () => {
    render(<Toast message="Ссылка скопирована" />);
    const el = screen.getByRole("status");
    expect(el).toHaveTextContent("Ссылка скопирована");
    expect(el.className).toContain("bg-ok-soft");
  });

  it("applies the warning tone", () => {
    render(<Toast message="Слой закреплён" tone="warning" />);
    expect(screen.getByRole("status").className).toContain("bg-warn-soft");
  });
});
