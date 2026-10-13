#!/usr/bin/env node
// consort-check-testlist: the SELF-CHECK a fan-out sub-agent (a per-kind analyst or the assembler) runs
// on its OWN produced items BEFORE it returns — the per-sub-agent analogue of the test-strategist's
// consort-response-formatter. It validates a JSON array of test-list items against the story's contract:
// shape (id/description/ac_id/status/kind), every ac_id is one of the story's EXACT ac ids (catches the
// truncation/mis-tag at the source), and — with --ordered (the assembler) — full AC coverage + unique
// feature-flat T-ids. Exits 0 "ok", else non-zero with a numbered problem list the sub-agent fixes +
// re-checks until clean. This moves correctness from a downstream whole-fan-out failure to the source.
//
// Usage: consort-check-testlist --feature <F> --story <S> --file <path> [--ordered] [--project-dir <d>]
//   The file may be a bare JSON array, a { "items": [...] } object, or an agent reply containing a
//   fenced ```json ... ``` array (so the sub-agent can check the exact text it is about to return).

import { existsSync, readFileSync } from "node:fs";
import { resolveConsortDir, storyAcIds, readAcLayer } from "../../consort/config/consort-paths.js";
import { extractJsonArray, validateTestlistItems } from "../../consort/test-list/fan-out-plan.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Parse the sub-agent's items from the file: a bare array, { items: [...] }, or a fenced reply. */
function readItems(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)) {
      return (parsed as { items: unknown[] }).items;
    }
  } catch {
    /* not plain JSON — fall through to the fenced-block extractor */
  }
  return extractJsonArray(raw); // throws if there is no fenced json array either
}

function main(): number {
  const featureId = arg("--feature");
  const story = arg("--story");
  const file = arg("--file");
  const ordered = process.argv.includes("--ordered");
  const projectDir = arg("--project-dir") ?? process.cwd();
  if (!featureId || !story || !file) {
    process.stderr.write("usage: consort-check-testlist --feature <F> --story <S> --file <path> [--ordered] [--project-dir <d>]\n");
    return 2;
  }
  if (!existsSync(file)) {
    process.stderr.write(`consort-check-testlist: file not found: ${file} (write your draft items there first)\n`);
    return 2;
  }
  const consortDir = resolveConsortDir(projectDir);
  const storyAcs = storyAcIds(consortDir, featureId, story);
  // Per-AC layer, so the check can require an E2E-layer AC's client test to be a real Playwright e2e spec.
  const acLayers: Record<string, string | undefined> = {};
  for (const ac of storyAcs) acLayers[ac] = readAcLayer(consortDir, featureId, ac);
  let items: unknown;
  try {
    items = readItems(readFileSync(file, "utf8"));
  } catch (e) {
    process.stderr.write(`FAIL: could not read a JSON array of items from ${file}: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
  const problems = validateTestlistItems(items, storyAcs, { ordered, acLayers });
  if (problems.length === 0) {
    process.stdout.write(`ok: ${(items as unknown[]).length} ${ordered ? "ordered " : ""}items, every ac_id valid${ordered ? " + full coverage" : ""} (story ${story}).\n`);
    return 0;
  }
  process.stderr.write(
    `FAIL (${problems.length} problem(s)) — fix these and re-run before you return your JSON:\n` +
      problems.map((p, i) => `  ${i + 1}. ${p}`).join("\n") +
      "\n",
  );
  return 1;
}

process.exit(main());
