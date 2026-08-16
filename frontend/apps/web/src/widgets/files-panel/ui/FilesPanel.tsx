import { useRef, useState } from "react";
import type { Attachment } from "@/shared/attachments";
import { buildFileTree } from "@/shared/lib";
import { useFileDrop } from "../lib/useFileDrop";
import { FileRow } from "./FileRow";
import { GroupLabel } from "./GroupLabel";
import { TreeRow } from "./TreeRow";
import { UploadsSection } from "./UploadsSection";
import { ClearIcon, CloseIcon, DropOverlayIcon, SearchIcon, UploadIcon } from "./icons";
import {
  BODY,
  EMPTY,
  HEAD,
  HEAD_BTN,
  HEAD_COUNT,
  HEAD_TITLE,
  OVERLAY,
  OVERLAY_HINT,
  OVERLAY_TITLE,
  PANEL,
  SEARCH,
  SEARCH_CLEAR,
  SEARCH_ICON,
  SEARCH_INPUT,
  SEARCH_WRAP,
} from "./classes";

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
    <aside {...dropHandlers} className={PANEL}>
      <div className={HEAD}>
        <span className={HEAD_TITLE}>Файлы</span>
        <span className={HEAD_COUNT}>{total + uploads.length}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          title="Загрузить файлы"
          aria-label="Загрузить файлы"
          className={HEAD_BTN}
        >
          <UploadIcon />
        </button>
        <button type="button" onClick={onClose} title="Закрыть файлы" aria-label="Закрыть файлы" className={HEAD_BTN}>
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

      <div className={SEARCH_WRAP}>
        <div className={SEARCH}>
          <SearchIcon className={SEARCH_ICON} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по файлам"
            spellCheck={false}
            className={SEARCH_INPUT}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск" className={SEARCH_CLEAR}>
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      <div className={BODY}>
        {!matches && (
          <UploadsSection uploads={uploads} onRemove={onRemoveUpload} onPick={() => uploadInputRef.current?.click()} />
        )}

        {!matches && uploads.length > 0 && <GroupLabel text="Проект" />}

        {matches ? (
          matches.length === 0 ? (
            <p className={EMPTY}>Ничего не найдено</p>
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
        <div className={OVERLAY}>
          <DropOverlayIcon />
          <span className={OVERLAY_TITLE}>Отпустите файлы</span>
          <span className={OVERLAY_HINT}>Добавим их в ресурсы проекта</span>
        </div>
      )}
    </aside>
  );
}
