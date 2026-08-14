import { useState } from "react";
import styles from "./AiInterview.module.css";

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
    <div className={styles.interview}>
      <div className={styles.head}>
        <div className={styles.steps} role="tablist" aria-label="Шаги интервью">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === step}
              onClick={() => setStep(i)}
              disabled={i > step && !answered(STEPS[i - 1]!)}
              className={[styles.dot, i === step && styles.dotActive, (i < step || done) && styles.dotDone]
                .filter(Boolean)
                .join(" ")}
              title={s.title}
            />
          ))}
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть интервью">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!done && current ? (
        <div className={styles.body} key={current.id}>
          <p className={styles.counter}>
            Шаг {step + 1} из {STEPS.length}
          </p>
          <h2 className={styles.title}>{current.title}</h2>
          <p className={styles.caption}>{current.caption}</p>

          <div className={styles.options}>
            {current.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => pick(opt)}
                className={[styles.option, isPicked(opt) && styles.optionPicked].filter(Boolean).join(" ")}
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
              className={styles.free}
            />
          )}

          <div className={styles.actions}>
            {step > 0 && (
              <button type="button" className={styles.back} onClick={() => setStep((s) => s - 1)}>
                Назад
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className={styles.next} onClick={goNext} disabled={!answered(current)}>
              {step === STEPS.length - 1 ? "Собрать бриф" : "Дальше"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          <p className={styles.counter}>Готово</p>
          <h2 className={styles.title}>Вот что получилось</h2>
          <p className={styles.caption}>Это ваш промпт — поправьте формулировку, если что-то звучит не так.</p>

          <textarea
            value={draft ?? prompt}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className={styles.draft}
          />

          <div className={styles.actions}>
            <button type="button" className={styles.back} onClick={() => setStep(STEPS.length - 1)}>
              Изменить ответы
            </button>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className={[styles.next, styles.nextGo].join(" ")}
              disabled={busy}
              onClick={() => onSubmit((draft ?? prompt).trim())}
            >
              {busy ? "Собираем…" : "Создать приложение"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
