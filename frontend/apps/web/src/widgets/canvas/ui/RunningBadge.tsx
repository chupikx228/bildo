export function RunningBadge() {
  return (
    <div className="absolute left-4 top-3.5 z-[5] flex items-center gap-[7px] px-3 py-[7px] rounded-full bg-ink text-ink-fg text-[11px] font-semibold shadow-md max-w-[240px] hide-on-mobile">
      <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
      Превью — нажатия как в приложении
    </div>
  );
}
