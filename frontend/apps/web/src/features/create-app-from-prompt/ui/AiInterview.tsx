import { useState } from "react";

const OPTION_BASE =
  "inline-flex items-center gap-[7px] px-[13px] py-[9px] rounded-full border text-[13px] cursor-pointer transition-[border-color,background,color,transform] duration-[.14s] ease-[ease] hover:-translate-y-px";
const FIELD =
  "w-full mt-3 px-3 py-[11px] rounded-[11px] border border-[#e4e4ea] outline-0 bg-panel text-text text-sm leading-[1.5] box-border resize-y focus:border-accent-line";
const COUNTER = "m-0 mb-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase text-accent-strong";
const TITLE = "m-0 mb-1 text-xl font-[650] tracking-[-0.01em] text-text";
const CAPTION = "m-0 mb-4 text-[13px] leading-[1.5] text-subtle";
const BODY = "px-5 pt-5 pb-[18px] animate-interview-step";
const ACTIONS = "flex items-center gap-2.5 mt-[18px]";
const BACK = "border-0 bg-transparent text-subtle text-[13px] cursor-pointer px-1 py-2 hover:text-text";
const NEXT_BASE =
  "px-[18px] py-2.5 border rounded-[10px] text-[13px] font-semibold cursor-pointer disabled:cursor-not-allowed";
const NEXT = `${NEXT_BASE} disabled:opacity-45 border-line-strong bg-panel text-text-soft enabled:hover:border-accent-line enabled:hover:bg-accent-wash enabled:hover:text-accent-strong`;
const NEXT_GO = `${NEXT_BASE} grid place-items-center border-accent-strong bg-[linear-gradient(180deg,#6b7bff_0%,var(--color-accent)_55%,var(--color-accent-strong)_100%)] text-ink-fg shadow-[0_1px_2px_rgba(46,55,150,0.22),0_6px_16px_rgba(92,108,245,0.22)] enabled:hover:brightness-105`;

export interface InterviewAnswers {
  kind: string;
  audience: string;
  screens: string[];
  vibe: string;
  extra: string;
}

interface Step {
  id: keyof InterviewAnswers;
  title: string;
  caption: string;
  multi?: boolean;
  free?: boolean;
  options: string[];
}

const STEPS: Step[] = [
  {
    id: "kind",
    title: "Что вы делаете?",
    caption: "Задаёт каркас: навигацию и набор базовых экранов.",
    options: [
      "Трекер привычек",
      "Магазин",
      "Соцсеть или лента",
      "Запись и заявки",
      "Доставка еды",
      "Обучение и курсы",
      "Финансы и бюджет",
      "Афиша событий",
    ],
  },
  {
    id: "audience",
    title: "Для кого?",
    caption: "Влияет на тон текстов и плотность интерфейса.",
    options: [
      "Для себя",
      "Для клиентов малого бизнеса",
      "Для сообщества",
      "Для команды внутри компании",
      "Для широкой аудитории",
    ],
  },
  {
    id: "screens",
    title: "Какие экраны нужны?",
    caption: "Можно выбрать несколько — каждый станет отдельным экраном.",
    multi: true,
    options: [
      "Главная",
      "Список или каталог",
      "Карточка элемента",
      "Поиск",
      "Профиль",
      "Корзина или оформление",
      "Статистика",
      "Настройки",
      "Онбординг",
    ],
  },
  {
    id: "vibe",
    title: "Какое настроение?",
    caption: "Определяет палитру, скругления и типографику.",
    options: [
      "Светлое и воздушное",
      "Тёмное и премиальное",
      "Яркое и молодёжное",
      "Строгое и деловое",
      "Тёплое и уютное",
    ],
  },
  {
    id: "extra",
    title: "Что важно не забыть?",
    caption: "Одна-две детали, ради которых всё затевается. Можно пропустить.",
    free: true,
    options: ["Push-уведомления", "Оплата картой", "Вход по номеру телефона", "Избранное", "Тёмная тема"],
  },
];

const EMPTY: InterviewAnswers = { kind: "", audience: "", screens: [], vibe: "", extra: "" };

function buildPromptFromAnswers(a: InterviewAnswers): string {
  const parts: string[] = [];
  if (a.kind) parts.push(`Мобильное приложение: ${a.kind.toLowerCase()}`);
  if (a.audience) parts.push(a.audience.toLowerCase());
  if (a.screens.length) parts.push(`экраны: ${a.screens.join(", ").toLowerCase()}`);
  if (a.vibe) parts.push(`настроение — ${a.vibe.toLowerCase()}`);
  if (a.extra.trim()) parts.push(`важно: ${a.extra.trim().toLowerCase()}`);
  return `${parts.join(". ")}.`;
}

function mergeExtra(picked: string, typed: string): string {
  const t = typed.trim();
  if (!t) return picked;
  return picked ? `${picked}, ${t}` : t;
}

