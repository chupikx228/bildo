import { useEffect, useRef, useState } from "react";
import { useChatDecision, useChatMessages, useSendChatMessage, useTaskStatus } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import type { Attachment } from "@/shared/attachments";
import { mapMessages } from "./messages";
import { uid, type Proposal, type Turn } from "./planner";

const MIN_CONTENT = 3;
const RUNNING = new Set(["deferred", "queued", "in_progress"]);

interface LocalNote {
  id: string;
  text: string;
}

export function useAssistantThread(appId: string) {
  const messagesQuery = useChatMessages(appId);
  const sendMutation = useSendChatMessage(appId);
  const decisionMutation = useChatDecision(appId);

  const document = useAppDocumentStore((s) => s.document);
  const applyDocument = useAppDocumentStore((s) => s.applyDocument);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const taskQuery = useTaskStatus(activeTaskId);

  const scrollRef = useRef<HTMLDivElement>(null);

  const task = taskQuery.data;
  const running = task ? RUNNING.has(task.status) : activeTaskId !== null;
  const busy = sendMutation.isPending || running;

  const refetchMessages = messagesQuery.refetch;
  const terminal = task ? task.status === "complete" || task.status === "not_found" : false;

  useEffect(() => {
    if (activeTaskId && terminal) void refetchMessages();
  }, [activeTaskId, terminal, refetchMessages]);

  const messages = messagesQuery.data ?? [];
  const turns: Turn[] = mapMessages(messages, document);
  for (const note of notes) {
    turns.push({ id: note.id, role: "note", text: note.text });
  }
  if (task?.status === "complete" && task.error) {
    turns.push({ id: `task-error-${task.id}`, role: "note", text: task.error });
  }
  if (busy) {
    turns.push({ id: "typing", role: "typing" });
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  function send(raw: string, _files: Attachment[]) {
    const text = raw.trim();
    if (text.length < MIN_CONTENT || busy) return;
    sendMutation.mutate(text, {
      onSuccess: (res) => {
        setActiveTaskId(res.taskId);
        void refetchMessages();
      },
      onError: (err) => {
        setNotes((prev) => [
          ...prev,
          { id: uid("note"), text: err instanceof Error ? err.message : "Не удалось отправить" },
        ]);
      },
    });
  }

  function resolve(turnId: string, _proposal: Proposal, accept: boolean) {
    const message = messages.find((m) => m.id === turnId);
    const proposed = message?.role === "assistant" ? message.proposedDocument : null;
    if (!proposed) return;
    if (accept) applyDocument(proposed);
    decisionMutation.mutate({ messageId: turnId, accepted: accept });
  }

  const pendingCount = messages.filter(
    (m) => m.role === "assistant" && m.proposedDocument !== null && m.accepted === null,
  ).length;
  const hasTranscript = turns.length > 0;

  return { turns, busy, pendingCount, hasTranscript, scrollRef, send, resolve };
}
