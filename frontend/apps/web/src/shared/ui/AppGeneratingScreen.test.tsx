import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppGeneratingScreen } from "./AppGeneratingScreen";
import { GENERATION_STAGES, STAGE_INTERVAL_MS } from "./generationStages";

afterEach(() => {
  vi.useRealTimers();
});

describe("AppGeneratingScreen", () => {
  it("starts on the first generation stage", () => {
    render(<AppGeneratingScreen />);
    expect(screen.getByText(GENERATION_STAGES[0])).toBeInTheDocument();
  });

  it("advances one stage at a time", () => {
    vi.useFakeTimers();
    render(<AppGeneratingScreen />);

    act(() => {
      vi.advanceTimersByTime(STAGE_INTERVAL_MS);
    });
    expect(screen.getByText(GENERATION_STAGES[1])).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(STAGE_INTERVAL_MS);
    });
    expect(screen.getByText(GENERATION_STAGES[2])).toBeInTheDocument();
  });

  it("holds on the last stage instead of restarting", () => {
    vi.useFakeTimers();
    render(<AppGeneratingScreen />);

    for (let i = 0; i < GENERATION_STAGES.length * 3; i++) {
      act(() => {
        vi.advanceTimersByTime(STAGE_INTERVAL_MS);
      });
    }

    expect(screen.getByText(GENERATION_STAGES.at(-1) ?? "")).toBeInTheDocument();
    expect(screen.queryByText(GENERATION_STAGES[0])).not.toBeInTheDocument();
  });

  it("pins an explicit label and stops cycling", () => {
    vi.useFakeTimers();
    render(<AppGeneratingScreen label="Загрузка приложения…" />);

    act(() => {
      vi.advanceTimersByTime(STAGE_INTERVAL_MS * 3);
    });
    expect(screen.getByText("Загрузка приложения…")).toBeInTheDocument();
    expect(screen.queryByText(GENERATION_STAGES[1])).not.toBeInTheDocument();
  });
});
