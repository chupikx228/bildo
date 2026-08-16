import type { ReactNode } from "react";
import type { Attachment } from "../model";
import { formatSize } from "../model";
import { AttachIcon } from "./icons";

export function AttachChips({
  items,
  onRemove,
  extra,
}: {
  items: Attachment[];
  onRemove?: (id: string) => void;
  extra?: ReactNode;
}) {
  if (items.length === 0 && !extra) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 mb-0.5">
      {extra}
      {items.map((a) => (
        <span
          key={a.id}
          className="inline-flex items-center gap-1.5 max-w-[220px] h-[26px] pl-[9px] pr-[7px] rounded-full border border-[#e4e4ea] bg-[#f7f7f9] text-muted text-[11px]"
          title={`${a.name} · ${formatSize(a.size)}`}
        >
          <AttachIcon kind={a.kind} />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{a.name}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              aria-label={`Убрать ${a.name}`}
              className="grid place-items-center border-0 p-0 bg-transparent text-inherit opacity-50 cursor-pointer hover:opacity-100"
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
