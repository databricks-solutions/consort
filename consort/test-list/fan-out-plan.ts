// Fan-out plan: the PURE helpers the deterministic test-analyst fan-out bin
// (bin/consort/fan-out-analysts.cli.ts) consumes. The subprocess orchestration lives in
// the bin; the project-shaped decisions (which analysts, which inputs, which prompt, how
// ids number) live here, pure + unit-testable.
//
// Locked (b) design: the orchestrator hands the test-strategist a bin to RUN (not a Task
// roster to spawn at the LLM's discretion); the bin spawns the ENABLED kind analysts
// (behavior/fitness/client — unordered slices) then the ASSEMBLER (reconcile + order +
// assign feature-flat T-ids). The ANALYST, never the supervisor, produces the ordered
// list. Uniform: single-kind stories just run fewer kind analysts; the assembler always
// orders. The test_list gate (B4) hard-blocks if the bin's ordered-list artifact is absent.

import { join } from "node:path";
import { acsDir, architectureJson, dbDesignJson, designGuideJson, iaMd, storyDir } from "../config/consort-paths.js";
import { isFixedKeyE2eCreateFlow } from "../orchestrator/validators/conformance/artifact-conformance.js";
import {
  enabledAnalysts,
  type AnalystInput,
  type AnalystEnablementContext,
  type TestAnalystCatalogueEntry,
} from "./test-analyst-catalogue.js";

export interface FanOutLoc {
  consortDir: string;
  projectDir: string;
  featureId: string;
  story: string;
}

/** The ordered-list artifact the bin WRITES and the test_list gate ASSERTS (B4). One per story. */
export const analystOrderedJson = (consortDir: string, f: string, s: string): string =>
  join(storyDir(consortDir, f, s), "analyst-ordered.json");

/** The PRESERVED sidecar a SCOPED revise (B) leaves behind: the ordered items for the ACs the reflect
 *  finding did NOT flag, with their original ids. The bin reads it, re-derives ONLY the now-uncovered
 *  (flagged) ACs, and MERGES — so a scoped revise keeps the good items + their ids instead of ditching
 *  the whole list. Absent ⇒ the bin does a full fan-out (first authoring / a full/coupled revise). */
export const analystOrderedPreservedJson = (consortDir: string, f: string, s: string): string =>
  join(storyDir(consortDir, f, s), "analyst-ordered.preserved.json");

/** Informational mode label: >=2 enabled kinds = "multi", else "single". The bin runs the enabled
 *  kind analysts (1 or N) + the assembler EITHER WAY (uniform); the label is for logging/the directive. */
export function fanOutMode(ctx: AnalystEnablementContext): "multi" | "single" {
  return enabledAnalysts(ctx).length >= 2 ? "multi" : "single";
}

/** Is the BEHAVIOR analyst (API/service-observable scenario tests) warranted for this story? If NOT,
 *  spawning it is a wasteful `claude -p` that returns 0 (observed on read-only, all-E2E stories S2/S3).
 *  It IS warranted when the story has backend behavior to assert: an API/Infra-layer AC, OR a schema
 *  change (it writes), OR a write/mutation verb in any AC's architect notes. We ERR TOWARD KEEPING — any
 *  of those signals keeps behavior — so a write story can never silently lose its API-scenario coverage
 *  (e.g. S1 is all-E2E in its final state yet writes, so its schema_changes/notes keep behavior). Only a
 *  demonstrably read-only story (no backend-layer AC, no schema change, no write verb) skips it. */
export function behaviorWarranted(
  acLayers: ReadonlyArray<string | undefined>,
  acNotes: ReadonlyArray<string | undefined>,
  hasSchemaChanges: boolean,
): boolean {
  if (acLayers.some((l) => l === "API" || l === "Infra")) return true;
  if (hasSchemaChanges) return true;
  const WRITE = /\b(POST|PUT|PATCH|DELETE|INSERT|UPSERT|mutat)/i;
  return acNotes.some((n) => typeof n === "string" && WRITE.test(n));
}

