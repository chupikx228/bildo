const HANDLE = 7;
const SELECT_COLOR = "var(--color-accent)";

export function SelectionChrome({
  radius,
  onResizeCorner,
}: {
  radius: number;
  onResizeCorner: (corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => void;
}) {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          boxShadow: `0 0 0 1.5px ${SELECT_COLOR}`,
          pointerEvents: "none",
          zIndex: 15,
        }}
      />
      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
        <div
          key={corner}
          data-handle="1"
          onPointerDown={(e) => onResizeCorner(corner, e)}
          style={{
            position: "absolute",
            width: HANDLE,
            height: HANDLE,
            background: "var(--color-panel)",
            border: `1.5px solid ${SELECT_COLOR}`,
            borderRadius: "50%",
            zIndex: 20,
            cursor: `${corner}-resize`,
            boxSizing: "border-box",
            left: corner.includes("w") ? -HANDLE / 2 : undefined,
            right: corner.includes("e") ? -HANDLE / 2 : undefined,
            top: corner.includes("n") ? -HANDLE / 2 : undefined,
            bottom: corner.includes("s") ? -HANDLE / 2 : undefined,
          }}
        />
      ))}
    </>
  );
}
