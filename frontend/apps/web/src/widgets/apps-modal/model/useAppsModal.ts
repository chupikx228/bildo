import { useState } from "react";
import { useNavigate } from "react-router";
import { type AppSummary, useApps, useDeleteApp } from "@bildo/api";
import { ROUTES } from "@/shared/config";

interface UseAppsModalParams {
  currentId?: string;
  onClose: () => void;
}

interface UseAppsModal {
  apps: AppSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isDeleteError: boolean;
  deleteError: unknown;
  confirmId: string | null;
  deletingId: string | null;
  openApp: (id: string) => void;
  startNew: () => void;
  requestDelete: (id: string) => void;
}

export function useAppsModal({ currentId, onClose }: UseAppsModalParams): UseAppsModal {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useApps();
  const del = useDeleteApp();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function openApp(id: string) {
    if (id === currentId) {
      onClose();
      return;
    }
    void navigate(ROUTES.editor(id));
  }

  function startNew() {
    void navigate(ROUTES.home);
  }

  function requestDelete(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    del.mutate(id, {
      onSuccess: () => {
        setConfirmId(null);
        if (id === currentId) void navigate(ROUTES.home);
      },
    });
  }

  return {
    apps: data,
    isLoading,
    isError,
    error,
    isDeleteError: del.isError,
    deleteError: del.error,
    confirmId,
    deletingId: del.isPending ? (del.variables ?? null) : null,
    openApp,
    startNew,
    requestDelete,
  };
}
