import { useRef, useState } from "react";
import {
  findAppNode,
  APP_STAGE_HEIGHT,
  APP_STAGE_WIDTH,
  type AppNode,
  type AppNodeLayout,
  type AppScreen,
} from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { useWindowEvent } from "@/shared/lib";
import { snap } from "./canvasNode";

const DRAG_THRESHOLD = 4;

interface PendingDrag {
  ids: string[];
  startX: number;
  startY: number;
  origins: Record<string, AppNodeLayout>;
  moved: boolean;
}

interface ResizeDrag {
  id: string;
  corner: string;
  startX: number;
  startY: number;
  origin: AppNodeLayout;
}

export function useNodeDrag(screen: AppScreen, editMode: boolean) {
  const selectedNodeIds = useAppDocumentStore((s) => s.selectedNodeIds);
  const selectNode = useAppDocumentStore((s) => s.selectNode);
  const resizeNode = useAppDocumentStore((s) => s.resizeNode);

  const stageRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const resizeRef = useRef<ResizeDrag | null>(null);
  const liveRef = useRef<Record<string, AppNodeLayout> | null>(null);
  const suppressClickRef = useRef(false);

  const [liveLayouts, setLiveLayouts] = useState<Record<string, AppNodeLayout> | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  const screenId = screen.id;

  function toStage(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    const sx = APP_STAGE_WIDTH / rect.width;
    const sy = APP_STAGE_HEIGHT / rect.height;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  useWindowEvent("pointermove", (e) => {
    const pending = pendingRef.current;
    const resizing = resizeRef.current;
    if (!pending && !resizing) return;
    const { x, y } = toStage(e.clientX, e.clientY);

    if (pending) {
      const dx = x - pending.startX;
      const dy = y - pending.startY;
      if (!pending.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!pending.moved) {
        pending.moved = true;
        setDraggingIds(pending.ids);
      }
      const next: Record<string, AppNodeLayout> = {};
      const guideV: number[] = [];
      const guideH: number[] = [];
      for (const id of pending.ids) {
        const o = pending.origins[id];
        if (!o) continue;
        let nx = o.x + dx;
        let ny = o.y + dy;
        nx = snap(nx, [0, 16, APP_STAGE_WIDTH / 2 - o.width / 2, APP_STAGE_WIDTH - o.width]);
        ny = snap(ny, [0, 16, APP_STAGE_HEIGHT / 2 - o.height / 2, APP_STAGE_HEIGHT - o.height]);
        if (Math.abs(nx - (o.x + dx)) > 0.01) guideV.push(nx);
        if (Math.abs(ny - (o.y + dy)) > 0.01) guideH.push(ny);
        next[id] = { ...o, x: nx, y: ny };
      }
      liveRef.current = next;
      setLiveLayouts(next);
      setGuides({ v: guideV, h: guideH });
      return;
    }

    if (resizing) {
      const dx = x - resizing.startX;
      const dy = y - resizing.startY;
      let { x: nx, y: ny, width: nw, height: nh } = resizing.origin;
      const c = resizing.corner;
      if (c.includes("e")) nw = Math.max(8, resizing.origin.width + dx);
      if (c.includes("s")) nh = Math.max(8, resizing.origin.height + dy);
      if (c.includes("w")) {
        nw = Math.max(8, resizing.origin.width - dx);
        nx = resizing.origin.x + (resizing.origin.width - nw);
      }
      if (c.includes("n")) {
        nh = Math.max(8, resizing.origin.height - dy);
        ny = resizing.origin.y + (resizing.origin.height - nh);
      }
      const next = { [resizing.id]: { ...resizing.origin, x: nx, y: ny, width: nw, height: nh } };
      liveRef.current = next;
      setLiveLayouts(next);
    }
  });

  function commitDrag() {
    const pending = pendingRef.current;
    const resizing = resizeRef.current;
    const live = liveRef.current;

    if (pending?.moved && live) {
      for (const id of pending.ids) {
        const L = live[id];
        if (L) resizeNode(screenId, id, L, false);
      }
      suppressClickRef.current = true;
    }

    if (resizing && live?.[resizing.id]) {
      resizeNode(screenId, resizing.id, live[resizing.id]!, false);
      suppressClickRef.current = true;
    }

    pendingRef.current = null;
    resizeRef.current = null;
    liveRef.current = null;
    setLiveLayouts(null);
    setGuides({ v: [], h: [] });
    setDraggingIds([]);
  }

  useWindowEvent("pointerup", commitDrag);
  useWindowEvent("pointercancel", commitDrag);

  function beginMove(e: React.PointerEvent, node: AppNode) {
    if (!editMode || node.locked || !node.layout) return;
    if ((e.target as HTMLElement).dataset?.handle) return;
    e.stopPropagation();
    const { x, y } = toStage(e.clientX, e.clientY);

    const selectedSet = new Set(selectedNodeIds);
    const topLevel = (screen.root.children ?? []).filter((c) => !c.hidden);

    let ids = selectedSet.has(node.id) && selectedNodeIds.length ? [...selectedNodeIds] : [node.id];
    if (node.groupId) {
      ids = [...new Set([...ids, ...topLevel.filter((n) => n.groupId === node.groupId).map((n) => n.id)])];
    }

    if (!selectedSet.has(node.id)) {
      selectNode(node.id, { additive: e.metaKey || e.ctrlKey });
      ids = e.metaKey || e.ctrlKey ? [...selectedNodeIds, node.id] : [node.id];
    }

    const origins: Record<string, AppNodeLayout> = {};
    for (const id of ids) {
      const n = findAppNode(screen.root, id);
      if (n?.layout) origins[id] = { ...n.layout };
    }

    pendingRef.current = { ids: Object.keys(origins), startX: x, startY: y, origins, moved: false };
  }

  function beginResize(e: React.PointerEvent, node: AppNode, corner: string) {
    if (!editMode || node.locked || !node.layout) return;
    e.stopPropagation();
    e.preventDefault();
    const { x, y } = toStage(e.clientX, e.clientY);
    selectNode(node.id);
    resizeRef.current = { id: node.id, corner, startX: x, startY: y, origin: { ...node.layout } };
  }

  return { stageRef, liveLayouts, guides, draggingIds, suppressClickRef, beginMove, beginResize };
}
