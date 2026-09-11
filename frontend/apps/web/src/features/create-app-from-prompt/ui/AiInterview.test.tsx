import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiInterview } from "./AiInterview";

const noop = vi.fn();

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AiInterview", () => {
  it("auto-advances to the next step 160ms after a single-select pick", () => {
    vi.useFakeTimers();
    render(<AiInterview onSubmit={noop} onClose={noop} busy={false} />);

    expect(screen.getByText("Что вы делаете?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Магазин"));

    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(screen.getByText("Для кого?")).toBeInTheDocument();
  });

  it("clears the scheduled auto-advance timeout on unmount", () => {
    const setSpy = vi.spyOn(window, "setTimeout");
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(<AiInterview onSubmit={noop} onClose={noop} busy={false} />);

    fireEvent.click(screen.getByText("Магазин"));

    const advanceIndex = setSpy.mock.calls.findIndex(([, delay]) => delay === 160);
    expect(advanceIndex).toBeGreaterThanOrEqual(0);
    const timerId = setSpy.mock.results[advanceIndex]?.value as number | undefined;

    unmount();

    expect(clearSpy).toHaveBeenCalledWith(timerId);
  });
});
