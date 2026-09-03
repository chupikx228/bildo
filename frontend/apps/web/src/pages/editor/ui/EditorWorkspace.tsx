import { useDeferredValue, useEffect, useState, type CSSProperties } from "react";
import { findAppNode, getExportUrl, type AppDocument } from "@bildo/api";
import { codegenExpoProject, useAppDocumentStore } from "@/entities/app-document";
import { useAutosave } from "@/features/autosave-app-document";
import { AssistantPanel } from "@/widgets/assistant";
import { Board, BoardToolbar, RunningBadge } from "@/widgets/canvas";
import { CodePanel } from "@/widgets/code-panel";
import { EditorHeader } from "@/widgets/editor-header";
import { AppsModal } from "@/widgets/apps-modal";
import { FilesPanel } from "@/widgets/files-panel";
import { InsertDock } from "@/widgets/insert-dock";
import { InspectorPanel } from "@/widgets/inspector";
import { toAttachments, type Attachment } from "@/shared/attachments";
import { apiClient } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useSearchFlag, useWindowEvent } from "@/shared/lib";
import { Toast } from "@/shared/ui";

const RAIL_OPEN = "352px";
const RAIL_CLOSED = "52px";
const FILES_OPEN = "256px";
const NO_FILES: Record<string, string> = {};

