import { useEffect, useRef, useState } from "react";
import {
  ADDABLE_COMPONENTS,
  APP_COMPONENT_REGISTRY,
  findAppNode,
  findParentNode,
  type AppComponentType,
  type AppScreen,
} from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { useOutsideClick, useWindowEvent } from "@/shared/lib";
import { ElementIcon } from "./ElementIcon";

const QUICK: AppComponentType[] = ["Text", "Button", "TextInput", "Image", "View"];

const HINTS: Record<AppComponentType, string> = {
  Text: "Заголовок или абзац",
  Button: "Действие с переходом",
  TextInput: "Ввод одной строки",
  Image: "Картинка по ссылке",
  View: "Группа для вложений",
  ScrollView: "Прокручиваемая область",
  FlatList: "Повторяющиеся строки",
  Spacer: "Пустой промежуток",
};

export function InsertDock({ screen }: { screen: AppScreen }) {
  const selectedNodeId = useAppDocumentStore((s) => s.selectedNodeId);
  const addComponent = useAppDocumentStore((s) => s.addComponent);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = selectedNodeId ? findAppNode(screen.root, selectedNodeId) : null;
  const parent = selected ? findParentNode(screen.root, selected.id) : null;
  const target =
    selected && APP_COMPONENT_REGISTRY[selected.type].canHaveChildren
      ? selected
      : parent && APP_COMPONENT_REGISTRY[parent.type].canHaveChildren
        ? parent
        : screen.root;

  const q = query.trim().toLowerCase();
  const results = q
    ? ADDABLE_COMPONENTS.filter((t) => {
        const def = APP_COMPONENT_REGISTRY[t];
        return (
          def.displayName.toLowerCase().includes(q) || t.toLowerCase().includes(q) || HINTS[t].toLowerCase().includes(q)
        );
      })
    : ADDABLE_COMPONENTS;

  const activeIndex = cursor < results.length ? cursor : 0;

  function insert(type: AppComponentType) {
    addComponent(screen.id, target.id, type);
    setOpen(false);
    setQuery("");
    setCursor(0);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useWindowEvent("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === "k" || e.code === "KeyK")) {
      e.preventDefault();
      setOpen((v) => !v);
    }
  });

  const targetLabel =
    target.id === screen.root.id ? screen.name : target.name || APP_COMPONENT_REGISTRY[target.type].displayName;

  return (
    <div
      ref={rootRef}
      className="absolute left-1/2 bottom-[18px] -translate-x-1/2 z-[6] flex flex-col items-center gap-2 hide-on-mobile"
    >
      {open && (
        <div className="w-[292px] rounded-2xl border border-line-strong bg-[rgba(255,255,255,0.97)] backdrop-saturate-[1.8] backdrop-blur-[18px] shadow-lg overflow-hidden animate-insert-pop">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-subtle shrink-0">
              <circle cx="6.2" cy="6.2" r="3.9" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.3 9.3l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              placeholder="Найти элемент…"
              spellCheck={false}
              className="flex-1 min-w-0 border-0 outline-0 bg-transparent text-text font-ui font-normal text-[13px] leading-[1.4]"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor(Math.min(results.length - 1, activeIndex + 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor(Math.max(0, activeIndex - 1));
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  const pick = results[activeIndex];
                  if (pick) insert(pick);
                }
              }}
            />
          </div>

          <div className="max-h-[268px] overflow-y-auto p-1.5">
            {results.length === 0 && (
              <div className="px-2.5 py-3.5 text-xs text-subtle text-center">Ничего не найдено</div>
            )}
            {results.map((type, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => insert(type)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex items-center gap-2.5 w-full px-2.5 py-2 border-0 rounded-[10px] cursor-pointer text-left ${
                    active ? "bg-accent-soft" : "bg-transparent"
                  }`}
                >
                  <span
                    className={`w-7 h-7 shrink-0 grid place-items-center rounded-lg ${
                      active
                        ? "bg-panel text-accent-strong shadow-[0_1px_2px_rgba(46,55,150,0.14)]"
                        : "bg-surface text-muted"
                    }`}
                  >
                    <ElementIcon type={type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-[550] text-text">
                      {APP_COMPONENT_REGISTRY[type].displayName}
                    </span>
                    <span className="block text-[11px] text-subtle">{HINTS[type]}</span>
                  </span>
                  {active && (
                    <kbd className="shrink-0 text-[10px] text-subtle border border-line-strong rounded-[5px] px-[5px] py-0.5 font-ui">
                      ⏎
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t border-line text-[11px] text-subtle flex items-center gap-[5px]">
            <span className="shrink-0">Вставить в</span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-accent-strong">
              {targetLabel}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-0.5 p-1 rounded-[14px] border border-line-strong bg-[rgba(255,255,255,0.92)] backdrop-blur-[10px] shadow-md">
        {QUICK.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => insert(type)}
            title={APP_COMPONENT_REGISTRY[type].displayName}
            aria-label={`Добавить: ${APP_COMPONENT_REGISTRY[type].displayName}`}
            className="w-8 h-8 border-0 rounded-[10px] bg-transparent text-muted grid place-items-center cursor-pointer p-0 transition-[background,color] duration-[.14s] ease-[ease] hover:bg-accent-soft hover:text-accent-strong"
          >
            <ElementIcon type={type} />
          </button>
        ))}

        <span className="w-px h-5 bg-line-strong mx-1" />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Все элементы (Ctrl+K)"
          aria-label="Все элементы"
          aria-expanded={open}
          className={`h-8 pl-[9px] pr-[11px] inline-flex items-center gap-1.5 border-0 rounded-[10px] font-ui text-xs font-semibold cursor-pointer transition-[background,color] duration-[.16s] ease-[ease] ${
            open ? "bg-[linear-gradient(180deg,#6b7bff,#4a55c9)] text-ink-fg" : "bg-surface text-text"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Элемент
        </button>
      </div>
    </div>
  );
}
