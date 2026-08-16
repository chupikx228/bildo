import { formatSize } from "@/shared/attachments";
import { fileAccent } from "@/shared/lib";
import { FileIcon } from "./icons";
import { FILE_ROW_ACTIVE, FILE_ROW_INACTIVE, ROW_LAYOUT, ROW_NAME, ROW_SIZE } from "./classes";

export function FileRow({
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
      className={`${ROW_LAYOUT} cursor-pointer ${active ? FILE_ROW_ACTIVE : FILE_ROW_INACTIVE}`}
      style={{ paddingLeft: 8 + depth * 12 + 14 }}
    >
      <FileIcon style={{ flexShrink: 0, color: active ? "var(--color-accent-strong)" : fileAccent(name) }} />
      <span className={ROW_NAME}>{name}</span>
      <span className={ROW_SIZE}>{formatSize(size)}</span>
    </button>
  );
}
