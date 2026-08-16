import {
  APP_COMPONENT_REGISTRY,
  APP_STAGE_HEIGHT,
  APP_STAGE_WIDTH,
  findParentNode,
  type AppAction,
  type AppNode,
  type AppNodeLayout,
  type AppNodeStyle,
  type AppScreen,
  type AppThemeTokens,
} from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { clamp } from "@/shared/lib";
import {
  AlignPad,
  ColorPicker,
  CompactNumber,
  StepNumber,
  type HorizontalAlign,
  type VerticalAlign,
} from "@/shared/ui";
import { Field, PanelHeader, Row, Section, TextAlignButtons, WeightSelect } from "./controls";

const FALLBACK_SURFACE = "#18181B";
const FALLBACK_TEXT = "#FAFAFA";

const PANEL = "flex flex-col h-full overflow-hidden";
const INPUT =
  "w-full bg-surface border border-line-strong rounded-md px-2.5 py-2 text-xs text-text outline-none box-border";
const TEXTAREA = `${INPUT} resize-y min-h-[72px] leading-[1.4]`;
const OPACITY_INPUT =
  "w-9 border-0 outline-none bg-transparent text-text text-xs text-right tabular-nums p-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0";

export function InspectorPanel({ screen, node }: { screen: AppScreen; node: AppNode | null }) {
  const document = useAppDocumentStore((s) => s.document);
  const updateNode = useAppDocumentStore((s) => s.updateNode);
  const setNodeText = useAppDocumentStore((s) => s.setNodeText);
  const setNodeLayout = useAppDocumentStore((s) => s.setNodeLayout);
  const setNodeActions = useAppDocumentStore((s) => s.setNodeActions);
  const renameScreen = useAppDocumentStore((s) => s.renameScreen);
  const updateTheme = useAppDocumentStore((s) => s.updateTheme);

  if (!document) return null;

  return (
    <div className={PANEL}>
      <div className="h-12 pl-4 pr-3 border-b border-line flex items-center shrink-0 text-xs font-semibold text-text tracking-[0.01em]">
        Инспектор
      </div>

      {!node ? (
        <ScreenInspector
          screen={screen}
          theme={document.theme}
          onRename={(name) => renameScreen(screen.id, name)}
          onTheme={updateTheme}
        />
      ) : (
        <NodeInspector
          screen={screen}
          node={node}
          screens={document.screens}
          onText={(text) => setNodeText(screen.id, node.id, text)}
          onPatch={(patch) => updateNode(screen.id, node.id, patch)}
          onLayout={(layout) => setNodeLayout(screen.id, node.id, layout, true)}
          onActions={(actions) => setNodeActions(screen.id, node.id, "onPress", actions)}
        />
      )}
    </div>
  );
}

function ScreenInspector({
  screen,
  theme,
  onRename,
  onTheme,
}: {
  screen: AppScreen;
  theme: AppThemeTokens;
  onRename: (name: string) => void;
  onTheme: (patch: Partial<AppThemeTokens>) => void;
}) {
  return (
    <div className={PANEL}>
      <PanelHeader typeLabel="Экран" title={screen.name} />
      <div className="flex-1 overflow-y-auto">
        <Section title="Содержание">
          <Field label="Имя">
            <input value={screen.name} onChange={(e) => onRename(e.target.value)} className={INPUT} />
          </Field>
        </Section>
        <Section title="Тема">
          <Row label="Фон">
            <ColorPicker value={theme.colorBg} onChange={(colorBg) => onTheme({ colorBg })} />
          </Row>
          <Row label="Акцент">
            <ColorPicker value={theme.colorPrimary} onChange={(colorPrimary) => onTheme({ colorPrimary })} />
          </Row>
          <Row label="Текст">
            <ColorPicker value={theme.colorText} onChange={(colorText) => onTheme({ colorText })} />
          </Row>
        </Section>
      </div>
    </div>
  );
}

