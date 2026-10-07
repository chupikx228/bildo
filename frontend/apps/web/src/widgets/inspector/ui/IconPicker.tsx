import { useState } from "react";
import { icons, type LucideIcon } from "lucide-react";
import { appIconNameSchema, type AppIconName } from "@bildo/api";
import { useOutsideClick } from "@/shared/lib";

const ICON_NAMES = appIconNameSchema.options;
const ICON_MAP = icons as Record<string, LucideIcon>;

function pascal(icon: string): string {
  return icon
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function IconPicker({ value, onChange }: { value?: AppIconName; onChange: (v: AppIconName) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const Current = value ? ICON_MAP[pascal(value)] : undefined;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[30px] min-w-[132px] px-2.5 rounded-md border border-line-strong bg-surface text-text-soft text-xs cursor-pointer flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2">
          {Current ? <Current size={16} /> : null}
          <span>{value ?? "—"}</span>
        </span>
        <span className="text-subtle text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-40 grid w-[232px] max-h-[280px] grid-cols-6 gap-1 overflow-auto p-2 rounded-lg border border-line-strong bg-panel shadow-lg">
          {ICON_NAMES.map((name) => {
            const Ico = ICON_MAP[pascal(name)];
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-md cursor-pointer ${
                  name === value ? "bg-accent-soft text-accent-strong" : "text-text-soft hover:bg-surface-hover"
                }`}
              >
                {Ico ? <Ico size={16} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
