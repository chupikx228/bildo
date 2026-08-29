import { Icon } from "@/shared/ui";
import type { Model } from "../model/models";

export function ModelRow({ model, selected, onClick }: { model: Model; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-accent-wash"
    >
      <Icon name={model.icon} size={18} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{model.name}</span>
      {model.pro && (
        <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-subtle">
          Pro
        </span>
      )}
      {selected && <Icon name="check" size={15} className="text-accent" />}
    </button>
  );
}
