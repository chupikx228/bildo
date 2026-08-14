import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AppDocument } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { clamp, useWindowEvent } from "@/shared/lib";
import { phoneFrameSize } from "../lib/phoneFrame";
import { PhonePreview } from "./PhonePreview";
import styles from "./Board.module.css";

const FRAME_GAP = 56;
const LABEL_H = 30;
const FRAME_RADIUS = 50;
const FIT_PAD = 44;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;

interface View {
  x: number;
  y: number;
  zoom: number;
}

const clampZoom = (z: number) => clamp(z, MIN_ZOOM, MAX_ZOOM);

function useRefit(
  hostRef: RefObject<HTMLDivElement | null>,
  touchedRef: RefObject<boolean>,
  fitRef: RefObject<(() => void) | null>,
  screensLength: number,
) {
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!touchedRef.current) fitRef.current?.();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!touchedRef.current) fitRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screensLength]);
}

function useBoardWheel(
  hostRef: RefObject<HTMLDivElement | null>,
  running: boolean,
  touchedRef: RefObject<boolean>,
  setView: React.Dispatch<React.SetStateAction<View>>,
) {
  useEffect(() => {
    const el = hostRef.current;
    if (!el || running) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const zoom = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0022));
          const k = zoom / v.zoom;
          return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
        });
        return;
      }
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hostRef, running, touchedRef, setView]);
}

