import type { ReactNode } from "react";

const TOKEN = {
  comment: "text-[#9a9aa5] italic",
  string: "text-[#0f766e]",
  keyword: "text-[#8b3dc7] font-[550]",
  number: "text-[#b45309]",
  type: "text-[#2563eb]",
  jsonKey: "text-accent-strong",
};

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "function",
  "return",
  "if",
  "else",
  "new",
  "await",
  "async",
  "type",
  "interface",
  "as",
  "true",
  "false",
  "null",
  "undefined",
]);

export function highlight(line: string, path: string): ReactNode {
  if (!line) return " ";

  if (path.endsWith(".json")) {
    const parts = line.split(/("(?:[^"\\]|\\.)*")/g);
    return parts.map((part, i) => {
      if (i % 2 === 0) return <span key={i}>{part}</span>;
      const isKey = /^\s*:/.test(parts[i + 1] ?? "");
      return (
        <span key={i} className={isKey ? TOKEN.jsonKey : TOKEN.string}>
          {part}
        </span>
      );
    });
  }

  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    return <span className={TOKEN.comment}>{line}</span>;
  }

  const tokens = line.split(/('[^']*'|"[^"]*"|`[^`]*`|\b)/g);
  return tokens.map((tok, i) => {
    if (!tok) return null;
    if (/^['"`]/.test(tok))
      return (
        <span key={i} className={TOKEN.string}>
          {tok}
        </span>
      );
    if (KEYWORDS.has(tok))
      return (
        <span key={i} className={TOKEN.keyword}>
          {tok}
        </span>
      );
    if (/^\d+(\.\d+)?$/.test(tok))
      return (
        <span key={i} className={TOKEN.number}>
          {tok}
        </span>
      );
    if (/^[A-Z][A-Za-z0-9]*$/.test(tok))
      return (
        <span key={i} className={TOKEN.type}>
          {tok}
        </span>
      );
    return <span key={i}>{tok}</span>;
  });
}
