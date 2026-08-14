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
import styles from "./InsertDock.module.css";

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
    <div ref={rootRef} className={`${styles.dock} hide-on-mobile`}>
      {open && (
        <div className={styles.palette}>
          <div className={styles.search}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.searchIcon}>
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
              className={styles.searchInput}
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

          <div className={styles.results}>
            {results.length === 0 && <div className={styles.empty}>Ничего не найдено</div>}
            {results.map((type, i) => (
              <button
                key={type}
                type="button"
                onClick={() => insert(type)}
                onMouseEnter={() => setCursor(i)}
                className={[styles.result, i === activeIndex && styles.resultActive].filter(Boolean).join(" ")}
              >
                <span className={styles.resultIcon}>
                  <ElementIcon type={type} />
                </span>
                <span className={styles.resultText}>
                  <span className={styles.resultName}>{APP_COMPONENT_REGISTRY[type].displayName}</span>
                  <span className={styles.resultHint}>{HINTS[type]}</span>
                </span>
                {i === activeIndex && <kbd className={styles.kbd}>⏎</kbd>}
              </button>
            ))}
          </div>

          <div className={styles.target}>
            <span style={{ flexShrink: 0 }}>Вставить в</span>
            <span className={styles.targetName}>{targetLabel}</span>
          </div>
        </div>
      )}

      <div className={styles.bar}>
        {QUICK.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => insert(type)}
            title={APP_COMPONENT_REGISTRY[type].displayName}
            aria-label={`Добавить: ${APP_COMPONENT_REGISTRY[type].displayName}`}
            className={styles.quick}
          >
            <ElementIcon type={type} />
          </button>
        ))}

        <span className={styles.sep} />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Все элементы (Ctrl+K)"
          aria-label="Все элементы"
          aria-expanded={open}
          className={[styles.more, open && styles.moreOpen].filter(Boolean).join(" ")}
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
