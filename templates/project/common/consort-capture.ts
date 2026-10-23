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

/** The feature currently on the build lane, from `.consort/next.json` — the disambiguator of last
 *  resort when a reused T-id's file does not pin a single owner (e.g. a fitness/behavior test whose
 *  test-list item carries no scenario_file). Null when unreadable. */
function activeFeature(consortDir: string): string | null {
  try {
    const next = JSON.parse(readFileSync(join(consortDir, "next.json"), "utf8")) as { feature?: unknown };
    return typeof next.feature === "string" ? next.feature : null;
  } catch {
    return null;
  }
}

/** Resolve a (test id, file) to its single owning story. One owner -> it. Several (a T-id reused across
 *  features — ids are unique only WITHIN a story) -> (1) the owner whose scenario_file basename matches
 *  the running file (a client/e2e spec pins ITSELF, so a sibling feature's same-id spec resolves to its
 *  own story); then (2) the owner in the feature currently on the build lane (next.json) — a
 *  fitness/behavior test carries no scenario_file, so during THIS feature's build its reused id belongs
 *  to the active feature's story, while another feature's same-id test already resolved via (1). Else
 *  null (skip, never mis-attribute). */
function resolveOwner(consortDir: string, id: string, file: string): TestOwner | null {
  const base = /^(T\d+)/.exec(id)?.[1] ?? id;
  const index = buildOwnerIndex(consortDir);
  const owners = index.get(id) ?? index.get(base) ?? [];
  if (owners.length === 0) return null;
  if (owners.length === 1) return owners[0];
  // (1) The owner whose scenario_file matches the running file (unique match).
  const fileBase = basename(file || "");
  if (fileBase) {
    const byFile = owners.filter((o) => o.scenario_file && basename(o.scenario_file) === fileBase);
    if (byFile.length === 1) return byFile[0];
  }
  // (2) Fall back to the owner in the currently-building feature (one match only).
  const active = activeFeature(consortDir);
  if (active) {
    const byFeature = owners.filter((o) => o.feature_id === active);
    if (byFeature.length === 1) return byFeature[0];
  }
  return null;
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
        role: "driver",
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
    appendFileSync(
      join(dir, "table-snapshots.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), test_id: id, file, table, rows, row_count: rowCount }) + "\n",
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
