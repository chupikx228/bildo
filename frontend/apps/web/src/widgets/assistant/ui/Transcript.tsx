import type { RefObject } from "react";
import type { Proposal, Turn } from "../lib/planner";
import { CommitCard } from "./cards";
import { MessageBubble } from "./MessageBubble";
import styles from "./Assistant.module.css";

const EXAMPLES = ["Добавь экран профиля", "Светлая тема с индиго-акцентом", "Поставь 3D-модель на главный экран"];

export function Transcript({
  scrollRef,
  turns,
  hasTranscript,
  onExample,
  onResolve,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  turns: Turn[];
  hasTranscript: boolean;
  onExample: (text: string) => void;
  onResolve: (turnId: string, proposal: Proposal, accept: boolean) => void;
}) {
  return (
    <div ref={scrollRef} className={styles.transcript}>
      <div className={styles.transcriptInner}>
        {!hasTranscript && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              Опишите изменение словами. Каждое предложение приходит с диффом — вы подтверждаете его до того, как оно
              попадёт в проект.
            </p>
            <div className={styles.examples}>
              {EXAMPLES.map((text) => (
                <button key={text} type="button" onClick={() => onExample(text)} className={styles.example}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => {
          if (turn.role === "typing") {
            return (
              <div key={turn.id} className={[styles.msg, styles.msgAi].join(" ")}>
                <div className={styles.bubble}>
                  <span className={styles.typing}>
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            );
          }
          if (turn.role === "note") {
            return (
              <div key={turn.id} className={styles.note}>
                {turn.text}
              </div>
            );
          }
          if (turn.role === "commit") {
            return <CommitCard key={turn.id} commit={turn.commit} />;
          }
          return <MessageBubble key={turn.id} turn={turn} onResolve={onResolve} />;
        })}
      </div>
    </div>
  );
}
