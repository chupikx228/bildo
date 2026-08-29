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
import { resolveErrorMessage } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useOutsideClick } from "@/shared/lib";
import { DEFAULT_MODEL_ID, type ModelId } from "../model/models";
import { AiInterview } from "./AiInterview";
import { ModelPicker } from "./ModelPicker";

const EXAMPLE_PROMPTS = [
  "Трекер привычек: сегодня, статистика, настройки",
  "Соцсеть с лентой, поиском и профилем",
  "Магазин кроссовок: каталог, корзина, аккаунт",
  "Форма заявки на консультацию с экраном «Готово»",
];

const MIN_PROMPT_LENGTH = 3;

const MENU =
  "absolute bottom-[calc(100%+8px)] left-0 w-[264px] p-1.5 rounded-[14px] border border-line-strong bg-[rgba(255,255,255,0.98)] backdrop-blur-[18px] shadow-[0_18px_48px_rgba(16,16,20,0.14),0_2px_6px_rgba(16,16,20,0.06)] z-20 animate-insert-pop [&_button]:flex [&_button]:items-center [&_button]:gap-2.5 [&_button]:w-full [&_button]:px-2.5 [&_button]:py-[9px] [&_button]:border-0 [&_button]:rounded-control [&_button]:bg-transparent [&_button]:text-text-soft [&_button]:font-ui [&_button]:text-[13px] [&_button]:text-left [&_button]:cursor-pointer [&_button:hover]:bg-accent-wash [&_button_svg]:shrink-0 [&_button_svg]:text-accent";

