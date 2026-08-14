import type { ReactNode } from "react";
import styles from "./CodePanel.module.css";

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
        <span key={i} className={isKey ? styles.tokenJsonKey : styles.tokenString}>
          {part}
        </span>
      );
    });
  }

  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    return <span className={styles.tokenComment}>{line}</span>;
  }

  const tokens = line.split(/('[^']*'|"[^"]*"|`[^`]*`|\b)/g);
  return tokens.map((tok, i) => {
    if (!tok) return null;
    if (/^['"`]/.test(tok))
      return (
        <span key={i} className={styles.tokenString}>
          {tok}
        </span>
      );
    if (KEYWORDS.has(tok))
      return (
        <span key={i} className={styles.tokenKeyword}>
          {tok}
        </span>
      );
    if (/^\d+(\.\d+)?$/.test(tok))
      return (
        <span key={i} className={styles.tokenNumber}>
          {tok}
        </span>
      );
    if (/^[A-Z][A-Za-z0-9]*$/.test(tok))
      return (
        <span key={i} className={styles.tokenType}>
          {tok}
        </span>
      );
    return <span key={i}>{tok}</span>;
  });
}
