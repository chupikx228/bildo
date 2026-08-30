import { useState } from "react";
import { useModels } from "@bildo/api";
import { useOutsideClick } from "@/shared/lib";
import { Icon, QueryState } from "@/shared/ui";
import { DEFAULT_MODEL_ID, toModels, type ModelId } from "../model/models";
import { ModelRow } from "./ModelRow";

const POPOVER =
  "absolute left-0 bottom-[calc(100%+8px)] w-[264px] p-1.5 rounded-[14px] border border-line-strong bg-[rgba(255,255,255,0.98)] backdrop-blur-[18px] shadow-lg z-20 animate-insert-pop max-h-[320px] overflow-auto";

export function ModelPicker({ value, onChange }: { value: ModelId; onChange: (id: ModelId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const { data, isLoading, isError, error } = useModels();

  const models = toModels(data);
  const selected = models.find((m) => m.id === value);
  const showSelected = selected !== undefined && selected.id !== DEFAULT_MODEL_ID;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border pl-3 pr-2.5 text-[13px] font-medium transition-colors ${
          open
            ? "border-accent-line bg-accent-wash text-accent-strong"
            : "border-line-strong bg-panel text-muted hover:border-accent-line hover:bg-accent-wash hover:text-accent-strong"
        }`}
      >
        {showSelected ? (
          <>
            <Icon name={selected.icon} size={15} />
            <span className="max-w-[150px] truncate">{selected.name}</span>
          </>
        ) : (
          <span>Выбрать модель</span>
        )}
        <Icon
          name="chevron-down"
          size={13}
          className={`text-subtle transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className={POPOVER} role="listbox">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            errorFallback="Не удалось загрузить список моделей"
          >
            {models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                selected={model.id === value}
                onClick={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
              />
            ))}
          </QueryState>
        </div>
      )}
    </div>
  );
}
