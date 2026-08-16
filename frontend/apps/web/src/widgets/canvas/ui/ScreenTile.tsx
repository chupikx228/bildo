import type { AppDocument, AppScreen } from "@bildo/api";
import { PhonePreview } from "./PhonePreview";

const LABEL_H = 30;
const FRAME_RADIUS = 50;

export function ScreenTile({
  document,
  screen,
  left,
  frameWidth,
  active,
  running,
  renaming,
  hovered,
  canDelete,
  onSelect,
  onHover,
  onStartRename,
  onRename,
  onStopRename,
  onRequestDelete,
}: {
  document: AppDocument;
  screen: AppScreen;
  left: number;
  frameWidth: number;
  active: boolean;
  running: boolean;
  renaming: boolean;
  hovered: boolean;
  canDelete: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onStartRename: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onStopRename: () => void;
  onRequestDelete: (screen: AppScreen) => void;
}) {
  return (
    <div
      style={{ position: "absolute", left, top: 0, width: frameWidth }}
      onPointerDownCapture={() => {
        if (!active) onSelect(screen.id);
      }}
      onMouseEnter={() => onHover(screen.id)}
      onMouseLeave={() => onHover(null)}
    >
      {!running && (
        <div
          style={{
            position: "absolute",
            left: 4,
            top: -LABEL_H + 4,
            right: 4,
            height: 22,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {renaming ? (
            <input
              autoFocus
              defaultValue={screen.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) onRename(screen.id, v);
                onStopRename();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") onStopRename();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                height: 22,
                border: "1px solid var(--color-accent)",
                borderRadius: 6,
                padding: "0 6px",
                font: "600 13px/1 var(--font-ui)",
                color: "var(--color-text)",
                outline: "none",
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSelect(screen.id)}
                onDoubleClick={() => onStartRename(screen.id)}
                title="Двойной клик — переименовать"
                style={{
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  font: `${active ? 650 : 500} 13px/1 var(--font-ui)`,
                  color: active ? "var(--color-accent-strong)" : "var(--color-subtle)",
                  cursor: "pointer",
                }}
              >
                {screen.name}
              </button>
              {canDelete && hovered && (
                <button
                  type="button"
                  aria-label={`Удалить экран ${screen.name}`}
                  title="Удалить экран"
                  onClick={() => onRequestDelete(screen)}
                  style={{
                    width: 18,
                    height: 18,
                    display: "grid",
                    placeItems: "center",
                    border: 0,
                    borderRadius: 5,
                    background: "transparent",
                    color: "var(--color-faint)",
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div
        style={{
          borderRadius: FRAME_RADIUS,
          outline: active && !running ? "2px solid var(--color-accent)" : "none",
          outlineOffset: 5,
          transition: "outline-color .16s ease",
        }}
      >
        <PhonePreview document={document} screen={screen} editMode={!running} onSelectScreen={onSelect} />
      </div>
    </div>
  );
}
