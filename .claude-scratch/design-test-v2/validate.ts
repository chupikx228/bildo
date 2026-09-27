import { readFileSync } from "node:fs";
import { appDocumentSchema } from "../../frontend/packages/api/src/apps/model";
import { normalizeAppDocument } from "../../frontend/packages/api/src/apps/normalize";
import type { AppNode } from "../../frontend/packages/api/src/apps/model";

const path = process.env.HOME + "/mnt/bildo/.claude-scratch/design-test-v2/habit-tracker-v2-prompt-expansion.json";
const raw = JSON.parse(readFileSync(path, "utf-8"));
const result = appDocumentSchema.safeParse(raw);
if (!result.success) {
  console.error("INVALID");
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}
console.log("VALID");
const doc = result.data;
console.log("screens:", doc.screens.map((s) => `${s.name} (${s.route})`).join(", "));

const ids = new Set<string>();
let dupes: string[] = [];
function walk(n: AppNode) { if (ids.has(n.id)) dupes.push(n.id); ids.add(n.id); (n.children ?? []).forEach(walk); }
doc.screens.forEach((s) => walk(s.root));
console.log("node ids:", ids.size, "dupes:", dupes);

const normalized = normalizeAppDocument(doc);
console.log("normalize ok, screens:", normalized.screens.length);
