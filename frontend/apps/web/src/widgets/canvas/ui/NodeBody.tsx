import { icons, type LucideIcon } from "lucide-react";
import type { AppDocument, AppNode, AppThemeTokens } from "@bildo/api";

const ICON_MAP = icons as Record<string, LucideIcon>;
import { paperRoundness, previewFont, resolveText } from "../lib/canvasNode";

function iconPascalName(icon: string): string {
  return icon
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function NodeBody({
  node,
  theme,
  docState,
}: {
  node: AppNode;
  theme: AppThemeTokens;
  docState?: AppDocument["state"];
}) {
  const weight = node.style?.fontWeight;
  const align = node.style?.textAlign ?? "left";

  switch (node.type) {
    case "Text": {
      const font = previewFont(theme, { fontSize: node.style?.fontSize, fontWeight: weight, heading: true });
      return (
        <span
          style={{
            pointerEvents: "none",
            width: "100%",
            textAlign: align,
            fontWeight: font.fontWeight ?? weight,
            fontFamily: font.fontFamily,
            fontSize: "inherit",
            color: "inherit",
            whiteSpace: "pre-wrap",
          }}
        >
          {resolveText(node, docState) || "Текст"}
        </span>
      );
    }
    case "Button": {
      const font = previewFont(theme, { fontWeight: weight ?? "600", heading: false });
      return (
        <span
          style={{
            pointerEvents: "none",
            width: "100%",
            textAlign: node.style?.textAlign ?? "center",
            color: node.style?.color ?? theme.colorPrimaryFg,
            fontWeight: font.fontWeight ?? weight ?? 600,
            fontFamily: font.fontFamily,
            fontSize: "inherit",
          }}
        >
          {resolveText(node, docState) || "Кнопка"}
        </span>
      );
    }
    case "TextInput": {
      const font = previewFont(theme, { fontWeight: weight, heading: false });
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            border: `${node.style?.borderWidth ?? 1}px solid ${node.style?.borderColor ?? theme.colorBorder}`,
            borderRadius: node.style?.borderRadius ?? paperRoundness(theme),
            background: node.style?.backgroundGradient ?? node.style?.backgroundColor ?? theme.colorSurface,
            color: node.style?.color ?? theme.colorTextMuted,
            padding: node.style?.paddingHorizontal ?? node.style?.padding ?? 10,
            boxSizing: "border-box",
            fontSize: node.style?.fontSize ?? 14,
            fontWeight: font.fontWeight ?? weight,
            fontFamily: font.fontFamily,
            textAlign: align,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            pointerEvents: "none",
          }}
        >
          <span style={{ width: "100%", textAlign: align }}>
            {node.props?.valueBind && docState?.[node.props.valueBind] != null
              ? String(docState[node.props.valueBind])
              : node.props?.placeholder || "Поле ввода"}
          </span>
        </div>
      );
    }
    case "Image":
      return node.props?.source ? (
        <img
          src={node.props.source}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
        />
      ) : (
        <span style={{ color: theme.colorTextMuted, fontSize: 12, margin: "auto", pointerEvents: "none" }}>Image</span>
      );
    case "FlatList":
      return (
        <div style={{ overflow: "auto", width: "100%", height: "100%", padding: 4, pointerEvents: "none" }}>
          {(node.props?.data ?? ["Item"]).map((item, i) => (
            <div
              key={i}
              style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: theme.colorSurface, fontSize: 13 }}
            >
              {item}
            </div>
          ))}
        </div>
      );
    case "Icon": {
      const iconName = node.props?.icon;
      const Icon = iconName ? ICON_MAP[iconPascalName(iconName)] : undefined;
      const size = node.layout ? Math.min(node.layout.width, node.layout.height) : 24;
      const color = node.style?.color ?? theme.colorText;
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {Icon ? <Icon size={size} color={color} /> : null}
        </div>
      );
    }
    default:
      return null;
  }
}
