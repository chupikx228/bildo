import { COLLAPSED, COLLAPSED_BADGE, COLLAPSED_BTN, COLLAPSED_LABEL } from "./classes";

export function CollapsedRail({ pendingCount, onExpand }: { pendingCount: number; onExpand: () => void }) {
  return (
    <div className={COLLAPSED}>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Открыть ассистента"
        title="Ассистент (Ctrl+J)"
        className={COLLAPSED_BTN}
      >
        <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden>
          <path
            d="M7.5 1.6l1.15 3.1 3.1 1.15-3.1 1.15L7.5 10.1 6.35 7 3.25 5.85l3.1-1.15L7.5 1.6z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
        {pendingCount > 0 && <span className={COLLAPSED_BADGE}>{pendingCount}</span>}
      </button>
      <span className={COLLAPSED_LABEL}>Ассистент</span>
    </div>
  );
}
