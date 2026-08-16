import { useState } from "react";
import { Link } from "react-router";
import { useApps, useDeleteApp } from "@bildo/api";
import { AppCard } from "@/entities/app";
import { SiteHeader } from "@/widgets/site-header";
import { ROUTES } from "@/shared/config";

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
    <div className="min-h-[100dvh] text-text bg-[#fafafc] bg-[radial-gradient(150%_130%_at_-12%_-30%,rgba(92,108,245,0.075)_0%,rgba(92,108,245,0.03)_42%,rgba(92,108,245,0)_100%),radial-gradient(110%_100%_at_108%_115%,rgba(255,141,92,0.07)_0%,rgba(255,141,92,0)_100%)]">
      <SiteHeader>
        <Link
          to={ROUTES.home}
          className="px-3.5 py-2.5 rounded-control bg-[linear-gradient(180deg,#6b7bff,var(--color-accent-strong))] text-ink-fg no-underline text-[13px] font-semibold shadow-[0_6px_16px_rgba(92,108,245,0.28)] hover:brightness-105"
        >
          Новое
        </Link>
      </SiteHeader>

      <main className="pt-2 px-7 pb-7">
        <h1 className="m-0 mb-5 text-2xl font-bold">Мои приложения</h1>

        {message && <p className={`text-[13px] ${isError ? "text-danger" : "text-subtle"}`}>{message}</p>}

        <div className="grid gap-2.5 max-w-[640px]">
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
