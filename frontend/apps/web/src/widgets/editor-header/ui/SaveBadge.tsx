import type { AppSaveStatus } from "@/entities/app-document";

const BADGE: Record<AppSaveStatus, { badge: string; dot: string; label: string }> = {
  idle: { badge: "bg-ok-soft text-ok-strong", dot: "bg-ok", label: "Сохранено" },
  saved: { badge: "bg-ok-soft text-ok-strong", dot: "bg-ok", label: "Сохранено" },
  saving: { badge: "bg-accent-soft text-accent-strong", dot: "bg-accent", label: "Сохранение…" },
  dirty: { badge: "bg-warn-soft text-warn-strong", dot: "bg-warn", label: "Не сохранено" },
  error: { badge: "bg-danger-soft text-danger-strong", dot: "bg-danger", label: "Ошибка" },
};

export function SaveBadge({ status }: { status: AppSaveStatus }) {
  const s = BADGE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-[9px] rounded-full text-[11px] font-[550] whitespace-nowrap hide-on-mobile ${s.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}
