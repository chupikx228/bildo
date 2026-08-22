import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-3.5 pb-4 border-b border-line">
      <div className="text-[10px] font-[650] tracking-[0.08em] uppercase text-muted mb-3">{title}</div>
      {children}
    </div>
  );
}
