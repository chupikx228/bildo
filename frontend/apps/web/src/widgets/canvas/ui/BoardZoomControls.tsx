import { BoardIconBtn } from "./BoardIconBtn";
import { MAX_ZOOM, MIN_ZOOM } from "../lib/useBoardView";

export function BoardZoomControls({
  zoom,
  onZoomOut,
  onZoomIn,
  onFitAll,
  onFitActive,
}: {
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitAll: () => void;
  onFitActive: () => void;
}) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      className="hide-on-mobile"
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        zIndex: 4,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        borderRadius: 11,
        border: "1px solid var(--color-line-strong)",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(10px)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <BoardIconBtn label="Уменьшить" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM + 0.001}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 7h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </BoardIconBtn>
      <button
        type="button"
        onClick={onFitAll}
        title="Вписать всё (Shift+1)"
        style={{
          minWidth: 50,
          height: 28,
          border: 0,
          borderRadius: 8,
          background: "transparent",
          color: "var(--color-muted)",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "inherit",
          fontVariantNumeric: "tabular-nums",
          cursor: "pointer",
        }}
      >
        {zoomPercent}%
      </button>
      <BoardIconBtn label="Увеличить" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM - 0.001}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 3.5v7M3.5 7h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </BoardIconBtn>
      <span style={{ width: 1, height: 18, background: "var(--color-line-strong)", margin: "0 3px" }} />
      <BoardIconBtn label="К активному экрану (Shift+2)" onClick={onFitActive}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="4.5" y="2.5" width="5" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1.5 4.5v-2h2M12.5 9.5v2h-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </BoardIconBtn>
    </div>
  );
}
