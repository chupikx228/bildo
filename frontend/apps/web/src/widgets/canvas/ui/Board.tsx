import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppDocument, AppScreen } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { useWindowEvent } from "@/shared/lib";
import { phoneFrameSize } from "../lib/phoneFrame";
import { clampZoom, useBoardWheel, useRefit, type View } from "../lib/useBoardView";
import { BoardZoomControls } from "./BoardZoomControls";
import { ScreenTile } from "./ScreenTile";

const FRAME_GAP = 56;
const LABEL_H = 30;

const FIT_PAD = 44;

export function Board({
  document,
  activeScreenId,
  running,
  onSetVar,
}: {
  document: AppDocument;
  activeScreenId: string | null;
  running: boolean;
  onSetVar?: (name: string, value: string | number | boolean) => void;
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

  function requestDeleteScreen(screen: AppScreen) {
    if (window.confirm(`Удалить «${screen.name}»?`)) removeScreen(screen.id);
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
        {screens.map((sc, i) => (
          <ScreenTile
            key={sc.id}
            document={document}
            screen={sc}
            left={i * (frame.width + FRAME_GAP)}
            frameWidth={frame.width}
            active={sc.id === activeScreenId}
            running={running}
            renaming={renamingId === sc.id}
            hovered={hoverId === sc.id}
            canDelete={document.screens.length > 1}
            onSelect={selectScreen}
            onHover={setHoverId}
            onStartRename={setRenamingId}
            onRename={renameScreen}
            onStopRename={() => setRenamingId(null)}
            onRequestDelete={requestDeleteScreen}
            onSetVar={onSetVar}
          />
        ))}

        {!running && (
          <button
            type="button"
            onClick={onAddScreen}
            title="Добавить экран"
            className="absolute rounded-[50px] border-2 border-dashed border-line bg-[rgba(255,255,255,0.5)] text-subtle flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-[border-color,color,background] duration-[.16s] ease-[ease] hover:border-accent hover:text-accent-strong hover:bg-[rgba(92,108,245,0.05)]"
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

      <BoardZoomControls
        zoom={view.zoom}
        onZoomOut={() => zoomAtCenter(1 / 1.2)}
        onZoomIn={() => zoomAtCenter(1.2)}
        onFitAll={fitAll}
        onFitActive={fitActive}
      />
    </div>
  );
}
