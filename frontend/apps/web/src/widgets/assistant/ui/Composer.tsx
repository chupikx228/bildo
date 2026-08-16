import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AttachChips,
  ClipIcon,
  FileMenuIcon,
  ImageMenuIcon,
  toAttachments,
  type Attachment,
} from "@/shared/attachments";
import { useWindowEvent } from "@/shared/lib";
import { ATTACH, CLIP, CLIP_MENU, CLIP_OPEN, COMPOSER, FIELD, FIELD_ICON, FOOTER, SEND, TEXTAREA } from "./classes";

export function Composer({
  value,
  onValueChange,
  attachments,
  onAttachmentsChange,
  busy,
  onSend,
}: {
  value: string;
  onValueChange: (value: string) => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  busy: boolean;
  onSend: (text: string, files: Attachment[]) => void;
}) {
  const [clipOpen, setClipOpen] = useState(false);
  const [clipPos, setClipPos] = useState<{ bottom: number; right: number } | null>(null);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const clipBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    onAttachmentsChange([...attachments, ...toAttachments(list, kind)].slice(0, 8));
    setClipOpen(false);
  }

  function submit() {
    const text = value.trim();
    if ((!text && attachments.length === 0) || busy) return;
    onSend(value, attachments);
    onValueChange("");
    onAttachmentsChange([]);
    if (areaRef.current) areaRef.current.style.height = "auto";
  }

  return (
    <div className={FOOTER}>
      <div style={{ margin: "10px 10px 0" }}>
        <AttachChips
          items={attachments}
          onRemove={(id) => onAttachmentsChange(attachments.filter((a) => a.id !== id))}
        />
      </div>

      <div className={COMPOSER}>
        <div className={FIELD}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className={FIELD_ICON} aria-hidden>
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
            className={TEXTAREA}
            onChange={(e) => {
              onValueChange(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 108)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") e.currentTarget.blur();
            }}
          />
        </div>

        <button
          type="button"
          className={SEND}
          onClick={submit}
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

        <div className={ATTACH} ref={clipRef}>
          <button
            ref={clipBtnRef}
            type="button"
            className={`${CLIP} ${clipOpen ? CLIP_OPEN : ""}`}
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
                className={CLIP_MENU}
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
  );
}
