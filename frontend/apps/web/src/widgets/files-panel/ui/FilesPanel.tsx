import { useRef, useState } from "react";
import { AttachIcon, formatSize, type Attachment } from "@/shared/attachments";
import { buildFileTree, fileAccent, type TreeNode } from "@/shared/lib";

const ROW_LAYOUT =
  "flex items-center gap-[7px] w-full h-[27px] pr-2 border-0 rounded-[7px] bg-transparent text-xs leading-none text-left transition-[background] duration-[.12s] ease-[ease]";
const ROW_NAME = "flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left";
const ROW_SIZE = "shrink-0 text-[10px] text-faint font-normal";

export function FilesPanel({
  files,
  activePath,
  uploads,
  onUpload,
  onRemoveUpload,
  onOpen,
  onClose,
}: {
  files: Record<string, string>;
  activePath: string | null;
  uploads: Attachment[];
  onUpload: (files: FileList | File[] | null) => void;
  onRemoveUpload: (id: string) => void;
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const tree = buildFileTree(files);
  const q = query.trim().toLowerCase();
  const matches = q
    ? Object.keys(files)
        .filter((p) => p.toLowerCase().includes(q))
        .sort()
    : null;

  function toggleDir(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const total = Object.keys(files).length;

  return (
    <aside
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files);
      }}
      className="relative min-w-0 flex flex-col overflow-hidden bg-panel border-r border-line-strong"
    >
      <div className="h-12 shrink-0 pl-3.5 pr-2 border-b border-line flex items-center gap-2">
        <span className="font-semibold text-xs leading-none font-ui text-text tracking-[0.01em]">Файлы</span>
        <span className="text-[11px] text-subtle">{total + uploads.length}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          title="Загрузить файлы"
          aria-label="Загрузить файлы"
          className="w-[26px] h-[26px] grid place-items-center border-0 rounded-[7px] bg-transparent text-subtle cursor-pointer p-0 shrink-0 transition-[background,color] duration-[.14s] ease-[ease] hover:bg-accent-wash hover:text-accent-strong"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 9.6V2.8M4.3 5.3L7 2.6l2.7 2.7"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2.6 9.9v.8c0 .6.5 1.1 1.1 1.1h6.6c.6 0 1.1-.5 1.1-1.1v-.8"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Закрыть файлы"
          aria-label="Закрыть файлы"
          className="w-[26px] h-[26px] grid place-items-center border-0 rounded-[7px] bg-transparent text-subtle cursor-pointer p-0 shrink-0 transition-[background,color] duration-[.14s] ease-[ease] hover:bg-accent-wash hover:text-accent-strong"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onUpload(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="px-2.5 py-2 shrink-0">
        <div className="flex items-center gap-[7px] h-[30px] px-[9px] rounded-lg bg-surface border border-line">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-subtle shrink-0">
            <circle cx="6.2" cy="6.2" r="3.9" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.3 9.3l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по файлам"
            spellCheck={false}
            className="flex-1 min-w-0 border-0 outline-0 bg-transparent text-text font-ui font-normal text-xs leading-[1.4]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Очистить поиск"
              className="border-0 bg-transparent text-subtle cursor-pointer p-0 grid place-items-center"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-3">
        {!matches && (
          <UploadsSection uploads={uploads} onRemove={onRemoveUpload} onPick={() => uploadInputRef.current?.click()} />
        )}

        {!matches && uploads.length > 0 && <GroupLabel text="Проект" />}

        {matches ? (
          matches.length === 0 ? (
            <p className="mx-2.5 my-[18px] text-xs text-subtle text-center">Ничего не найдено</p>
          ) : (
            matches.map((path) => (
              <FileRow
                key={path}
                name={path}
                depth={0}
                active={path === activePath}
                size={files[path]!.length}
                onClick={() => onOpen(path)}
              />
            ))
          )
        ) : (
          tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              collapsed={collapsed}
              activePath={activePath}
              onToggle={toggleDir}
              onOpen={onOpen}
            />
          ))
        )}
      </div>

      {dragging && (
        <div className="absolute inset-1.5 z-[5] flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-accent-line bg-[rgba(246,247,255,0.92)] backdrop-blur-[6px] text-accent-strong pointer-events-none">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16.5V4.5M7.5 9L12 4.5 16.5 9"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4.5 16.8v1.4a2 2 0 002 2h11a2 2 0 002-2v-1.4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[13px] font-semibold">Отпустите файлы</span>
          <span className="text-[11px] opacity-75">Добавим их в ресурсы проекта</span>
        </div>
      )}
    </aside>
  );
}

