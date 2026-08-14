import { useState } from "react";
import { Link } from "react-router";
import { useApps, useDeleteApp } from "@bildo/api";
import { AppCard } from "@/entities/app";
import { SiteHeader } from "@/widgets/site-header";
import { ROUTES } from "@/shared/config";
import styles from "./AppsListPage.module.css";

export function AppsListPage() {
  const { data, isLoading, isError, error } = useApps();
  const deleteApp = useDeleteApp();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`Удалить «${name}»?`)) return;
    setPendingId(id);
    try {
      await deleteApp.mutateAsync(id);
    } finally {
      setPendingId(null);
    }
  }

  const message = isLoading
    ? "Загрузка…"
    : isError
      ? error instanceof Error
        ? error.message
        : "Не получилось загрузить список приложений."
      : data?.length === 0
        ? "Пока пусто — опишите идею на главной."
        : null;

  return (
    <div className={styles.page}>
      <SiteHeader>
        <Link to={ROUTES.home} className={styles.new}>
          Новое
        </Link>
      </SiteHeader>

      <main className={styles.content}>
        <h1 className={styles.title}>Мои приложения</h1>

        {message && (
          <p className={[styles.status, isError && styles.statusError].filter(Boolean).join(" ")}>{message}</p>
        )}

        <div className={styles.list}>
          {data?.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              deleting={pendingId === app.id}
              onDelete={() => void onDelete(app.id, app.name)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
