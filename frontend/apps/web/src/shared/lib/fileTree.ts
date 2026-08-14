export interface TreeDir {
  kind: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}

export interface TreeFile {
  kind: "file";
  name: string;
  path: string;
  size: number;
}

export type TreeNode = TreeDir | TreeFile;

export function buildFileTree(files: Record<string, string>): TreeNode[] {
  const root: TreeDir = { kind: "dir", name: "", path: "", children: [] };

  for (const path of Object.keys(files).sort()) {
    const parts = path.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i]!;
      const dirPath = parts.slice(0, i + 1).join("/");
      let next = dir.children.find((c): c is TreeDir => c.kind === "dir" && c.name === name);
      if (!next) {
        next = { kind: "dir", name, path: dirPath, children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({
      kind: "file",
      name: parts[parts.length - 1]!,
      path,
      size: files[path]!.length,
    });
  }

  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.kind === "dir") sort(n.children);
    return nodes;
  };

  return sort(root.children);
}

export function fileAccent(name: string): string {
  if (/\.tsx?$/.test(name)) return "#3B82F6";
  if (name.endsWith(".json")) return "#D97706";
  if (/\.(md|txt)$/.test(name)) return "#8A8A96";
  if (/\.(png|jpe?g|svg)$/.test(name)) return "#16A34A";
  return "#8A8A96";
}
