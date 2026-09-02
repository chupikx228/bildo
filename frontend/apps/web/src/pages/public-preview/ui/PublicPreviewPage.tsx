import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { normalizeAppDocument, useApp } from "@bildo/api";
import { AppGeneratingScreen, LOADING_LABEL } from "@/shared/ui";
import { PhonePreview } from "@/widgets/canvas";

const WRAPPER = "relative min-h-[100dvh] grid place-items-center bg-board p-6";
const STATUS = "text-subtle text-[13px]";
const BACK =
  "absolute left-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-control border border-line-strong bg-panel text-muted shadow-sm transition-[background,color] duration-[.16s] ease-[ease] hover:bg-accent-wash hover:text-accent-strong";

export function PublicPreviewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useApp(id);
  const [screenId, setScreenId] = useState<string | null>(null);
  const [stateVars, setStateVars] = useState<Record<string, string | number | boolean>>({});

  const handleSetVar = (name: string, value: string | number | boolean) =>
    setStateVars((prev) => ({ ...prev, [name]: value }));

  const backButton = (
    <button type="button" onClick={() => void navigate(-1)} aria-label="Назад" className={BACK}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M10 3.5L5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  if (isLoading) {
    return <AppGeneratingScreen label={LOADING_LABEL} />;
  }

  if (isError || !data) {
    return (
      <div className={WRAPPER}>
        {backButton}
        <p className={STATUS}>Приложение не найдено.</p>
      </div>
    );
  }

  if (data.generationStatus === "failed") {
    return (
      <div className={WRAPPER}>
        {backButton}
        <p className={STATUS}>{data.generationError ?? "Не удалось сгенерировать приложение"}</p>
      </div>
    );
  }

  if (data.generationStatus !== "ready") {
    return (
      <div className="relative">
        <AppGeneratingScreen />
        {backButton}
      </div>
    );
  }

  const base = normalizeAppDocument(data.document);
  const document = { ...base, state: { ...base.state, ...stateVars } };
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
      {backButton}
      <PhonePreview
        document={document}
        screen={screen}
        editMode={false}
        onSelectScreen={setScreenId}
        onSetVar={handleSetVar}
      />
    </div>
  );
}
