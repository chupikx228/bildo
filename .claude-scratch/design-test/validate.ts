import { readFileSync } from "node:fs";
import { appDocumentSchema } from "../../frontend/packages/api/src/apps/model";

const raw = JSON.parse(readFileSync("/sessions/rcw-01rxn1v9qtqzhmyj1uxv9unl/mnt/bildo/.claude-scratch/design-test/habit-tracker-claude-freeform.json", "utf-8"));
const result = appDocumentSchema.safeParse(raw);

if (!result.success) {
  console.error("INVALID");
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
} else {
  console.log("VALID");
  console.log("screens:", result.data.screens.map((s) => `${s.name} (${s.route})`).join(", "));
  console.log("nav roots:", result.data.navigation.roots.join(", "));
}
