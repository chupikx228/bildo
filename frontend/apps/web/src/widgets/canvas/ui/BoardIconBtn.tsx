import type { ReactNode } from "react";

export function BoardIconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 8,
        background: "transparent",
        color: disabled ? "var(--color-faint)" : "var(--color-muted)",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}