export function Board({
  document,
  activeScreenId,
  running,
}: {
  document: AppDocument;
  activeScreenId: string | null;
  running: boolean;
}) {
  const selectScreen = useAppDocumentStore((s) => s.selectScreen);
  const addScreen = useAppDocumentStore((s) => s.addScreen);
  const removeScreen = useAppDocumentStore((s) => s.removeScreen);
  const renameScreen = useAppDocumentStore((s) => s.renameScreen);

  const hostRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const spaceRef = useRef(false);
  const touchedRef = useRef(false);

  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const frame = phoneFrameSize(document);
  const screens = running ? document.screens.filter((s) => s.id === activeScreenId).slice(0, 1) : document.screens;
  const count = Math.max(1, screens.length);
  const slots = running ? count : count + 1;

  const worldWidth = slots * frame.width + (slots - 1) * FRAME_GAP;
  const worldHeight = frame.height + (running ? 0 : LABEL_H);

  function fitBox(boxX: number, boxW: number, maxZoom: number) {
    const el = hostRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw <= 0 || vh <= 0) return;
    touchedRef.current = false;
    const topPad = running ? 0 : LABEL_H;
    const zoom = clampZoom(Math.min(maxZoom, (vw - FIT_PAD * 2) / boxW, (vh - FIT_PAD * 2) / worldHeight));
    setView({
      zoom,
      x: (vw - boxW * zoom) / 2 - boxX * zoom,
      y: (vh - worldHeight * zoom) / 2 + topPad * zoom,
    });
  }

  function fitAll() {
    fitBox(0, worldWidth, 1);
  }

  function fitActive() {
    const i = screens.findIndex((s) => s.id === activeScreenId);
    const index = i < 0 ? 0 : i;
    fitBox(index * (frame.width + FRAME_GAP), frame.width, 1);
  }

  useLayoutEffect(() => {
    if (running) fitActive();
    else fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const fitRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    fitRef.current = () => (running ? fitActive() : fitAll());
  });

  useRefit(hostRef, touchedRef, fitRef, document.screens.length);
  useBoardWheel(hostRef, running, touchedRef, setView);

  useWindowEvent("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
    if (typing) return;

    if (e.code === "Space") {
      if (!spaceRef.current && t === window.document.body) {
        spaceRef.current = true;
        setSpaceHeld(true);
        e.preventDefault();
      }
      return;
    }
    if (e.shiftKey && e.code === "Digit1") {
      e.preventDefault();
      fitAll();
      return;
    }
    if (e.shiftKey && e.code === "Digit2") {
      e.preventDefault();
      fitActive();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.code === "Digit0") {
      e.preventDefault();
      touchedRef.current = true;
      setView((v) => ({ ...v, zoom: 1 }));
    }
  });

  useWindowEvent("keyup", (e) => {
    if (e.code === "Space") {
      spaceRef.current = false;
      setSpaceHeld(false);
    }
  });

  useWindowEvent("pointermove", (e) => {
    const p = panRef.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.ox + (e.clientX - p.px), y: p.oy + (e.clientY - p.py) }));
  });

  useWindowEvent("pointerup", () => {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
  });

  function startPan(e: React.PointerEvent) {
    const onBackground = (e.target as HTMLElement)?.dataset?.boardBg === "1";
    if (!(onBackground || spaceRef.current || e.button === 1)) return;
    panRef.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y };
    touchedRef.current = true;
    setPanning(true);
  }

  function onAddScreen() {
    const id = addScreen();
    if (id) selectScreen(id);
  }

  const zoomPercent = Math.round(view.zoom * 100);
  function zoomAtCenter(factor: number) {
    const el = hostRef.current;
    if (!el) return;
    touchedRef.current = true;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const zoom = clampZoom(v.zoom * factor);
      const k = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }

  return (
    <div
      ref={hostRef}
      onPointerDown={startPan}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        cursor: panning ? "grabbing" : spaceHeld ? "grab" : "default",
        touchAction: "none",
      }}
    >
      <div data-board-bg="1" style={{ position: "absolute", inset: 0 }} />

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {screens.map((sc, i) => {
          const active = sc.id === activeScreenId;
          const left = i * (frame.width + FRAME_GAP);
          return (
            <div
              key={sc.id}
              style={{ position: "absolute", left, top: 0, width: frame.width }}
              onPointerDownCapture={() => {
                if (!active) selectScreen(sc.id);
              }}
              onMouseEnter={() => setHoverId(sc.id)}
              onMouseLeave={() => setHoverId(null)}
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
                  {renamingId === sc.id ? (
                    <input
                      autoFocus
                      defaultValue={sc.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) renameScreen(sc.id, v);
                        setRenamingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenamingId(null);
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
                        onClick={() => selectScreen(sc.id)}
                        onDoubleClick={() => setRenamingId(sc.id)}
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
                        {sc.name}
                      </button>
                      {document.screens.length > 1 && hoverId === sc.id && (
                        <button
                          type="button"
                          aria-label={`Удалить экран ${sc.name}`}
                          title="Удалить экран"
                          onClick={() => {
                            if (window.confirm(`Удалить «${sc.name}»?`)) removeScreen(sc.id);
                          }}
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
                            <path
                              d="M1.5 1.5l6 6M7.5 1.5l-6 6"
                              stroke="currentColor"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                            />
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
                <PhonePreview document={document} screen={sc} editMode={!running} onSelectScreen={selectScreen} />
              </div>
            </div>
          );
        })}

        {!running && (
          <button
            type="button"
            onClick={onAddScreen}
            title="Добавить экран"
            className={styles.addScreen}
            style={{
              left: screens.length * (frame.width + FRAME_GAP),
              top: 0,
              width: frame.width,
              height: frame.height,
            }}
          >
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
              <path d="M15 8v14M8 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Новый экран</span>
          </button>
        )}
      </div>

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
        <BoardIconBtn label="Уменьшить" onClick={() => zoomAtCenter(1 / 1.2)} disabled={view.zoom <= MIN_ZOOM + 0.001}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 7h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </BoardIconBtn>
        <button
          type="button"
          onClick={fitAll}
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
        <BoardIconBtn label="Увеличить" onClick={() => zoomAtCenter(1.2)} disabled={view.zoom >= MAX_ZOOM - 0.001}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 3.5v7M3.5 7h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </BoardIconBtn>
        <span style={{ width: 1, height: 18, background: "var(--color-line-strong)", margin: "0 3px" }} />
        <BoardIconBtn label="К активному экрану (Shift+2)" onClick={fitActive}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="4.5" y="2.5" width="5" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 4.5v-2h2M12.5 9.5v2h-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </BoardIconBtn>
      </div>
    </div>
  );
}

function BoardIconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
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
