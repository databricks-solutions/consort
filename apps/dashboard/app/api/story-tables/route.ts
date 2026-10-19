import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { readArtifactAtHead, consortDir, isSafeSegment } from "@/lib/consort";
import { resolveContained } from "@/lib/safepath";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/story-tables?feature=&story=&testId=<id>
//
// The lightbox's "tables the story touches + their contents AS OF A TEST" — a PURE CORPUS READER.
// The dashboard NEVER connects to a database. The backend that runs each test records that test's
// table state to `.consort/table-snapshots.jsonl` (pytest in `makereport`; the E2E Playwright
// reporter via the app's read-only snapshot route) keyed by `test_id` — exactly parallel to
// `test-run.jsonl`. This route returns the latest snapshot per table FOR THE REQUESTED test, so the
// view shows the table as that test left it: at the live edge the view asks for the running test
// (freshest capture via its poll); on replay it asks for the test at the playhead. Same invocation.
//
// Table names + columns + the story's schema_changes come from the feature's `db-design.json`.
// SECURITY: fixed-name reads under the project `.consort`, slug-validated feature/story; no DB.

const SNAPSHOT_FILE = "table-snapshots.jsonl";
const INTERACTIONS_FILE = "test-interactions.jsonl";

/** Per-test RETRIEVED/STORED rows (the precise capture written by the app's per-request events —
 *  app/consort_capture.py), grouped by table. Unlike the whole-table snapshot, these are exactly the
 *  rows THIS test read or wrote. Returns a Map<table, {read, stored}>. */
