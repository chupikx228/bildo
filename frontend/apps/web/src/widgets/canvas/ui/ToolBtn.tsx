import type { ReactNode } from "react";

export function ToolBtn({
  label,
  hint,
  onClick,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${hint})`}
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 border-0 rounded-lg bg-transparent text-muted grid place-items-center cursor-pointer p-0 transition-[background] duration-[.14s] ease-[ease] enabled:hover:bg-surface disabled:text-faint disabled:cursor-default"
    >
      {children}
    </button>
  );
}
