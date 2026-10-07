import { useState } from "react";
import { appFontFamilySchema, type AppFontFamily } from "@bildo/api";
import { useOutsideClick } from "@/shared/lib";

const FONTS = appFontFamilySchema.options;

function familyOf(font: AppFontFamily): string | undefined {
  return font === "System" ? undefined : font;
}

export function FontSelect({ value, onChange }: { value: AppFontFamily; onChange: (v: AppFontFamily) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[30px] min-w-[132px] px-2.5 rounded-md border border-line-strong bg-surface text-text-soft text-xs cursor-pointer flex items-center justify-between gap-2"
        style={{ fontFamily: familyOf(value) }}
      >
        <span>{value}</span>
        <span className="text-subtle text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-40 min-w-[160px] max-h-[260px] overflow-auto p-1 rounded-lg border border-line-strong bg-panel shadow-lg">
          {FONTS.map((font) => (
            <button
              key={font}
              type="button"
              onClick={() => {
                onChange(font);
                setOpen(false);
              }}
              className={`block w-full text-left px-2.5 py-2 border-0 rounded-md bg-transparent text-text-soft text-[13px] cursor-pointer ${
                font === value ? "bg-accent-soft" : "hover:bg-surface-hover"
              }`}
              style={{ fontFamily: familyOf(font) }}
            >
              {font}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
