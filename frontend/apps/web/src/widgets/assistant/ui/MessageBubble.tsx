import { AttachChips } from "@/shared/attachments";
import type { Proposal, Turn } from "../lib/planner";
import { ProposalCard } from "./cards";
import styles from "./Assistant.module.css";

type MessageTurn = Extract<Turn, { role: "user" | "ai" }>;

export function MessageBubble({
  turn,
  onResolve,
}: {
  turn: MessageTurn;
  onResolve: (turnId: string, proposal: Proposal, accept: boolean) => void;
}) {
  const wide = turn.role === "ai" && Boolean(turn.proposal);

  return (
    <div
      className={[styles.msg, turn.role === "user" ? styles.msgUser : styles.msgAi, wide && styles.msgWide]
        .filter(Boolean)
        .join(" ")}
    >
      {turn.text && <div className={styles.bubble}>{turn.text}</div>}
      {turn.role === "user" && turn.attachments && turn.attachments.length > 0 && (
        <AttachChips items={turn.attachments} />
      )}
      {turn.role === "ai" && turn.proposal && (
        <ProposalCard
          proposal={turn.proposal}
          onAccept={() => onResolve(turn.id, turn.proposal!, true)}
          onReject={() => onResolve(turn.id, turn.proposal!, false)}
        />
      )}
    </div>
  );
}
