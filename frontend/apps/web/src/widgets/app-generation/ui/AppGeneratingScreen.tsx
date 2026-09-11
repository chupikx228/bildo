import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderAmbient } from "@/shared/ui";
import { BuildPhone } from "./BuildPhone";
import { Confetti } from "./Confetti";
import { GenerationStatus } from "./GenerationStatus";

const REVEAL_BEAT_MS = 1800;

export function AppGeneratingScreen({
  ready,
  preview,
  onDone,
}: {
  ready: boolean;
  preview?: ReactNode;
  onDone?: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!ready || !onDone) return;
    const id = setTimeout(onDone, reduce ? 0 : REVEAL_BEAT_MS);
    return () => {
      clearTimeout(id);
    };
  }, [ready, onDone, reduce]);

  const revealed = ready && preview;

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-board">
      <LoaderAmbient />

      <div className="relative z-10 flex max-h-[100dvh] flex-col items-center gap-7 overflow-hidden px-4 py-8">
        <div className="relative">
          <AnimatePresence mode="wait">
            {revealed ? (
              <motion.div
                key="reveal"
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
              >
                {preview}
              </motion.div>
            ) : (
              <motion.div key="build" exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}>
                <BuildPhone />
              </motion.div>
            )}
          </AnimatePresence>
          {revealed && !reduce && <Confetti />}
        </div>

        <GenerationStatus ready={ready} />
      </div>
    </div>
  );
}