/** Resolve an analyst input kind to the on-disk path(s) that analyst should READ (it has the Read tool). */
export function analystInputPaths(input: AnalystInput, loc: FanOutLoc): string[] {
  switch (input) {
    case "story-acs":
      return [acsDir(loc.consortDir, loc.featureId, loc.story)];
    case "architecture-invariants":
      return [architectureJson(loc.consortDir, loc.featureId)];
    case "db-design":
      return [dbDesignJson(loc.consortDir, loc.featureId)];
    case "design-guide":
      return [designGuideJson(loc.consortDir), iaMd(loc.consortDir)];
  }
}

/** Restate the per-analyst levers in prose (claude -p takes no effort/tool params, so the analyst
 *  self-paces/self-limits on the instruction — same convention the old roster render used). */
function leverPreamble(entry: { effort?: string; toolScope?: string[] }): string {
  const parts: string[] = [];
  if (entry.effort && entry.effort !== "default") parts.push(`Think at ${entry.effort} effort.`);
  if (entry.toolScope?.length) parts.push(`Confine your work to these tools: ${entry.toolScope.join(", ")}.`);
  return parts.length ? parts.join(" ") + " " : "";
}

/** The sub-agents (kind analysts + assembler) run as headless `claude -p` subprocesses the bin spawns,
 *  so their reasoning NEVER reaches the drive's turn transcript — the fan-out is a black box when one
 *  under-produces (behavior=0) or truncates/mis-tags an ac_id (observed: repeated FAILED runs with no
 *  trace of WHY). This directive makes each sub-agent record, via the kit logging CLI, exactly what it
 *  produced — per-AC counts + the EXACT ac_id string it tagged each item with + why it omitted anything —
 *  so a failed/thin run is debuggable from .consort/agent-log.jsonl. The bin grants Bash for this; the
 *  logging command is permitted ALONGSIDE the Read tools. */
/** The SELF-CHECK a sub-agent runs on its OWN items before returning — the per-sub-agent analogue of
 *  the test-strategist's consort-response-formatter. It writes a draft, validates it with
 *  consort-check-testlist (shape + every ac_id is a full story AC id + — ordered — coverage/T-ids), and
 *  fixes until clean, so a bad ac_id / coverage gap is caught at the SOURCE instead of failing the whole
 *  fan-out. `ordered` is true only for the assembler (its list must cover every AC + carry T-ids). */
export function analystSelfCheckDirective(loc: FanOutLoc, label: string, ordered: boolean): string {
  const scratch = join(storyDir(loc.consortDir, loc.featureId, loc.story), `.selfcheck-${label.replace(/[^a-z0-9]+/gi, "-")}.json`);
  return (
    `\n\nSELF-CHECK (REQUIRED) before you call this complete: (1) write your draft JSON array to ${scratch} ` +
    `(a Bash heredoc is fine); (2) run as its own command (granted standalone, headless): ` +
    `./scripts/lk consort-check-testlist --feature ${loc.featureId} --story ${loc.story} --file ${scratch}${ordered ? " --ordered" : ""}; ` +
    `(3) FIX every problem it lists — most often an ac_id that is not the FULL story AC id — and re-run until ` +
    `it prints "ok"; (4) ONLY THEN return that validated array as your final fenced \`\`\`json block. Do NOT ` +
    `return items that have not passed this check.`
  );
}

export function analystLoggingDirective(loc: FanOutLoc, label: string): string {
  return (
    `\n\nOBSERVABILITY (REQUIRED): before you return your JSON, log what you tried so the fan-out is not a ` +
    `black box. Run this as its OWN command (headless; the kit logging CLI is granted standalone, in ` +
    `addition to Read): ./scripts/lk consort-log --role test-strategist --event reasoning --feature ` +
    `${loc.featureId} --message "[${label}] story ${loc.story}: <how many items you produced; the per-AC ` +
    `count (e.g. AC1-full-id=2, AC2-full-id=1); the EXACT ac_id STRING you tagged each item with, VERBATIM ` +
    `and never abbreviated so any truncation shows; every AC you produced 0 items for AND WHY (e.g. you ` +
    `deferred an E2E-layer AC to the client analyst); the inputs you read>". If you emit an EMPTY slice, ` +
    `the log MUST say why. State ac_ids in full — a truncated id is the bug we are hunting.`
  );
}

