import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GENERATION_STAGES, STAGE_INTERVAL_MS } from "@/shared/ui";

export function GenerationStatus({ ready, error }: { ready: boolean; error?: string | null }) {
  const failed = Boolean(error);
  const [stage, setStage] = useState(0);
  const last = GENERATION_STAGES.length - 1;

  useEffect(() => {
    if (ready || failed || stage >= last) return;
    const id = setTimeout(() => {
      setStage(stage + 1);
    }, STAGE_INTERVAL_MS);
    return () => {
      clearTimeout(id);
    };
  }, [ready, failed, stage, last]);

  const text = failed
    ? "Не удалось собрать приложение"
    : ready
      ? "Готово — открываем редактор"
      : GENERATION_STAGES[stage];
  const sub = failed
    ? error
    : ready
      ? "Экраны собраны, секунду"
      : "Приложение собирается — это займёт несколько секунд";

  return (
    <div className="flex items-center gap-3 rounded-popover border border-line-strong bg-panel/95 px-5 py-3.5 shadow-md backdrop-blur">
      <span className="relative grid h-8 w-8 shrink-0 place-items-center">
        {failed ? (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-danger-soft text-danger-strong">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 7.5v6M12 16.5h.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : ready ? (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="grid h-8 w-8 place-items-center rounded-full bg-accent text-ink-fg"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12.5 10 17.5 19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.span>
        ) : (
          <motion.svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-accent"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
          >
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path
              d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </motion.svg>
        )}
      </span>

      <div className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.p
            key={text}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -7 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="truncate text-[13px] font-semibold text-text"
          >
            {text}
          </motion.p>
        </AnimatePresence>
        <p className={`truncate text-[11px] ${failed ? "text-danger-strong" : "text-subtle"}`}>{sub}</p>
      </div>
    </div>
  );
}