export function EditorWorkspace({ appId, document }: { appId: string; document: AppDocument }) {
  const selectedScreenId = useAppDocumentStore((s) => s.selectedScreenId);
  const selectedNodeId = useAppDocumentStore((s) => s.selectedNodeId);
  const selectedNodeIds = useAppDocumentStore((s) => s.selectedNodeIds);
  const selectNode = useAppDocumentStore((s) => s.selectNode);
  const lastError = useAppDocumentStore((s) => s.lastErrors[0]);
  const clearErrors = useAppDocumentStore((s) => s.clearErrors);
  const undo = useAppDocumentStore((s) => s.undo);
  const redo = useAppDocumentStore((s) => s.redo);
  const removeSelected = useAppDocumentStore((s) => s.removeSelected);
  const duplicateSelected = useAppDocumentStore((s) => s.duplicateSelected);
  const copySelected = useAppDocumentStore((s) => s.copySelected);
  const pasteClipboard = useAppDocumentStore((s) => s.pasteClipboard);
  const moveNodes = useAppDocumentStore((s) => s.moveNodes);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codePath, setCodePath] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Attachment[]>([]);
  const appsModal = useSearchFlag("apps");

  const { flush } = useAutosave(appId);

  const screen = document.screens.find((s) => s.id === selectedScreenId) ?? document.screens[0] ?? null;
  const selectedNode = screen && selectedNodeId ? findAppNode(screen.root, selectedNodeId) : null;

  const deferredDocument = useDeferredValue(document);
  const files = filesOpen || codeOpen ? codegenExpoProject(deferredDocument) : NO_FILES;

  useEffect(() => {
    if (!shareUrl) return;
    const id = window.setTimeout(() => setShareUrl(null), 3200);
    return () => window.clearTimeout(id);
  }, [shareUrl]);

  useEffect(() => {
    if (!lastError) return;
    const id = window.setTimeout(() => clearErrors(), 3200);
    return () => window.clearTimeout(id);
  }, [lastError, clearErrors]);

  async function exportProject() {
    const ok = await flush();
    if (ok) window.location.href = getExportUrl(apiClient.baseUrl, appId);
  }

  function share() {
    const url = `${window.location.origin}${ROUTES.publicPreview(appId)}`;
    setShareUrl(url);
    void navigator.clipboard?.writeText(url);
  }

  function toggleRun() {
    const next = !running;
    if (next) selectNode(null);
    setRunning(next);
  }

  useWindowEvent("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement | null;
    const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

    if (meta && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if (meta && e.key === "s") {
      e.preventDefault();
      void flush();
      return;
    }
    if (meta && e.key === "e") {
      e.preventDefault();
      void exportProject();
      return;
    }
    if (meta && e.key === "d") {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (meta && (e.key === "j" || e.code === "KeyJ")) {
      e.preventDefault();
      setChatOpen((v) => !v);
      return;
    }
    if (meta && (e.key === "c" || e.code === "KeyC") && !typing) {
      e.preventDefault();
      copySelected();
      return;
    }
    if (meta && (e.key === "v" || e.code === "KeyV") && !typing) {
      e.preventDefault();
      pasteClipboard();
      return;
    }
    if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (!typing && selectedScreenId && selectedNodeIds.length) {
      const step = e.shiftKey ? 8 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveNodes(selectedScreenId, selectedNodeIds, -step, 0, true);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveNodes(selectedScreenId, selectedNodeIds, step, 0, true);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveNodes(selectedScreenId, selectedNodeIds, 0, -step, true);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveNodes(selectedScreenId, selectedNodeIds, 0, step, true);
      }
    }
  });

  useWindowEvent("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });
  useWindowEvent("drop", (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });

  if (!screen) return null;

  return (
    <div className="h-[100dvh] min-h-[520px] flex flex-col overflow-hidden bg-bg text-text">
      <EditorHeader
        running={running}
        filesOpen={filesOpen}
        codeOpen={codeOpen}
        onOpenApps={appsModal.setOn}
        onToggleFiles={() => setFilesOpen((v) => !v)}
        onToggleCode={() => setCodeOpen((v) => !v)}
        onToggleRun={toggleRun}
        onShare={share}
        onExport={() => void exportProject()}
      />

      <AppsModal open={appsModal.on} onClose={appsModal.setOff} currentId={appId} />

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        <Toast tone="warning" message={lastError ?? null} />
        <Toast tone="success" message={shareUrl ? `Ссылка скопирована: ${shareUrl}` : null} />
      </div>

      <div
        className="min-h-0 flex-1 grid grid-cols-[var(--rail-w,352px)_var(--files-w,0px)_minmax(0,1fr)_minmax(252px,300px)] max-[1020px]:grid-cols-[var(--rail-w,320px)_var(--files-w,0px)_minmax(0,1fr)] max-[720px]:grid-cols-[minmax(0,1fr)]"
        style={
          {
            "--rail-w": chatOpen ? RAIL_OPEN : RAIL_CLOSED,
            "--files-w": filesOpen ? FILES_OPEN : "0px",
          } as CSSProperties
        }
      >
        {/* Остаётся смонтированной в свёрнутом виде, чтобы переписка не терялась. */}
        <aside className="min-w-0 flex flex-col overflow-hidden border-r border-line max-[720px]:hidden">
          <AssistantPanel
            appId={appId}
            collapsed={!chatOpen}
            onCollapse={() => setChatOpen(false)}
            onExpand={() => setChatOpen(true)}
          />
        </aside>

        <div className="min-w-0 overflow-hidden flex [&>*]:flex-1 [&>*]:min-w-0 max-[720px]:hidden">
          {filesOpen && (
            <FilesPanel
              files={files}
              activePath={codePath}
              uploads={uploads}
              onUpload={(list) => setUploads((prev) => [...prev, ...toAttachments(list)].slice(0, 40))}
              onRemoveUpload={(id) => setUploads((prev) => prev.filter((a) => a.id !== id))}
              onOpen={(path) => {
                setCodePath(path);
                setCodeOpen(true);
              }}
              onClose={() => setFilesOpen(false)}
            />
          )}
        </div>

        <main className="relative min-w-0 flex flex-col overflow-hidden bg-board bg-[radial-gradient(150%_130%_at_-12%_-30%,rgba(92,108,245,0.085)_0%,rgba(92,108,245,0.035)_42%,rgba(92,108,245,0)_100%),radial-gradient(110%_100%_at_108%_115%,rgba(255,141,92,0.08)_0%,rgba(255,141,92,0)_100%)] before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:bg-[radial-gradient(circle,rgba(16,16,20,0.05)_1px,transparent_1px)] before:bg-[length:22px_22px]">
          <Board document={document} activeScreenId={screen.id} running={running} />

          {running ? <RunningBadge /> : <BoardToolbar />}

          {!running && <InsertDock screen={screen} />}

          {codeOpen && (
            <CodePanel
              files={files}
              path={codePath}
              onPath={setCodePath}
              onClose={() => setCodeOpen(false)}
              onOpenFiles={() => setFilesOpen(true)}
              filesOpen={filesOpen}
            />
          )}
        </main>

        <aside className="min-w-0 overflow-hidden bg-panel border-l border-line max-[1020px]:hidden">
          <InspectorPanel screen={screen} node={selectedNode} />
        </aside>
      </div>
    </div>
  );
}