function NodeInspector({
  screen,
  node,
  screens,
  onText,
  onPatch,
  onLayout,
  onActions,
}: {
  screen: AppScreen;
  node: AppNode;
  screens: AppScreen[];
  onText: (t: string) => void;
  onPatch: (patch: Partial<AppNode>) => void;
  onLayout: (layout: Partial<AppNodeLayout>) => void;
  onActions: (actions: AppAction[]) => void;
}) {
  const typeLabel = APP_COMPONENT_REGISTRY[node.type].displayName;
  const isTextual = node.type === "Text" || node.type === "Button";
  const displayTitle = isTextual ? node.props?.text?.trim() || typeLabel : node.name || typeLabel;
  const locked = Boolean(node.locked);
  const style = node.style ?? {};
  const hasFill =
    node.type === "Button" ||
    node.type === "View" ||
    node.type === "TextInput" ||
    node.type === "Image" ||
    node.type === "ScrollView";
  const hasPress = node.type === "Button" || node.type === "View" || node.type === "Text";
  const showLayerName = !isTextual;

  const parent = findParentNode(screen.root, node.id);
  const alignBounds =
    !parent || parent.id === screen.root.id
      ? { w: APP_STAGE_WIDTH, h: APP_STAGE_HEIGHT }
      : { w: parent.layout?.width ?? APP_STAGE_WIDTH, h: parent.layout?.height ?? APP_STAGE_HEIGHT };

  const patchStyle = (patch: Partial<AppNodeStyle>) => onPatch({ style: patch });
  const opacityPercent = Math.round((style.opacity ?? 1) * 100);

  function onAlign(h: HorizontalAlign, v: VerticalAlign) {
    if (!node.layout) return;
    const { width, height } = node.layout;
    let x = node.layout.x;
    let y = node.layout.y;
    if (h === "left") x = 0;
    else if (h === "center") x = Math.round((alignBounds.w - width) / 2);
    else if (h === "right") x = Math.round(alignBounds.w - width);
    if (v === "top") y = 0;
    else if (v === "middle") y = Math.round((alignBounds.h - height) / 2);
    else if (v === "bottom") y = Math.round(alignBounds.h - height);
    onLayout({ x, y });
  }

  return (
    <div className={PANEL}>
      <PanelHeader typeLabel={typeLabel} title={displayTitle} />
      <div className={`flex-1 overflow-y-auto ${locked ? "opacity-50" : ""}`}>
        <fieldset disabled={locked} className="border-0 m-0 p-0 min-w-0">
          {locked && (
            <div className="px-4 py-2.5 text-[11px] text-muted border-b border-line">
              Закреплено — снимите замок в слоях
            </div>
          )}

          <Section title="Содержание">
            {showLayerName && (
              <Field label="Имя слоя">
                <input
                  value={node.name ?? ""}
                  placeholder={typeLabel}
                  onChange={(e) => onPatch({ name: e.target.value })}
                  className={INPUT}
                />
              </Field>
            )}
            {isTextual && (
              <Field label="Текст">
                <textarea
                  rows={3}
                  value={node.props?.text ?? ""}
                  onChange={(e) => onText(e.target.value)}
                  className={TEXTAREA}
                />
              </Field>
            )}
            {node.type === "TextInput" && (
              <Field label="Подсказка">
                <input
                  value={node.props?.placeholder ?? ""}
                  onChange={(e) => onPatch({ props: { placeholder: e.target.value } })}
                  className={INPUT}
                />
              </Field>
            )}
            {node.type === "Image" && (
              <Field label="URL изображения">
                <input
                  value={node.props?.source ?? ""}
                  placeholder="https://…"
                  onChange={(e) => onPatch({ props: { source: e.target.value } })}
                  className={INPUT}
                />
              </Field>
            )}
            {node.type === "FlatList" && (
              <Field label="Элементы (по строке)">
                <textarea
                  rows={3}
                  value={(node.props?.data ?? []).join("\n")}
                  onChange={(e) => onPatch({ props: { data: e.target.value.split("\n").filter(Boolean) } })}
                  className={TEXTAREA}
                />
              </Field>
            )}
          </Section>

          {node.layout && (
            <Section title="Позиция">
              <div className="flex items-start gap-3">
                <div style={{ flexShrink: 0 }}>
                  <AlignPad horizontal={null} vertical={null} hint={null} onChange={onAlign} />
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                  <CompactNumber label="X" value={node.layout.x} onChange={(x) => onLayout({ x })} />
                  <CompactNumber label="Y" value={node.layout.y} onChange={(y) => onLayout({ y })} />
                  <CompactNumber label="W" value={node.layout.width} onChange={(width) => onLayout({ width })} />
                  <CompactNumber label="H" value={node.layout.height} onChange={(height) => onLayout({ height })} />
                </div>
              </div>
            </Section>
          )}

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
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={opacityPercent}
                  onChange={(e) => patchStyle({ opacity: Number(e.target.value) / 100 })}
                  className="w-16 accent-accent"
                  aria-label="Прозрачность"
                />
                <div className="inline-flex items-center h-7 rounded-md border border-line-strong bg-surface px-2 gap-0.5">
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
                  <span className="text-[11px] text-subtle select-none">%</span>
                </div>
              </div>
            </Row>
          </Section>

          {hasPress && (
            <Section title="Поведение">
              <Field label="При нажатии">
                <PressEditor actions={node.props?.onPress ?? []} screens={screens} onChange={onActions} />
              </Field>
            </Section>
          )}
        </fieldset>
      </div>
    </div>
  );
}

function PressEditor({
  actions,
  screens,
  onChange,
}: {
  actions: AppAction[];
  screens: AppScreen[];
  onChange: (a: AppAction[]) => void;
}) {
  const primary = actions[0];
  const kind =
    primary?.type === "navigate"
      ? `nav:${primary.route}`
      : primary?.type === "toast"
        ? "toast"
        : primary?.type === "openUrl"
          ? "url"
          : "none";

  return (
    <div className="grid gap-2">
      <select
        value={kind}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "none") onChange([]);
          else if (v === "toast") onChange([{ type: "toast", message: "Готово" }]);
          else if (v === "url") onChange([{ type: "openUrl", url: "https://" }]);
          else if (v.startsWith("nav:")) onChange([{ type: "navigate", route: v.slice(4) }]);
        }}
        className={INPUT}
      >
        <option value="none">Нет действия</option>
        <option value="toast">Показать сообщение</option>
        <option value="url">Открыть ссылку</option>
        {screens.map((s) => (
          <option key={s.id} value={`nav:${s.route}`}>
            Перейти → {s.name}
          </option>
        ))}
      </select>
      {primary?.type === "toast" && (
        <input
          value={primary.message}
          onChange={(e) => onChange([{ type: "toast", message: e.target.value }])}
          placeholder="Текст сообщения"
          className={INPUT}
        />
      )}
      {primary?.type === "openUrl" && (
        <input
          value={primary.url}
          onChange={(e) => onChange([{ type: "openUrl", url: e.target.value }])}
          placeholder="https://"
          className={INPUT}
        />
      )}
    </div>
  );
}
