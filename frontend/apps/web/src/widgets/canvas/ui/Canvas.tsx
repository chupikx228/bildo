import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  APP_STAGE_HEIGHT,
  APP_STAGE_WIDTH,
  findAppNode,
  type AppAction,
  type AppDocument,
  type AppNode,
  type AppNodeAnimation,
  type AppNodeLayout,
  type AppScreen,
  type AppThemeTokens,
} from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { useWindowEvent } from "@/shared/lib";

const SNAP = 8;
const HANDLE = 7;
const DRAG_THRESHOLD = 4;
const SELECT_COLOR = "var(--color-accent)";

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

function resolveText(node: AppNode, state?: AppDocument["state"]): string {
  if (node.props?.textBind && state && node.props.textBind in state) {
    return String(state[node.props.textBind]);
  }
  return node.props?.text ?? "";
}

function runActions(
  actions: AppAction[] | undefined,
  ctx: {
    navigate: (route: string) => void;
    setVar: (name: string, value: string | number | boolean) => void;
    toast: (msg: string) => void;
  },
) {
  if (!actions?.length) return;
  for (const a of actions) {
    if (a.type === "navigate") ctx.navigate(a.route);
    else if (a.type === "setVar") ctx.setVar(a.name, a.value);
    else if (a.type === "toast") ctx.toast(a.message);
    else if (a.type === "openUrl") window.open(a.url, "_blank", "noopener,noreferrer");
  }
}

function snap(v: number, guides: number[]): number {
  for (const g of guides) {
    if (Math.abs(v - g) <= SNAP) return g;
  }
  return v;
}

function resolvePadding(
  style: AppNode["style"],
  field = 0,
): Pick<CSSProperties, "paddingLeft" | "paddingRight" | "paddingTop" | "paddingBottom"> {
  const base = style?.padding ?? (field > 0 ? field : undefined);
  const h = style?.paddingHorizontal ?? base;
  const v = style?.paddingVertical ?? base;
  const out: Pick<CSSProperties, "paddingLeft" | "paddingRight" | "paddingTop" | "paddingBottom"> = {};
  if (h != null) {
    out.paddingLeft = h;
    out.paddingRight = h;
  } else if (field > 0) {
    out.paddingLeft = field;
    out.paddingRight = field;
  }
  if (v != null) {
    out.paddingTop = v;
    out.paddingBottom = v;
  } else if (field > 0) {
    out.paddingTop = field;
    out.paddingBottom = field;
  }
  return out;
}

function frameStyle(layout: AppNodeLayout, editMode: boolean, dragging: boolean): CSSProperties {
  return {
    position: "absolute",
    left: layout.x,
    top: layout.y,
    width: layout.width,
    height: layout.height,
    zIndex: (layout.zIndex ?? 1) + (dragging ? 100 : 0),
    cursor: editMode ? (dragging ? "grabbing" : "grab") : "default",
    touchAction: "none",
  };
}

function animClass(animation: AppNodeAnimation | undefined): string | undefined {
  return animation ? `app-anim app-anim--${animation}` : undefined;
}

function shellStyle(theme: AppThemeTokens, node: AppNode, isContainer: boolean, editMode: boolean): CSSProperties {
  const textual = node.type === "Text" || node.type === "Button";
  const fill =
    node.style?.backgroundGradient ??
    node.style?.backgroundColor ??
    (node.type === "Button" ? theme.colorPrimary : undefined);
  const ghostContainer = isContainer && !fill && !node.style?.borderWidth && editMode;
  const shadows = [ghostContainer ? "inset 0 0 0 1px rgba(92,108,245,0.22)" : null, node.style?.shadow ?? null]
    .filter(Boolean)
    .join(", ");

  return {
    position: "absolute",
    inset: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    borderRadius: node.style?.borderRadius,
    opacity: node.style?.opacity,
    boxShadow: shadows || undefined,
    border: node.style?.borderWidth
      ? `${node.style.borderWidth}px solid ${node.style.borderColor ?? theme.colorBorder}`
      : undefined,
    background: fill,
    color: node.style?.color ?? theme.colorText,
    fontSize: node.style?.fontSize,
    fontWeight: node.style?.fontWeight,
    letterSpacing: node.style?.letterSpacing,
    lineHeight: node.style?.lineHeight ? `${node.style.lineHeight}px` : undefined,
    textAlign: node.style?.textAlign ?? (node.type === "Button" ? "center" : undefined),
    display: "flex",
    flexDirection: node.style?.flexDirection ?? "column",
    alignItems: textual ? "stretch" : node.style?.alignItems,
    justifyContent: textual
      ? node.type === "Button"
        ? "center"
        : (node.style?.justifyContent ?? "flex-start")
      : node.style?.justifyContent,
    gap: node.style?.gap,
    ...resolvePadding(node.style, node.field ?? 0),
  };
}

