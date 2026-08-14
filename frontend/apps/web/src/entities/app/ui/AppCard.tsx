import type { AppSummary } from "@bildo/api";
import { Link } from "react-router";
import { ROUTES } from "@/shared/config";
import styles from "./AppCard.module.css";

export function AppCard({ app, deleting, onDelete }: { app: AppSummary; deleting: boolean; onDelete: () => void }) {
  return (
    <div className={styles.card}>
      <Link to={ROUTES.editor(app.id)} className={styles.main}>
        <span className={styles.name}>{app.name}</span>
        <span className={styles.date}>{new Date(app.updatedAt).toLocaleString("ru-RU")}</span>
      </Link>
      <Link to={ROUTES.publicPreview(app.id)} className={styles.preview}>
        Превью
      </Link>
      <button type="button" disabled={deleting} onClick={onDelete} className={styles.delete}>
        {deleting ? "Удаляем…" : "Удалить"}
      </button>
    </div>
  );
}
