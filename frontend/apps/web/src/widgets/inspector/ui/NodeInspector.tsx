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
} from "@bildo/api";
import { type HorizontalAlign, type VerticalAlign } from "@/shared/ui";
import { PanelHeader } from "./controls";
import { AppearanceSection } from "./sections/AppearanceSection";
import { BehaviorSection } from "./sections/BehaviorSection";
import { ContentSection } from "./sections/ContentSection";
import { PositionSection } from "./sections/PositionSection";
import { FIELDSET, LOCKED_NOTE, PANEL, SCROLL, SCROLL_LOCKED } from "./classes";

export function NodeInspector({
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
      <div className={`${SCROLL} ${locked ? SCROLL_LOCKED : ""}`}>
        <fieldset disabled={locked} className={FIELDSET}>
          {locked && <div className={LOCKED_NOTE}>Закреплено — снимите замок в слоях</div>}

          <ContentSection
            node={node}
            typeLabel={typeLabel}
            isTextual={isTextual}
            showLayerName={showLayerName}
            onText={onText}
            onPatch={onPatch}
          />

          {node.layout && <PositionSection layout={node.layout} onLayout={onLayout} onAlign={onAlign} />}

          <AppearanceSection
            node={node}
            style={style}
            hasFill={hasFill}
            isTextual={isTextual}
            opacityPercent={opacityPercent}
            patchStyle={patchStyle}
          />

          {hasPress && <BehaviorSection actions={node.props?.onPress ?? []} screens={screens} onChange={onActions} />}
        </fieldset>
      </div>
    </div>
  );
}