function NodeBody({
  node,
  theme,
  docState,
}: {
  node: AppNode;
  theme: AppThemeTokens;
  docState?: AppDocument["state"];
}) {
  const weight = node.style?.fontWeight;
  const align = node.style?.textAlign ?? "left";

  switch (node.type) {
    case "Text":
      return (
        <span
          style={{
            pointerEvents: "none",
            width: "100%",
            textAlign: align,
            fontWeight: weight,
            fontSize: "inherit",
            color: "inherit",
          }}
        >
          {resolveText(node, docState) || "Текст"}
        </span>
      );
    case "Button":
      return (
        <span
          style={{
            pointerEvents: "none",
            width: "100%",
            textAlign: node.style?.textAlign ?? "center",
            color: node.style?.color ?? theme.colorPrimaryFg,
            fontWeight: weight ?? 600,
            fontSize: "inherit",
          }}
        >
          {resolveText(node, docState) || "Кнопка"}
        </span>
      );
    case "TextInput":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            border: `${node.style?.borderWidth ?? 1}px solid ${node.style?.borderColor ?? theme.colorBorder}`,
            borderRadius: node.style?.borderRadius ?? 10,
            background: node.style?.backgroundGradient ?? node.style?.backgroundColor ?? theme.colorSurface,
            color: node.style?.color ?? theme.colorTextMuted,
            padding: node.style?.paddingHorizontal ?? node.style?.padding ?? 10,
            boxSizing: "border-box",
            fontSize: node.style?.fontSize ?? 14,
            fontWeight: weight,
            textAlign: align,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            pointerEvents: "none",
          }}
        >
          <span style={{ width: "100%", textAlign: align }}>
            {node.props?.valueBind && docState?.[node.props.valueBind] != null
              ? String(docState[node.props.valueBind])
              : node.props?.placeholder || "Поле ввода"}
          </span>
        </div>
      );
    case "Image":
      return node.props?.source ? (
        <img
          src={node.props.source}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
        />
      ) : (
        <span style={{ color: theme.colorTextMuted, fontSize: 12, margin: "auto", pointerEvents: "none" }}>Image</span>
      );
    case "FlatList":
      return (
        <div style={{ overflow: "auto", width: "100%", height: "100%", padding: 4, pointerEvents: "none" }}>
          {(node.props?.data ?? ["Item"]).map((item, i) => (
            <div
              key={i}
              style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: theme.colorSurface, fontSize: 13 }}
            >
              {item}
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function SelectionChrome({
  radius,
  onResizeCorner,
}: {
  radius: number;
  onResizeCorner: (corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => void;
}) {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          boxShadow: `0 0 0 1.5px ${SELECT_COLOR}`,
          pointerEvents: "none",
          zIndex: 15,
        }}
      />
      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
        <div
          key={corner}
          data-handle="1"
          onPointerDown={(e) => onResizeCorner(corner, e)}
          style={{
            position: "absolute",
            width: HANDLE,
            height: HANDLE,
            background: "var(--color-panel)",
            border: `1.5px solid ${SELECT_COLOR}`,
            borderRadius: "50%",
            zIndex: 20,
            cursor: `${corner}-resize`,
            boxSizing: "border-box",
            left: corner.includes("w") ? -HANDLE / 2 : undefined,
            right: corner.includes("e") ? -HANDLE / 2 : undefined,
            top: corner.includes("n") ? -HANDLE / 2 : undefined,
            bottom: corner.includes("s") ? -HANDLE / 2 : undefined,
          }}
        />
      ))}
    </>
  );
}

