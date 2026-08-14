import styles from "./NumberField.module.css";

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
    <div className={styles.stepper}>
      <button
        type="button"
        aria-label="Уменьшить"
        onClick={() => onChange(clamp(value - step))}
        className={styles.stepBtn}
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
        className={styles.stepInput}
        style={suffix ? { width: 36 } : undefined}
      />
      {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      <button
        type="button"
        aria-label="Увеличить"
        onClick={() => onChange(clamp(value + step))}
        className={styles.stepBtn}
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
    <label className={styles.compact}>
      <span className={styles.compactLabel}>{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={styles.compactInput}
      />
    </label>
  );
}
