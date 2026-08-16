import { AttachIcon, formatSize, type Attachment } from "@/shared/attachments";
import { GroupLabel } from "./GroupLabel";
import { DropzoneIcon, RemoveIcon } from "./icons";
import { DROPZONE, DROPZONE_HINT, DROPZONE_TITLE, REMOVE_UPLOAD, ROW_NAME, ROW_SIZE, UPLOAD_ROW } from "./classes";

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
      <button type="button" onClick={onPick} className={DROPZONE}>
        <DropzoneIcon />
        <span className={DROPZONE_TITLE}>Перетащите файлы сюда</span>
        <span className={DROPZONE_HINT}>или нажмите, чтобы выбрать</span>
      </button>
    );
  }

  return (
    <>
      <GroupLabel text={`Мои файлы · ${uploads.length}`} action={{ label: "Добавить", onClick: onPick }} />
      {uploads.map((a) => (
        <div key={a.id} className={UPLOAD_ROW} style={{ paddingLeft: 10 }}>
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
            className={REMOVE_UPLOAD}
          >
            <RemoveIcon />
          </button>
        </div>
      ))}
      <div style={{ height: 10 }} />
    </>
  );
}
