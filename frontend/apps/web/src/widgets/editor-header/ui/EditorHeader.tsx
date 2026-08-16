import { Link } from "react-router";
import { useAppDocumentStore, type AppSaveStatus } from "@/entities/app-document";
import { BildoLogo, Button } from "@/shared/ui";
import { ROUTES } from "@/shared/config";

export function EditorHeader({
  running,
  filesOpen,
  codeOpen,
  onToggleFiles,
  onToggleCode,
  onToggleRun,
  onShare,
  onExport,
}: {
  running: boolean;
  filesOpen: boolean;
  codeOpen: boolean;
  onToggleFiles: () => void;
  onToggleCode: () => void;
  onToggleRun: () => void;
  onShare: () => void;
  onExport: () => void;
}) {
  const name = useAppDocumentStore((s) => s.document?.name ?? "");
  const saveStatus = useAppDocumentStore((s) => s.saveStatus);
  const renameApp = useAppDocumentStore((s) => s.renameApp);

  return (
    <header className="relative min-h-14 flex items-center gap-3 px-3.5 border-b border-line bg-[rgba(255,255,255,0.86)] backdrop-saturate-[1.8] backdrop-blur-[12px] shrink-0 after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:pointer-events-none after:bg-[linear-gradient(90deg,var(--color-accent)_0%,#a855f7_26%,rgba(255,141,92,0.7)_48%,rgba(92,108,245,0)_76%)] after:opacity-50">
      <div className="flex items-center gap-2">
        <BildoLogo size="sm" href={ROUTES.apps} />
        <Link
          to={ROUTES.apps}
          className="inline-flex items-center min-h-8 px-[11px] py-1.5 rounded-control text-muted text-xs font-medium no-underline hover:bg-accent-wash hover:text-accent-strong hide-on-mobile"
        >
          Приложения
        </Link>
      </div>

      <span className="w-px h-5 shrink-0 bg-line hide-on-mobile" />

      <div className="flex items-center gap-2 min-w-0">
        <input
          className="w-[190px] h-[30px] min-w-0 px-2 border border-transparent rounded-lg outline-0 bg-transparent text-text font-ui text-[13px] font-semibold leading-[30px] text-ellipsis transition-[background,border-color] duration-[.14s] ease-[ease] hover:bg-surface focus:bg-panel focus:border-accent-line"
          value={name}
          onChange={(e) => renameApp(e.target.value)}
          aria-label="Название приложения"
          spellCheck={false}
        />
        <SaveBadge status={saveStatus} />
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 hide-on-mobile">
        <Button onClick={onToggleFiles} title="Файлы проекта" aria-pressed={filesOpen} on={filesOpen}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h2l1.2 1.3h4.8c.7 0 1.2.5 1.2 1.2v4.3c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2V4.2z"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
          </svg>
          Файлы
        </Button>
        <Button onClick={onToggleCode} title="Показать исходный код" aria-pressed={codeOpen} on={codeOpen}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M5.2 3.4L2.2 7l3 3.6M8.8 3.4L11.8 7l-3 3.6"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Код
        </Button>
      </div>

      <span className="w-px h-5 shrink-0 bg-line hide-on-mobile" />

      <div className="flex items-center gap-2">
        <Button onClick={onToggleRun} title="Запустить приложение в превью" variant={running ? "danger" : "default"}>
          {running ? (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden>
                <rect x="1.5" y="1.5" width="3" height="8" rx="1" />
                <rect x="6.5" y="1.5" width="3" height="8" rx="1" />
              </svg>
              Остановить
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="var(--color-ok)" aria-hidden>
                <path d="M2.5 1.6l6.6 3.9-6.6 3.9V1.6z" />
              </svg>
              Превью
            </>
          )}
        </Button>
        <Button onClick={onShare} className="hide-on-mobile">
          Поделиться
        </Button>
        <Button onClick={onExport} variant="primary">
          Экспорт
        </Button>
      </div>
    </header>
  );
}

const BADGE: Record<AppSaveStatus, { badge: string; dot: string; label: string }> = {
  idle: { badge: "bg-ok-soft text-ok-strong", dot: "bg-ok", label: "Сохранено" },
  saved: { badge: "bg-ok-soft text-ok-strong", dot: "bg-ok", label: "Сохранено" },
  saving: { badge: "bg-accent-soft text-accent-strong", dot: "bg-accent", label: "Сохранение…" },
  dirty: { badge: "bg-warn-soft text-warn-strong", dot: "bg-warn", label: "Не сохранено" },
  error: { badge: "bg-danger-soft text-danger-strong", dot: "bg-danger", label: "Ошибка" },
};

function SaveBadge({ status }: { status: AppSaveStatus }) {
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
