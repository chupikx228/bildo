export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-on={checked}
      onClick={() => onChange(!checked)}
      className="group relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full bg-line-strong p-[2px] transition-colors duration-[.16s] ease-[var(--ease-system)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 data-[on=true]:bg-accent"
    >
      <span className="h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(16,16,20,0.2)] transition-transform duration-[.16s] ease-[var(--ease-system)] group-data-[on=true]:translate-x-[12px]" />
    </button>
  );
}
