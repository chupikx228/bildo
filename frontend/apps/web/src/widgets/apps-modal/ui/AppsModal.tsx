import { Button, Modal, QueryState } from "@/shared/ui";
import { resolveErrorMessage } from "@/shared/api";
import { useAppsModal } from "../model/useAppsModal";
import { AppRow } from "./AppRow";
import { AppsSkeleton } from "./AppsSkeleton";

interface AppsModalProps {
  open: boolean;
  onClose: () => void;
  currentId?: string;
}

export const AppsModal = ({ open, onClose, currentId }: AppsModalProps) => {
  const {
    apps,
    isLoading,
    isError,
    error,
    isDeleteError,
    deleteError,
    confirmId,
    deletingId,
    openApp,
    startNew,
    requestDelete,
  } = useAppsModal({ currentId, onClose });

  return (
    <Modal open={open} onClose={onClose}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-[18px] pb-3.5 pt-[18px]">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-subtle">Приложения</div>
          <h2 className="mt-1 text-[16px] font-[650] tracking-[-0.02em] text-text">Мои приложения</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="primary" onClick={startNew}>
            Новое
          </Button>
          <Button variant="quiet" aria-label="Закрыть" onClick={onClose} className="h-9 w-9 px-0">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path d="M5.5 5.5l11 11M16.5 5.5l-11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isDeleteError && (
          <p className="mb-2.5 px-1 text-[13px] text-danger">
            {resolveErrorMessage(deleteError, "Не удалось удалить приложение.")}
          </p>
        )}

        <QueryState
          isLoading={isLoading}
          isError={isError}
          error={error}
          errorFallback="Не удалось загрузить приложения."
          loading={<AppsSkeleton />}
        >
          {apps?.length === 0 ? (
            <div className="px-4 pb-5 pt-7 text-center text-[13px] leading-normal text-muted">
              <p className="mb-3.5">Пока пусто — опишите идею на главной, и приложение появится здесь.</p>
              <Button onClick={startNew}>К созданию</Button>
            </div>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {apps?.map((app) => (
                <AppRow
                  key={app.id}
                  app={app}
                  current={app.id === currentId}
                  confirming={confirmId === app.id}
                  deleting={deletingId === app.id}
                  onOpen={() => openApp(app.id)}
                  onDelete={() => requestDelete(app.id)}
                />
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </Modal>
  );
};
