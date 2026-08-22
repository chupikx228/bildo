import type { AppNodeStyle } from "@bildo/api";

export type TextAlign = NonNullable<AppNodeStyle["textAlign"]>;

export function AlignLines({ align }: { align: TextAlign }) {
  const widths = [14, 10, 12];
  const xFor = (w: number) => {
    if (align === "left") return 1;
    if (align === "right") return 15 - w;
    return (16 - w) / 2;
  };
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden>
      {widths.map((w, i) => (
        <rect key={i} x={xFor(w)} y={1.5 + i * 4.2} width={w} height={1.8} rx={0.9} fill="currentColor" />
      ))}
    </svg>
  );
}
