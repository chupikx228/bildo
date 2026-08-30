import type { AppDocument } from "@bildo/api";
import { codegenExpoProject } from "@/entities/app-document";
import type { Diff } from "./planner";

export interface ChatDiff {
  diff: Diff[];
  files: { path: string; stat: string }[];
}

function lineCount(source: string): number {
  if (source === "") return 0;
  return source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
}

export function chatDiff(current: AppDocument, proposed: AppDocument): ChatDiff {
  const before = codegenExpoProject(current);
  const after = codegenExpoProject(proposed);
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  const files: { path: string; stat: string }[] = [];
  let added = 0;
  let modified = 0;
  let removed = 0;

  for (const path of paths) {
    const a = before[path];
    const b = after[path];
    if (a === b) continue;
    if (a === undefined) {
      added++;
      files.push({ path, stat: `+${lineCount(b ?? "")}` });
    } else if (b === undefined) {
      removed++;
      files.push({ path, stat: `−${lineCount(a)}` });
    } else {
      modified++;
      files.push({ path, stat: "~" });
    }
  }

  const diff: Diff[] = [];
  if (added) diff.push({ label: `+${added} файл.`, tone: "add" });
  if (modified) diff.push({ label: `~${modified} файл.`, tone: "mod" });
  if (removed) diff.push({ label: `−${removed} файл.`, tone: "del" });

  return { diff, files };
}
