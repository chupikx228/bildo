import type { Attachment } from "@/shared/attachments";

export type DiffTone = "add" | "mod" | "del";
export interface Diff {
  label: string;
  tone: DiffTone;
}
export type ProposalKind = "theme" | "asset3d" | "screen" | "component";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  commitTitle: string;
  note: string;
  diff: Diff[];
  files: { path: string; stat: string }[];
  command?: string;
  swatches?: string[];
  assetName?: string;
}

export interface Commit {
  hash: string;
  title: string;
  files: { path: string; stat: string }[];
  diff: Diff[];
}

export type Turn =
  | { id: string; role: "user"; text: string; attachments?: Attachment[] }
  | { id: string; role: "ai"; text: string; proposal?: Proposal }
  | { id: string; role: "typing" }
  | { id: string; role: "commit"; commit: Commit }
  | { id: string; role: "note"; text: string };

let seq = 0;
export const uid = (p: string) => `${p}-${++seq}`;

export function shortHash(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(6, "0").slice(0, 6);
}
