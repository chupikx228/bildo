import type { AppSummary } from "@bildo/api";
import { Link } from "react-router";
import { ROUTES } from "@/shared/config";

export function AppCard({ app, deleting, onDelete }: { app: AppSummary; deleting: boolean; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-card border border-[#e4e4ea] bg-panel shadow-sm transition-[border-color,box-shadow] duration-[.16s] ease-[ease] hover:border-accent-line hover:shadow-md">
      <Link to={ROUTES.editor(app.id)} className="flex-1 min-w-0 no-underline text-inherit">
        <span className="block font-semibold text-text overflow-hidden text-ellipsis whitespace-nowrap">
          {app.name}
        </span>
        <span className="block mt-1 text-xs text-subtle">{new Date(app.updatedAt).toLocaleString("ru-RU")}</span>
      </Link>
      <Link
        to={ROUTES.publicPreview(app.id)}
        className="shrink-0 text-xs text-muted no-underline hover:text-accent-strong"
      >
        Превью
      </Link>
      <button
        type="button"
        disabled={deleting}
        onClick={onDelete}
        className="shrink-0 text-xs text-danger bg-transparent border border-[#e4e4ea] rounded-lg px-2.5 py-1.5 cursor-pointer enabled:hover:bg-danger-soft disabled:cursor-wait disabled:opacity-60"
      >
        {deleting ? "Удаляем…" : "Удалить"}
      </button>
    </div>
  );
}
