import { useEffect, useState } from "react";
import styles from "./AlignPad.module.css";

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

interface Cell {
  h: HorizontalAlign;
  v: VerticalAlign;
  label: string;
}

const CELLS: Cell[] = [
  { h: "left", v: "top", label: "Слева сверху" },
  { h: "center", v: "top", label: "По центру сверху" },
  { h: "right", v: "top", label: "Справа сверху" },
  { h: "left", v: "middle", label: "Слева по центру" },
  { h: "center", v: "middle", label: "По центру" },
  { h: "right", v: "middle", label: "Справа по центру" },
  { h: "left", v: "bottom", label: "Слева снизу" },
  { h: "center", v: "bottom", label: "По центру снизу" },
  { h: "right", v: "bottom", label: "Справа снизу" },
];

const PAD = 84;
const INSET = 6;
const GAP = 4;
const CELL = (PAD - INSET * 2 - GAP * 2) / 3;

const colOf = (h: HorizontalAlign) => (h === "left" ? 0 : h === "center" ? 1 : 2);
const rowOf = (v: VerticalAlign) => (v === "top" ? 0 : v === "middle" ? 1 : 2);

interface AlignPadProps {
  horizontal?: HorizontalAlign | null;
  vertical?: VerticalAlign | null;
  horizontalOnly?: boolean;
  hint?: string | null;
  onChange: (horizontal: HorizontalAlign, vertical: VerticalAlign) => void;
}

export function AlignPad({
  horizontal = null,
  vertical = null,
  horizontalOnly = false,
  hint,
  onChange,
}: AlignPadProps) {
  const [picked, setPicked] = useState<{ h: HorizontalAlign; v: VerticalAlign } | null>(null);
  const [ready, setReady] = useState(false);

  const thumb = {
    h: horizontal ?? picked?.h ?? "center",
    v: horizontalOnly ? ("middle" as const) : (vertical ?? picked?.v ?? "middle"),
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const caption = hint === undefined ? (horizontalOnly ? "Горизонталь содержимого" : "Куда прижать содержимое") : hint;

  const tx = INSET + colOf(thumb.h) * (CELL + GAP);
  const ty = INSET + rowOf(thumb.v) * (CELL + GAP);
  const showThumb = horizontal != null || vertical != null || picked != null || ready;

  return (
    <div className={styles.root}>
      <div role="group" aria-label="Выравнивание" className={styles.pad}>
        {showThumb && (
          <div
            aria-hidden="true"
            className={[styles.thumb, ready && styles.thumbReady].filter(Boolean).join(" ")}
            style={{ width: CELL, height: CELL, transform: `translate(${tx}px, ${ty}px)` }}
          />
        )}

        <div className={styles.grid}>
          {CELLS.map((cell) => {
            const disabled = horizontalOnly && cell.v !== "middle";
            const active = !disabled && cell.h === thumb.h && cell.v === thumb.v;
            const isCenter = cell.h === "center" && cell.v === "middle";
            return (
              <button
                key={`${cell.h}-${cell.v}`}
                type="button"
                title={cell.label}
                aria-label={cell.label}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  const nextV = horizontalOnly ? ("middle" as const) : cell.v;
                  setPicked({ h: cell.h, v: nextV });
                  onChange(cell.h, nextV);
                }}
                className={styles.cell}
              >
                <span
                  className={[styles.dot, isCenter && styles.dotCenter, active && styles.dotActive]
                    .filter(Boolean)
                    .join(" ")}
                />
              </button>
            );
          })}
        </div>
      </div>
      {caption ? <div className={styles.hint}>{caption}</div> : null}
    </div>
  );
}
