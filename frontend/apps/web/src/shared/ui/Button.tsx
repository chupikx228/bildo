import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "quiet";
  on?: boolean;
}

const BASE =
  "inline-flex items-center justify-center gap-1.5 min-h-8 px-[11px] py-1.5 rounded-control border text-xs leading-none cursor-pointer transition duration-[.16s] ease-[ease] enabled:active:translate-y-px enabled:active:shadow-none disabled:opacity-[.45] disabled:cursor-not-allowed disabled:shadow-none";

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-panel border-line-strong text-text-soft font-medium shadow-sm enabled:hover:bg-accent-wash enabled:hover:border-accent-line enabled:hover:text-text",
  primary:
    "border-accent-strong text-ink-fg font-semibold bg-[linear-gradient(180deg,#6b7bff_0%,var(--color-accent)_55%,var(--color-accent-strong)_100%)] shadow-[0_1px_2px_rgba(46,55,150,0.22),0_6px_16px_rgba(92,108,245,0.22)] enabled:hover:bg-[linear-gradient(180deg,#7c8aff_0%,#5a69f2_55%,#4450c4_100%)] enabled:hover:shadow-[0_8px_22px_rgba(92,108,245,0.3)]",
  danger:
    "bg-danger-soft border-[rgba(220,38,38,0.3)] text-danger-strong font-semibold shadow-sm enabled:hover:bg-[rgba(220,38,38,0.16)] enabled:hover:text-danger-strong-hover",
  quiet:
    "bg-transparent border-transparent text-muted font-medium enabled:hover:bg-accent-wash enabled:hover:text-accent-strong",
};

const ON =
  "bg-accent-wash border-accent-line text-accent-strong font-semibold shadow-[inset_0_1px_2px_rgba(46,55,150,0.08)]";

export function Button({ variant = "default", on, className, ...props }: ButtonProps) {
  const classes = [BASE, on ? ON : VARIANT[variant], className].filter(Boolean).join(" ");
  return <button className={classes} {...props} />;
}
