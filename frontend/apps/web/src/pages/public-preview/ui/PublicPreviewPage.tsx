import { useState } from "react";
import { useParams } from "react-router";
import { normalizeAppDocument, useApp } from "@bildo/api";
import { PhonePreview } from "@/widgets/canvas";
import styles from "./PublicPreviewPage.module.css";

export function PublicPreviewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useApp(id);
  const [screenId, setScreenId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.status}>Загрузка…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.status}>Приложение не найдено.</p>
      </div>
    );
  }

  const document = normalizeAppDocument(data);
  const screen = document.screens.find((s) => s.id === screenId) ?? document.screens[0];
  if (!screen) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.status}>В приложении пока нет экранов.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <PhonePreview document={document} screen={screen} editMode={false} onSelectScreen={setScreenId} />
    </div>
  );
}
