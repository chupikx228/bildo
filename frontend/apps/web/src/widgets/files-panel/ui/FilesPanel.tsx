import { useRef, useState } from "react";
import type { Attachment } from "@/shared/attachments";
import { buildFileTree } from "@/shared/lib";
import { useFileDrop } from "../lib/useFileDrop";
import { FileRow } from "./FileRow";
import { GroupLabel } from "./GroupLabel";
import { TreeRow } from "./TreeRow";
import { UploadsSection } from "./UploadsSection";
import { ClearIcon, CloseIcon, DropOverlayIcon, SearchIcon, UploadIcon } from "./icons";
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
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { dragging, dropHandlers } = useFileDrop(onUpload);

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
    <aside {...dropHandlers} className={styles.panel}>
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
          <UploadIcon />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Закрыть файлы"
          aria-label="Закрыть файлы"
          className={styles.headBtn}
        >
          <CloseIcon />
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
          <SearchIcon className={styles.searchIcon} />
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
              <ClearIcon />
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
          <DropOverlayIcon />
          <span className={styles.overlayTitle}>Отпустите файлы</span>
          <span className={styles.overlayHint}>Добавим их в ресурсы проекта</span>
        </div>
      )}
    </aside>
  );
}
