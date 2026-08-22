import { useEffect, useRef } from "react";
import { ApiError, useSaveApp, type AppDocument } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";

const AUTOSAVE_MS = 1200;

export function useAutosave(appId: string) {
  const document = useAppDocumentStore((s) => s.document);
  const setSaveStatus = useAppDocumentStore((s) => s.setSaveStatus);
  const saveApp = useSaveApp(appId);

  const timerRef = useRef<number | null>(null);
  const latestRef = useRef<AppDocument | null>(null);
  const seenRef = useRef<AppDocument | null>(null);
  const inFlightRef = useRef<Promise<unknown> | null>(null);

  const saveRef = useRef(saveApp.mutateAsync);
  const statusRef = useRef(setSaveStatus);

  useEffect(() => {
    latestRef.current = document;
    saveRef.current = saveApp.mutateAsync;
    statusRef.current = setSaveStatus;
  });

  async function persist(doc: AppDocument) {
    statusRef.current("saving");
    try {
      const run = saveRef.current({ ...doc, id: appId });
      inFlightRef.current = run;
      await run;
      statusRef.current("saved");
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        statusRef.current("saved");
        return true;
      }
      statusRef.current("error", "Не удалось сохранить");
      return false;
    } finally {
      inFlightRef.current = null;
    }
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
      await inFlightRef.current;
      return true;
    }
    return persist(doc);
  }

  return { flush };
}
