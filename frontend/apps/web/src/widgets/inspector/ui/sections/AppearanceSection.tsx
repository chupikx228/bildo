import type { AppNode, AppNodeStyle } from "@bildo/api";
import { clamp } from "@/shared/lib";
import { ColorPicker, StepNumber } from "@/shared/ui";
import { Row, Section, TextAlignButtons, WeightSelect } from "../controls";
import { OPACITY, OPACITY_BOX, OPACITY_INPUT, OPACITY_SLIDER, OPACITY_UNIT } from "../classes";

const FALLBACK_SURFACE = "#18181B";
const FALLBACK_TEXT = "#FAFAFA";

export function AppearanceSection({
  node,
  style,
  hasFill,
  isTextual,
  opacityPercent,
  patchStyle,
}: {
  node: AppNode;
  style: AppNodeStyle;
  hasFill: boolean;
  isTextual: boolean;
  opacityPercent: number;
  patchStyle: (patch: Partial<AppNodeStyle>) => void;
}) {
  return (
    <Section title="Внешний вид">
      {hasFill && (
        <Row label="Заливка">
          <ColorPicker
            value={style.backgroundColor ?? (node.type === "Button" ? "#5C6CF5" : FALLBACK_SURFACE)}
            onChange={(backgroundColor) => patchStyle({ backgroundColor })}
          />
        </Row>
      )}
      {(isTextual || node.type === "TextInput") && (
        <>
          <Row label="Цвет текста">
            <ColorPicker value={style.color ?? FALLBACK_TEXT} onChange={(color) => patchStyle({ color })} />
          </Row>
          <Row label="Размер шрифта">
            <StepNumber
              value={style.fontSize ?? 16}
              onChange={(fontSize) => patchStyle({ fontSize })}
              min={10}
              max={72}
            />
          </Row>
          <Row label="Начертание">
            <WeightSelect
              value={style.fontWeight ?? (node.type === "Button" ? "600" : "400")}
              onChange={(fontWeight) => patchStyle({ fontWeight })}
            />
          </Row>
          <Row label="Выравнивание">
            <TextAlignButtons
              value={style.textAlign ?? (node.type === "Button" ? "center" : "left")}
              onChange={(textAlign) => patchStyle({ textAlign })}
            />
          </Row>
        </>
      )}
      <Row label="Скругление">
        <StepNumber
          value={style.borderRadius ?? 0}
          onChange={(borderRadius) => patchStyle({ borderRadius })}
          min={0}
          max={999}
        />
      </Row>
      <Row label="Прозрачность">
        <div className={OPACITY}>
          <input
            type="range"
            min={0}
            max={100}
            value={opacityPercent}
            onChange={(e) => patchStyle({ opacity: Number(e.target.value) / 100 })}
            className={OPACITY_SLIDER}
            aria-label="Прозрачность"
          />
          <div className={OPACITY_BOX}>
            <input
              type="number"
              min={0}
              max={100}
              value={opacityPercent}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "" || raw === "-") return;
                const n = clamp(Number(raw), 0, 100);
                if (Number.isFinite(n)) patchStyle({ opacity: n / 100 });
              }}
              onBlur={(e) => {
                const n = Number(e.target.value);
                const clamped = clamp(Number.isFinite(n) ? n : opacityPercent, 0, 100);
                patchStyle({ opacity: clamped / 100 });
              }}
              aria-label="Прозрачность в процентах"
              className={OPACITY_INPUT}
            />
            <span className={OPACITY_UNIT}>%</span>
          </div>
        </div>
      </Row>
    </Section>
  );
}
