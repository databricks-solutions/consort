// Consort per-test capture writers — FRAMEWORK-AGNOSTIC (no Playwright, no Vitest import).
//
// These are the shared, pure Node helpers the three test reporters use to stream per-test signals to
// `.consort/`: the status trail (`test-run.jsonl`) the dashboard tails to light bubbles, and the
// per-test table snapshots (`table-snapshots.jsonl`) the dashboard reads for its table view. They
// live in their OWN module (not in `consort-test-reporter.ts`) precisely because that file imports
// `@playwright/test/reporter` for the Playwright Reporter class — and the Vitest client compile
// (`tests/setup.ts` captures table state in an afterEach) must NOT drag Playwright's types through
// the client's bundler-resolution tsconfig. Importing these from here keeps the client Playwright-free.
//
// Pure observability: everything is wrapped so a write can NEVER fail a test/suite.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Walk up from `start` to the project's `.consort` dir (tests run from root OR client/, so cwd
 *  varies); fall back to `<cwd>/.consort` (created on write) if none is found. */
export function findConsortDir(start: string): string {
  let d = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, ".consort"))) return join(d, ".consort");
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return join(start, ".consort");
}

export type TestRunStatus = "running" | "green" | "red" | "skipped";

export function emitTestRun(id: string, status: TestRunStatus, absFile: string, kind: string): void {
  try {
    const dir = findConsortDir(process.cwd());
    mkdirSync(dir, { recursive: true });
    const root = dirname(dir);
    const file = (absFile || "").replace(`${root}/`, "");
    const ts = new Date().toISOString();
    appendFileSync(
      join(dir, "test-run.jsonl"),
      JSON.stringify({ ts, test_id: id, status, file, kind }) + "\n",
    );
    // RECORD a durable per-test `test.result` into the agent-log AT RUN TIME (not a cycle-end batch),
    // so the dashboard lights each bubble the moment its test runs (live), scrubbing lights each test
    // AT the point it actually ran (the event sits at its real position in the stream), and a REPLAY of
    // the recording does the same — the per-test trail is part of the durable record, not a live-only
    // overlay. Attributed to its story via the on-disk test-lists (the agent-log fold keys by
    // feature|story|test). Best-effort: a reporter write must never fail the suite.
    recordTestResultEvent(dir, id, status, file, ts);
  } catch {
    /* best-effort: a per-test reporter write must never fail the suite */
  }
}

/** Owner of a test id, resolved from the project's per-story test-lists (the attribution the reporter
 *  lacks — it only sees id + file). Cached per process (a reporter process is one suite run). */
interface TestOwner { feature_id: string; story_id: string; ac_id: string; scenario_file?: string }
const ownerIndexCache = new Map<string, Map<string, TestOwner[]>>();

function buildOwnerIndex(consortDir: string): Map<string, TestOwner[]> {
  const cached = ownerIndexCache.get(consortDir);
  if (cached) return cached;
  const index = new Map<string, TestOwner[]>();
  try {
    const featuresDir = join(consortDir, "features");
    for (const f of readdirSync(featuresDir)) {
      const storiesDir = join(featuresDir, f, "stories");
      let stories: string[];
      try { stories = readdirSync(storiesDir); } catch { continue; }
      for (const s of stories) {
        const listFile = join(storiesDir, s, "test-list-per-story.json");
        if (!existsSync(listFile)) continue;
        let list: { feature_id?: string; story_id?: string; items?: unknown[] };
        try { list = JSON.parse(readFileSync(listFile, "utf8")); } catch { continue; }
        const featureId = typeof list.feature_id === "string" ? list.feature_id : f;
        const storyId = typeof list.story_id === "string" ? list.story_id : s;
        for (const raw of list.items ?? []) {
          const it = raw as { id?: unknown; ac_id?: unknown; scenario_file?: unknown };
          if (typeof it.id !== "string") continue;
          const owners = index.get(it.id) ?? [];
          owners.push({
            feature_id: featureId,
            story_id: storyId,
            ac_id: typeof it.ac_id === "string" ? it.ac_id : "unknown",
            ...(typeof it.scenario_file === "string" ? { scenario_file: it.scenario_file } : {}),
          });
          index.set(it.id, owners);
        }
      }
    }
  } catch {
    /* no test-lists (pre-design project) — leave the index empty; the kit's cycle-scoped emit covers it */
  }
  ownerIndexCache.set(consortDir, index);
  return index;
}

/** Resolve a (test id, file) to its single owning story — a property of the TEST, read from the
 *  authoritative per-story test-list, NEVER from which feature happens to be building now. One owner
 *  -> it. Several (a T-id reused across features — ids are unique only WITHIN a story) -> the owner
 *  whose scenario_file basename matches the running file (a client/e2e spec, and now every test, pins
 *  ITSELF). If the running file still can't disambiguate, return null (leave it UNSCOPED) rather than
 *  attribute by the active feature — a full-suite re-run under a LATER feature's lane would otherwise
 *  mis-stamp this test's rows with that feature, and the dashboard would scope them out. `next.json`
 *  is deliberately NOT consulted: attribution follows the test's identity, not the run that executed it. */
export function resolveOwner(consortDir: string, id: string, file: string): TestOwner | null {
  const base = /^(T\d+)/.exec(id)?.[1] ?? id;
  const index = buildOwnerIndex(consortDir);
  const owners = index.get(id) ?? index.get(base) ?? [];
  if (owners.length === 0) return null;
  if (owners.length === 1) return owners[0];
  // The owner whose scenario_file matches the running file (unique match). No active-feature fallback.
  const fileBase = basename(file || "");
  if (fileBase) {
    const byFile = owners.filter((o) => o.scenario_file && basename(o.scenario_file) === fileBase);
    if (byFile.length === 1) return byFile[0];
  }
  return null;
}

