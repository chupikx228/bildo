import styles from "./FilesPanel.module.css";

export function GroupLabel({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={styles.groupLabel}>
      <span className={styles.groupLabelText}>{text}</span>
      <span style={{ flex: 1 }} />
      {action && (
        <button type="button" onClick={action.onClick} className={styles.groupAction}>
          {action.label}
        </button>
      )}
    </div>
  );
}
