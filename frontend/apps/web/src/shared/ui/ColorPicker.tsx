import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useOutsideClick } from "@/shared/lib";
import styles from "./ColorPicker.module.css";

const PRESET_COLORS = [
  "#FFFFFF",
  "#F8F8FA",
  "#9A9AA5",
  "#4B4B57",
  "#1B1B21",
  "#0A0A0C",
  "#5C6CF5",
  "#7C89FF",
  "#22C55E",
  "#EF4444",
  "#F59E0B",
  "#38BDF8",
];

const FALLBACK = "#18181B";

function normalizeHex(raw: string): string | null {
  let v = raw.trim();
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
  return v.toUpperCase();
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const normalized = normalizeHex(value) ?? FALLBACK;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const rootRef = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));

  const shown = draft ?? normalized;

  function commit(raw: string) {
    const n = normalizeHex(raw);
    if (!n) {
      setDraft(null);
      return;
    }
    setDraft(null);
    onChange(n);
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={styles.trigger}>
        <span className={styles.swatch} style={{ background: shown }} />
        <span className={styles.hex}>{shown}</span>
      </button>

      {open && (
        <div className={styles.popover}>
          <div className={styles.picker}>
            <HexColorPicker color={shown} onChange={(c) => setDraft(c.toUpperCase())} onChangeEnd={(c) => commit(c)} />
          </div>
          <div className={styles.presets}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => commit(c)}
                className={[styles.preset, shown === c && styles.presetActive].filter(Boolean).join(" ")}
                style={{ background: c }}
              />
            ))}
          </div>
          <input
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            }}
            spellCheck={false}
            className={styles.hexInput}
          />
        </div>
      )}
    </div>
  );
}
