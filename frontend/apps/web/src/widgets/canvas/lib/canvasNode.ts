import type { CSSProperties } from "react";
import type { AppAction, AppDocument, AppNode, AppNodeAnimation, AppNodeLayout, AppThemeTokens } from "@bildo/api";

const SNAP = 8;

export function resolveText(node: AppNode, state?: AppDocument["state"]): string {
  if (node.props?.textBind && state && node.props.textBind in state) {
    return String(state[node.props.textBind]);
  }
  return node.props?.text ?? "";
}

export function runActions(
  actions: AppAction[] | undefined,
  ctx: {
    navigate: (route: string) => void;
    setVar: (name: string, value: string | number | boolean) => void;
    toast: (msg: string) => void;
  },
) {
  if (!actions?.length) return;
  for (const a of actions) {
    if (a.type === "navigate") ctx.navigate(a.route);
    else if (a.type === "setVar") ctx.setVar(a.name, a.value);
    else if (a.type === "toast") ctx.toast(a.message);
    else if (a.type === "openUrl") window.open(a.url, "_blank", "noopener,noreferrer");
  }
}

export function snap(v: number, guides: number[]): number {
  for (const g of guides) {
    if (Math.abs(v - g) <= SNAP) return g;
  }
  return v;
}

export function resolvePadding(
  style: AppNode["style"],
  field = 0,
): Pick<CSSProperties, "paddingLeft" | "paddingRight" | "paddingTop" | "paddingBottom"> {
  const base = style?.padding ?? (field > 0 ? field : undefined);
  const h = style?.paddingHorizontal ?? base;
  const v = style?.paddingVertical ?? base;
  const out: Pick<CSSProperties, "paddingLeft" | "paddingRight" | "paddingTop" | "paddingBottom"> = {};
  if (h != null) {
    out.paddingLeft = h;
    out.paddingRight = h;
  } else if (field > 0) {
    out.paddingLeft = field;
    out.paddingRight = field;
  }
  if (v != null) {
    out.paddingTop = v;
    out.paddingBottom = v;
  } else if (field > 0) {
    out.paddingTop = field;
    out.paddingBottom = field;
  }
  return out;
}

export function frameStyle(layout: AppNodeLayout, editMode: boolean, dragging: boolean): CSSProperties {
  return {
    position: "absolute",
    left: layout.x,
    top: layout.y,
    width: layout.width,
    height: layout.height,
    zIndex: (layout.zIndex ?? 1) + (dragging ? 100 : 0),
    cursor: editMode ? (dragging ? "grabbing" : "grab") : "default",
    touchAction: "none",
  };
}

export function animClass(animation: AppNodeAnimation | undefined): string | undefined {
  return animation ? `app-anim app-anim--${animation}` : undefined;
}

export function shellStyle(
  theme: AppThemeTokens,
  node: AppNode,
  isContainer: boolean,
  editMode: boolean,
): CSSProperties {
  const textual = node.type === "Text" || node.type === "Button";
  const fill =
    node.style?.backgroundGradient ??
    node.style?.backgroundColor ??
    (node.type === "Button" ? theme.colorPrimary : undefined);
  const ghostContainer = isContainer && !fill && !node.style?.borderWidth && editMode;
  const shadows = [ghostContainer ? "inset 0 0 0 1px rgba(92,108,245,0.22)" : null, node.style?.shadow ?? null]
    .filter(Boolean)
    .join(", ");

  return {
    position: "absolute",
    inset: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    borderRadius: node.style?.borderRadius,
    opacity: node.style?.opacity,
    boxShadow: shadows || undefined,
    border: node.style?.borderWidth
      ? `${node.style.borderWidth}px solid ${node.style.borderColor ?? theme.colorBorder}`
      : undefined,
    background: fill,
    color: node.style?.color ?? theme.colorText,
    fontSize: node.style?.fontSize,
    fontWeight: node.style?.fontWeight,
    letterSpacing: node.style?.letterSpacing,
    lineHeight: node.style?.lineHeight ? `${node.style.lineHeight}px` : undefined,
    textAlign: node.style?.textAlign ?? (node.type === "Button" ? "center" : undefined),
    display: "flex",
    flexDirection: node.style?.flexDirection ?? "column",
    alignItems: textual ? "stretch" : node.style?.alignItems,
    justifyContent: textual
      ? node.type === "Button"
        ? "center"
        : (node.style?.justifyContent ?? "flex-start")
      : node.style?.justifyContent,
    gap: node.style?.gap,
    ...resolvePadding(node.style, node.field ?? 0),
  };
}
