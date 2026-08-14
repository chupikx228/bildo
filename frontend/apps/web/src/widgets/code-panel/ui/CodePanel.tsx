import { useEffect, useState } from "react";
import { Button } from "@/shared/ui";
import { fileAccent, useWindowEvent } from "@/shared/lib";
import { formatSize } from "@/shared/attachments";
import { highlight } from "./highlight";
import styles from "./CodePanel.module.css";

const ENTRY_ORDER = ["app/index.tsx", "app/_layout.tsx", "package.json"];

export function CodePanel({
  files,
  path,
  onPath,
  onClose,
  onOpenFiles,
  filesOpen,
}: {
  files: Record<string, string>;
  path: string | null;
  onPath: (path: string) => void;
  onClose: () => void;
  onOpenFiles: () => void;
  filesOpen: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const paths = Object.keys(files).sort();
  const current = path && files[path] ? path : (ENTRY_ORDER.find((p) => files[p]) ?? paths[0]!);
  const source = files[current] ?? "";
  const lines = source.split("\n");

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  useWindowEvent("keydown", (e) => {
    if (e.key === "Escape") onClose();
  });

  function copy() {
    void navigator.clipboard?.writeText(source);
    setCopied(true);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        {!filesOpen && (
          <Button onClick={onOpenFiles} title="Показать файлы проекта">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path
                d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h2l1.2 1.3h4.8c.7 0 1.2.5 1.2 1.2v4.3c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2V4.2z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            Файлы
          </Button>
        )}

        <Breadcrumb path={current} />

        <span style={{ flex: 1 }} />

        <span className={styles.meta}>
          {lines.length} строк · {formatSize(source.length)}
        </span>

        <Button onClick={copy}>
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "var(--color-ok)" }}>
                <path
                  d="M3 7.4l2.6 2.6L11 4.6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Скопировано
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <rect x="5" y="5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M9 5V3.5A1.5 1.5 0 007.5 2h-4A1.5 1.5 0 002 3.5v4A1.5 1.5 0 003.5 9H5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              Копировать
            </>
          )}
        </Button>

        <Button onClick={onClose} title="Закрыть код (Esc)">
          Закрыть
        </Button>
      </div>

      <div className={styles.codeWrap}>
        <pre className={styles.code}>
          <code>
            {lines.map((line, i) => (
              <div key={i} className={styles.line}>
                <span className={styles.lineNo}>{i + 1}</span>
                <span className={styles.lineText}>{highlight(line, current)}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>

      <div className={styles.footer}>
        {ENTRY_ORDER.filter((p) => files[p]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPath(p)}
            className={[styles.jump, p === current && styles.jumpActive].filter(Boolean).join(" ")}
          >
            <span className={styles.jumpDot} style={{ background: fileAccent(p) }} />
            {p}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span className={styles.readonly}>Только чтение — правки делаются на холсте</span>
      </div>
    </div>
  );
}

function Breadcrumb({ path }: { path: string }) {
  const parts = path.split("/");
  return (
    <span className={styles.crumbs}>
      {parts.map((part, i) => (
        <span key={i} className={styles.crumb}>
          {i > 0 && <span className={styles.crumbSep}>/</span>}
          <span className={[styles.crumbText, i === parts.length - 1 && styles.crumbLast].filter(Boolean).join(" ")}>
            {part}
          </span>
        </span>
      ))}
    </span>
  );
}
