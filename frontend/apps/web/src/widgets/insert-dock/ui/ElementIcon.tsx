import type { AppComponentType } from "@bildo/api";

export function ElementIcon({ type }: { type: AppComponentType }) {
  const s = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const };
  switch (type) {
    case "Text":
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h10M8 4v8M6 12h4" {...s} />
        </svg>
      );
    case "Button":
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="5" width="11" height="6" rx="3" {...s} />
          <path d="M6 8h4" {...s} />
        </svg>
      );
    case "TextInput":
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="4.5" width="11" height="7" rx="2" {...s} />
          <path d="M5.5 6.6v2.8" {...s} />
        </svg>
      );
    case "Image":
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="3.5" width="11" height="9" rx="2" {...s} />
          <path d="M3 10.5l3-2.6 2.4 2 2-1.6 2.6 2.2" {...s} />
          <circle cx="6" cy="6.4" r="1" {...s} />
        </svg>
      );
    case "View":
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" {...s} />
          <path d="M2.5 6.5h11" {...s} />
        </svg>
      );
    case "ScrollView":
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="3.5" y="2.5" width="9" height="11" rx="2" {...s} />
          <path d="M8 5.5v5M6.4 9l1.6 1.6L9.6 9" {...s} />
        </svg>
      );
    case "FlatList":
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M3 4.5h10M3 8h10M3 11.5h6" {...s} />
        </svg>
      );
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10" {...s} strokeDasharray="2 2" />
          <path d="M3 4.5v7M13 4.5v7" {...s} />
        </svg>
      );
  }
}
