import type { AppDocument, AppNode, AppThemeTokens } from "@bildo/api";
import { resolveText } from "../lib/canvasNode";

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
    case "Text":
      return (
        <span
          style={{
            pointerEvents: "none",
            width: "100%",
            textAlign: align,
            fontWeight: weight,
            fontSize: "inherit",
            color: "inherit",
          }}
        >
          {resolveText(node, docState) || "Текст"}
        </span>
      );
    case "Button":
      return (
        <span
          style={{
            pointerEvents: "none",
            width: "100%",
            textAlign: node.style?.textAlign ?? "center",
            color: node.style?.color ?? theme.colorPrimaryFg,
            fontWeight: weight ?? 600,
            fontSize: "inherit",
          }}
        >
          {resolveText(node, docState) || "Кнопка"}
        </span>
      );
    case "TextInput":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            border: `${node.style?.borderWidth ?? 1}px solid ${node.style?.borderColor ?? theme.colorBorder}`,
            borderRadius: node.style?.borderRadius ?? 10,
            background: node.style?.backgroundGradient ?? node.style?.backgroundColor ?? theme.colorSurface,
            color: node.style?.color ?? theme.colorTextMuted,
            padding: node.style?.paddingHorizontal ?? node.style?.padding ?? 10,
            boxSizing: "border-box",
            fontSize: node.style?.fontSize ?? 14,
            fontWeight: weight,
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
    default:
      return null;
  }
}
