import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, appsKeys, useSaveApp, type AppDetail, type AppDocument } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";

const AUTOSAVE_MS = 1200;
const STALE_SAVE_ERROR = "Документ изменён в другом месте — загружена последняя версия";

export function useAutosave(appId: string) {
  const document = useAppDocumentStore((s) => s.document);
  const setSaveStatus = useAppDocumentStore((s) => s.setSaveStatus);
  const setRevision = useAppDocumentStore((s) => s.setRevision);
  const setDocument = useAppDocumentStore((s) => s.setDocument);
  const saveApp = useSaveApp(appId);
  const queryClient = useQueryClient();

  const timerRef = useRef<number | null>(null);
  const latestRef = useRef<AppDocument | null>(null);
  const seenRef = useRef<AppDocument | null>(null);
  const chainRef = useRef<Promise<boolean> | null>(null);

  const saveRef = useRef(saveApp.mutateAsync);
  const statusRef = useRef(setSaveStatus);
  const revisionRef = useRef(setRevision);
  const setDocumentRef = useRef(setDocument);

  useEffect(() => {
    latestRef.current = document;
    saveRef.current = saveApp.mutateAsync;
    statusRef.current = setSaveStatus;
    revisionRef.current = setRevision;
    setDocumentRef.current = setDocument;
  });

  async function reloadFromServer(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: appsKeys.detail(appId) });
    const detail = queryClient.getQueryData<AppDetail>(appsKeys.detail(appId));
    if (!detail) return;
    setDocumentRef.current({ ...detail.document, id: appId });
    seenRef.current = useAppDocumentStore.getState().document;
  }

  async function send(fallback: AppDocument): Promise<boolean> {
    const sent = useAppDocumentStore.getState().document ?? fallback;
    statusRef.current("saving");
    try {
      const saved = await saveRef.current({ ...sent, id: appId });
      const current = useAppDocumentStore.getState().document;
      revisionRef.current(saved.revision);
      if (current !== sent) {
        statusRef.current("dirty");
        return true;
      }
      seenRef.current = useAppDocumentStore.getState().document;
      statusRef.current("saved");
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        statusRef.current("saved");
        return true;
      }
      if (err instanceof ApiError && err.status === 412) {
        await reloadFromServer();
        statusRef.current("error", STALE_SAVE_ERROR);
        return false;
      }
      statusRef.current("error", "Не удалось сохранить");
      return false;
    }
  }

  function persist(doc: AppDocument): Promise<boolean> {
    const previous = chainRef.current;
    const run = previous ? previous.then(() => send(doc)) : send(doc);
    chainRef.current = run;
    void run.finally(() => {
      if (chainRef.current === run) chainRef.current = null;
    });
    return run;
  }

  useEffect(() => {
    if (!document) return;
    if (seenRef.current === document) return;
    const isInitial = seenRef.current === null;
    seenRef.current = document;
    if (isInitial) return;
    statusRef.current("dirty");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const doc = latestRef.current;
      if (doc) void persist(doc);
    }, AUTOSAVE_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  async function flush(): Promise<boolean> {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const doc = latestRef.current;
    if (!doc) {
      await chainRef.current;
      return true;
    }
    return persist(doc);
  }

  return { flush };
}
