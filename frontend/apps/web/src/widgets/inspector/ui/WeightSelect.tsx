import { useState } from "react";
import type { AppNodeStyle } from "@bildo/api";
import { useOutsideClick } from "@/shared/lib";

type FontWeight = NonNullable<AppNodeStyle["fontWeight"]>;

const WEIGHTS: { id: FontWeight; label: string; weight: number }[] = [
  { id: "400", label: "Regular", weight: 400 },
  { id: "500", label: "Medium", weight: 500 },
  { id: "600", label: "Semibold", weight: 600 },
  { id: "700", label: "Bold", weight: 700 },
];

export function WeightSelect({ value, onChange }: { value: FontWeight; onChange: (v: FontWeight) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const current = WEIGHTS.find((w) => w.id === value) ?? WEIGHTS[0]!;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[30px] min-w-[120px] px-2.5 rounded-md border border-line-strong bg-surface text-text-soft text-xs cursor-pointer flex items-center justify-between gap-2"
        style={{ fontWeight: current.weight }}
      >
        <span>{current.label}</span>
        <span className="text-subtle text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-40 min-w-[140px] p-1 rounded-lg border border-line-strong bg-panel shadow-lg">
          {WEIGHTS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                onChange(w.id);
                setOpen(false);
              }}
              className={`block w-full text-left px-2.5 py-2 border-0 rounded-md bg-transparent text-text-soft text-[13px] cursor-pointer ${
                w.id === value ? "bg-accent-soft" : "hover:bg-surface-hover"
              }`}
              style={{ fontWeight: w.weight }}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
