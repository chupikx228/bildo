import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GENERATION_STAGES } from "@/shared/ui";
import { GenerationStatus } from "./GenerationStatus";

describe("GenerationStatus", () => {
  it("starts on the first generation stage while pending", () => {
    render(<GenerationStatus ready={false} />);
    expect(screen.getByText(GENERATION_STAGES[0])).toBeInTheDocument();
  });

  it("shows the done text when ready", () => {
    render(<GenerationStatus ready />);
    expect(screen.getByText("Готово — открываем редактор")).toBeInTheDocument();
  });

  it("shows the error state with the backend message", () => {
    render(<GenerationStatus ready={false} error="Ключ RouterAI не задан" />);
    expect(screen.getByText("Не удалось собрать приложение")).toBeInTheDocument();
    expect(screen.getByText("Ключ RouterAI не задан")).toBeInTheDocument();
  });
});
