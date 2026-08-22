import { AttachChips } from "@/shared/attachments";
import type { Proposal, Turn } from "../lib/planner";
import { ProposalCard } from "./ProposalCard";
import { BUBBLE_AI, BUBBLE_USER, MSG, MSG_AI, MSG_USER, MSG_WIDE } from "./classes";

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
    <div className={`${MSG} ${turn.role === "user" ? MSG_USER : MSG_AI} ${wide ? MSG_WIDE : ""}`}>
      {turn.text && <div className={turn.role === "user" ? BUBBLE_USER : BUBBLE_AI}>{turn.text}</div>}
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
