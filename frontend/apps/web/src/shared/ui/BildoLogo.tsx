import type { CSSProperties } from "react";
import { Link } from "react-router";

interface BildoLogoProps {
  size?: "sm" | "md" | "lg" | "hero";
  withWordmark?: boolean;
  href?: string;
  className?: string;
  style?: CSSProperties;
}

const SIZES = {
  sm: { mark: 24, word: 15, gap: 8 },
  md: { mark: 28, word: 18, gap: 10 },
  lg: { mark: 36, word: 24, gap: 12 },
  hero: { mark: 56, word: 52, gap: 16 },
} as const;

export function BildoLogo({ size = "md", withWordmark = true, href, className, style }: BildoLogoProps) {
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
        <BildoMark size={s.mark} />
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

export function BildoMark({ size = 28 }: { size?: number }) {
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
      <rect x="14" y="14" width="16" height="16" rx="4.5" fill="#0B0B0D" />
      <rect x="34" y="14" width="16" height="16" rx="4.5" fill="#0B0B0D" fillOpacity="0.88" />
      <rect x="14" y="34" width="16" height="16" rx="4.5" fill="#0B0B0D" fillOpacity="0.88" />
      <g transform="translate(42 42) rotate(-12)">
        <rect x="-8" y="-8" width="16" height="16" rx="4.5" fill="#5C6CF5" />
        <rect x="-4" y="-3.5" width="8" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.9" />
        <rect x="-4" y="-0.2" width="5.5" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.55" />
      </g>
    </svg>
  );
}
