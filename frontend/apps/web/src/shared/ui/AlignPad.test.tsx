import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlignPad } from "./AlignPad";

describe("AlignPad", () => {
  it("renders all nine alignment cells", () => {
    render(<AlignPad onChange={() => undefined} />);
    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("reports the picked horizontal and vertical alignment", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AlignPad onChange={onChange} />);
    await user.click(screen.getByLabelText("Справа снизу"));
    expect(onChange).toHaveBeenCalledWith("right", "bottom");
  });

  it("marks the currently active cell as pressed", () => {
    render(<AlignPad horizontal="right" vertical="top" onChange={() => undefined} />);
    expect(screen.getByRole("button", { pressed: true })).toBe(screen.getByLabelText("Справа сверху"));
  });

  it("renders the caption hint when provided", () => {
    render(<AlignPad hint="Куда прижать" onChange={() => undefined} />);
    expect(screen.getByText("Куда прижать")).toBeInTheDocument();
  });

  describe("horizontalOnly mode", () => {
    it("disables every cell outside the middle row", () => {
      render(<AlignPad horizontalOnly onChange={() => undefined} />);
      expect(screen.getByLabelText("Слева сверху")).toBeDisabled();
      expect(screen.getByLabelText("Справа снизу")).toBeDisabled();
      expect(screen.getByLabelText("Слева по центру")).toBeEnabled();
    });

    it("forces the vertical alignment to middle on selection", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<AlignPad horizontalOnly onChange={onChange} />);
      await user.click(screen.getByLabelText("Слева по центру"));
      expect(onChange).toHaveBeenCalledWith("left", "middle");
    });

    it("does not emit when a disabled cell is clicked", () => {
      const onChange = vi.fn();
      render(<AlignPad horizontalOnly onChange={onChange} />);
      fireEvent.click(screen.getByLabelText("Слева сверху"));
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
