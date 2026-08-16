import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { refineAppFromMessage } from "@/features/refine-app-from-chat";
import {
  AttachChips,
  ClipIcon,
  FileMenuIcon,
  ImageMenuIcon,
  toAttachments,
  type Attachment,
} from "@/shared/attachments";
import { useWindowEvent } from "@/shared/lib";
import { CommitCard, ProposalCard } from "./cards";
import { assetProposal, plan, shortHash, typingDelayMs, uid, type Proposal, type Turn } from "./planner";

const EXAMPLES = ["Добавь экран профиля", "Светлая тема с индиго-акцентом", "Поставь 3D-модель на главный экран"];

const QUIET_BTN_BASE =
  "border border-line-strong rounded-lg bg-panel text-muted text-xs font-medium cursor-pointer hover:bg-accent-wash hover:border-accent-line hover:text-accent-strong";
const QUIET_BTN = `${QUIET_BTN_BASE} px-2.5 py-1.5`;
const ICON_BTN = `${QUIET_BTN_BASE} w-[26px] h-[26px] p-0 grid place-items-center`;
const MSG_BASE = "flex flex-col gap-1.5 max-w-[92%] animate-msg-in";
const BUBBLE_BASE = "rounded-[14px] px-3 py-[9px] text-[13px] leading-[1.45] border border-transparent";
const BUBBLE_USER = `${BUBBLE_BASE} bg-ink text-ink-fg rounded-br-[5px]`;
const BUBBLE_AI = `${BUBBLE_BASE} bg-surface text-text-soft border-line rounded-bl-[5px]`;

