import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GENERATION_STAGES, STAGE_INTERVAL_MS } from "@/shared/ui";

export function GenerationStatus({ ready }: { ready: boolean }) {
  const [stage, setStage] = useState(0);
  const last = GENERATION_STAGES.length - 1;

  useEffect(() => {
    if (ready || stage >= last) return;
    const id = setTimeout(() => {
      setStage(stage + 1);
    }, STAGE_INTERVAL_MS);
    return () => {
      clearTimeout(id);
    };
  }, [ready, stage, last]);

  const text = ready ? "Готово — открываем редактор" : GENERATION_STAGES[stage];

  return (
    <div className="flex items-center gap-3 rounded-popover border border-line-strong bg-panel/95 px-5 py-3.5 shadow-md backdrop-blur">
      <span className="relative grid h-8 w-8 shrink-0 place-items-center">
        {ready ? (
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
        <p className="text-[11px] text-subtle">Приложение собирается — это займёт несколько секунд</p>
      </div>
    </div>
  );
}
