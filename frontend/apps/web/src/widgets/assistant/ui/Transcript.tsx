import type { RefObject } from "react";
import type { Proposal, Turn } from "../lib/planner";
import { CommitCard } from "./cards";
import { MessageBubble } from "./MessageBubble";
import {
  BUBBLE_AI,
  EMPTY_STATE,
  EMPTY_TEXT,
  EXAMPLE,
  EXAMPLES,
  MSG,
  MSG_AI,
  NOTE,
  TRANSCRIPT,
  TRANSCRIPT_INNER,
  TYPING,
  TYPING_DOT,
} from "./classes";

const EXAMPLES_LIST = ["Добавь экран профиля", "Светлая тема с индиго-акцентом", "Поставь 3D-модель на главный экран"];

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
    <div ref={scrollRef} className={TRANSCRIPT}>
      <div className={TRANSCRIPT_INNER}>
        {!hasTranscript && (
          <div className={EMPTY_STATE}>
            <p className={EMPTY_TEXT}>
              Опишите изменение словами. Каждое предложение приходит с диффом — вы подтверждаете его до того, как оно
              попадёт в проект.
            </p>
            <div className={EXAMPLES}>
              {EXAMPLES_LIST.map((text) => (
                <button key={text} type="button" onClick={() => onExample(text)} className={EXAMPLE}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => {
          if (turn.role === "typing") {
            return (
              <div key={turn.id} className={`${MSG} ${MSG_AI}`}>
                <div className={BUBBLE_AI}>
                  <span className={TYPING}>
                    <span className={TYPING_DOT} />
                    <span className={`${TYPING_DOT} [animation-delay:0.14s]`} />
                    <span className={`${TYPING_DOT} [animation-delay:0.28s]`} />
                  </span>
                </div>
              </div>
            );
          }
          if (turn.role === "note") {
            return (
              <div key={turn.id} className={NOTE}>
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
