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
import styles from "./Assistant.module.css";

const EXAMPLES = ["Добавь экран профиля", "Светлая тема с индиго-акцентом", "Поставь 3D-модель на главный экран"];

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
      <div className={styles.collapsed}>
        <button
          type="button"
          onClick={onExpand}
          aria-label="Открыть ассистента"
          title="Ассистент (Ctrl+J)"
          className={styles.collapsedBtn}
        >
          <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden>
            <path
              d="M7.5 1.6l1.15 3.1 3.1 1.15-3.1 1.15L7.5 10.1 6.35 7 3.25 5.85l3.1-1.15L7.5 1.6z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
          {pendingCount > 0 && <span className={styles.collapsedBadge}>{pendingCount}</span>}
        </button>
        <span className={styles.collapsedLabel}>Ассистент</span>
      </div>
    );
  }

  return (
    <div className={styles.rail}>
      <div className={styles.head}>
        <span className={[styles.statusDot, busy && styles.statusDotBusy].filter(Boolean).join(" ")} />
        <span className={styles.headTitle}>Ассистент</span>
        {pendingCount > 0 && <span className={styles.pendingBadge}>{pendingCount} на подтверждение</span>}
        <div style={{ flex: 1 }} />
        {hasTranscript && (
          <button type="button" onClick={() => setTurns([])} className={styles.quietBtn} title="Очистить переписку">
            Очистить
          </button>
        )}
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Свернуть панель ассистента"
          title="Свернуть панель"
          className={styles.iconBtn}
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
                  <button key={text} type="button" onClick={() => send(text)} className={styles.example}>
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
            const wide = turn.role === "ai" && Boolean(turn.proposal);
            return (
              <div
                key={turn.id}
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
                    onAccept={() => resolve(turn.id, turn.proposal!, true)}
                    onReject={() => resolve(turn.id, turn.proposal!, false)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.footer}>
        <div style={{ margin: "10px 10px 0" }}>
          <AttachChips
            items={attachments}
            onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          />
        </div>

        <div className={styles.composer}>
          <div className={styles.field}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className={styles.fieldIcon} aria-hidden>
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
              className={styles.textarea}
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
            className={styles.send}
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

          <div className={styles.attach} ref={clipRef}>
            <button
              ref={clipBtnRef}
              type="button"
              className={[styles.clip, clipOpen && styles.clipOpen].filter(Boolean).join(" ")}
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
                  className={styles.clipMenu}
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
