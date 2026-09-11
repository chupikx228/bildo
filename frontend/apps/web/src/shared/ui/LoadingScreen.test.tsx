import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "./LoadingScreen";
import { LOADING_LABEL } from "./generationStages";

describe("LoadingScreen", () => {
  it("renders the loading label", () => {
    render(<LoadingScreen />);
    expect(screen.getByText(LOADING_LABEL)).toBeInTheDocument();
  });
});
