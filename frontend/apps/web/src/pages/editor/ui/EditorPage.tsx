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

  const [revealed, setRevealed] = useState(false);

  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.generationStatus !== "ready" || loadedRef.current === id) return;
    loadedRef.current = id;
    setDocument({ ...data.document, id });
  }, [data, id, setDocument]);

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

  if (!isReady || !revealed) {
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
          setRevealed(true);
        }}
      />
    );
  }

  return <EditorWorkspace appId={id} document={document} />;
}
