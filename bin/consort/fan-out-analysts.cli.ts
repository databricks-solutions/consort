#!/usr/bin/env node
// consort-fan-out-analysts: the DETERMINISTIC test-analyst fan-out (locked (b) design). The
// orchestrator hands the test-strategist THIS bin to run, instead of trusting the LLM to Task-spawn
// the roster (which it nondeterministically skipped — the live review found it solo-authored the
// first authoring even with an explicit prompt). The bin spawns the ENABLED kind analysts
// (behavior/fitness/client → unordered slices) then the ASSEMBLER (reconcile + order + feature-flat
// T-ids), and writes stories/<S>/analyst-ordered.json. The test_list gate hard-blocks if that
// artifact is absent (B4), so there is no path where the test-strategist silently solo-authors.
//
// Analyst spawns mirror the drive's claudeBaseArgs load-bearing flags: --permission-mode acceptEdits
// (headless, no human) + --setting-sources project. Analysts only Read. Each analyst retries ONCE on a
// spawn/parse failure, then the bin exits non-zero → the gate blocks (fail-closed).

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveProjectSettings } from "../../consort/config/consort-config-file.js";
import { resolveConsortDir, featureTestListJson, storyAcIds, readAcLayer, readAcArchitecturalNotes, dbDesignJson } from "../../consort/config/consort-paths.js";
import { enabledAnalysts } from "../../consort/test-list/test-analyst-catalogue.js";
import {
  analystOrderedJson,
  analystOrderedPreservedJson,
  assembleSlices,
  behaviorWarranted,
  buildKindAnalystPrompt,
  extractJsonArray,
  fanOutMode,
  highestTid,
  mergeOrdered,
  uncoveredAcs,
  type FanOutLoc,
} from "../../consort/test-list/fan-out-plan.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Spawn one `claude -p` analyst and capture its stdout (the final assistant text, default output). */
function runAnalyst(prompt: string, model: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", prompt,
      "--model", model,
      "--permission-mode", "acceptEdits",
      "--setting-sources", "project",
      "--strict-mcp-config",
      // Read (inputs) + Bash so the analyst can shell out to the logging CLI (./scripts/lk consort-log)
      // and record what it tried — otherwise the fan-out is a black box when an analyst under-produces
      // or mis-tags an ac_id (observed: behavior=0, truncated ac_ids → repeated FAILED runs with no
      // trace of WHY). Mirrors the drive granting role agents Bash for the same kit CLI.
      "--allowedTools", "Read,Bash",
    ];
    const child = spawn("claude", args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      // On a non-zero exit, `claude -p` writes its real failure (a 401/token-expiry, a usage limit, an
      // internal error) to STDOUT in the result envelope, NOT stderr (which is usually empty). Capturing
      // only stderr made every assembler/analyst exit-1 a black box ("claude -p exited 1: "). Surface
      // BOTH tails so the fan-out.log names the actual cause.
      code === 0
        ? resolve(out)
        : reject(new Error(`claude -p exited ${code}: stderr=${err.trim().slice(-600) || "(empty)"} ||| stdout=${out.trim().slice(-1500) || "(empty)"}`)),
    );
  });
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** A wall-clock duration for the fan-out log. The bin OWNS the per-phase timing (it does not rely on
 *  the sub-agents to self-log), so a slow test-strategist turn is always attributable from fan-out.log. */
