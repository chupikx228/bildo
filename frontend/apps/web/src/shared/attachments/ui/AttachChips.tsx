import type { ReactNode } from "react";
import type { Attachment } from "../model";
import { formatSize } from "../model";
import { AttachIcon } from "./icons";
import styles from "./AttachChips.module.css";

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
    <div className={styles.chips}>
      {extra}
      {items.map((a) => (
        <span key={a.id} className={styles.chip} title={`${a.name} · ${formatSize(a.size)}`}>
          <AttachIcon kind={a.kind} />
          <span className={styles.chipName}>{a.name}</span>
          {onRemove && (
            <button type="button" onClick={() => onRemove(a.id)} aria-label={`Убрать ${a.name}`}>
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