/** The owner-identity request headers a test harness sends on every `/api` call so the backend's
 *  capture stamps each read/write with the test's OWNING feature/story (app/consort_capture.py reads
 *  these, never next.json). Empty when the owner can't be resolved — the backend then leaves the line
 *  unscoped (kept by test id, back-compat) rather than mis-stamped. */
export function consortOwnerHeaders(consortDir: string, id: string, file: string): Record<string, string> {
  const owner = resolveOwner(consortDir, id, file);
  if (!owner) return {};
  return { "X-Consort-Feature": owner.feature_id, "X-Consort-Story": owner.story_id };
}

/** The role that RAN this suite, for per-test attribution. The deploy/promote lane re-runs the suite
 *  as the release-engineer (verify); every other phase is the driver's build cycle. The dashboard
 *  routes a release-engineer `test.result` to the deploy lane's Verify step, NOT the build lane's
 *  Green, so a deploy-verify re-run never lights the driver's card. Falls back to driver on any error. */
function testRunnerRole(consortDir: string): string {
  try {
    const ws = JSON.parse(readFileSync(join(consortDir, "workflow-state.json"), "utf8")) as { phase?: unknown };
    if (ws.phase === "deploy") return "release-engineer";
  } catch { /* best-effort: fall back to the build-cycle driver */ }
  return "driver";
}

/** Append a durable, schema-valid `test.result` to the agent-log (+ the corpus mirror when a recording
 *  is in flight), shaped exactly like the kit's emitAgentLogEvent output so the dashboard fold reads it
 *  identically. Only emitted for an attributable test; best-effort. */
export function recordTestResultEvent(consortDir: string, id: string, status: TestRunStatus, file: string, ts: string): void {
  try {
    const owner = resolveOwner(consortDir, id, file);
    if (!owner) return; // cannot attribute (ambiguous reused id) — skip rather than mis-key a bubble
    const line =
      JSON.stringify({
        timestamp: ts,
        level: "info",
        role: testRunnerRole(consortDir),
        event: "test.result",
        message: `TEST ${id} ${status}`,
        metadata: { feature_id: owner.feature_id, test_id: id, status, story_id: owner.story_id, ac_id: owner.ac_id },
      }) + "\n";
    appendFileSync(join(consortDir, "agent-log.jsonl"), line);
    // Mirror into the corpus so a RECORDED run replays the per-test trail (same env the kit uses).
    const recordDir = process.env.LAKEBASE_CONSORT_RECORD_DIR?.trim();
    if (recordDir) {
      try { mkdirSync(recordDir, { recursive: true }); appendFileSync(join(recordDir, "agent-log.jsonl"), line); } catch { /* mirror is best-effort */ }
    }
  } catch {
    /* best-effort: recording a per-test result must never fail the suite */
  }
}

/** Append a per-test TABLE snapshot (one line per table) to `.consort/table-snapshots.jsonl`, keyed
 *  by test id — parallel to `emitTestRun`. Best-effort. */
export function emitTableSnapshot(id: string, absFile: string, table: string, rows: unknown[], rowCount: number | null): void {
  try {
    const dir = findConsortDir(process.cwd());
    mkdirSync(dir, { recursive: true });
    const root = dirname(dir);
    const file = (absFile || "").replace(`${root}/`, "");
    // Stamp feature/story so the dashboard scopes this snapshot per feature (test ids repeat across
    // features). resolveOwner uses the scenario_file + the active feature to pick the owning story;
    // omit on no resolution so the reader keeps the line by test id (back-compat).
    const owner = resolveOwner(dir, id, absFile);
    appendFileSync(
      join(dir, "table-snapshots.jsonl"),
      JSON.stringify({
        ts: new Date().toISOString(),
        test_id: id,
        ...(owner ? { feature_id: owner.feature_id, story_id: owner.story_id } : {}),
        file,
        table,
        rows,
        row_count: rowCount,
      }) + "\n",
    );
  } catch {
    /* best-effort */
  }
}

/** Capture the DB state a test left — for the dashboard's per-test table view — by asking the app's
 *  read-only `/api/_consort/table-snapshot` route (the client never touches the DB; the app, which the
 *  test hit over `/api`, reports its rows). Writes one `emitTableSnapshot` per table, keyed by test id.
 *  Shared by the Playwright (e2e) AND Vitest (component) paths — both drive the DB THROUGH the app.
 *  Best-effort + time-boxed: a missing route (prod app) or a slow/unreachable endpoint just skips it. */
export async function captureTablesFromRoute(baseURL: string, id: string, absFile: string): Promise<void> {
  if (!baseURL) return;
  try {
    // Time-box with Promise.race, NOT an AbortController signal: this runs in BOTH Node (Playwright /
    // pytest reporters) and jsdom (Vitest component afterEach), and a jsdom-realm AbortSignal is not an
    // instance of the AbortSignal Node's undici fetch expects ("Expected signal to be an instance of
    // AbortSignal") — it throws there and the capture silently no-ops. A dangling GET on timeout is a
    // harmless read-only best-effort call.
    const res = await Promise.race([
      fetch(`${baseURL.replace(/\/$/, "")}/api/_consort/table-snapshot`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("snapshot timeout")), 4000)),
    ]);
    if (!res.ok) return;
    const tables = (await res.json()) as Record<string, { rows?: unknown[]; row_count?: number | null }>;
    for (const [table, data] of Object.entries(tables)) {
      emitTableSnapshot(id, absFile, table, data.rows ?? [], data.row_count ?? null);
    }
  } catch {
    /* route absent (prod) / unreachable / timed out — skip the snapshot */
  }
}
