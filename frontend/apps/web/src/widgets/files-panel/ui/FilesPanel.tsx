import { useRef, useState } from "react";
import { AttachIcon, formatSize, type Attachment } from "@/shared/attachments";
import { buildFileTree, fileAccent, type TreeNode } from "@/shared/lib";
import styles from "./FilesPanel.module.css";

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
      className={styles.panel}
    >
      <div className={styles.head}>
        <span className={styles.headTitle}>Файлы</span>
        <span className={styles.headCount}>{total + uploads.length}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          title="Загрузить файлы"
          aria-label="Загрузить файлы"
          className={styles.headBtn}
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
          className={styles.headBtn}
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

      <div className={styles.searchWrap}>
        <div className={styles.search}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className={styles.searchIcon}>
            <circle cx="6.2" cy="6.2" r="3.9" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.3 9.3l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по файлам"
            spellCheck={false}
            className={styles.searchInput}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Очистить поиск"
              className={styles.searchClear}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {!matches && (
          <UploadsSection uploads={uploads} onRemove={onRemoveUpload} onPick={() => uploadInputRef.current?.click()} />
        )}

        {!matches && uploads.length > 0 && <GroupLabel text="Проект" />}

        {matches ? (
          matches.length === 0 ? (
            <p className={styles.empty}>Ничего не найдено</p>
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
        <div className={styles.overlay}>
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
          <span className={styles.overlayTitle}>Отпустите файлы</span>
          <span className={styles.overlayHint}>Добавим их в ресурсы проекта</span>
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
      <button type="button" onClick={onPick} className={styles.dropzone}>
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
        <span className={styles.dropzoneTitle}>Перетащите файлы сюда</span>
        <span className={styles.dropzoneHint}>или нажмите, чтобы выбрать</span>
      </button>
    );
  }

  return (
    <>
      <GroupLabel text={`Мои файлы · ${uploads.length}`} action={{ label: "Добавить", onClick: onPick }} />
      {uploads.map((a) => (
        <div key={a.id} className={styles.uploadRow} style={{ paddingLeft: 10 }}>
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
          <span className={styles.rowName}>{a.name}</span>
          <span className={styles.rowSize}>{formatSize(a.size)}</span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Удалить ${a.name}`}
            className={styles.removeUpload}
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
    <div className={styles.groupLabel}>
      <span className={styles.groupLabelText}>{text}</span>
      <span style={{ flex: 1 }} />
      {action && (
        <button type="button" onClick={action.onClick} className={styles.groupAction}>
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
        className={styles.dirRow}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          className={[styles.chevron, !isCollapsed && styles.chevronOpen].filter(Boolean).join(" ")}
        >
          <path
            d="M4.5 2.5L8 6l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className={styles.folderIcon}>
          <path
            d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h2l1.2 1.3h4.8c.7 0 1.2.5 1.2 1.2v4.3c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2V4.2z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.rowName}>{node.name}</span>
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
      className={[styles.row, active && styles.rowActive].filter(Boolean).join(" ")}
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
      <span className={styles.rowName}>{name}</span>
      <span className={styles.rowSize}>{formatSize(size)}</span>
    </button>
  );
}
