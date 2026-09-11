import { motion } from "framer-motion";

const COLORS = ["#5c6cf5", "#4a55c9", "#6b7bff", "#9db8ff", "#c9cffb"];

const PIECES = Array.from({ length: 26 }, (_, i) => ({
  dx: (Math.random() - 0.5) * 340,
  up: 90 + Math.random() * 110,
  down: 70 + Math.random() * 90,
  rot: (Math.random() - 0.5) * 720,
  delay: Math.random() * 0.15,
  dur: 1.15 + Math.random() * 0.75,
  color: COLORS[i % COLORS.length],
  round: i % 4 === 0,
}));

export function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      {PIECES.map((c, i) => (
        <motion.span
          key={i}
          className={`absolute left-1/2 top-[38%] h-[11px] w-[7px] ${c.round ? "rounded-full" : "rounded-[2px]"}`}
          style={{ background: c.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: [0, c.dx * 0.65, c.dx],
            y: [0, -c.up, c.down],
            opacity: [1, 1, 0],
            rotate: [0, c.rot * 0.6, c.rot],
          }}
          transition={{ duration: c.dur, delay: c.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}
