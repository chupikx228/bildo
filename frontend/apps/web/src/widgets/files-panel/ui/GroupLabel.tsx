import { GROUP_ACTION, GROUP_LABEL, GROUP_LABEL_TEXT } from "./classes";

export function GroupLabel({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={GROUP_LABEL}>
      <span className={GROUP_LABEL_TEXT}>{text}</span>
      <span className="flex-1" />
      {action && (
        <button type="button" onClick={action.onClick} className={GROUP_ACTION}>
          {action.label}
        </button>
      )}
    </div>
  );
}
