import type { AppNodeLayout } from "@bildo/api";
import { AlignPad, CompactNumber, type HorizontalAlign, type VerticalAlign } from "@/shared/ui";
import { Section } from "../Section";
import { POSITION, POSITION_FIELDS } from "../classes";

export function PositionSection({
  layout,
  onLayout,
  onAlign,
}: {
  layout: AppNodeLayout;
  onLayout: (layout: Partial<AppNodeLayout>) => void;
  onAlign: (h: HorizontalAlign, v: VerticalAlign) => void;
}) {
  return (
    <Section title="Позиция">
      <div className={POSITION}>
        <div style={{ flexShrink: 0 }}>
          <AlignPad horizontal={null} vertical={null} hint={null} onChange={onAlign} />
        </div>
        <div className={POSITION_FIELDS}>
          <CompactNumber label="X" value={layout.x} onChange={(x) => onLayout({ x })} />
          <CompactNumber label="Y" value={layout.y} onChange={(y) => onLayout({ y })} />
          <CompactNumber label="W" value={layout.width} onChange={(width) => onLayout({ width })} />
          <CompactNumber label="H" value={layout.height} onChange={(height) => onLayout({ height })} />
        </div>
      </div>
    </Section>
  );
}
