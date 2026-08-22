export function PanelHeader({ typeLabel, title }: { typeLabel: string; title: string }) {
  return (
    <div className="px-4 pt-3.5 pb-3 border-b border-line shrink-0">
      <div>
        <span className="inline-block px-[7px] py-0.5 rounded-full bg-accent-soft text-[10px] font-semibold tracking-[0.08em] uppercase text-accent-strong mb-[5px]">
          {typeLabel}
        </span>
      </div>
      <div className="text-sm font-semibold text-text overflow-hidden text-ellipsis whitespace-nowrap">{title}</div>
    </div>
  );
}
