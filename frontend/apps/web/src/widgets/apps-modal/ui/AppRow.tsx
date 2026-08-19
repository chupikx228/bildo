import { Link } from "react-router";
import type { AppSummary } from "@bildo/api";
import { ROUTES } from "@/shared/config";
import { formatWhen } from "@/shared/lib";

interface AppRowProps {
  app: AppSummary;
  current: boolean;
  confirming: boolean;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export const AppRow = ({ app, current, confirming, deleting, onOpen, onDelete }: AppRowProps) => {
  const initial = (app.name.trim()[0] ?? "A").toUpperCase();

  return (
    <li className="min-w-0">
      <div
        className={`flex items-center gap-2 rounded-card border p-2 pl-2.5 transition-[border-color,background] duration-[.16s] ease-[ease] ${
          current
            ? "border-accent-line bg-accent-wash shadow-[inset_0_0_0_1px_var(--color-accent-line)]"
            : "border-line bg-panel shadow-sm hover:border-accent-line hover:bg-accent-wash"
        }`}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-1 text-left"
        >
          <span
            aria-hidden
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-accent-soft text-[13px] font-[650] text-accent-strong"
          >
            {initial}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px] overflow-hidden">
            <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold text-text">
              {app.name || "Без названия"}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[11.5px] text-subtle">
              {formatWhen(app.updatedAt)}
              {current && (
                <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-[650] uppercase tracking-[0.04em] text-accent-strong">
                  в работе
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            to={ROUTES.publicPreview(app.id)}
            className="rounded-control px-2 py-1 text-xs text-muted no-underline hover:bg-accent-wash hover:text-accent-strong"
          >
            Превью
          </Link>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className={`cursor-pointer whitespace-nowrap rounded-control border-0 bg-transparent px-2 py-1 text-xs disabled:cursor-wait ${
              confirming ? "bg-danger-soft text-danger" : "text-muted hover:bg-accent-wash hover:text-accent-strong"
            }`}
          >
            {deleting ? "…" : confirming ? "Точно?" : "Удалить"}
          </button>
        </div>
      </div>
    </li>
  );
};
