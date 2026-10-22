// Reconcile the agent-log's per-test `test.result` trail with the TEST RUNNER'S OWN truth
// (`.consort/test-run.jsonl`), so a test that actually RAN green/red during a whole-suite verify
// corrects its dashboard bubble — even when it is NOT a test of the cycle that just transitioned.
//
// WHY this is additive, not a replacement. The cycle transitions (RED/GREEN/REFACTOR) emit
// `test.result` DECLARATIVELY for the cycle's `coveredTestIds` (run-cycle.ts logTestResults): the
// Navigator WRITES a failing test and the substrate records it red at write time — that red is NOT a
// reporter run, so a purely reporter-driven emission would MISS it until the Driver first executes it.
// Those declarations stay. This reconciler runs ALONGSIDE them, at the post-verify points (GREEN /
// REFACTOR), to catch every OTHER test the suite re-ran: a prior story's tests that still pass (so a
// stale red left by an earlier cycle is corrected to green), or one that regressed (red). The reporter
// is the only honest source for "did this specific test pass THIS run", so it owns that correction.
//
// Grain. The reporter tail streams `behavior` (pytest-bdd) + `client` (Vitest/Playwright) tests tagged
// `@T<id>`; architectural `fitness` runs are not tagged and never appear here — those keep only the
// cycle-scoped declaration. Attribution: the reporter line carries `test_id` + `file` but no story, so
// we map each id to its owning (feature, story, ac) via the per-story test-lists. A test id can be
// REUSED across features (F1 and F6 may both carry a T44 with different meanings), so when an id has
// more than one owner we disambiguate by `scenario_file`; if it stays ambiguous we SKIP it rather than
// mis-attribute (fail-safe: a wrong green is worse than no correction). Pure observability — every
// write is wrapped so reconciliation can never fail a transition.
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join } from "path";
import { emitAgentLogEvent, readAgentLog } from "../../consort/logging/agent-log";
import { featuresDir, storiesDir, storyTestListJson } from "../../consort/config/consort-paths.js";

/** The reporter's latest line per (test_id, file). */
interface ReporterEntry {
  test_id: string;
  status: string; // running | green | red | skipped
  file: string;
  ts: string;
}

/** Who owns a test id (from the per-story test-list). */
interface TestOwner {
  feature_id: string;
  story_id: string;
  ac_id: string;
  scenario_file?: string;
}

/** Only these reporter statuses are a settled per-test result worth recording in the trail. A
 *  `running` line is the live tail's job (the dashboard reads test-run.jsonl directly for the live
 *  edge); recording it in history would just add churn. */
const RECORDABLE = new Set(["green", "red", "skipped"]);

/** The base `T<n>` of a possibly-suffixed reporter id (`T28-foo` -> `T28`), so an id the runner tagged
 *  with a variant suffix still resolves to its plain test-list entry. */
function baseId(id: string): string {
  const m = /^(T\d+)/.exec(id);
  return m ? m[1] : id;
}

/** Reduce `.consort/test-run.jsonl` to the LATEST entry per (test_id, file) — the last line for a key
 *  wins, so a rerun within the suite shows its final state. Malformed / half-written trailing lines are
 *  skipped (a reader may catch the file mid-append). Empty when there is no tail (replay, no run yet). */
function reduceReporterTail(consortDir: string): ReporterEntry[] {
  const latest = new Map<string, ReporterEntry>();
  let text: string;
  try {
    text = readFileSync(join(consortDir, "test-run.jsonl"), "utf8");
  } catch {
    return [];
  }
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let o: Partial<ReporterEntry>;
    try {
      o = JSON.parse(s) as Partial<ReporterEntry>;
    } catch {
      continue;
    }
    if (typeof o.test_id !== "string" || typeof o.status !== "string") continue;
    const file = typeof o.file === "string" ? o.file : "";
    latest.set(`${o.test_id}\u0000${file}`, {
      test_id: o.test_id,
      status: o.status,
      file,
      ts: typeof o.ts === "string" ? o.ts : "",
    });
  }
  return [...latest.values()];
}

/** Build `test_id -> owners[]` from every `features/<f>/stories/<s>/test-list-per-story.json`. A
 *  per-story list self-declares its feature_id/story_id and each item its ac_id (+ optional
 *  scenario_file), which is exactly the attribution the reporter tail lacks. Best-effort per file: an
 *  absent/unparseable list is skipped, never thrown on. */
