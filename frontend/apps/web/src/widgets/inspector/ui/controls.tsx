import { useState, type ReactNode } from "react";
import type { AppNodeStyle } from "@bildo/api";
import { useOutsideClick } from "@/shared/lib";
import styles from "./Inspector.module.css";

export function PanelHeader({ typeLabel, title }: { typeLabel: string; title: string }) {
  return (
    <div className={styles.header}>
      <div>
        <span className={styles.badge}>{typeLabel}</span>
      </div>
      <div className={styles.headerTitle}>{title}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowControl}>{children}</div>
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
    <div ref={rootRef} className={styles.select}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={styles.selectTrigger}
        style={{ fontWeight: current.weight }}
      >
        <span>{current.label}</span>
        <span className={styles.selectCaret}>▾</span>
      </button>
      {open && (
        <div className={styles.selectMenu}>
          {WEIGHTS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                onChange(w.id);
                setOpen(false);
              }}
              className={[styles.selectOption, w.id === value && styles.selectOptionActive].filter(Boolean).join(" ")}
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
    <div className={styles.segmented}>
      {TEXT_ALIGNS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.title}
          aria-label={item.title}
          aria-pressed={item.id === value}
          onClick={() => onChange(item.id)}
          className={[styles.segment, item.id === value && styles.segmentActive].filter(Boolean).join(" ")}
        >
          <AlignLines align={item.id} />
        </button>
      ))}
    </div>
  );
}
