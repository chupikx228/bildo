import { current, isDraft, type Draft } from "immer";
import { nanoid } from "nanoid";
import type { AppNode, AppNodeLayout, AppNodeProps, AppNodeStyle } from "./model";

export type AppNodePatch = Partial<Omit<AppNode, "props" | "style" | "layout">> & {
  props?: Partial<AppNodeProps>;
  style?: Partial<AppNodeStyle>;
  layout?: Partial<AppNodeLayout>;
};

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

function mergeBag<T extends object>(base: T | undefined, patch: Partial<T> | undefined): T | undefined {
  if (!patch) return base;
  if (!base) return patch as T;
  return { ...base, ...patch };
}

export function updateNodeById(root: AppNode, id: string, patch: AppNodePatch): AppNode {
  if (root.id === id) {
    return {
      ...root,
      ...patch,
      props: mergeBag(root.props, patch.props),
      style: mergeBag(root.style, patch.style),
      layout: mergeBag(root.layout, patch.layout),
    };
  }
  if (!root.children?.length) return root;
  return {
    ...root,
    children: root.children.map((c) => updateNodeById(c, id, patch)),
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
