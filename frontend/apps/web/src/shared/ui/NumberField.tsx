const SPIN_RESET =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0";

export function StepNumber({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

  return (
    <div className="inline-flex items-center h-7 rounded-md border border-line-strong bg-surface overflow-hidden">
      <button
        type="button"
        aria-label="Уменьшить"
        onClick={() => onChange(clamp(value - step))}
        className="w-[26px] h-7 border-0 bg-transparent text-muted text-sm leading-none cursor-pointer shrink-0 p-0 hover:text-text"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Math.round(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" || raw === "-") return;
          onChange(clamp(Number(raw)));
        }}
        onBlur={(e) => {
          const n = Number(e.target.value);
          onChange(clamp(Number.isFinite(n) ? n : value));
        }}
        className={`w-10 h-7 border-0 border-x border-x-line-strong outline-none bg-transparent text-text text-xs text-center tabular-nums p-0 ${SPIN_RESET}`}
        style={suffix ? { width: 36 } : undefined}
      />
      {suffix ? <span className="text-[11px] text-subtle pr-0.5 tabular-nums select-none">{suffix}</span> : null}
      <button
        type="button"
        aria-label="Увеличить"
        onClick={() => onChange(clamp(value + step))}
        className="w-[26px] h-7 border-0 bg-transparent text-muted text-sm leading-none cursor-pointer shrink-0 p-0 hover:text-text"
      >
        +
      </button>
    </div>
  );
}

export function CompactNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center h-7 rounded-md border border-line-strong bg-surface min-w-0 overflow-hidden">
      <span className="text-[9px] text-subtle font-[650] w-[18px] shrink-0 text-center select-none">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={`flex-1 min-w-0 w-full h-full border-0 border-l border-l-line-strong outline-none bg-transparent text-text text-xs tabular-nums px-2 ${SPIN_RESET}`}
      />
    </label>
  );
}
