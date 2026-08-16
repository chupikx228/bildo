import { useState } from "react";
import type { Attachment } from "@/shared/attachments";
import { useAssistantThread } from "../lib/useAssistantThread";
import { CollapsedRail } from "./CollapsedRail";
import { Composer } from "./Composer";
import { Transcript } from "./Transcript";
import { HEAD, HEAD_TITLE, ICON_BTN, PENDING_BADGE, QUIET_BTN, RAIL } from "./classes";

export function AssistantPanel({
  collapsed,
  onCollapse,
  onExpand,
}: {
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const { turns, busy, pendingCount, hasTranscript, scrollRef, send, resolve, clear } = useAssistantThread();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (collapsed) {
    return <CollapsedRail pendingCount={pendingCount} onExpand={onExpand} />;
  }

  function runExample(text: string) {
    send(text, attachments);
    setValue("");
    setAttachments([]);
  }

  return (
    <div className={RAIL}>
      <div className={HEAD}>
        <span
          className={`w-[7px] h-[7px] rounded-full shrink-0 ${
            busy ? "bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" : "bg-ok"
          }`}
        />
        <span className={HEAD_TITLE}>Ассистент</span>
        {pendingCount > 0 && <span className={PENDING_BADGE}>{pendingCount} на подтверждение</span>}
        <div className="flex-1" />
        {hasTranscript && (
          <button type="button" onClick={clear} className={QUIET_BTN} title="Очистить переписку">
            Очистить
          </button>
        )}
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Свернуть панель ассистента"
          title="Свернуть панель"
          className={ICON_BTN}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M7.5 2.5L4 6l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <Transcript
        scrollRef={scrollRef}
        turns={turns}
        hasTranscript={hasTranscript}
        onExample={runExample}
        onResolve={resolve}
      />

      <Composer
        value={value}
        onValueChange={setValue}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        busy={busy}
        onSend={send}
      />
    </div>
  );
}