export function AssistantPanel({
  collapsed,
  onCollapse,
  onExpand,
}: {
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [clipOpen, setClipOpen] = useState(false);
  const [clipPos, setClipPos] = useState<{ bottom: number; right: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const clipBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  const pendingCount = turns.filter((t) => t.role === "ai" && t.proposal).length;
  const hasTranscript = turns.length > 0;

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

  function toggleClip() {
    if (clipOpen) {
      setClipOpen(false);
      return;
    }
    const rect = clipBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setClipPos({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right });
    }
    setClipOpen(true);
  }

  useWindowEvent("pointerdown", (e) => {
    if (!clipOpen) return;
    const t = e.target as Node;
    if (clipRef.current?.contains(t) || menuRef.current?.contains(t)) return;
    setClipOpen(false);
  });

  useWindowEvent("keydown", (e) => {
    if (clipOpen && e.key === "Escape") setClipOpen(false);
  });

  useWindowEvent("resize", () => {
    if (clipOpen) setClipOpen(false);
  });

  function attach(list: FileList | null, kind: Attachment["kind"]) {
    setAttachments((prev) => [...prev, ...toAttachments(list, kind)].slice(0, 8));
    setClipOpen(false);
  }

  function send(raw: string) {
    const text = raw.trim();
    const files = attachments;
    if ((!text && files.length === 0) || busy) return;

    setValue("");
    setAttachments([]);
    if (areaRef.current) areaRef.current.style.height = "auto";
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

  if (collapsed) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center gap-3 pt-2.5">
        <button
          type="button"
          onClick={onExpand}
          aria-label="Открыть ассистента"
          title="Ассистент (Ctrl+J)"
          className="relative w-[34px] h-[34px] rounded-[10px] border border-line-strong bg-panel text-muted grid place-items-center cursor-pointer p-0"
        >
          <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden>
            <path
              d="M7.5 1.6l1.15 3.1 3.1 1.15-3.1 1.15L7.5 10.1 6.35 7 3.25 5.85l3.1-1.15L7.5 1.6z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
          {pendingCount > 0 && (
            <span className="absolute -top-[3px] -right-[3px] min-w-[15px] h-[15px] rounded-full bg-accent text-ink-fg text-[9px] font-bold grid place-items-center border-2 border-panel">
              {pendingCount}
            </span>
          )}
        </button>
        <span className="[writing-mode:vertical-rl] text-[11px] font-semibold tracking-[0.06em] text-subtle select-none">
          Ассистент
        </span>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-panel bg-[linear-gradient(180deg,rgba(92,108,245,0.06)_0%,rgba(92,108,245,0)_220px)]">
      <div className="flex items-center gap-2 h-12 pl-3.5 pr-2.5 border-b border-line shrink-0">
        <span
          className={`w-[7px] h-[7px] rounded-full shrink-0 ${
            busy ? "bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" : "bg-ok"
          }`}
        />
        <span className="text-[12.5px] font-semibold text-text">Ассистент</span>
        {pendingCount > 0 && (
          <span className="text-[10px] font-semibold text-accent-strong bg-accent-soft rounded-full px-[7px] py-0.5 whitespace-nowrap">
            {pendingCount} на подтверждение
          </span>
        )}
        <div className="flex-1" />
        {hasTranscript && (
          <button type="button" onClick={() => setTurns([])} className={QUIET_BTN} title="Очистить переписку">
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

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 px-3 pt-3.5 pb-4">
          {!hasTranscript && (
            <div className="px-0.5 pt-2.5 pb-1">
              <p className="m-0 mb-3 text-[12.5px] leading-[1.5] text-muted">
                Опишите изменение словами. Каждое предложение приходит с диффом — вы подтверждаете его до того, как оно
                попадёт в проект.
              </p>
              <div className="flex flex-col gap-1.5">
                {EXAMPLES.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => send(text)}
                    className="text-left px-2.5 py-2 rounded-control border border-line-strong bg-panel text-muted text-xs cursor-pointer transition-[border-color,color] duration-[.16s] ease-[ease] hover:border-accent-line hover:text-text"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => {
            if (turn.role === "typing") {
              return (
                <div key={turn.id} className={`${MSG_BASE} self-start items-start`}>
                  <div className={BUBBLE_AI}>
                    <span className="inline-flex items-center gap-1 h-4">
                      <span className="w-[5px] h-[5px] rounded-full bg-faint animate-typing" />
                      <span className="w-[5px] h-[5px] rounded-full bg-faint animate-typing [animation-delay:0.14s]" />
                      <span className="w-[5px] h-[5px] rounded-full bg-faint animate-typing [animation-delay:0.28s]" />
                    </span>
                  </div>
                </div>
              );
            }
            if (turn.role === "note") {
              return (
                <div key={turn.id} className="self-center text-[11px] text-subtle px-2 py-0.5">
                  {turn.text}
                </div>
              );
            }
            if (turn.role === "commit") {
              return <CommitCard key={turn.id} commit={turn.commit} />;
            }
            const wide = turn.role === "ai" && Boolean(turn.proposal);
            return (
              <div
                key={turn.id}
                className={`${MSG_BASE} ${turn.role === "user" ? "self-end items-end" : "self-start items-start"} ${
                  wide ? "max-w-full w-full" : ""
                }`}
              >
                {turn.text && <div className={turn.role === "user" ? BUBBLE_USER : BUBBLE_AI}>{turn.text}</div>}
                {turn.role === "user" && turn.attachments && turn.attachments.length > 0 && (
                  <AttachChips items={turn.attachments} />
                )}
                {turn.role === "ai" && turn.proposal && (
                  <ProposalCard
                    proposal={turn.proposal}
                    onAccept={() => resolve(turn.id, turn.proposal!, true)}
                    onReject={() => resolve(turn.id, turn.proposal!, false)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-panel">
        <div style={{ margin: "10px 10px 0" }}>
          <AttachChips
            items={attachments}
            onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          />
        </div>

        <div className="flex items-end gap-2 p-2.5 shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-[11px] border border-line-strong bg-panel px-2.5 py-2 transition-[border-color,box-shadow] duration-[.16s] ease-[ease] focus-within:border-[#b9c0fa] focus-within:shadow-[0_0_0_3px_rgba(92,108,245,0.12)]">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0 text-subtle" aria-hidden>
              <path
                d="M7.5 1.6l1.15 3.1 3.1 1.15-3.1 1.15L7.5 10.1 6.35 7 3.25 5.85l3.1-1.15L7.5 1.6z"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
              <path
                d="M11.9 10.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z"
                fill="currentColor"
                opacity=".55"
              />
            </svg>
            <textarea
              ref={areaRef}
              rows={1}
              value={value}
              placeholder="Опишите изменение…"
              className="flex-1 min-w-0 resize-none border-0 outline-0 bg-transparent text-text font-ui font-normal text-[13px] leading-[18px] max-h-[108px] placeholder:text-faint"
              onChange={(e) => {
                setValue(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 108)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(value);
                }
                if (e.key === "Escape") e.currentTarget.blur();
              }}
            />
          </div>

          <button
            type="button"
            className="w-9 h-9 shrink-0 grid place-items-center border-0 rounded-[11px] bg-[linear-gradient(180deg,#6b7bff,var(--color-accent-strong))] text-ink-fg cursor-pointer shadow-[0_4px_12px_rgba(92,108,245,0.28)] transition-[background,opacity,transform,box-shadow] duration-[.16s] ease-[ease] disabled:opacity-[.28] disabled:cursor-not-allowed disabled:shadow-none enabled:hover:bg-[linear-gradient(180deg,#7c8aff,#4450c4)] enabled:hover:shadow-[0_6px_16px_rgba(92,108,245,0.36)] enabled:active:scale-[0.94]"
            onClick={() => send(value)}
            disabled={(!value.trim() && attachments.length === 0) || busy}
            aria-label="Отправить"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M7.5 12.5V3M7.5 3L3.6 6.9M7.5 3l3.9 3.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="relative shrink-0" ref={clipRef}>
            <button
              ref={clipBtnRef}
              type="button"
              className={`w-9 h-9 grid place-items-center border border-transparent rounded-[11px] bg-transparent text-subtle cursor-pointer p-0 transition-[background,color,border-color] duration-[.14s] ease-[ease] hover:bg-accent-wash hover:border-accent-line hover:text-accent-strong ${
                clipOpen ? "bg-accent-wash border-accent-line text-accent-strong" : ""
              }`}
              onClick={toggleClip}
              aria-label="Прикрепить"
              aria-expanded={clipOpen}
              title="Прикрепить"
            >
              <ClipIcon />
            </button>

            {clipOpen &&
              clipPos &&
              createPortal(
                <div
                  ref={menuRef}
                  className="fixed w-[236px] p-1.5 rounded-[14px] border border-line-strong bg-[rgba(255,255,255,0.98)] backdrop-blur-[18px] shadow-lg z-[90] animate-clip-in [&_button]:flex [&_button]:items-center [&_button]:gap-2.5 [&_button]:w-full [&_button]:px-2.5 [&_button]:py-[9px] [&_button]:border-0 [&_button]:rounded-control [&_button]:bg-transparent [&_button]:text-text-soft [&_button]:font-ui [&_button]:text-[13px] [&_button]:text-left [&_button]:cursor-pointer [&_button:hover]:bg-accent-wash [&_button_svg]:shrink-0 [&_button_svg]:text-accent"
                  role="menu"
                  style={{ bottom: clipPos.bottom, right: clipPos.right }}
                >
                  <button type="button" role="menuitem" onClick={() => imageInputRef.current?.click()}>
                    <ImageMenuIcon />
                    Загрузить изображения
                  </button>
                  <button type="button" role="menuitem" onClick={() => fileInputRef.current?.click()}>
                    <FileMenuIcon />
                    Загрузить файлы
                  </button>
                </div>,
                window.document.body,
              )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                attach(e.target.files, "image");
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                attach(e.target.files, "file");
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
