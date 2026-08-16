import { useEffect, useRef, useState } from "react";
import { refineAppFromMessage } from "@/features/refine-app-from-chat";
import type { Attachment } from "@/shared/attachments";
import { assetProposal, plan, shortHash, typingDelayMs, uid, type Proposal, type Turn } from "./planner";

export function useAssistantThread() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  function after(ms: number, fn: () => void) {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setTurns([
        {
          id: uid("ai"),
          role: "ai",
          text: "Осмотрел экраны. Есть одна идея, которая заметно поднимет первый экран.",
          proposal: assetProposal(),
        },
      ]);
    }, 900);
    timers.current.push(id);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  function send(raw: string, files: Attachment[]) {
    const text = raw.trim();
    if ((!text && files.length === 0) || busy) return;
    setBusy(true);

    const typingId = uid("typing");
    setTurns((prev) => [
      ...prev,
      { id: uid("user"), role: "user", text, attachments: files },
      { id: typingId, role: "typing" },
    ]);

    after(typingDelayMs(), () => {
      const { reply, proposal } = plan(text || files.map((f) => f.name).join(" "));
      setTurns((prev) => [
        ...prev.filter((t) => t.id !== typingId),
        { id: uid("ai"), role: "ai", text: reply, proposal },
      ]);
      setBusy(false);
    });
  }

  function resolve(turnId: string, proposal: Proposal, accept: boolean) {
    setTurns((prev) => prev.map((t) => (t.id === turnId && t.role === "ai" ? { ...t, proposal: undefined } : t)));

    if (!accept) {
      setTurns((prev) => [...prev, { id: uid("note"), role: "note", text: "Отклонено — ничего не изменилось." }]);
      return;
    }

    if (proposal.command) {
      const result = refineAppFromMessage(proposal.command);
      if (!result.ok) {
        setTurns((prev) => [
          ...prev,
          { id: uid("note"), role: "note", text: result.errors[0] ?? "Не удалось применить" },
        ]);
        return;
      }
    }

    setTurns((prev) => [
      ...prev,
      {
        id: uid("commit"),
        role: "commit",
        commit: { hash: shortHash(), title: proposal.commitTitle, files: proposal.files, diff: proposal.diff },
      },
    ]);
  }

  const pendingCount = turns.filter((t) => t.role === "ai" && t.proposal).length;
  const hasTranscript = turns.length > 0;
  const clear = () => setTurns([]);

  return { turns, busy, pendingCount, hasTranscript, scrollRef, send, resolve, clear };
}
