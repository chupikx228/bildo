import { readFileSync } from "node:fs";
import { appDocumentSchema } from "../../frontend/packages/api/src/apps/model";
import { normalizeAppDocument } from "../../frontend/packages/api/src/apps/normalize";
import type { AppNode } from "../../frontend/packages/api/src/apps/model";

const path = process.env.HOME + "/mnt/bildo/.claude-scratch/design-test/habit-tracker-claude-freeform.json";
const raw = JSON.parse(readFileSync(path, "utf-8"));
const doc = appDocumentSchema.parse(raw);

const ids = new Set<string>();
let dupes: string[] = [];
function walk(n: AppNode) {
  if (ids.has(n.id)) dupes.push(n.id);
  ids.add(n.id);
  (n.children ?? []).forEach(walk);
}
doc.screens.forEach((s) => walk(s.root));
console.log("total node ids:", ids.size, "dupes:", dupes);

const normalized = normalizeAppDocument(doc);
console.log("normalize ok, screens:", normalized.screens.length);
console.log("root layouts:", normalized.screens.map((s) => JSON.stringify(s.root.layout)));
