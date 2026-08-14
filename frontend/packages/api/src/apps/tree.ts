import { current, isDraft, type Draft } from "immer";
import { nanoid } from "nanoid";
import type { AppNode, AppScreen } from "./model";

function plainClone<T>(value: T): T {
  const plain = isDraft(value) ? current(value as Draft<T>) : value;
  return JSON.parse(JSON.stringify(plain)) as T;
}

export function flattenAppNodes(root: AppNode): AppNode[] {
  const out: AppNode[] = [];
  const walk = (n: AppNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  walk(root);
  return out;
}

export function findAppNode(root: AppNode, id: string): AppNode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findAppNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export function findParentNode(root: AppNode, id: string): AppNode | null {
  for (const c of root.children ?? []) {
    if (c.id === id) return root;
    const hit = findParentNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export function updateNodeById(root: AppNode, id: string, patch: Partial<AppNode>): AppNode {
  if (root.id === id) {
    return {
      ...root,
      ...patch,
      props: patch.props ? { ...root.props, ...patch.props } : root.props,
      style: patch.style ? { ...root.style, ...patch.style } : root.style,
      layout: patch.layout ? { ...root.layout, ...patch.layout } : root.layout,
    };
  }
  if (!root.children?.length) return root;
  return {
    ...root,
    children: root.children.map((c) => updateNodeById(c, id, patch)),
  };
}

export function removeNodeById(root: AppNode, id: string): AppNode {
  if (!root.children?.length) return root;
  return {
    ...root,
    children: root.children.filter((c) => c.id !== id).map((c) => removeNodeById(c, id)),
  };
}

export function insertChild(root: AppNode, parentId: string, child: AppNode, index?: number): AppNode {
  if (root.id === parentId) {
    const kids = [...(root.children ?? [])];
    if (index === undefined || index < 0 || index > kids.length) kids.push(child);
    else kids.splice(index, 0, child);
    return { ...root, children: kids };
  }
  if (!root.children?.length) return root;
  return {
    ...root,
    children: root.children.map((c) => insertChild(c, parentId, child, index)),
  };
}

export function reorderChild(root: AppNode, parentId: string, fromIndex: number, toIndex: number): AppNode {
  if (root.id === parentId) {
    const kids = [...(root.children ?? [])];
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= kids.length || toIndex >= kids.length || fromIndex === toIndex) {
      return root;
    }
    const [item] = kids.splice(fromIndex, 1);
    if (!item) return root;
    kids.splice(toIndex, 0, item);
    return { ...root, children: kids };
  }
  if (!root.children?.length) return root;
  return {
    ...root,
    children: root.children.map((c) => reorderChild(c, parentId, fromIndex, toIndex)),
  };
}

export function cloneNodeDeep(node: AppNode, offset = 16): AppNode {
  const id = nanoid(8);
  const base = plainClone(node);
  return {
    ...base,
    id,
    layout: base.layout
      ? {
          ...base.layout,
          x: base.layout.x + offset,
          y: base.layout.y + offset,
        }
      : base.layout,
    children: base.children?.map((c) => cloneNodeDeep(c, 0)),
  };
}

export function patchScreenRoot(screen: AppScreen, root: AppNode): AppScreen {
  return { ...screen, root };
}
