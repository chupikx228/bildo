import type { CSSProperties } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "framer-motion";

interface BildoLogoProps {
  size?: "sm" | "md" | "lg" | "hero";
  withWordmark?: boolean;
  href?: string;
  className?: string;
  style?: CSSProperties;
  animateMark?: boolean;
}

const SIZES = {
  sm: { mark: 24, word: 15, gap: 8 },
  md: { mark: 28, word: 18, gap: 10 },
  lg: { mark: 36, word: 24, gap: 12 },
  hero: { mark: 56, word: 52, gap: 16 },
} as const;

export function BildoLogo({
  size = "md",
  withWordmark = true,
  href,
  className,
  style,
  animateMark = false,
}: BildoLogoProps) {
  const s = SIZES[size];
  const content = (
    <span
      className={className}
      role={href ? undefined : "img"}
      aria-label="bildo"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        textDecoration: "none",
        color: "inherit",
        lineHeight: 1,
        userSelect: "none",
        verticalAlign: "middle",
        ...style,
      }}
    >
      <span
        style={{
          width: s.mark,
          height: s.mark,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          lineHeight: 0,
        }}
      >
        <BildoMark size={s.mark} animate={animateMark} />
      </span>
      {withWordmark && (
        <span
          style={{
            fontFamily: "var(--font-brand)",
            fontWeight: 700,
            fontSize: s.word,
            letterSpacing: size === "hero" ? "-0.05em" : "-0.04em",
            color: "var(--color-text)",
            lineHeight: 1,
            display: "block",
            background:
              size === "hero"
                ? "linear-gradient(180deg, var(--color-text) 15%, var(--color-accent-hover) 135%)"
                : undefined,
            WebkitBackgroundClip: size === "hero" ? "text" : undefined,
            backgroundClip: size === "hero" ? "text" : undefined,
            WebkitTextFillColor: size === "hero" ? "transparent" : undefined,
          }}
        >
          bildo
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link
        to={href}
        aria-label="bildo — на главную"
        style={{
          textDecoration: "none",
          color: "inherit",
          display: "inline-flex",
          alignItems: "center",
          lineHeight: 0,
        }}
      >
        {content}
      </Link>
    );
  }
  return content;
}

const TILE_ORIGIN: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

export function BildoMark({ size = 28, animate = false }: { size?: number; animate?: boolean }) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;

  const tile = (delay: number) =>
    play
      ? {
          initial: { opacity: 0, scale: 0.6 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as const },
          style: TILE_ORIGIN,
        }
      : {};

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%", flexShrink: 0 }}
    >
      <rect width="64" height="64" rx="16" fill="#F4F4F6" />
      <motion.rect x="14" y="14" width="16" height="16" rx="4.5" fill="#0B0B0D" {...tile(0.05)} />
      <motion.rect x="34" y="14" width="16" height="16" rx="4.5" fill="#0B0B0D" fillOpacity="0.88" {...tile(0.13)} />
      <motion.rect x="14" y="34" width="16" height="16" rx="4.5" fill="#0B0B0D" fillOpacity="0.88" {...tile(0.21)} />
      <g transform="translate(42 42) rotate(-12)">
        <motion.g
          {...(play
            ? {
                initial: { opacity: 0, x: 18, y: 18, scale: 0.5 },
                animate: { opacity: 1, x: 0, y: 0, scale: 1 },
                transition: { duration: 0.55, delay: 0.32, ease: [0.16, 1, 0.3, 1] as const },
              }
            : {})}
        >
          <rect x="-8" y="-8" width="16" height="16" rx="4.5" fill="#5C6CF5" />
          <rect x="-4" y="-3.5" width="8" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.9" />
          <rect x="-4" y="-0.2" width="5.5" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.55" />
        </motion.g>
      </g>
    </svg>
  );
}
