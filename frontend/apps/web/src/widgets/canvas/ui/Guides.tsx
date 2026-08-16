export function Guides({ guides }: { guides: { v: number[]; h: number[] } }) {
  return (
    <>
      {guides.v.map((x) => (
        <div
          key={`v${x}`}
          style={{
            position: "absolute",
            left: x,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--color-snap-guide)",
            zIndex: 40,
            pointerEvents: "none",
          }}
        />
      ))}
      {guides.h.map((y) => (
        <div
          key={`h${y}`}
          style={{
            position: "absolute",
            top: y,
            left: 0,
            right: 0,
            height: 1,
            background: "var(--color-snap-guide)",
            zIndex: 40,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}