function buildTestOwnerIndex(consortDir: string): Map<string, TestOwner[]> {
  const index = new Map<string, TestOwner[]>();
  let featureDirs: string[];
  try {
    featureDirs = readdirSync(featuresDir(consortDir));
  } catch {
    return index;
  }
  for (const f of featureDirs) {
    const stories = storiesDir(consortDir, f);
    let storyDirs: string[];
    try {
      if (!statSync(stories).isDirectory()) continue;
      storyDirs = readdirSync(stories);
    } catch {
      continue;
    }
    for (const s of storyDirs) {
      const listFile = storyTestListJson(consortDir, f, s);
      if (!existsSync(listFile)) continue;
      let list: { feature_id?: string; story_id?: string; items?: unknown[] };
      try {
        list = JSON.parse(readFileSync(listFile, "utf8"));
      } catch {
        continue;
      }
      const featureId = typeof list.feature_id === "string" ? list.feature_id : f;
      const storyId = typeof list.story_id === "string" ? list.story_id : s;
      for (const raw of list.items ?? []) {
        const it = raw as { id?: unknown; ac_id?: unknown; scenario_file?: unknown };
        if (typeof it.id !== "string") continue;
        const owner: TestOwner = {
          feature_id: featureId,
          story_id: storyId,
          ac_id: typeof it.ac_id === "string" ? it.ac_id : "unknown",
          ...(typeof it.scenario_file === "string" ? { scenario_file: it.scenario_file } : {}),
        };
        const owners = index.get(it.id) ?? [];
        owners.push(owner);
        index.set(it.id, owners);
      }
    }
  }
  return index;
}

/** Resolve a reporter entry to its single owning story. One owner -> that owner (the id is unique in
 *  the project; trust it regardless of file). Several owners -> the one whose `scenario_file` basename
 *  matches the reporter line's `file` basename; anything still ambiguous (no match, or more than one)
 *  returns null so the caller SKIPS it rather than mis-attributing a cross-feature reused id. */
function resolveOwner(entry: ReporterEntry, index: Map<string, TestOwner[]>): TestOwner | null {
  const owners = index.get(entry.test_id) ?? index.get(baseId(entry.test_id)) ?? [];
  if (owners.length === 0) return null;
  if (owners.length === 1) return owners[0];
  const fileBase = basename(entry.file || "");
  if (!fileBase) return null;
  const byFile = owners.filter((o) => o.scenario_file && basename(o.scenario_file) === fileBase);
  return byFile.length === 1 ? byFile[0] : null;
}

/** The latest `test.result` status already in the agent-log, keyed `feature|story|test_id` — folded in
 *  stream (append) order, exactly as the dashboard folds it, so a reporter result is only emitted when
 *  it genuinely CHANGES a bubble (keeps the trail to real corrections, not 68 repeats per verify).
 *  Best-effort: an unreadable log yields an empty map (everything then looks like a change, which is
 *  still correct, just less terse). */
function currentTestResultStatus(consortDir: string): Map<string, string> {
  const status = new Map<string, string>();
  let events: ReturnType<typeof readAgentLog>;
  try {
    events = readAgentLog({ consortDir });
  } catch {
    return status;
  }
  for (const e of events) {
    if (e.event !== "test.result") continue;
    const md = e.metadata ?? {};
    const story = typeof md.story_id === "string" ? md.story_id : null;
    const testId = typeof md.test_id === "string" ? md.test_id : null;
    const stat = typeof md.status === "string" ? md.status : null;
    const feature = typeof md.feature_id === "string" ? md.feature_id : "";
    if (!story || !testId || !stat) continue;
    status.set(`${feature}|${story}|${testId}`, stat); // last in stream wins
  }
  return status;
}

/**
 * Emit a `test.result` for every test the RUNNER reports (test-run.jsonl) whose settled status now
 * DIFFERS from the agent-log's current status for that (feature, story, test) — the deltas only. Run
 * at the post-verify transitions (GREEN / REFACTOR) so a prior story's tests that re-ran green correct
 * their stale red, and a regression shows red. Stamps each event with the reporter's REAL transition
 * time (`now`), the same way the cycle-scoped declaration does, so the trail reads in run order.
 * Best-effort throughout — never throws, so it can never fail a cycle transition.
 */
export function reconcileTestResultsFromReporter(
  consortDir: string,
  role: "navigator" | "driver",
): void {
  try {
    const entries = reduceReporterTail(consortDir);
    if (entries.length === 0) return;
    const index = buildTestOwnerIndex(consortDir);
    if (index.size === 0) return;
    const current = currentTestResultStatus(consortDir);
    for (const entry of entries) {
      if (!RECORDABLE.has(entry.status)) continue;
      const owner = resolveOwner(entry, index);
      if (!owner) continue;
      const key = `${owner.feature_id}|${owner.story_id}|${entry.test_id}`;
      if (current.get(key) === entry.status) continue; // no change -> no churn
      try {
        emitAgentLogEvent(
          {
            role,
            level: "info",
            event: "test.result",
            feature_id: owner.feature_id,
            slots: {
              test_id: entry.test_id,
              status: entry.status,
              story_id: owner.story_id,
              ac_id: owner.ac_id,
            },
          },
          { consortDir, ...(entry.ts ? { now: () => new Date(entry.ts) } : {}) },
        );
        current.set(key, entry.status); // keep the local view coherent across this pass
      } catch {
        // swallow: a single malformed emit must not stop reconciling the rest
      }
    }
  } catch {
    // swallow: reconciliation is observability, never a reason to fail a transition
  }
}
