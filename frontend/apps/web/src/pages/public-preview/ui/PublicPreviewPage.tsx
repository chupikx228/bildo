import { useState } from "react";
import { useParams } from "react-router";
import { normalizeAppDocument, useApp } from "@bildo/api";
import { PhonePreview } from "@/widgets/canvas";

const WRAPPER = "min-h-[100dvh] grid place-items-center bg-board p-6";
const STATUS = "text-subtle text-[13px]";

export function PublicPreviewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useApp(id);
  const [screenId, setScreenId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className={WRAPPER}>
        <p className={STATUS}>Загрузка…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={WRAPPER}>
        <p className={STATUS}>Приложение не найдено.</p>
      </div>
    );
  }

  const document = normalizeAppDocument(data);
  const screen = document.screens.find((s) => s.id === screenId) ?? document.screens[0];
  if (!screen) {
    return (
      <div className={WRAPPER}>
        <p className={STATUS}>В приложении пока нет экранов.</p>
      </div>
    );
  }

  return (
    <div className={WRAPPER}>
      <PhonePreview document={document} screen={screen} editMode={false} onSelectScreen={setScreenId} />
    </div>
  );
}
