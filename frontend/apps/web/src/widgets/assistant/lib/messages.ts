import type { AppDocument, ChatMessage } from "@bildo/api";
import { chatDiff } from "./chatDiff";
import { shortHash, type Proposal, type Turn } from "./planner";

function proposalFor(message: ChatMessage, current: AppDocument | null, proposed: AppDocument): Proposal {
  const { diff, files } = current ? chatDiff(current, proposed) : { diff: [], files: [] };
  return {
    id: message.id,
    kind: "screen",
    title: "Применить изменение?",
    commitTitle: message.content,
    note: "Ассистент подготовил обновлённый документ приложения.",
    diff,
    files,
  };
}

export function mapMessages(messages: ChatMessage[], current: AppDocument | null): Turn[] {
  const turns: Turn[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ id: message.id, role: "user", text: message.content });
      continue;
    }

    if (message.proposedDocument === null) {
      turns.push({ id: message.id, role: "ai", text: message.content });
      continue;
    }

    if (message.accepted === null) {
      turns.push({
        id: message.id,
        role: "ai",
        text: message.content,
        proposal: proposalFor(message, current, message.proposedDocument),
      });
      continue;
    }

    turns.push({ id: message.id, role: "ai", text: message.content });
    if (message.accepted) {
      turns.push({
        id: `${message.id}-commit`,
        role: "commit",
        commit: { hash: shortHash(message.id), title: message.content, files: [], diff: [] },
      });
    } else {
      turns.push({ id: `${message.id}-note`, role: "note", text: "Отклонено — ничего не изменилось." });
    }
  }

  return turns;
}
