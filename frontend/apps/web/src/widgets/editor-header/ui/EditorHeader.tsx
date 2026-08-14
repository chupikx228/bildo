import { Link } from "react-router";
import { useAppDocumentStore, type AppSaveStatus } from "@/entities/app-document";
import { BildoLogo, Button } from "@/shared/ui";
import { ROUTES } from "@/shared/config";
import styles from "./EditorHeader.module.css";

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
    <header className={styles.topbar}>
      <div className={styles.group}>
        <BildoLogo size="sm" href={ROUTES.apps} />
        <Link to={ROUTES.apps} className={`${styles.link} hide-on-mobile`}>
          Приложения
        </Link>
      </div>

      <span className={`${styles.sep} hide-on-mobile`} />

      <div className={styles.group} style={{ minWidth: 0 }}>
        <input
          className={styles.title}
          value={name}
          onChange={(e) => renameApp(e.target.value)}
          aria-label="Название приложения"
          spellCheck={false}
        />
        <SaveBadge status={saveStatus} />
      </div>

      <div style={{ flex: 1 }} />

      <div className={`${styles.group} hide-on-mobile`}>
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

      <span className={`${styles.sep} hide-on-mobile`} />

      <div className={styles.group}>
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

const BADGE: Record<AppSaveStatus, { className: string; label: string }> = {
  idle: { className: styles.badgeSaved!, label: "Сохранено" },
  saved: { className: styles.badgeSaved!, label: "Сохранено" },
  saving: { className: styles.badgeSaving!, label: "Сохранение…" },
  dirty: { className: styles.badgeDirty!, label: "Не сохранено" },
  error: { className: styles.badgeError!, label: "Ошибка" },
};

function SaveBadge({ status }: { status: AppSaveStatus }) {
  const s = BADGE[status];
  return (
    <span className={[styles.badge, s.className, "hide-on-mobile"].join(" ")}>
      <span className={styles.badgeDot} />
      {s.label}
    </span>
  );
}
