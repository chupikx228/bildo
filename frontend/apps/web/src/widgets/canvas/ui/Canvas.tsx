import { useEffect, useState, type ReactNode } from "react";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, type AppDocument, type AppNode, type AppScreen } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { animClass, frameStyle, resolveText, runActions, shellStyle } from "../lib/canvasNode";
import { useNodeDrag } from "../lib/useNodeDrag";
import { CanvasToast } from "./CanvasToast";
import { Guides } from "./Guides";
import { NodeBody } from "./NodeBody";
import { SelectionChrome } from "./SelectionChrome";

export function Canvas({
  document,
  screen,
  editMode,
  onNavigateRoute,
  onSetVar,
}: {
  document: AppDocument;
  screen: AppScreen;
  editMode: boolean;
  onNavigateRoute?: (route: string) => void;
  onSetVar?: (name: string, value: string | number | boolean) => void;
}) {
  const selectedNodeIds = useAppDocumentStore((s) => s.selectedNodeIds);
  const selectedNodeId = useAppDocumentStore((s) => s.selectedNodeId);
  const selectNode = useAppDocumentStore((s) => s.selectNode);
  const clearSelection = useAppDocumentStore((s) => s.clearSelection);
  const setNodeText = useAppDocumentStore((s) => s.setNodeText);
  const storeSetAppVar = useAppDocumentStore((s) => s.setAppVar);
  const setAppVar = onSetVar ?? storeSetAppVar;

  const { stageRef, liveLayouts, guides, draggingIds, suppressClickRef, beginMove, beginResize } = useNodeDrag(
    screen,
    editMode,
  );

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const screenId = screen.id;
  const topLevel = (screen.root.children ?? []).filter((c) => !c.hidden);
  const selectedSet = new Set(selectedNodeIds);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(id);
  }, [toast]);

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
      <Guides guides={guides} />
      <CanvasToast message={toast} />
    </div>
  );
}
