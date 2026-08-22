import type { ReactNode } from "react";

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-8 mb-2">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <div className="flex justify-end min-w-0">{children}</div>
    </div>
  );
}
