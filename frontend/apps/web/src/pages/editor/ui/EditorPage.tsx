import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useApp } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { LoadingScreen } from "@/shared/ui";
import { AppGeneratingScreen } from "@/widgets/app-generation";
import { PhonePreview } from "@/widgets/canvas";
import { EditorWorkspace } from "./EditorWorkspace";

export function EditorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useApp(id);

  const document = useAppDocumentStore((s) => s.document);
  const setDocument = useAppDocumentStore((s) => s.setDocument);

  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.generationStatus !== "ready" || loadedRef.current === id) return;
    loadedRef.current = id;
    setDocument({ ...data.document, id });
  }, [data, id, setDocument]);

  const [reveal, setReveal] = useState({ id, revealed: false, cameFromPending: false });
  if (reveal.id !== id) {
    setReveal({ id, revealed: false, cameFromPending: data?.generationStatus === "pending" });
  } else if (data?.generationStatus === "pending" && !reveal.cameFromPending) {
    setReveal((s) => ({ ...s, cameFromPending: true }));
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isError) {
    return (
      <AppGeneratingScreen
        ready={false}
        error={error instanceof Error ? error.message : "Не удалось загрузить приложение"}
      />
    );
  }

  if (data?.generationStatus === "failed") {
    return <AppGeneratingScreen ready={false} error={data.generationError ?? "Не удалось сгенерировать приложение"} />;
  }

  const isReady = data?.generationStatus === "ready" && document?.id === id;

  if (!isReady || (reveal.cameFromPending && !reveal.revealed)) {
    const screen = isReady && document ? document.screens[0] : undefined;
    return (
      <AppGeneratingScreen
        ready={isReady}
        preview={
          isReady && document && screen ? (
            <PhonePreview document={document} screen={screen} editMode={false} reveal />
          ) : undefined
        }
        onDone={() => {
          setReveal((s) => ({ ...s, revealed: true }));
        }}
      />
    );
  }

  return <EditorWorkspace appId={id} document={document} />;
}
