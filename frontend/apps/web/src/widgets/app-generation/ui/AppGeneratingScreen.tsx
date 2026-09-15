import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderAmbient } from "@/shared/ui";
import { BuildPhone } from "./BuildPhone";
import { Confetti } from "./Confetti";
import { GenerationStatus } from "./GenerationStatus";

const REVEAL_BEAT_MS = 2800;

export function AppGeneratingScreen({
  ready,
  preview,
  error,
  onDone,
}: {
  ready: boolean;
  preview?: ReactNode;
  error?: string | null;
  onDone?: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!ready || error || !onDone) return;
    const id = setTimeout(onDone, reduce ? 0 : REVEAL_BEAT_MS);
    return () => {
      clearTimeout(id);
    };
  }, [ready, error, onDone, reduce]);

  const revealed = ready && !!preview && !error;

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-board">
      <LoaderAmbient />

      <div className="relative z-10 flex max-h-[100dvh] flex-col items-center gap-7 overflow-hidden px-4 py-8">
        {!error && (
          <div className="relative">
            <AnimatePresence mode="wait">
              {revealed ? (
                <motion.div
                  key="reveal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
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
        )}

        <GenerationStatus ready={ready} error={error} />
      </div>
    </div>
  );
}