const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** Run an analyst and parse its JSON array, retrying ONCE on any spawn/parse failure. Every failure is
 *  recorded to the durable log via `say` — INCLUDING the raw reply tail on a parse failure — so an
 *  assembler/analyst that exits 1 or returns unparseable output is NOT a black box (observed: "the
 *  fan-out CLI gives no way to see why the assembler exits 1"). */
async function runAnalystWithRetry(
  label: string,
  prompt: string,
  model: string,
  cwd: string,
  say: (line: string) => void,
): Promise<unknown[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    let raw: string | undefined;
    try {
      raw = await runAnalyst(prompt, model, cwd);
    } catch (spawnErr) {
      lastErr = spawnErr;
      say(`[fan-out] ${label} attempt ${attempt} SPAWN failed after ${secs(Date.now() - t0)}: ${errMsg(spawnErr)}`);
      continue;
    }
    try {
      const items = extractJsonArray(raw);
      say(`[fan-out] ${label} ok in ${secs(Date.now() - t0)} (${model}, attempt ${attempt}, ${items.length} item(s))`);
      return items;
    } catch (parseErr) {
      lastErr = parseErr;
      // The raw reply is what we need to see — it did not contain a parseable fenced JSON array.
      say(`[fan-out] ${label} attempt ${attempt} PARSE failed after ${secs(Date.now() - t0)}: ${errMsg(parseErr)}. Raw reply tail: ${raw.slice(-800).replace(/\n/g, "\\n")}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function main(): Promise<number> {
  const featureId = arg("--feature");
  const story = arg("--story");
  const projectDir = arg("--project-dir") ?? process.cwd();
  if (!featureId || !story) {
    process.stderr.write("usage: consort-fan-out-analysts --feature <F> --story <S> [--project-dir <d>]\n");
    return 2;
  }
  const totalStart = Date.now();
  const consortDir = resolveConsortDir(projectDir);
  const uiTrack = resolveProjectSettings(projectDir).project.uiTrack;
  const loc: FanOutLoc = { consortDir, projectDir, featureId, story };
  const ctx = { projectDir, uiTrack };
  const storyAcs = storyAcIds(consortDir, featureId, story);
  // #1 — skip the behavior analyst for a demonstrably READ-ONLY story (no API/Infra AC, no schema change,
  // no write verb in any AC's architect notes). Otherwise it is a wasteful `claude -p` spawn that returns
  // 0 (observed on read-only all-E2E stories). Errs toward KEEPING (any backend signal keeps it), so a
  // write story — even an all-E2E one like S1 — never silently loses its API-scenario coverage.
  const acLayers = storyAcs.map((ac) => readAcLayer(consortDir, featureId, ac));
  const acNotes = storyAcs.map((ac) => readAcArchitecturalNotes(consortDir, featureId, ac));
  let hasSchemaChanges = false;
  try {
    const db = JSON.parse(readFileSync(dbDesignJson(consortDir, featureId), "utf8")) as { schema_changes?: Array<{ story_id?: unknown }> };
    hasSchemaChanges = Array.isArray(db.schema_changes) && db.schema_changes.some((c) => c?.story_id === story);
  } catch {
    /* no/empty db-design → no schema changes known */
  }
  const skipBehavior = storyAcs.length > 0 && !behaviorWarranted(acLayers, acNotes, hasSchemaChanges);
  const analysts = skipBehavior ? enabledAnalysts(ctx).filter((a) => a.kind !== "behavior") : enabledAnalysts(ctx);
  // A durable log: everything the bin says is ALSO buffered to stories/<S>/fan-out.log, so the
  // per-analyst counts + coverage survive regardless of how the caller pipes stdout (the test-strategist
  // used `| tail -20`, which cut the slice line).
  const log: string[] = [];
  const say = (line: string): void => {
    process.stderr.write(line + "\n");
    log.push(line);
  };
  say(`[fan-out] ${fanOutMode(ctx)} mode: ${analysts.map((a) => a.kind).join(", ")} + assembler (story ${story}); ACs: ${storyAcs.join(", ") || "(none on disk)"}`);
  if (skipBehavior) say(`[fan-out] behavior analyst SKIPPED — story ${story} is read-only (no API/Infra AC, no schema change, no write-verb note); behavior would return 0, so the spawn is omitted.`);

  // start T-ids past the master's highest id (so ids never collide across stories)
  let masterItems: Array<{ id?: unknown }> = [];
  const masterPath = featureTestListJson(consortDir, featureId);
  if (existsSync(masterPath)) {
    try {
      masterItems = (JSON.parse(readFileSync(masterPath, "utf8")) as { items?: Array<{ id?: unknown }> }).items ?? [];
    } catch {
      /* an unreadable/empty master → start at T1 */
    }
  }
  const startId = highestTid(masterItems) + 1;

  // SCOPED re-derive (B): a reflect-testlist-defect revise leaves the UNFLAGGED items (with their ids)
  // in a preserved sidecar + removes only the flagged ACs' items. Read that sidecar; if present, derive
  // ONLY the now-uncovered (flagged) ACs and MERGE onto the preserved — so the good items + their ids
  // survive. No sidecar ⇒ a full fan-out (first authoring / full/coupled revise).
  const preservedPath = analystOrderedPreservedJson(consortDir, featureId, story);
  let preserved: unknown[] = [];
  if (existsSync(preservedPath)) {
    try {
      preserved = (JSON.parse(readFileSync(preservedPath, "utf8")) as { items?: unknown[] }).items ?? [];
    } catch {
      /* an unreadable sidecar → treat as a full derive */
    }
  }
  const scoped = preserved.length > 0;
  const targetAcs = scoped ? uncoveredAcs(preserved as Array<{ ac_id?: unknown }>, storyAcs) : storyAcs;
  say(
    scoped
      ? `[fan-out] SCOPED re-derive of ${targetAcs.join(", ") || "(none)"} — preserving ${preserved.length} item(s) + their ids`
      : `[fan-out] full derive (all ${storyAcs.length} AC(s))`,
  );

  // One fan-out pass: kind analysts (parallel, unordered slices, SCOPED to targetAcs when re-deriving)
  // → DETERMINISTIC assembly (ordered + T-ids past the master's highest).
  //
  // Assembly is MECHANICAL and runs IN THIS ORCHESTRATOR (the process that launched the analysts),
  // never a separate assembler subagent: coverage (every slice item kept), ORDER (story-AC order →
  // kind), exact + per-invariant dedup, feature-flat T-ids. A dedicated LLM assembler was a single
  // point of failure — a model-side AUP safeguard false-positive made its `claude -p` exit 1 on a
  // benign reconcile prompt (content-sensitive, recurring), blocking the whole lane for one LLM call
  // whose only real value over this routine was SEMANTIC de-dup (differently-worded duplicates,
  // cross-kind overlap). That semantic pass is the test-strategist's final job again (it already ran
  // the fan-out and has the list in context), so no extra spawn and no failure point.
  const fanOutOnce = async (): Promise<unknown[]> => {
    const aStart = Date.now();
    const slices = await Promise.all(
      analysts.map(async (a) => ({ kind: a.kind, items: await runAnalystWithRetry(a.kind, buildKindAnalystPrompt(a, loc, storyAcs, scoped ? targetAcs : undefined), a.model, projectDir, say) })),
    );
    // The parallel analyst phase's wall-clock = the SLOWEST analyst (incl. its retry). The per-analyst
    // "ok in Ns" lines above attribute WHICH one; this line is the phase total.
    say(`[fan-out] analyst phase (parallel, ${analysts.length}) ${secs(Date.now() - aStart)} — slices: ${slices.map((s) => `${s.kind}=${s.items.length}`).join(", ")}`);
    const assembled = assembleSlices(slices, startId, storyAcs);
    say(`[fan-out] deterministic assembler: ${slices.reduce((acc, s) => acc + s.items.length, 0)} slice item(s) → ${assembled.length} ordered item(s) (T${startId}+)`);
    return assembled;
  };

  // The durable fan-out.log is written on EVERY exit (success OR failure) — a failed fan-out is where the
  // log matters most (the raw sub-agent replies + the error are the only trace of why it blocked).
  const outPath = analystOrderedJson(consortDir, featureId, story);
  let passes = 0; // coverage passes actually run (each = parallel analysts + assembler); read by flushLog
  const flushLog = (): void => {
    // The bin-owned per-turn total: the slow test-strategist's duration, always on disk + narrated,
    // attributable to the per-analyst/assembler/phase lines above (no reliance on sub-agent self-logs).
    say(`[fan-out] TOTAL ${secs(Date.now() - totalStart)} across ${passes} coverage pass(es) (${analysts.length} parallel analyst(s) + assembler per pass)`);
    try {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(join(dirname(outPath), "fan-out.log"), log.join("\n") + "\n");
    } catch {
      /* best-effort */
    }
  };

  // COVERAGE-RETRY: an analyst can under-produce (seen live — a backend story's behavior analyst
  // returned 0, leaving an AC uncovered). Make full AC coverage a property of the BIN, not the
  // test-strategist's after-the-fact self-check: (re-)derive the target ACs, merge onto preserved, and
  // if any story AC is still uncovered, re-roll the derivation ONCE more (fresh analyst spawns).
  let ordered: unknown[] = preserved;
  let uncovered: string[] = targetAcs;
  try {
    if (targetAcs.length > 0) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        passes++;
        const fresh = await fanOutOnce();
        ordered = mergeOrdered(preserved, fresh);
        uncovered = uncoveredAcs(ordered as Array<{ ac_id?: unknown }>, storyAcs);
        if (uncovered.length === 0) break;
        say(`[fan-out] attempt ${attempt}: ${uncovered.length} AC(s) uncovered (${uncovered.join(", ")})${attempt < 2 ? " — re-running the derivation" : ""}`);
      }
    }
  } catch (e) {
    // A sub-agent (usually the assembler) exhausted its retries. Record WHY (runAnalystWithRetry already
    // logged the raw replies) + flush, so the test-strategist + operator can read the cause from fan-out.log.
    say(`[fan-out] FAILED: a sub-agent did not return a parseable slice after retries: ${errMsg(e)}`);
    flushLog();
    process.stderr.write(`[fan-out] FAILED: ${errMsg(e)} (see ${join(dirname(outPath), "fan-out.log")})\n`);
    return 1;
  }
  if (existsSync(preservedPath)) rmSync(preservedPath, { force: true }); // consumed

  // write the ordered-list artifact (B4) + the durable fan-out.log
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ items: ordered }, null, 2) + "\n");
  const byKind = ordered.reduce<Record<string, number>>((acc, it) => {
    const k = String((it as { kind?: unknown }).kind ?? "?");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  say(`[fan-out] wrote ${ordered.length} ordered items (${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(", ")}) → ${outPath}`);
  flushLog();

  if (uncovered.length > 0) {
    process.stderr.write(`[fan-out] FAILED: ${uncovered.length} story AC(s) still uncovered after retry: ${uncovered.join(", ")}\n`);
    return 1; // fail-closed → the test_list gate (B4) / self-check surfaces the gap
  }
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    process.stderr.write(`[fan-out] FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
