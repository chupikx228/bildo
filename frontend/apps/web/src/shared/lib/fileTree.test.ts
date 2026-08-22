import { describe, expect, it } from "vitest";
import { buildFileTree, fileAccent, type TreeDir, type TreeFile } from "./fileTree";

describe("buildFileTree", () => {
  it("returns an empty array for no files", () => {
    expect(buildFileTree({})).toEqual([]);
  });

  it("places a single root-level file with its byte length as size", () => {
    const tree = buildFileTree({ "a.ts": "hello" });
    expect(tree).toHaveLength(1);
    const file = tree[0] as TreeFile;
    expect(file.kind).toBe("file");
    expect(file.size).toBe(5);
    expect(file.path).toBe("a.ts");
  });

  it("nests files under directories and records the directory path", () => {
    const tree = buildFileTree({ "app/index.tsx": "x", "app/lib/util.ts": "yy" });
    const app = tree[0] as TreeDir;
    expect(app.kind).toBe("dir");
    expect(app.path).toBe("app");
    const lib = app.children.find((c) => c.name === "lib") as TreeDir;
    expect(lib.path).toBe("app/lib");
    expect((lib.children[0] as TreeFile).size).toBe(2);
  });

  it("sorts directories before files, each alphabetically", () => {
    const tree = buildFileTree({ "z.ts": "1", "b.ts": "1", "app/x.ts": "1" });
    expect(tree.map((n) => n.name)).toEqual(["app", "b.ts", "z.ts"]);
    expect(tree[0]?.kind).toBe("dir");
  });

  it("does not duplicate a shared directory across sibling files", () => {
    const tree = buildFileTree({ "app/a.ts": "1", "app/b.ts": "1" });
    expect(tree).toHaveLength(1);
    expect((tree[0] as TreeDir).children).toHaveLength(2);
  });
});

describe("fileAccent", () => {
  it("colors known extensions and falls back for the rest", () => {
    expect(fileAccent("a.ts")).toBe("#3B82F6");
    expect(fileAccent("a.tsx")).toBe("#3B82F6");
    expect(fileAccent("package.json")).toBe("#D97706");
    expect(fileAccent("README.md")).toBe("#8A8A96");
    expect(fileAccent("logo.png")).toBe("#16A34A");
    expect(fileAccent("icon.svg")).toBe("#16A34A");
    expect(fileAccent("Makefile")).toBe("#8A8A96");
  });
});
