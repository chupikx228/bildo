import styles from "./Assistant.module.css";

export function CollapsedRail({ pendingCount, onExpand }: { pendingCount: number; onExpand: () => void }) {
  return (
    <div className={styles.collapsed}>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Открыть ассистента"
        title="Ассистент (Ctrl+J)"
        className={styles.collapsedBtn}
      >
        <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden>
          <path
            d="M7.5 1.6l1.15 3.1 3.1 1.15-3.1 1.15L7.5 10.1 6.35 7 3.25 5.85l3.1-1.15L7.5 1.6z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
        {pendingCount > 0 && <span className={styles.collapsedBadge}>{pendingCount}</span>}
      </button>
      <span className={styles.collapsedLabel}>Ассистент</span>
    </div>
  );
}
