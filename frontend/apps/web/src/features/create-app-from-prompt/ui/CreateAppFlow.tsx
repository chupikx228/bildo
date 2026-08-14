import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useCreateApp } from "@bildo/api";
import {
  AttachChips,
  ClipIcon,
  FileMenuIcon,
  ImageMenuIcon,
  toAttachments,
  type Attachment,
} from "@/shared/attachments";
import { ROUTES } from "@/shared/config";
import { useOutsideClick } from "@/shared/lib";
import { AiInterview } from "./AiInterview";
import styles from "./CreateAppFlow.module.css";

const EXAMPLE_PROMPTS = [
  "Трекер привычек: сегодня, статистика, настройки",
  "Соцсеть с лентой, поиском и профилем",
  "Магазин кроссовок: каталог, корзина, аккаунт",
  "Форма заявки на консультацию с экраном «Готово»",
];

const MIN_PROMPT_LENGTH = 3;

export function CreateAppFlow() {
  const navigate = useNavigate();
  const createApp = useCreateApp();

  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"prompt" | "interview">("prompt");

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useOutsideClick<HTMLDivElement>(menuOpen, () => setMenuOpen(false));
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null, kind: Attachment["kind"]) => {
    setAttachments((prev) => [...prev, ...toAttachments(list, kind)].slice(0, 8));
    setMenuOpen(false);
  };

  const submit = async (override?: string) => {
    const text = (override ?? prompt).trim();
    if (text.length < MIN_PROMPT_LENGTH || createApp.isPending) return;
    if (override) setPrompt(text);
    setError(null);
    try {
      const result = await createApp.mutateAsync({ prompt: text });
      await navigate(ROUTES.editor(result.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать приложение");
    }
  };

  const canSend = prompt.trim().length >= MIN_PROMPT_LENGTH && !createApp.isPending;

  if (mode === "interview") {
    return (
      <AiInterview
        busy={createApp.isPending}
        onClose={() => setMode("prompt")}
        onSubmit={(text) => void submit(text)}
      />
    );
  }

  return (
    <>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Например: трекер привычек с вкладками «Сегодня», «Статистика» и настройками…"
          rows={4}
          disabled={createApp.isPending}
          className={styles.input}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />

        <AttachChips
          items={attachments}
          onRemove={(id) => setAttachments((prev) => prev.filter((x) => x.id !== id))}
          extra={
            planMode ? (
              <span className={[styles.chip, styles.chipPlan].join(" ")}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3 3.5h8M3 7h8M3 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Plan mode
                <button type="button" onClick={() => setPlanMode(false)} aria-label="Выключить plan mode">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            ) : null
          }
        />

        <div className={styles.bar}>
          <div className={styles.attach} ref={menuRef}>
            <button
              type="button"
              className={[styles.clip, menuOpen && styles.clipOpen].filter(Boolean).join(" ")}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Прикрепить"
              aria-expanded={menuOpen}
              title="Прикрепить"
            >
              <ClipIcon />
            </button>

            {menuOpen && (
              <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" onClick={() => imageInputRef.current?.click()}>
                  <ImageMenuIcon />
                  Загрузить изображения
                </button>
                <button type="button" role="menuitem" onClick={() => fileInputRef.current?.click()}>
                  <FileMenuIcon />
                  Загрузить файлы
                </button>

                <div className={styles.menuSep} />

                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={planMode}
                  onClick={() => setPlanMode((v) => !v)}
                  className={styles.menuToggle}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M3 3.5h8M3 7h8M3 10.5h5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                  </svg>
                  <span>
                    Plan mode
                    <em>Сначала план, потом сборка</em>
                  </span>
                  <span className={[styles.switch, planMode && styles.switchOn].filter(Boolean).join(" ")} aria-hidden>
                    <span />
                  </span>
                </button>
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files, "image");
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files, "file");
                e.target.value = "";
              }}
            />
          </div>

          <span className={styles.hint}>Ctrl+Enter</span>
          <span style={{ flex: 1 }} />
          <button type="submit" disabled={!canSend} className={styles.send}>
            {createApp.isPending ? "Собираем…" : "Создать приложение"}
          </button>
        </div>
      </form>

      <div className={styles.examples}>
        {EXAMPLE_PROMPTS.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={createApp.isPending}
            onClick={() => void submit(ex)}
            className={styles.example}
          >
            {ex}
          </button>
        ))}
      </div>

      <button type="button" className={styles.interviewEntry} onClick={() => setMode("interview")}>
        <span className={styles.interviewEntryIcon}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.8l1.5 3.2 3.5.5-2.5 2.4.6 3.4L8 9.7l-3.1 1.6.6-3.4L3 5.5l3.5-.5L8 1.8z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>
          Не знаете, с чего начать?
          <em>Ответьте на 5 вопросов — соберём промпт за вас</em>
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.interviewEntryGo}>
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {error && <p className={styles.error}>{error}</p>}
    </>
  );
}
