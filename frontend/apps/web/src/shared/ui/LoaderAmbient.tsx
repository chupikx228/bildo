import type { CSSProperties } from "react";
import { Icon, type IconName } from "./icons";

const PARTICLES = Array.from({ length: 11 }, (_, i) => ({
  left: `${(i * 61 + 7) % 100}%`,
  size: 3 + (i % 3) * 2,
  duration: `${13 + (i % 5) * 2.4}s`,
  delay: `${-(i * 1.9)}s`,
  opacity: 0.18 + ((i * 37) % 34) / 100,
}));

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

export function LoaderAmbient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute left-[-10%] top-[-16%] h-[min(60vw,520px)] w-[min(60vw,520px)] rounded-full bg-[radial-gradient(circle_at_40%_40%,rgba(92,108,245,0.16)_0%,rgba(92,108,245,0.05)_45%,transparent_70%)] blur-[80px] will-change-[transform,opacity] animate-orb-a" />
      <span className="absolute bottom-[-20%] right-[-12%] h-[min(56vw,460px)] w-[min(56vw,460px)] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(92,108,245,0.12)_0%,rgba(56,189,248,0.05)_42%,transparent_70%)] blur-[80px] will-change-[transform,opacity] animate-orb-c" />

      <span className="loader-dotgrid" />

      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="loader-particle"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.size,
              animationDuration: p.duration,
              animationDelay: p.delay,
              "--p-o": p.opacity,
            } as CSSProperties
          }
        />
      ))}

      {FLOATERS.map((f) => (
        <span key={f.className} className={`absolute will-change-transform ${f.className}`}>
          <Icon name={f.name} size={f.size} />
        </span>
      ))}
    </div>
  );
}
