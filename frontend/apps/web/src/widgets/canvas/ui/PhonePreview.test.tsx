import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppDocument } from "@bildo/api";
import { PhonePreview } from "./PhonePreview";

const THEME: AppDocument["theme"] = {
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

function makeDoc(): AppDocument {
  return {
    id: "app-1",
    name: "Demo",
    theme: THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [
      {
        id: "s1",
        name: "Home",
        route: "index",
        root: {
          id: "root1",
          type: "View",
          layout: { x: 0, y: 0, width: 370, height: 640 },
          children: [
            {
              id: "n-count",
              type: "Text",
              props: { text: "0", textBind: "count" },
              layout: { x: 24, y: 60, width: 180, height: 40 },
            },
            {
              id: "n-tap",
              type: "Button",
              props: { text: "Tap", onPress: [{ type: "setVar", name: "count", value: 1 }] },
              layout: { x: 24, y: 120, width: 160, height: 48 },
            },
          ],
        },
      },
    ],
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function PreviewHarness() {
  const base = makeDoc();
  const [stateVars, setStateVars] = useState<Record<string, string | number | boolean>>({});
  const document = { ...base, state: { ...base.state, ...stateVars } };

  return (
    <PhonePreview
      document={document}
      screen={document.screens[0]!}
      editMode={false}
      onSetVar={(name, value) => setStateVars((prev) => ({ ...prev, [name]: value }))}
    />
  );
}

describe("PhonePreview preview interactions", () => {
  it("runs a setVar action and updates the textBind display without the editor store", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<PreviewHarness />);

    expect(screen.getByText("0")).toBeInTheDocument();

    await user.click(screen.getByText("Tap"));

    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
