import { useEffect, useState } from "react";
import { Button } from "@/shared/ui";
import { fileAccent, useWindowEvent } from "@/shared/lib";
import { formatSize } from "@/shared/attachments";
import { highlight } from "./highlight";

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
    <div className="absolute inset-0 z-[12] flex flex-col bg-[#fbfbfd] animate-code-in">
      <div className="h-11 shrink-0 flex items-center gap-2 pl-3 pr-2.5 border-b border-line bg-[rgba(255,255,255,0.9)] backdrop-blur-[10px]">
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

        <span className="flex-1" />

        <span className="text-[11px] text-subtle whitespace-nowrap">
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

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <pre className="flex-1 min-w-0 m-0 overflow-auto pt-3.5 pb-10 font-mono text-[12.5px] leading-5 [tab-size:2]">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex min-h-5 pr-5">
                <span className="shrink-0 w-[52px] pr-3.5 text-right text-[#c3c3cd] select-none">{i + 1}</span>
                <span className="whitespace-pre text-text">{highlight(line, current)}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>

      <div className="shrink-0 flex items-center gap-1.5 px-3 py-[7px] border-t border-line bg-panel overflow-x-auto">
        {ENTRY_ORDER.filter((p) => files[p]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPath(p)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full border cursor-pointer text-[11px] ${
              p === current
                ? "border-accent-line bg-accent-soft text-accent-strong font-semibold"
                : "border-line bg-transparent text-subtle font-normal"
            }`}
          >
            <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: fileAccent(p) }} />
            {p}
          </button>
        ))}
        <span className="flex-1" />
        <span className="shrink-0 text-[11px] text-faint">Только чтение — правки делаются на холсте</span>
      </div>
    </div>
  );
}

function Breadcrumb({ path }: { path: string }) {
  const parts = path.split("/");
  return (
    <span className="inline-flex items-center gap-1 min-w-0 text-xs text-subtle">
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-1 min-w-0">
          {i > 0 && <span className="text-faint">/</span>}
          <span
            className={`overflow-hidden text-ellipsis whitespace-nowrap ${
              i === parts.length - 1 ? "text-text font-semibold" : ""
            }`}
          >
            {part}
          </span>
        </span>
      ))}
    </span>
  );
}
