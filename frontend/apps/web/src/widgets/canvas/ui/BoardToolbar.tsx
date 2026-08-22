import { useAppDocumentStore } from "@/entities/app-document";
import { ToolBtn } from "./ToolBtn";

export function BoardToolbar() {
  const undo = useAppDocumentStore((s) => s.undo);
  const redo = useAppDocumentStore((s) => s.redo);
  const copySelected = useAppDocumentStore((s) => s.copySelected);
  const pasteClipboard = useAppDocumentStore((s) => s.pasteClipboard);
  const pastLen = useAppDocumentStore((s) => s.past.length);
  const futureLen = useAppDocumentStore((s) => s.future.length);
  const selectedNodeId = useAppDocumentStore((s) => s.selectedNodeId);
  const selectedCount = useAppDocumentStore((s) => s.selectedNodeIds.length);
  const hasClipboard = useAppDocumentStore((s) => Boolean(s.clipboard));

  return (
    <div className="absolute left-4 top-3.5 z-[5] flex items-center gap-0.5 p-[3px] rounded-[11px] border border-line-strong bg-[rgba(255,255,255,0.92)] backdrop-blur-[10px] shadow-md hide-on-mobile">
      <ToolBtn label="Отменить" hint="Ctrl+Z" onClick={undo} disabled={pastLen === 0}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M4.5 5.5H10a3 3 0 010 6H7.5M4.5 5.5L6.5 3.5M4.5 5.5L6.5 7.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ToolBtn>
      <ToolBtn label="Повторить" hint="Ctrl+Y" onClick={redo} disabled={futureLen === 0}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M9.5 5.5H4a3 3 0 000 6h2.5M9.5 5.5L7.5 3.5M9.5 5.5L7.5 7.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ToolBtn>
      <span className="w-px h-[18px] bg-line-strong mx-[3px]" />
      <ToolBtn
        label="Копировать"
        hint="Ctrl+C"
        onClick={copySelected}
        disabled={!selectedNodeId && selectedCount === 0}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="5" y="5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M9 5V3.5A1.5 1.5 0 007.5 2h-4A1.5 1.5 0 002 3.5v4A1.5 1.5 0 003.5 9H5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </ToolBtn>
      <ToolBtn label="Вставить" hint="Ctrl+V" onClick={pasteClipboard} disabled={!hasClipboard}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M5 2.5h4M4.5 2.5h-1A1.5 1.5 0 002 4v7.5A1.5 1.5 0 003.5 13h7a1.5 1.5 0 001.5-1.5V4a1.5 1.5 0 00-1.5-1.5h-1"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <rect x="4.5" y="5.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.15" />
        </svg>
      </ToolBtn>
    </div>
  );
}
