import { AttachIcon, formatSize, type Attachment } from "@/shared/attachments";
import { GroupLabel } from "./GroupLabel";
import { DropzoneIcon, RemoveIcon } from "./icons";
import styles from "./FilesPanel.module.css";

export function UploadsSection({
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
        <DropzoneIcon />
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
            <RemoveIcon />
          </button>
        </div>
      ))}
      <div style={{ height: 10 }} />
    </>
  );
}
