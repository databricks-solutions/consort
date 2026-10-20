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
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

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
    appendFileSync(
      join(dir, "test-run.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), test_id: id, status, file, kind }) + "\n",
    );
  } catch {
    /* best-effort: a per-test reporter write must never fail the suite */
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
