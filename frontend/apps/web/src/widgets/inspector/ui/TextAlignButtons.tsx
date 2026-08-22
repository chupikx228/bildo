import { AlignLines, type TextAlign } from "./AlignLines";

const TEXT_ALIGNS: { id: TextAlign; title: string }[] = [
  { id: "left", title: "Слева" },
  { id: "center", title: "По центру" },
  { id: "right", title: "Справа" },
];

export function TextAlignButtons({ value, onChange }: { value: TextAlign; onChange: (v: TextAlign) => void }) {
  return (
    <div className="inline-flex p-0.5 rounded-[7px] border border-line-strong bg-surface gap-px">
      {TEXT_ALIGNS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.title}
          aria-label={item.title}
          aria-pressed={item.id === value}
          onClick={() => onChange(item.id)}
          className={`w-[30px] h-[26px] border-0 rounded-[5px] cursor-pointer grid place-items-center p-0 ${
            item.id === value
              ? "bg-panel shadow-[0_1px_2px_rgba(46,55,150,0.16),inset_0_0_0_1px_rgba(92,108,245,0.35)] text-accent-strong"
              : "bg-transparent text-subtle"
          }`}
        >
          <AlignLines align={item.id} />
        </button>
      ))}
    </div>
  );
}
