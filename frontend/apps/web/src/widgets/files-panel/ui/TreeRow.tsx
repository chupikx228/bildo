import type { TreeNode } from "@/shared/lib";
import { FileRow } from "./FileRow";
import { ChevronIcon, FolderIcon } from "./icons";
import { CHEVRON, CHEVRON_OPEN, DIR_ROW, FOLDER_ICON, ROW_NAME } from "./classes";

export function TreeRow({
  node,
  depth,
  collapsed,
  activePath,
  onToggle,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  if (node.kind === "file") {
    return (
      <FileRow
        name={node.name}
        depth={depth}
        size={node.size}
        active={node.path === activePath}
        onClick={() => onOpen(node.path)}
      />
    );
  }

  const isCollapsed = collapsed.has(node.path);
  return (
    <>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className={DIR_ROW}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <ChevronIcon className={`${CHEVRON} ${!isCollapsed ? CHEVRON_OPEN : ""}`} />
        <FolderIcon className={FOLDER_ICON} />
        <span className={ROW_NAME}>{node.name}</span>
      </button>
      {!isCollapsed &&
        node.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            collapsed={collapsed}
            activePath={activePath}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
    </>
  );
}
