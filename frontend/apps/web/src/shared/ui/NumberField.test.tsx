import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompactNumber, StepNumber } from "./NumberField";

describe("StepNumber", () => {
  it("shows the rounded value", () => {
    render(<StepNumber value={3.7} onChange={() => undefined} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(4);
  });

  it("steps up and down by the step amount", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StepNumber value={5} step={2} onChange={onChange} />);

    await user.click(screen.getByLabelText("Увеличить"));
    await user.click(screen.getByLabelText("Уменьшить"));

    expect(onChange).toHaveBeenNthCalledWith(1, 7);
    expect(onChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("clamps stepping at the min and max bounds", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<StepNumber value={10} min={0} max={10} onChange={onChange} />);
    await user.click(screen.getByLabelText("Увеличить"));
    expect(onChange).toHaveBeenLastCalledWith(10);

    rerender(<StepNumber value={0} min={0} max={10} onChange={onChange} />);
    await user.click(screen.getByLabelText("Уменьшить"));
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("ignores an empty or lone-minus input without emitting", () => {
    const onChange = vi.fn();
    render(<StepNumber value={5} onChange={onChange} />);
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "-" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("clamps a typed value into range", () => {
    const onChange = vi.fn();
    render(<StepNumber value={5} min={0} max={99} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "500" } });
    expect(onChange).toHaveBeenCalledWith(99);
  });

  it("normalizes an empty entry to the clamped minimum on blur", () => {
    const onChange = vi.fn();
    render(<StepNumber value={7} min={2} onChange={onChange} />);
    fireEvent.blur(screen.getByRole("spinbutton"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("renders an optional suffix", () => {
    render(<StepNumber value={12} suffix="px" onChange={() => undefined} />);
    expect(screen.getByText("px")).toBeInTheDocument();
  });
});

describe("CompactNumber", () => {
  it("renders its label and the rounded value", () => {
    render(<CompactNumber label="X" value={4.6} onChange={() => undefined} />);
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(5);
  });

  it("emits finite numeric edits, including negatives", () => {
    const onChange = vi.fn();
    render(<CompactNumber label="X" value={0} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "-12" } });
    expect(onChange).toHaveBeenCalledWith(-12);
  });
});
