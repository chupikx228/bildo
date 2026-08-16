import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useOutsideClick } from "@/shared/lib";

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

const PICKER_STYLING =
  "[&_.react-colorful]:w-full [&_.react-colorful]:h-auto [&_.react-colorful__saturation]:h-[140px] [&_.react-colorful__saturation]:rounded-lg [&_.react-colorful__saturation]:mb-2 [&_.react-colorful__saturation]:border-b-0 [&_.react-colorful__hue]:h-2.5 [&_.react-colorful__hue]:rounded-full [&_.react-colorful__pointer]:w-3.5 [&_.react-colorful__pointer]:h-3.5 [&_.react-colorful__pointer]:border-2";

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-[30px] pl-1 pr-2 rounded-md border border-line-strong bg-surface cursor-pointer"
      >
        <span
          className="w-[18px] h-[18px] rounded-[4px] border border-[rgba(16,16,20,0.16)] shrink-0"
          style={{ background: shown }}
        />
        <span className="text-[11px] font-[550] text-text font-mono tracking-[0.02em] uppercase">{shown}</span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-40 w-[200px] p-2.5 rounded-[10px] border border-line-strong bg-panel shadow-lg">
          <div className={PICKER_STYLING}>
            <HexColorPicker color={shown} onChange={(c) => setDraft(c.toUpperCase())} onChangeEnd={(c) => commit(c)} />
          </div>
          <div className="grid grid-cols-6 gap-[5px] mt-2.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => commit(c)}
                className={`w-full aspect-square rounded-[4px] cursor-pointer p-0 ${
                  shown === c ? "border-2 border-accent" : "border border-[rgba(16,16,20,0.14)]"
                }`}
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
            className="w-full bg-surface border border-line-strong rounded-md px-2.5 py-2 text-[11px] text-text outline-none font-mono box-border mt-2.5"
          />
        </div>
      )}
    </div>
  );
}
