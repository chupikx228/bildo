import type { ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-medium tracking-[0.06em] uppercase text-subtle mb-1.5">{label}</div>
      {children}
    </div>
  );
}