/** The EXACT story AC ids + their file paths, injected into every sub-agent prompt. ROOT-CAUSE FIX:
 *  the analysts are handed the acs/ DIRECTORY, but the Read tool cannot LIST a directory — only read a
 *  named file. Unable to enumerate the AC files, they INFERRED the ac_ids from architecture.json's
 *  realized_by (lossy, inconsistent) → truncated/mis-tagged ids → the coverage check saw ACs uncovered
 *  and the bin failed, run after run (confirmed in the sub-agent logs: "acs dir not listable; ids
 *  inferred from architecture.json realized_by"). Handing them the EXACT ids + file paths removes the
 *  guesswork: read these files, tag verbatim. Empty when storyAcs is unknown (the prompt still lists the
 *  dir, as before). */
export function exactAcIdsClause(storyAcs: string[], loc: FanOutLoc): string {
  if (storyAcs.length === 0) return "";
  const files = storyAcs.map((a) => join(acsDir(loc.consortDir, loc.featureId, loc.story), `${a}.json`));
  return (
    ` This story's EXACT acceptance-criterion ids are: ${storyAcs.join(", ")}. READ each AC from its own ` +
    `file (${files.join(", ")}) — the acs/ directory is NOT listable with the Read tool, so do NOT try to ` +
    `enumerate it and do NOT infer ac_ids from architecture.json realized_by. Tag every item's "ac_id" ` +
    `with one of the ids above COPIED VERBATIM — never abbreviate or truncate (e.g. "${storyAcs[0]}" is ` +
    `right; its leading "AC<n>" token alone is WRONG).`
  );
}

/** The full prompt for one KIND analyst: levers + story scope + the EXACT AC ids/files + the input paths
 *  + its focusPrompt (which already carries the unordered SLICE_CONTRACT). On a SCOPED re-derive,
 *  `targetAcs` limits authoring to just those ACs (the rest are already covered + preserved). */
export function buildKindAnalystPrompt(entry: TestAnalystCatalogueEntry, loc: FanOutLoc, storyAcs: string[], targetAcs?: string[]): string {
  const inputs = entry.inputs.flatMap((i) => analystInputPaths(i, loc));
  const scope =
    targetAcs && targetAcs.length > 0
      ? ` SCOPE: author items ONLY for these AC id(s): ${targetAcs.join(", ")} — the story's other ACs ` +
        `are already covered + preserved, so emit NOTHING for them.`
      : "";
  return (
    `${leverPreamble(entry)}You are analyzing story ${loc.story} of feature ${loc.featureId}.${scope}` +
    `${exactAcIdsClause(storyAcs, loc)} ` +
    `Read your inputs from disk: ${inputs.join(", ")}.\n\n${entry.focusPrompt}` +
    analystSelfCheckDirective(loc, `${entry.kind}-analyst`, false) +
    analystLoggingDirective(loc, `${entry.kind} analyst`)
  );
}

/** Merge a SCOPED re-derive's new items onto the preserved items: preserved first (original ids kept),
 *  then the newly-derived items (their fresh ids, already assigned past the master's highest). Pure. */
export function mergeOrdered(preserved: unknown[], fresh: unknown[]): unknown[] {
  return [...preserved, ...fresh];
}

/**
 * DETERMINISTIC fallback assembler. The LLM assembler (buildAssemblerPrompt → claude -p) MUST NOT be a
 * single point of failure for the lane: a model-side AUP safeguard false-positive makes `claude -p` exit 1
 * on an otherwise-benign reconcile prompt (observed live: "Sonnet's safeguards flagged this message …
 * [reasoning_extraction]"), content-sensitive so it recurs. When the LLM assembler fails for ANY reason,
 * the bin assembles the kind analysts' slices IN CODE — the analysts already succeeded and assembly is
 * mechanical: RECONCILE (drop exact (ac_id + normalized description) duplicates; keep ONE fitness item per
 * invariant_id), ORDER for momentum (by story-AC order, then kind behavior → fitness → client), and assign
 * feature-flat T-ids from startId. OVER-covers rather than under-covers (every non-duplicate item is kept),
 * so coverage is never lost; the navigator reflect + human spec gate still review. Pure + testable.
 */
