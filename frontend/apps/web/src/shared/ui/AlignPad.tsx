import { useEffect, useState } from "react";

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
    <div className="flex items-center gap-3">
      <div
        role="group"
        aria-label="Выравнивание"
        className="relative w-[84px] h-[84px] rounded-[10px] border border-line-strong bg-surface shrink-0 overflow-hidden"
      >
        {showThumb && (
          <div
            aria-hidden="true"
            className={`absolute left-0 top-0 rounded-[5px] bg-panel shadow-[0_0_0_1px_rgba(92,108,245,0.45),0_2px_6px_rgba(46,55,150,0.14),0_0_14px_rgba(92,108,245,0.18)] pointer-events-none z-0 ${
              ready ? "[transition:transform_280ms_cubic-bezier(0.22,1,0.36,1),box-shadow_280ms_ease]" : ""
            }`}
            style={{ width: CELL, height: CELL, transform: `translate(${tx}px, ${ty}px)` }}
          />
        )}

        <div className="relative z-[1] grid grid-cols-3 grid-rows-3 p-1.5 gap-1 w-full h-full box-border">
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
                className="border-0 rounded-[4px] p-0 cursor-pointer bg-transparent grid place-items-center disabled:opacity-25 disabled:cursor-default"
              >
                <span
                  className={`rounded-[2px] transition-[background,transform] duration-[220ms] ease-[ease] ${
                    isCenter ? "w-2.5 h-2.5" : "w-2 h-2"
                  } ${
                    active ? "bg-accent-strong scale-[1.12] shadow-[0_0_8px_rgba(92,108,245,0.35)]" : "bg-[#a1a1ab]"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
      {caption ? <div className="text-[11px] leading-[1.45] text-subtle min-w-0">{caption}</div> : null}
    </div>
  );
}