function UploadsSection({
  uploads,
  onRemove,
  onPick,
}: {
  uploads: Attachment[];
  onRemove: (id: string) => void;
  onPick: () => void;
}) {
  if (uploads.length === 0) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex flex-col items-center gap-[3px] w-[calc(100%-4px)] mx-0.5 mt-1 mb-2.5 px-2.5 py-3.5 rounded-[11px] border border-dashed border-line-strong bg-transparent text-subtle cursor-pointer transition-[border-color,background,color] duration-[.14s] ease-[ease] hover:border-accent-line hover:bg-accent-wash hover:text-accent-strong"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 10.8V3.4M5 6.4L8 3.4l3 3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 11.2v.9c0 .7.6 1.3 1.3 1.3h7.4c.7 0 1.3-.6 1.3-1.3v-.9"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-xs font-semibold">Перетащите файлы сюда</span>
        <span className="text-[11px]">или нажмите, чтобы выбрать</span>
      </button>
    );
  }

  return (
    <>
      <GroupLabel text={`Мои файлы · ${uploads.length}`} action={{ label: "Добавить", onClick: onPick }} />
      {uploads.map((a) => (
        <div key={a.id} className={`${ROW_LAYOUT} cursor-default text-muted font-normal`} style={{ paddingLeft: 10 }}>
          <span
            style={{
              flexShrink: 0,
              color: a.kind === "image" ? "var(--color-ok)" : "var(--color-accent)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <AttachIcon kind={a.kind} />
          </span>
          <span className={ROW_NAME}>{a.name}</span>
          <span className={ROW_SIZE}>{formatSize(a.size)}</span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Удалить ${a.name}`}
            className="shrink-0 w-[18px] h-[18px] grid place-items-center border-0 rounded-[5px] bg-transparent text-faint cursor-pointer p-0 hover:text-danger"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
      <div style={{ height: 10 }} />
    </>
  );
}

function GroupLabel({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1">
      <span className="text-[10px] font-[650] tracking-[0.07em] uppercase text-faint">{text}</span>
      <span className="flex-1" />
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="border-0 bg-transparent text-accent-strong font-ui text-[11px] font-semibold cursor-pointer p-0"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  collapsed,
  activePath,
  onToggle,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  if (node.kind === "file") {
    return (
      <FileRow
        name={node.name}
        depth={depth}
        size={node.size}
        active={node.path === activePath}
        onClick={() => onOpen(node.path)}
      />
    );
  }

  const isCollapsed = collapsed.has(node.path);
  return (
    <>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className={`${ROW_LAYOUT} cursor-pointer text-muted font-[550] hover:bg-surface`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          className={`shrink-0 text-subtle transition-transform duration-[.14s] ease-[ease] ${
            !isCollapsed ? "rotate-90" : ""
          }`}
        >
          <path
            d="M4.5 2.5L8 6l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="shrink-0 text-accent">
          <path
            d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h2l1.2 1.3h4.8c.7 0 1.2.5 1.2 1.2v4.3c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2V4.2z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        <span className={ROW_NAME}>{node.name}</span>
      </button>
      {!isCollapsed &&
        node.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            collapsed={collapsed}
            activePath={activePath}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
    </>
  );
}

function FileRow({
  name,
  depth,
  size,
  active,
  onClick,
}: {
  name: string;
  depth: number;
  size: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={`${ROW_LAYOUT} cursor-pointer ${
        active ? "bg-accent-soft text-accent-strong font-semibold" : "text-muted font-normal hover:bg-surface"
      }`}
      style={{ paddingLeft: 8 + depth * 12 + 14 }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        fill="none"
        style={{ flexShrink: 0, color: active ? "var(--color-accent-strong)" : fileAccent(name) }}
      >
        <path
          d="M3.5 2h4.2L11 5.2v6.3c0 .6-.4 1-1 1H3.5c-.6 0-1-.4-1-1V3c0-.6.4-1 1-1z"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
        <path d="M7.6 2.2v3.1h3.2" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      </svg>
      <span className={ROW_NAME}>{name}</span>
      <span className={ROW_SIZE}>{formatSize(size)}</span>
    </button>
  );
}
