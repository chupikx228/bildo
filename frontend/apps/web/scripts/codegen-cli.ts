import type { AppDocument } from "@bildo/api";
import { codegenExpoProject } from "../src/entities/app-document/lib/codegen.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) fail("codegen-cli: empty stdin, expected an AppDocument as JSON");

  let document: AppDocument;
  try {
    document = JSON.parse(raw) as AppDocument;
  } catch (error) {
    fail(`codegen-cli: invalid JSON on stdin: ${error instanceof Error ? error.message : String(error)}`);
  }

  const files = codegenExpoProject(document);
  process.stdout.write(JSON.stringify({ files }));
}

main().catch((error: unknown) => {
  fail(`codegen-cli: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
});
