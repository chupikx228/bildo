import { beforeEach, describe, expect, it } from "vitest";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, DEFAULT_APP_THEME, findAppNode, type AppDocument } from "@bildo/api";
import { useAppDocumentStore } from "./store";

function makeDoc(): AppDocument {
  const now = new Date().toISOString();
  return {
    id: "app1",
    name: "Test App",
    theme: DEFAULT_APP_THEME,
    navigation: { type: "stack", roots: ["s1"] },
    screens: [
      {
        id: "s1",
        name: "Home",
        route: "index",
        root: {
          id: "root1",
          type: "View",
          name: "Root",
          layout: { x: 0, y: 0, width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT },
          children: [
            {
              id: "n1",
              type: "Text",
              name: "Hello",
              props: { text: "Hello" },
              layout: { x: 16, y: 24, width: 120, height: 36 },
            },
            { id: "n2", type: "Text", name: "Hidden", hidden: true, layout: { x: 16, y: 80, width: 120, height: 36 } },
          ],
        },
      },
    ],
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

const s = () => useAppDocumentStore.getState();
const rootOf = (screenId = "s1") => s().document!.screens.find((sc) => sc.id === screenId)!.root;

beforeEach(() => {
  s().setDocument(makeDoc());
});

describe("setDocument (document + selection + history reset)", () => {
  it("loads the document and selects the first screen", () => {
    expect(s().document?.name).toBe("Test App");
    expect(s().selectedScreenId).toBe("s1");
    expect(s().selectedNodeId).toBeNull();
    expect(s().selectedNodeIds).toEqual([]);
  });

  it("resets history and marks the document as saved", () => {
    expect(s().past).toEqual([]);
    expect(s().future).toEqual([]);
    expect(s().aiBatch).toBe(false);
    expect(s().saveStatus).toBe("saved");
  });

  it("clears history left over from a previous document", () => {
    s().renameApp("Edited");
    expect(s().past.length).toBe(1);
    s().setDocument(makeDoc());
    expect(s().past).toEqual([]);
  });
});

describe("setRevision (optimistic locking)", () => {
  it("stores the revision returned by the server", () => {
    expect(s().document?.revision).toBe(1);
    s().setRevision(2);
    expect(s().document?.revision).toBe(2);
  });

  it("keeps local unsaved edits made while the save was in flight", () => {
    s().renameApp("Edited while saving");
    const before = s().document!;
    s().setRevision(7);
    const after = s().document!;
    expect(after.name).toBe("Edited while saving");
    expect(after.screens).toEqual(before.screens);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("does not push a history entry", () => {
    const past = s().past.length;
    s().setRevision(3);
    expect(s().past.length).toBe(past);
    expect(s().future).toEqual([]);
  });

  it("is a no-op without a document", () => {
    useAppDocumentStore.setState({ document: null });
    s().setRevision(5);
    expect(s().document).toBeNull();
  });
});

describe("selection slice", () => {
  it("selects a visible node", () => {
    s().selectNode("n1");
    expect(s().selectedNodeId).toBe("n1");
    expect(s().selectedNodeIds).toEqual(["n1"]);
  });

  it("ignores hidden nodes and the screen root", () => {
    s().selectNode("n2");
    expect(s().selectedNodeId).toBeNull();
    s().selectNode("root1");
    expect(s().selectedNodeId).toBeNull();
  });

  it("toggles additive selection", () => {
    s().selectNode("n1");
    s().selectNode("n1", { additive: true });
    expect(s().selectedNodeIds).toEqual([]);
  });

  it("clearSelection drops nodes but keeps the screen", () => {
    s().selectNode("n1");
    s().clearSelection();
    expect(s().selectedNodeId).toBeNull();
    expect(s().selectedScreenId).toBe("s1");
  });
});

describe("nodes slice", () => {
  it("adds a component into a container and selects it", () => {
    const ok = s().addComponent("s1", "root1", "Button");
    expect(ok).toBe(true);
    const id = s().selectedNodeId!;
    expect(findAppNode(rootOf(), id)?.type).toBe("Button");
  });

  it("refuses to nest into a non-container", () => {
    const ok = s().addComponent("s1", "n1", "Button");
    expect(ok).toBe(false);
    expect(s().lastErrors).toContain("Сюда нельзя вложить компонент");
  });

  it("updates node props and blocks locked nodes", () => {
    s().updateNode("s1", "n1", { locked: true });
    s().updateNode("s1", "n1", { name: "Nope" });
    expect(findAppNode(rootOf(), "n1")?.name).toBe("Hello");
    expect(s().lastErrors).toContain("Слой закреплён");
  });

  it("sets node text", () => {
    s().setNodeText("s1", "n1", "Updated");
    expect(findAppNode(rootOf(), "n1")?.props?.text).toBe("Updated");
  });

  it("clamps layout inside the parent bounds", () => {
    s().setNodeLayout("s1", "n1", { x: 9999, y: 24, width: 120, height: 36 });
    const layout = findAppNode(rootOf(), "n1")!.layout!;
    expect(layout.x).toBeLessThanOrEqual(APP_STAGE_WIDTH - layout.width);
  });

  it("removes a node and refuses to remove the root", () => {
    s().removeNode("s1", "n1");
    expect(findAppNode(rootOf(), "n1")).toBeNull();
    s().removeNode("s1", "root1");
    expect(s().lastErrors).toContain("Нельзя удалить корень экрана");
  });

  it("removeSelected deletes the current selection (cross-slice get().removeNode)", () => {
    s().selectNode("n1");
    s().removeSelected();
    expect(findAppNode(rootOf(), "n1")).toBeNull();
  });
});

describe("clipboard slice", () => {
  it("copies and pastes a node into the tree", () => {
    const before = rootOf().children!.length;
    s().selectNode("n1");
    s().copySelected();
    expect(s().clipboard?.type).toBe("Text");
    s().pasteClipboard();
    expect(rootOf().children!.length).toBe(before + 1);
    const pastedId = s().selectedNodeId!;
    expect(pastedId).not.toBe("n1");
    expect(findAppNode(rootOf(), pastedId)?.type).toBe("Text");
  });
});

describe("screens slice", () => {
  it("adds a screen and selects it", () => {
    const id = s().addScreen("Second");
    expect(id).not.toBeNull();
    expect(s().document!.screens.length).toBe(2);
    expect(s().selectedScreenId).toBe(id);
  });

  it("removes a screen but keeps at least one", () => {
    const id = s().addScreen("Second")!;
    s().removeScreen(id);
    expect(s().document!.screens.length).toBe(1);
    s().removeScreen("s1");
    expect(s().document!.screens.length).toBe(1);
    expect(s().lastErrors).toContain("Нужен хотя бы один экран");
  });

  it("renames a screen", () => {
    s().renameScreen("s1", "Renamed");
    expect(s().document!.screens[0]!.name).toBe("Renamed");
  });
});

describe("history slice", () => {
  it("undo and redo restore the document (cross-slice snapshots)", () => {
    s().renameApp("Renamed");
    expect(s().document!.name).toBe("Renamed");
    expect(s().past.length).toBe(1);

    s().undo();
    expect(s().document!.name).toBe("Test App");
    expect(s().future.length).toBe(1);

    s().redo();
    expect(s().document!.name).toBe("Renamed");
  });

  it("coalesces rapid edits sharing a key into one history entry", () => {
    s().setNodeLayout("s1", "n1", { x: 30, y: 24, width: 120, height: 36 }, true);
    s().setNodeLayout("s1", "n1", { x: 50, y: 24, width: 120, height: 36 }, true);
    expect(s().past.length).toBe(1);
    expect(findAppNode(rootOf(), "n1")?.layout?.x).toBe(50);
  });

  it("collapses an AI batch into a single undoable checkpoint", () => {
    expect(s().past.length).toBe(0);
    s().beginAiTurn();
    s().renameApp("A");
    s().setNodeText("s1", "n1", "X");
    s().renameApp("B");
    s().endAiTurn();
    expect(s().past.length).toBe(1);
    expect(s().document!.name).toBe("B");
    expect(findAppNode(rootOf(), "n1")?.props?.text).toBe("X");

    s().undo();
    expect(s().document!.name).toBe("Test App");
    expect(findAppNode(rootOf(), "n1")?.props?.text).toBe("Hello");

    s().redo();
    expect(s().document!.name).toBe("B");
    expect(findAppNode(rootOf(), "n1")?.props?.text).toBe("X");
  });
});

describe("clearErrors", () => {
  it("clears a lingering guard error", () => {
    const id = s().addScreen("Second")!;
    s().removeScreen(id);
    s().removeScreen("s1");
    expect(s().lastErrors.length).toBeGreaterThan(0);

    s().clearErrors();
    expect(s().lastErrors).toEqual([]);
  });
});
