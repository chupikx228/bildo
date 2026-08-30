import { useEffect, useState } from "react";
import { BildoLogo } from "./BildoLogo";
import { GENERATION_STAGES, STAGE_INTERVAL_MS } from "./generationStages";
import { Icon, type IconName } from "./icons";

const FLOATERS: { name: IconName; size: number; className: string }[] = [
  { name: "claude", size: 54, className: "left-[13%] top-[18%] opacity-20 animate-float-a" },
  { name: "openai", size: 40, className: "right-[15%] top-[26%] opacity-[0.14] animate-float-b [animation-delay:-7s]" },
  {
    name: "deepseek",
    size: 48,
    className: "left-[25%] bottom-[22%] opacity-[0.18] animate-float-c [animation-delay:-13s]",
  },
  {
    name: "grok",
    size: 34,
    className: "right-[23%] bottom-[18%] opacity-[0.14] animate-float-a [animation-delay:-19s]",
  },
  { name: "auto", size: 28, className: "left-[45%] top-[11%] opacity-[0.16] animate-float-b [animation-delay:-24s]" },
  {
    name: "deepseek",
    size: 30,
    className: "right-[37%] bottom-[11%] opacity-[0.12] animate-float-c [animation-delay:-4s]",
  },
];

export function AppGeneratingScreen({ label }: { label?: string }) {
  const [stage, setStage] = useState(0);
  const last = GENERATION_STAGES.length - 1;

  useEffect(() => {
    if (label || stage >= last) return;
    const id = setTimeout(() => {
      setStage(stage + 1);
    }, STAGE_INTERVAL_MS);
    return () => {
      clearTimeout(id);
    };
  }, [label, stage, last]);

  const status = label ?? GENERATION_STAGES[stage];

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-board">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {FLOATERS.map((f) => (
          <span key={f.className} className={`absolute will-change-transform ${f.className}`}>
            <Icon name={f.name} size={f.size} />
          </span>
        ))}
      </div>

      <div className="relative flex flex-col items-center gap-5">
        <BildoLogo size="lg" />
        <div className="relative h-1.5 w-[220px] overflow-hidden rounded-full bg-surface">
          <span className="absolute inset-y-0 left-0 w-2/5 animate-loader-bar rounded-full bg-[linear-gradient(90deg,rgba(92,108,245,0)_0%,var(--color-accent)_55%,#6b7bff_100%)] shadow-[0_0_12px_rgba(92,108,245,0.45)]" />
        </div>
        <p key={status} aria-live="polite" className="animate-msg-in text-[13px] text-muted">
          {status}
        </p>
      </div>
    </div>
  );
}
