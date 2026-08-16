import { useState, type ReactNode } from "react";
import type { AppNodeStyle } from "@bildo/api";
import { useOutsideClick } from "@/shared/lib";

export function PanelHeader({ typeLabel, title }: { typeLabel: string; title: string }) {
  return (
    <div className="px-4 pt-3.5 pb-3 border-b border-line shrink-0">
      <div>
        <span className="inline-block px-[7px] py-0.5 rounded-full bg-accent-soft text-[10px] font-semibold tracking-[0.08em] uppercase text-accent-strong mb-[5px]">
          {typeLabel}
        </span>
      </div>
      <div className="text-sm font-semibold text-text overflow-hidden text-ellipsis whitespace-nowrap">{title}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-3.5 pb-4 border-b border-line">
      <div className="text-[10px] font-[650] tracking-[0.08em] uppercase text-muted mb-3">{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-medium tracking-[0.06em] uppercase text-subtle mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-8 mb-2">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <div className="flex justify-end min-w-0">{children}</div>
    </div>
  );
}

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

type TextAlign = NonNullable<AppNodeStyle["textAlign"]>;

function AlignLines({ align }: { align: TextAlign }) {
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

const TEXT_ALIGNS: { id: TextAlign; title: string }[] = [
  { id: "left", title: "Слева" },
  { id: "center", title: "По центру" },
  { id: "right", title: "Справа" },
];

export function TextAlignButtons({ value, onChange }: { value: TextAlign; onChange: (v: TextAlign) => void }) {
  return (
    <div className="inline-flex p-0.5 rounded-[7px] border border-line-strong bg-surface gap-px">
      {TEXT_ALIGNS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.title}
          aria-label={item.title}
          aria-pressed={item.id === value}
          onClick={() => onChange(item.id)}
          className={`w-[30px] h-[26px] border-0 rounded-[5px] cursor-pointer grid place-items-center p-0 ${
            item.id === value
              ? "bg-panel shadow-[0_1px_2px_rgba(46,55,150,0.16),inset_0_0_0_1px_rgba(92,108,245,0.35)] text-accent-strong"
              : "bg-transparent text-subtle"
          }`}
        >
          <AlignLines align={item.id} />
        </button>
      ))}
    </div>
  );
}
