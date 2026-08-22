import { describe, expect, it } from "vitest";
import { cloneNodeDeep, findAppNode, findParentNode, flattenAppNodes, insertChild, updateNodeById } from "./tree";
import type { AppNode } from "./model";

function tree(): AppNode {
  return {
    id: "root",
    type: "View",
    children: [
      { id: "a", type: "Text", props: { text: "A" }, layout: { x: 10, y: 20, width: 100, height: 30 } },
      {
        id: "b",
        type: "View",
        children: [{ id: "b1", type: "Button", props: { text: "B1" } }],
      },
    ],
  };
}

describe("flattenAppNodes", () => {
  it("returns every node depth-first including the root", () => {
    expect(flattenAppNodes(tree()).map((n) => n.id)).toEqual(["root", "a", "b", "b1"]);
  });

  it("returns a single element for a leaf", () => {
    expect(flattenAppNodes({ id: "x", type: "Spacer" })).toHaveLength(1);
  });
});

describe("findAppNode", () => {
  it("finds the root, a nested node, and reports a miss", () => {
    const root = tree();
    expect(findAppNode(root, "root")?.id).toBe("root");
    expect(findAppNode(root, "b1")?.type).toBe("Button");
    expect(findAppNode(root, "nope")).toBeNull();
  });
});

describe("findParentNode", () => {
  it("returns the direct parent", () => {
    expect(findParentNode(tree(), "a")?.id).toBe("root");
    expect(findParentNode(tree(), "b1")?.id).toBe("b");
  });

  it("returns null for the root and for unknown ids", () => {
    expect(findParentNode(tree(), "root")).toBeNull();
    expect(findParentNode(tree(), "ghost")).toBeNull();
  });
});

describe("updateNodeById", () => {
  it("shallow-merges props, style and layout instead of replacing them", () => {
    const updated = updateNodeById(tree(), "a", { props: { placeholder: "P" }, layout: { x: 99 } as never });
    const a = findAppNode(updated, "a")!;
    expect(a.props).toEqual({ text: "A", placeholder: "P" });
    expect(a.layout).toEqual({ x: 99, y: 20, width: 100, height: 30 });
  });

  it("updates a deeply nested node and leaves siblings untouched", () => {
    const updated = updateNodeById(tree(), "b1", { name: "Renamed" });
    expect(findAppNode(updated, "b1")?.name).toBe("Renamed");
    expect(findAppNode(updated, "a")?.name).toBeUndefined();
  });

  it("returns an equivalent tree when the id is absent", () => {
    expect(updateNodeById(tree(), "missing", { name: "x" })).toEqual(tree());
  });
});

describe("insertChild", () => {
  const child: AppNode = { id: "new", type: "Spacer" };

  it("appends when no index is given", () => {
    const root = insertChild(tree(), "root", child);
    expect(root.children?.map((c) => c.id)).toEqual(["a", "b", "new"]);
  });

  it("splices at the requested index", () => {
    const root = insertChild(tree(), "root", child, 1);
    expect(root.children?.map((c) => c.id)).toEqual(["a", "new", "b"]);
  });

  it("appends when the index is out of range", () => {
    const root = insertChild(tree(), "root", child, 99);
    expect(root.children?.at(-1)?.id).toBe("new");
  });

  it("inserts into a nested container", () => {
    const root = insertChild(tree(), "b", child);
    expect(findAppNode(root, "b")?.children?.map((c) => c.id)).toEqual(["b1", "new"]);
  });
});

describe("cloneNodeDeep", () => {
  it("assigns fresh ids at every depth", () => {
    const clone = cloneNodeDeep(findAppNode(tree(), "b")!);
    expect(clone.id).not.toBe("b");
    expect(clone.children?.[0]?.id).not.toBe("b1");
  });

  it("offsets the top-level layout but keeps children in place", () => {
    const clone = cloneNodeDeep(findAppNode(tree(), "a")!, 16);
    expect(clone.layout).toMatchObject({ x: 26, y: 36, width: 100, height: 30 });
  });

  it("preserves a node without layout", () => {
    const clone = cloneNodeDeep({ id: "x", type: "Spacer" });
    expect(clone.layout).toBeUndefined();
    expect(clone.id).not.toBe("x");
  });

  it("produces a structural copy, not a reference to the source", () => {
    const source = findAppNode(tree(), "b")!;
    const clone = cloneNodeDeep(source);
    expect(clone.children).not.toBe(source.children);
    expect(clone.type).toBe("View");
  });
});
