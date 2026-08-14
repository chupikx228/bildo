export interface Attachment {
  id: string;
  name: string;
  kind: "image" | "file";
  size: number;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|heic)$/i;

export function toAttachments(list: FileList | File[] | null, kind?: Attachment["kind"]): Attachment[] {
  if (!list) return [];
  return Array.from(list).map((f) => ({
    id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
    name: f.name,
    kind: kind ?? (f.type.startsWith("image/") || IMAGE_RE.test(f.name) ? "image" : "file"),
    size: f.size,
  }));
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
