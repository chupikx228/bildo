import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { useApp } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { EditorWorkspace } from "./EditorWorkspace";

const WORKSPACE = "h-[100dvh] min-h-[520px] flex flex-col overflow-hidden bg-bg text-text";
const STATUS = "grid place-items-center flex-1 text-muted text-[13px]";

export function EditorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useApp(id);

  const document = useAppDocumentStore((s) => s.document);
  const setDocument = useAppDocumentStore((s) => s.setDocument);

  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data || loadedRef.current === id) return;
    loadedRef.current = id;
    setDocument({ ...data, id });
  }, [data, id, setDocument]);

  if (isLoading) {
    return (
      <div className={WORKSPACE}>
        <p className={STATUS}>Загрузка приложения…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={WORKSPACE}>
        <p className={STATUS}>{error instanceof Error ? error.message : "Не удалось загрузить приложение"}</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className={WORKSPACE}>
        <p className={STATUS}>Готовим редактор…</p>
      </div>
    );
  }

  return <EditorWorkspace appId={id} document={document} />;
}