export function Canvas({
  document,
  screen,
  editMode,
  onNavigateRoute,
}: {
  document: AppDocument;
  screen: AppScreen;
  editMode: boolean;
  onNavigateRoute?: (route: string) => void;
}) {
  const selectedNodeIds = useAppDocumentStore((s) => s.selectedNodeIds);
  const selectedNodeId = useAppDocumentStore((s) => s.selectedNodeId);
  const selectNode = useAppDocumentStore((s) => s.selectNode);
  const clearSelection = useAppDocumentStore((s) => s.clearSelection);
  const resizeNode = useAppDocumentStore((s) => s.resizeNode);
  const setNodeText = useAppDocumentStore((s) => s.setNodeText);
  const setAppVar = useAppDocumentStore((s) => s.setAppVar);

  const stageRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const resizeRef = useRef<ResizeDrag | null>(null);
  const liveRef = useRef<Record<string, AppNodeLayout> | null>(null);
  const suppressClickRef = useRef(false);

  const [liveLayouts, setLiveLayouts] = useState<Record<string, AppNodeLayout> | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  const screenId = screen.id;
  const topLevel = (screen.root.children ?? []).filter((c) => !c.hidden);
  const selectedSet = new Set(selectedNodeIds);

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

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(id);
  }, [toast]);

  function beginMove(e: React.PointerEvent, node: AppNode) {
    if (!editMode || node.locked || !node.layout) return;
    if ((e.target as HTMLElement).dataset?.handle) return;
    e.stopPropagation();
    const { x, y } = toStage(e.clientX, e.clientY);

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

  function onNodeClick(e: React.MouseEvent, node: AppNode) {
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (!editMode) {
      const href = node.props?.href;
      const actions = node.props?.onPress ?? (href ? [{ type: "navigate" as const, route: href }] : undefined);
      runActions(actions, {
        navigate: (route) => onNavigateRoute?.(route),
        setVar: setAppVar,
        toast: setToast,
      });
      return;
    }
    selectNode(node.id, { additive: e.metaKey || e.ctrlKey });
  }

  function renderNode(node: AppNode): ReactNode {
    if (node.hidden || !node.layout) return null;
    const layout = liveLayouts?.[node.id] ?? node.layout;
    const selected = selectedSet.has(node.id) || selectedNodeId === node.id;
    const isContainer = node.type === "View" || node.type === "ScrollView";
    const dragging = draggingIds.includes(node.id);
    const radius = node.style?.borderRadius ?? 0;

    return (
      <div
        key={node.id}
        role="presentation"
        onPointerDown={(e) => beginMove(e, node)}
        onClick={(e) => onNodeClick(e, node)}
        onDoubleClick={(e) => {
          if (!editMode) return;
          e.stopPropagation();
          if (node.type === "Text" || node.type === "Button") setEditingTextId(node.id);
        }}
        style={frameStyle(layout, editMode, dragging)}
      >
        <div
          className={animClass(node.style?.animation)}
          style={shellStyle(document.theme, node, isContainer, editMode)}
        >
          {editingTextId === node.id && editMode ? (
            <textarea
              autoFocus
              defaultValue={resolveText(node, document.state)}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                setNodeText(screenId, node.id, e.target.value);
                setEditingTextId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingTextId(null);
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  setNodeText(screenId, node.id, (e.target as HTMLTextAreaElement).value);
                  setEditingTextId(null);
                }
              }}
              style={{
                width: "100%",
                height: "100%",
                resize: "none",
                border: "none",
                background: "var(--color-accent-soft)",
                color: "inherit",
                font: "inherit",
                fontWeight: "inherit",
                textAlign: node.style?.textAlign ?? "left",
                padding: 4,
              }}
            />
          ) : (
            <NodeBody node={node} theme={document.theme} docState={document.state} />
          )}
        </div>

        {isContainer && (node.children ?? []).map((child) => renderNode(child))}

        {editMode && selected && !node.locked && (
          <SelectionChrome
            radius={radius}
            onResizeCorner={(corner, e) => beginResize(e, { ...node, layout }, corner)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      data-stage-bg="1"
      onPointerDown={() => {
        if (!editMode) return;
        clearSelection();
        setEditingTextId(null);
      }}
      style={{
        position: "relative",
        width: APP_STAGE_WIDTH,
        height: APP_STAGE_HEIGHT,
        background:
          screen.root.style?.backgroundGradient ?? screen.root.style?.backgroundColor ?? document.theme.colorBg,
        overflow: "hidden",
        userSelect: editMode ? "none" : "auto",
      }}
    >
      {topLevel.map((n) => renderNode(n))}
      {guides.v.map((x) => (
        <div
          key={`v${x}`}
          style={{
            position: "absolute",
            left: x,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--color-snap-guide)",
            zIndex: 40,
            pointerEvents: "none",
          }}
        />
      ))}
      {guides.h.map((y) => (
        <div
          key={`h${y}`}
          style={{
            position: "absolute",
            top: y,
            left: 0,
            right: 0,
            height: 1,
            background: "var(--color-snap-guide)",
            zIndex: 40,
            pointerEvents: "none",
          }}
        />
      ))}
      {toast && (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(24,24,27,0.92)",
            color: "#FAFAFA",
            fontSize: 13,
            zIndex: 60,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