export function assembleSlices(slices: Array<{ kind: string; items: unknown[] }>, startId: number, storyAcs: string[]): unknown[] {
  const KIND_ORDER = ["behavior", "fitness", "client"];
  const acRank = (ac: string): number => {
    const i = storyAcs.indexOf(ac);
    return i === -1 ? storyAcs.length : i;
  };
  const kindRank = (k: string): number => {
    const i = KIND_ORDER.indexOf(k);
    return i === -1 ? KIND_ORDER.length : i;
  };
  const all = slices
    .flatMap((s) => s.items)
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object" && !Array.isArray(it));
  // Stable momentum order: by the story's AC order, then by kind. (Array.prototype.sort is stable in V8,
  // so items sharing an (ac, kind) keep the analysts' authored order.)
  const ordered = [...all].sort((a, b) => {
    const ra = acRank(String(a.ac_id ?? "")) - acRank(String(b.ac_id ?? ""));
    return ra !== 0 ? ra : kindRank(String(a.kind ?? "")) - kindRank(String(b.kind ?? ""));
  });
  const seenBehavior = new Set<string>(); // (ac_id + normalized description)
  const seenInvariant = new Set<string>(); // one fitness item per invariant_id
  const out: Record<string, unknown>[] = [];
  for (const it of ordered) {
    const ac = String(it.ac_id ?? "");
    const descKey = `${ac}\u0000${String(it.description ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
    if (seenBehavior.has(descKey)) continue; // exact (ac + behavior) duplicate
    const inv = typeof it.invariant_id === "string" ? it.invariant_id : "";
    if (it.kind === "fitness" && inv) {
      if (seenInvariant.has(inv)) continue; // keep exactly one fitness per invariant_id
      seenInvariant.add(inv);
    }
    seenBehavior.add(descKey);
    out.push({ ...it, id: `T${startId + out.length}`, status: "pending" });
  }
  return out;
}

/** Extract the LAST fenced ```json ... ``` block from an agent's text reply and parse it as an array.
 *  Throws when there is none or it is not an array (the bin retries once, then fails → the gate blocks). */
export function extractJsonArray(text: string): unknown[] {
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (fences.length === 0) throw new Error("no fenced ```json block in the analyst reply");
  const body = fences[fences.length - 1]![1]!.trim();
  const parsed = JSON.parse(body) as unknown;
  if (!Array.isArray(parsed)) throw new Error("the fenced json block is not an array");
  return parsed;
}

/** The story ACs NOT covered by any item in the assembled list (empty = full coverage). The bin's
 *  coverage-retry asserts this is empty (an under-producing analyst leaves an AC uncovered); the
 *  test-strategist's self-check (consort-response-formatter) enforces the same "every AC covered". */
export function uncoveredAcs(items: Array<{ ac_id?: unknown }>, storyAcIds: string[]): string[] {
  const covered = new Set(items.map((it) => String(it.ac_id ?? "")));
  return storyAcIds.filter((ac) => !covered.has(ac));
}

/** SELF-CHECK a sub-agent's produced items against the story's contract, returning a list of concrete
 *  problems (empty = clean) the sub-agent must fix BEFORE it returns — so a bad ac_id, a malformed item,
 *  or (for the ordered list) a coverage gap / T-id collision is caught at the SOURCE instead of failing
 *  the whole fan-out downstream. `consort-check-testlist` wraps this for the sub-agents to run; it is the
 *  per-sub-agent analogue of the test-strategist's consort-response-formatter. Pure + unit-tested. */
export function validateTestlistItems(
  items: unknown,
  storyAcs: string[],
  opts: { ordered?: boolean; acLayers?: Record<string, string | undefined> } = {},
): string[] {
  if (!Array.isArray(items)) return ["output is not a JSON array of test-list items"];
  const problems: string[] = [];
  const kinds = new Set(["behavior", "fitness", "client"]);
  const acSet = new Set(storyAcs);
  const seenIds = new Set<string>();
  // A real Playwright e2e spec lives under client/tests/e2e and ends .spec.ts — NOT a *.e2e.ts file
  // (Playwright's default testMatch misses it) and NOT a pages/*.test.tsx component harness (jsdom,
  // mocked fetch — cannot verify an E2E AC's real browser↔server contract).
  const E2E_SPEC = /client\/tests\/e2e\/.+\.spec\.ts$/;
  items.forEach((raw, i) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const where = `item ${i + 1} (id ${String(it.id ?? "?")})`;
    if (typeof it.id !== "string" || it.id.length === 0) problems.push(`${where}: missing a non-empty "id"`);
    if (typeof it.description !== "string" || it.description.length === 0) problems.push(`${where}: missing a non-empty "description"`);
    if (typeof it.kind !== "string" || !kinds.has(it.kind)) problems.push(`${where}: "kind" must be behavior|fitness|client (got ${JSON.stringify(it.kind)})`);
    const ac = typeof it.ac_id === "string" ? it.ac_id : "";
    if (!ac) problems.push(`${where}: missing a string "ac_id"`);
    else if (storyAcs.length > 0 && !acSet.has(ac)) {
      problems.push(`${where}: ac_id "${ac}" is NOT one of the story's EXACT ac ids [${storyAcs.join(", ")}] — use the full id verbatim, do not abbreviate/truncate`);
    }
    // #2 — an E2E-layer AC's client test MUST be a real Playwright e2e spec, not a component harness or a
    // mis-named file. Catches the churn where the client analyst over-produced jsdom harness tests
    // (pages/*.test.tsx) or *.e2e.ts files that a later pass had to re-derive/strip.
    if (opts.acLayers && it.kind === "client" && opts.acLayers[ac] === "E2E") {
      const sf = typeof it.scenario_file === "string" ? it.scenario_file : "";
      if (!E2E_SPEC.test(sf)) {
        problems.push(
          `${where}: AC ${ac} is layer E2E, so its client test must be a real Playwright e2e spec at ` +
            `client/tests/e2e/<name>.spec.ts (got "${sf || "no scenario_file"}") — not a *.e2e.ts file or a ` +
            `pages/*.test.tsx component harness`,
        );
      }
      // fixed-key-e2e, in-turn: an E2E create flow (fill + submit) keyed on a HARDCODED business key
      // collides on the shared feature branch (a prior run / sibling story already holds that key), so
      // the second run hits a unique-violation and goes perma-red on a correct app. Caught HERE, the
      // client analyst re-authors with a per-run-unique key before returning — no flag/revise/re-dispatch
      // drive turns. Same tight heuristic as the pre-reflect gate (isFixedKeyE2eCreateFlow), one source.
      const desc = typeof it.description === "string" ? it.description : "";
      if (isFixedKeyE2eCreateFlow(desc)) {
        problems.push(
          `${where}: AC ${ac} is an E2E create flow keyed on a HARDCODED business key — the e2e verify runs ` +
            `against the SHARED feature branch, so a prior run or sibling story already holds that key and the ` +
            `next run hits a unique-violation (or asserts a stale duplicate). Key the created record on a ` +
            `per-run-unique business key ('SKU-' + crypto.randomUUID().slice(0,8); built-in, never import "uuid") ` +
            `and use that SAME value in both the create fill and the assertion locator`,
        );
      }
    }
    if (opts.ordered) {
      if (!/^T\d+$/.test(String(it.id ?? ""))) problems.push(`${where}: ordered id must be a feature-flat "T<n>"`);
      else if (seenIds.has(String(it.id))) problems.push(`${where}: duplicate id "${String(it.id)}"`);
      seenIds.add(String(it.id));
    }
  });
  if (opts.ordered && storyAcs.length > 0) {
    const uncovered = uncoveredAcs(items as Array<{ ac_id?: unknown }>, storyAcs);
    if (uncovered.length > 0) problems.push(`no item covers these story AC(s): ${uncovered.join(", ")} — every AC needs at least one item`);
  }
  return problems;
}

/** The highest existing feature-flat `T<n>` id across the master items (0 when none), so the assembler
 *  numbers THIS story's items past it and ids never collide across stories. */
export function highestTid(items: Array<{ id?: unknown }>): number {
  let max = 0;
  for (const it of items) {
    const m = /^T(\d+)$/.exec(String(it?.id ?? ""));
    if (m) max = Math.max(max, Number(m[1]!));
  }
  return max;
}
