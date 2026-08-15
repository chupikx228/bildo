import { formatSize } from "@/shared/attachments";
import { fileAccent } from "@/shared/lib";
import { FileIcon } from "./icons";
import styles from "./FilesPanel.module.css";

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
      className={[styles.row, active && styles.rowActive].filter(Boolean).join(" ")}
      style={{ paddingLeft: 8 + depth * 12 + 14 }}
    >
      <FileIcon style={{ flexShrink: 0, color: active ? "var(--color-accent-strong)" : fileAccent(name) }} />
      <span className={styles.rowName}>{name}</span>
      <span className={styles.rowSize}>{formatSize(size)}</span>
    </button>
  );
}