export function AiInterview({
  onSubmit,
  onClose,
  busy,
}: {
  onSubmit: (prompt: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<InterviewAnswers>(EMPTY);
  const [draft, setDraft] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  const done = step >= STEPS.length;
  const current = STEPS[step];
  const prompt = buildPromptFromAnswers(answers);

  const answered = (s: Step): boolean => {
    if (s.id === "screens") return answers.screens.length > 0;
    if (s.free) return true;
    return Boolean(answers[s.id]);
  };

  const pick = (value: string) => {
    if (!current) return;
    setAnswers((prev) => {
      switch (current.id) {
        case "screens": {
          const has = prev.screens.includes(value);
          return {
            ...prev,
            screens: has ? prev.screens.filter((s) => s !== value) : [...prev.screens, value],
          };
        }
        case "extra": {
          const cur = prev.extra ? prev.extra.split(", ") : [];
          const has = cur.includes(value);
          const next = has ? cur.filter((v) => v !== value) : [...cur, value];
          return { ...prev, extra: next.join(", ") };
        }
        case "kind":
          return { ...prev, kind: value };
        case "audience":
          return { ...prev, audience: value };
        case "vibe":
          return { ...prev, vibe: value };
        default:
          return prev;
      }
    });
    if (!current.multi && !current.free) {
      window.setTimeout(() => setStep((s) => s + 1), 160);
    }
  };

  const isPicked = (value: string): boolean => {
    if (!current) return false;
    if (current.id === "screens") return answers.screens.includes(value);
    if (current.id === "extra") return answers.extra.split(", ").includes(value);
    if (current.id === "kind") return answers.kind === value;
    if (current.id === "audience") return answers.audience === value;
    return answers.vibe === value;
  };

  const goNext = () => {
    if (step === STEPS.length - 1) {
      setDraft(buildPromptFromAnswers({ ...answers, extra: mergeExtra(answers.extra, custom) }));
      setAnswers((prev) => ({ ...prev, extra: mergeExtra(prev.extra, custom) }));
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="w-full rounded-[18px] border border-line-strong bg-[rgba(255,255,255,0.92)] backdrop-blur-[20px] shadow-[0_22px_60px_rgba(16,16,20,0.12),0_2px_6px_rgba(16,16,20,0.05)] overflow-hidden animate-interview-pop">
      <div className="flex items-center gap-2.5 py-3 pl-4 pr-3 border-b border-line">
        <div className="flex items-center gap-1.5 flex-1" role="tablist" aria-label="Шаги интервью">
          {STEPS.map((s, i) => {
            const isActive = i === step;
            const isDone = i < step || done;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === step}
                onClick={() => setStep(i)}
                disabled={i > step && !answered(STEPS[i - 1]!)}
                className={`h-1 border-0 p-0 rounded-full cursor-pointer transition-[background,width] duration-[.18s] ease-[ease] disabled:cursor-default ${
                  isActive ? "w-10" : "w-[26px]"
                } ${isActive ? "bg-accent" : isDone ? "bg-accent-line" : "bg-[#e7e7ec]"}`}
                title={s.title}
              />
            );
          })}
        </div>
        <button
          type="button"
          className="w-7 h-7 grid place-items-center border-0 rounded-lg bg-transparent text-subtle cursor-pointer p-0 hover:bg-surface hover:text-text"
          onClick={onClose}
          aria-label="Закрыть интервью"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!done && current ? (
        <div className={BODY} key={current.id}>
          <p className={COUNTER}>
            Шаг {step + 1} из {STEPS.length}
          </p>
          <h2 className={TITLE}>{current.title}</h2>
          <p className={CAPTION}>{current.caption}</p>

          <div className="flex flex-wrap gap-2">
            {current.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => pick(opt)}
                className={`${OPTION_BASE} ${
                  isPicked(opt)
                    ? "border-accent-line bg-accent-wash text-accent-strong font-semibold"
                    : "border-[#e4e4ea] bg-panel text-text-soft hover:border-accent-line"
                }`}
              >
                {opt}
                {isPicked(opt) && (
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path
                      d="M3 7.4l2.6 2.6L11 4.6"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {current.free && (
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Или своими словами…"
              className={FIELD}
            />
          )}

          <div className={ACTIONS}>
            {step > 0 && (
              <button type="button" className={BACK} onClick={() => setStep((s) => s - 1)}>
                Назад
              </button>
            )}
            <span className="flex-1" />
            <button type="button" className={NEXT} onClick={goNext} disabled={!answered(current)}>
              {step === STEPS.length - 1 ? "Собрать бриф" : "Дальше"}
            </button>
          </div>
        </div>
      ) : (
        <div className={BODY}>
          <p className={COUNTER}>Готово</p>
          <h2 className={TITLE}>Вот что получилось</h2>
          <p className={CAPTION}>Это ваш промпт — поправьте формулировку, если что-то звучит не так.</p>

          <textarea value={draft ?? prompt} onChange={(e) => setDraft(e.target.value)} rows={5} className={FIELD} />

          <div className={ACTIONS}>
            <button type="button" className={BACK} onClick={() => setStep(STEPS.length - 1)}>
              Изменить ответы
            </button>
            <span className="flex-1" />
            <button
              type="button"
              className={`${NEXT_GO} ${busy ? "cursor-wait" : ""}`}
              disabled={busy}
              aria-busy={busy}
              onClick={() => onSubmit((draft ?? prompt).trim())}
            >
              <span className="[grid-area:1/1] invisible" aria-hidden>
                Создать приложение
              </span>
              <span className="[grid-area:1/1]">{busy ? "Собираем…" : "Создать приложение"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
