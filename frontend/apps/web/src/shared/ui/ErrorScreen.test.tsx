import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorScreen } from "./ErrorScreen";

describe("ErrorScreen", () => {
  it("shows the message and fires both recovery actions", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onGoHome = vi.fn();
    render(<ErrorScreen onRetry={onRetry} onGoHome={onGoHome} />);

    expect(screen.getByText("Что-то пошло не так")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(onRetry).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "На главную" }));
    expect(onGoHome).toHaveBeenCalledOnce();
  });
});