function readInteractionsForTest(testId: string, atTs: string): Map<string, { read: Record<string, unknown>[]; stored: Record<string, unknown>[] }> {
  const byTable = new Map<string, { read: Record<string, unknown>[]; stored: Record<string, unknown>[] }>();
  const abs = resolveContained(consortDir(), INTERACTIONS_FILE);
  if (!abs || !testId) return byTable;
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return byTable;
  }
  const seen = new Set<string>(); // dedup identical (op,table,row) lines across requests
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s) as { test_id?: string; table?: string; op?: string; row?: Record<string, unknown>; ts?: string };
      if (o.test_id !== testId || typeof o.table !== "string" || !o.row) continue;
      // Scrubber-faithful: skip interactions AFTER the playhead so a test's rows appear only once the
      // playhead reaches the moment it ran — a test that executes LATER in the run shows nothing here.
      if (atTs && typeof o.ts === "string" && o.ts > atTs) continue;
      const key = `${o.op}\u0000${o.table}\u0000${JSON.stringify(o.row)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = byTable.get(o.table) ?? { read: [], stored: [] };
      (o.op === "write" ? entry.stored : entry.read).push(o.row);
      byTable.set(o.table, entry);
    } catch {
      continue;
    }
  }
  return byTable;
}

interface DbColumn {
  name: string;
  type?: string;
  nullable?: boolean;
  description?: string;
}
interface DbTable {
  name: string;
  columns?: DbColumn[];
}
interface SchemaChange {
  story_id?: string;
  table?: string;
  kind?: string;
  detail?: string;
}

function readDbDesign(feature: string): { tables: DbTable[]; changes: SchemaChange[] } | null {
  const art = readArtifactAtHead(`features/${feature}/db-design.json`);
  if (!art.content) return null;
  try {
    const d = JSON.parse(art.content) as { tables?: DbTable[]; schema_changes?: SchemaChange[] };
    return { tables: d.tables ?? [], changes: d.schema_changes ?? [] };
  } catch {
    return null;
  }
}

interface SnapEntry {
  testId: string;
  table: string;
  ts: string;
  rows: Record<string, unknown>[];
  rowCount: number | null;
  isolated: boolean;
}

/** Read the whole snapshot log once, newest-insertion-order preserved. */
function readAllSnapshots(): SnapEntry[] {
  const abs = resolveContained(consortDir(), SNAPSHOT_FILE);
  if (!abs) return [];
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const out: SnapEntry[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s) as {
        test_id?: string;
        table?: string;
        ts?: string;
        rows?: Record<string, unknown>[];
        row_count?: number | null;
        isolated?: boolean;
      };
      if (typeof o.test_id !== "string" || typeof o.table !== "string") continue;
      out.push({
        testId: o.test_id,
        table: o.table,
        ts: o.ts ?? "",
        rows: o.rows ?? [],
        rowCount: o.row_count ?? null,
        isolated: !!o.isolated,
      });
    } catch {
      continue;
    }
  }
  return out;
}

/** Latest snapshot per table for a given test_id (the last line wins). */
function snapshotForTest(all: SnapEntry[], testId: string): Map<string, SnapEntry> {
  const byTable = new Map<string, SnapEntry>();
  if (!testId) return byTable;
  for (const e of all) if (e.testId === testId) byTable.set(e.table, e);
  return byTable;
}

/** A stable, order-independent identity for a row (same column values = same row). */
function rowKey(row: Record<string, unknown>): string {
  const keys = Object.keys(row).sort();
  return JSON.stringify(keys.map((k) => [k, row[k]]));
}

/** For each row in `rows`, the EARLIEST test (by ts, up to and including the viewed test) whose
 *  snapshot of this table already contained that exact row — i.e. the test that drove the row into
 *  this state. A row first seen at the viewed test is attributed to it. */
function attributeRows(
  all: SnapEntry[],
  table: string,
  rows: Record<string, unknown>[],
  viewedTestId: string,
  viewedTs: string,
): (string | null)[] {
  const history = all
    .filter((e) => e.table === table && (viewedTs ? e.ts <= viewedTs : true))
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const firstSeen = new Map<string, string>();
  for (const e of history) {
    for (const r of e.rows) {
      const k = rowKey(r);
      if (!firstSeen.has(k)) firstSeen.set(k, e.testId);
    }
  }
  return rows.map((r) => firstSeen.get(rowKey(r)) ?? viewedTestId ?? null);
}

export async function GET(req: NextRequest) {
  const feature = req.nextUrl.searchParams.get("feature") ?? "";
  const story = req.nextUrl.searchParams.get("story") ?? "";
  const testId = req.nextUrl.searchParams.get("testId") ?? "";
  // `at` = the playhead's ISO timestamp (DashboardState.atTimestamp). Empty = live edge (no filter —
  // show the freshest capture). When set, the view is SCRUBBER-FAITHFUL: capture written AFTER the
  // playhead is hidden, so a test's records appear only once the playhead reaches when it ran.
  const atTs = req.nextUrl.searchParams.get("at") ?? "";
  if (!isSafeSegment(feature) || !isSafeSegment(story)) {
    return NextResponse.json({ error: "bad feature/story" }, { status: 400 });
  }

  const design = readDbDesign(feature);
  if (!design) return NextResponse.json({ available: false, reason: "no db-design.json" });

  const all = readAllSnapshots().filter((e) => !atTs || e.ts <= atTs);
  const byTable = snapshotForTest(all, testId);
  const interactions = readInteractionsForTest(testId, atTs); // precise per-test read/stored rows

  // Tables to show = those the story structurally changes (schema_changes) UNION those the VIEWED
  // TEST actually captured a snapshot for OR touched (read/stored). The union is what makes READ-ONLY
  // stories work: a detail view (e.g. S3 sku-detail) alters no schema, so it has no schema_changes,
  // but its tests still read stock_records — so the table appears for them. Structure from db-design.
  const touched = new Set(design.changes.filter((c) => c.story_id === story && c.table).map((c) => c.table as string));
  for (const name of byTable.keys()) touched.add(name);
  for (const name of interactions.keys()) touched.add(name);
  const storyTables = design.tables.filter((t) => touched.has(t.name));

  const tables = storyTables.map((t) => {
    const s = byTable.get(t.name);
    const rows = s?.rows ?? [];
    const io = interactions.get(t.name);
    return {
      name: t.name,
      columns: t.columns ?? [],
      changes: design.changes.filter((c) => c.story_id === story && c.table === t.name),
      rows,
      // Per-row provenance: the T# that drove each row into this state (see attributeRows).
      rowDrivers: attributeRows(all, t.name, rows, testId, s?.ts ?? ""),
      // Precise per-test interactions (app/consort_capture.py): exactly the rows THIS test read/wrote.
      retrieved: io?.read ?? [],
      stored: io?.stored ?? [],
      rowCount: s?.rowCount ?? null,
      capturedAt: s?.ts ?? null, // null = no snapshot recorded for this test yet
      isolated: s?.isolated ?? false, // true = @migration test (isolated ephemeral branch, schema round-trip)
    };
  });

  return NextResponse.json({ available: true, testId, tables });
}