export function CreateAppFlow() {
  const navigate = useNavigate();
  const createApp = useCreateApp();

  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"prompt" | "interview">("prompt");

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [modelId, setModelId] = useState<ModelId>(DEFAULT_MODEL_ID);
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
      const result = await createApp.mutateAsync({ prompt: text, model: modelId });
      await navigate(ROUTES.editor(result.id));
    } catch (err) {
      setError(resolveErrorMessage(err, "Не удалось создать приложение"));
    }
  };

  const pending = createApp.isPending;
  const promptReady = prompt.trim().length >= MIN_PROMPT_LENGTH;
  const canSend = promptReady && !pending;

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
        className="w-full rounded-2xl border border-line-strong bg-[rgba(255,255,255,0.88)] backdrop-blur-[20px] p-3 shadow-[0_18px_48px_rgba(16,16,20,0.1),0_2px_6px_rgba(16,16,20,0.05)] transition-[border-color,box-shadow] duration-[.18s] ease-[ease] focus-within:border-accent-line focus-within:shadow-[0_20px_56px_rgba(92,108,245,0.14),0_2px_6px_rgba(16,16,20,0.05)]"
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
          disabled={pending}
          className="w-full min-h-24 resize-y border-0 outline-0 bg-transparent text-text text-[15px] leading-[1.5] box-border placeholder:text-[#a5a5b0]"
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
              <span className="inline-flex items-center gap-1.5 h-[26px] pl-[9px] pr-[7px] rounded-full border border-accent-line bg-accent-wash text-accent-strong font-semibold text-[11px]">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3 3.5h8M3 7h8M3 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Plan mode
                <button
                  type="button"
                  onClick={() => setPlanMode(false)}
                  aria-label="Выключить plan mode"
                  className="grid place-items-center border-0 p-0 bg-transparent text-inherit opacity-70 cursor-pointer hover:opacity-100"
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            ) : null
          }
        />

        <div className="flex items-center gap-2.5 mt-2">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className={`w-8 h-8 grid place-items-center border border-transparent rounded-[11px] bg-transparent text-subtle cursor-pointer p-0 transition-[background,color,border-color] duration-[.14s] ease-[ease] hover:bg-accent-wash hover:border-accent-line hover:text-accent-strong ${
                menuOpen ? "bg-accent-wash border-accent-line text-accent-strong" : ""
              }`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Прикрепить"
              aria-expanded={menuOpen}
              title="Прикрепить"
            >
              <ClipIcon />
            </button>

            {menuOpen && (
              <div className={MENU} role="menu">
                <button type="button" role="menuitem" onClick={() => imageInputRef.current?.click()}>
                  <ImageMenuIcon />
                  Загрузить изображения
                </button>
                <button type="button" role="menuitem" onClick={() => fileInputRef.current?.click()}>
                  <FileMenuIcon />
                  Загрузить файлы
                </button>

                <div className="h-px my-[5px] mx-2 bg-line" />

                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={planMode}
                  onClick={() => setPlanMode((v) => !v)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M3 3.5h8M3 7h8M3 10.5h5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                  </svg>
                  <span className="flex-1 min-w-0 [&_em]:block [&_em]:not-italic [&_em]:text-[11px] [&_em]:text-subtle">
                    Plan mode
                    <em>Сначала план, потом сборка</em>
                  </span>
                  <span
                    className={`flex-none w-[30px] h-[18px] rounded-full p-0.5 transition-[background] duration-[.16s] ease-[ease] ${
                      planMode ? "bg-accent" : "bg-line-strong"
                    }`}
                    aria-hidden
                  >
                    <span
                      className={`block w-[14px] h-[14px] rounded-full bg-panel shadow-[0_1px_2px_rgba(16,16,20,0.2)] transition-transform duration-[.16s] ease-system ${
                        planMode ? "translate-x-3" : ""
                      }`}
                    />
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

          <ModelPicker value={modelId} onChange={setModelId} />

          <span className="text-[11px] text-[#a5a5b0]">Ctrl+Enter</span>
          <span className="flex-1" />
          <button
            type="submit"
            disabled={!canSend}
            aria-busy={pending}
            className={`grid place-items-center px-[18px] py-2.5 border-0 rounded-[10px] text-[13px] font-semibold transition-[filter,box-shadow,background-color,color] duration-[.16s] ease-[ease] ${
              promptReady
                ? "bg-[linear-gradient(180deg,#6b7bff_0%,var(--color-accent)_55%,var(--color-accent-strong)_100%)] text-ink-fg shadow-[0_1px_2px_rgba(46,55,150,0.22),0_6px_16px_rgba(92,108,245,0.22)] enabled:hover:brightness-105"
                : "bg-[#ececef] text-[#a5a5b0] shadow-none"
            } ${pending ? "cursor-wait" : canSend ? "cursor-pointer" : "cursor-not-allowed"}`}
          >
            <span className="[grid-area:1/1] invisible" aria-hidden>
              Создать приложение
            </span>
            <span className="[grid-area:1/1]">{pending ? "Собираем…" : "Создать приложение"}</span>
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2 mt-4 justify-center w-full">
        {EXAMPLE_PROMPTS.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={pending}
            onClick={() => void submit(ex)}
            className="px-3 py-2 rounded-full border border-[#e4e4ea] bg-[rgba(255,255,255,0.72)] backdrop-blur-[8px] text-muted text-xs cursor-pointer text-left max-w-full disabled:cursor-not-allowed"
          >
            {ex}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="flex items-center gap-3 w-full mt-5 px-3.5 py-3 rounded-[14px] border border-dashed border-[#d8d8e0] bg-[rgba(255,255,255,0.6)] text-text-soft text-[13px] font-semibold text-left cursor-pointer transition-[border-color,background,transform] duration-[.16s] ease-[ease] hover:border-accent-line hover:bg-accent-wash hover:-translate-y-px"
        onClick={() => setMode("interview")}
      >
        <span className="flex-none w-[30px] h-[30px] grid place-items-center rounded-control bg-accent-wash text-accent">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.8l1.5 3.2 3.5.5-2.5 2.4.6 3.4L8 9.7l-3.1 1.6.6-3.4L3 5.5l3.5-.5L8 1.8z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="flex-1 min-w-0 [&_em]:block [&_em]:not-italic [&_em]:text-xs [&_em]:font-normal [&_em]:text-subtle [&_em]:mt-0.5">
          Не знаете, с чего начать?
          <em>Ответьте на 5 вопросов — соберём промпт за вас</em>
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-none text-faint">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {error && <p className="text-danger text-[13px] mt-3">{error}</p>}
    </>
  );
}
