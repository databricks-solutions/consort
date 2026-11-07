import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { readArtifactAtHead, consortDir, isSafeSegment } from "@/lib/consort";
import { resolveContained } from "@/lib/safepath";
import { inScope, deriveColumns } from "@/lib/story-scope";

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
// SCOPING: test ids are per-STORY (T1,T2… recur in every story AND every feature), so a capture line
// is matched to the viewed feature+story — not test_id alone, which would cross-contaminate two
// features' same-id tests (the same leak the lightbox bubbles had). Lines that stamp feature_id/
// story_id must match; a line that stamps NEITHER (a pre-scoping corpus) is kept, so old runs still
// render by test_id alone (back-compat).
//
// Table names + columns + the story's schema_changes come from the feature's `db-design.json`.
// SECURITY: fixed-name reads under the project `.consort`, slug-validated feature/story; no DB.

const SNAPSHOT_FILE = "table-snapshots.jsonl";
const INTERACTIONS_FILE = "test-interactions.jsonl";
const AGENT_LOG_FILE = "agent-log.jsonl";

/** Has test `testId` GREENED for this feature+story by the playhead? The authoritative signal is the
 *  STAMPED `test.result` trail in the agent-log (status green|refactored). A test's table records must
 *  NOT appear before it greens at the playhead — a seeded-but-RED or not-yet-run test shows nothing,
 *  and the rows surface only from the green point onward (then the `atTs` capture filter walks the
 *  history through scrubbing). At the live edge (atTs empty) any green result counts. This closes the
 *  "records for a test before it's done" defect: a RED cycle writes real seed rows (the no-mock path),
 *  but the view must stay empty until the test actually passes at the viewed moment. */
function testGreenedBy(testId: string, feature: string, story: string, atTs: string): boolean {
  if (!testId) return false;
  const abs = resolveContained(consortDir(), AGENT_LOG_FILE);
  if (!abs) return false;
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return false;
  }
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s) as { event?: string; timestamp?: string; metadata?: { test_id?: string; status?: string; feature_id?: string; story_id?: string } };
      if (o.event !== "test.result") continue;
      const m = o.metadata ?? {};
      if (m.test_id !== testId) continue;
      if (m.status !== "green" && m.status !== "refactored") continue;
      if (!inScope({ featureId: m.feature_id, storyId: m.story_id }, feature, story)) continue;
      if (atTs && typeof o.timestamp === "string" && o.timestamp > atTs) continue;
      return true;
    } catch {
      continue;
    }
  }
  return false;
}


interface InteractionLine {
  test_id?: string;
  table?: string;
  op?: string;
  row?: Record<string, unknown>;
  ts?: string;
  feature_id?: string;
  story_id?: string;
}

/** Read the whole interactions log once (app/consort_capture.py per-request events). */
function readAllInteractions(): InteractionLine[] {
  const abs = resolveContained(consortDir(), INTERACTIONS_FILE);
  if (!abs) return [];
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const out: InteractionLine[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s) as InteractionLine);
    } catch {
      continue;
    }
  }
  return out;
}

/** Per-test RETRIEVED/STORED rows (the precise capture written by the app's per-request events —
 *  app/consort_capture.py), grouped by table. Unlike the whole-table snapshot, these are exactly the
 *  rows THIS test read or wrote. Returns a Map<table, {read, stored}>. */
function readInteractionsForTest(all: InteractionLine[], testId: string, atTs: string, feature: string, story: string, attributionActive: boolean): Map<string, { read: Record<string, unknown>[]; stored: Record<string, unknown>[] }> {
  const byTable = new Map<string, { read: Record<string, unknown>[]; stored: Record<string, unknown>[] }>();
  if (!testId) return byTable;
  const seen = new Set<string>(); // dedup identical (op,table,row) lines across requests
  for (const o of all) {
    if (o.test_id !== testId || typeof o.table !== "string" || !o.row) continue;
    // Same feature+story scope as the snapshots — a per-story test id can't borrow another story's
    // interactions. Unstamped lines are kept only in a pre-attribution corpus (see inScope): once this
    // feature stamps its captures, a `(None,None)` line is a foreign leftover, not this test's.
    if (!inScope({ featureId: o.feature_id, storyId: o.story_id }, feature, story, attributionActive)) continue;
    // Scrubber-faithful: skip interactions AFTER the playhead so a test's rows appear only once the
    // playhead reaches the moment it ran — a test that executes LATER in the run shows nothing here.
    if (atTs && typeof o.ts === "string" && o.ts > atTs) continue;
    const key = `${o.op}\u0000${o.table}\u0000${JSON.stringify(o.row)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = byTable.get(o.table) ?? { read: [], stored: [] };
    (o.op === "write" ? entry.stored : entry.read).push(o.row);
    byTable.set(o.table, entry);
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
  featureId?: string;
  storyId?: string;
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
        feature_id?: string;
        story_id?: string;
      };
      if (typeof o.test_id !== "string" || typeof o.table !== "string") continue;
      out.push({
        testId: o.test_id,
        table: o.table,
        ts: o.ts ?? "",
        rows: o.rows ?? [],
        rowCount: o.row_count ?? null,
        isolated: !!o.isolated,
        ...(typeof o.feature_id === "string" ? { featureId: o.feature_id } : {}),
        ...(typeof o.story_id === "string" ? { storyId: o.story_id } : {}),
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

  // Gate: a test's records appear only once it has GREENED at the playhead. A RED cycle seeds real rows
  // (the no-mock path writes to the real DB), but showing them while the test is still RED/pending reads
  // as "records before the test is done". No green test.result ≤ the playhead ⇒ empty, with the schema
  // still available for context. Once green, the rows surface and the atTs filter below walks them.
  if (!testGreenedBy(testId, feature, story, atTs)) {
    return NextResponse.json({ available: true, testId, tables: [], note: "not green at this playhead" });
  }

  const rawSnaps = readAllSnapshots();
  const rawInteractions = readAllInteractions();
  // Attribution is "active" for a feature once ANY of its captures carry a feature stamp (post the
  // scm-utils attribution fix). From that point an UNSTAMPED line is a legacy/foreign leftover, not
  // this feature's — so it must not leak into a reused test id (a RED F2/S2 T32 showing F1/S1's rows).
  // Scoped PER-FEATURE so a feature that ran entirely pre-attribution (all lines unstamped) still
  // renders its own captures by id (no regression). Snapshot (pytest) AND interaction (app) stamps
  // are checked because a component-only story may stamp interactions but write no whole-table snapshot.
  const attributionActive = rawSnaps.some((e) => e.featureId === feature) || rawInteractions.some((o) => o.feature_id === feature);
  const all = rawSnaps.filter((e) => (!atTs || e.ts <= atTs) && inScope(e, feature, story, attributionActive));
  const byTable = snapshotForTest(all, testId);
  const interactions = readInteractionsForTest(rawInteractions, testId, atTs, feature, story, attributionActive); // precise per-test read/stored rows

  // Tables to show = those the story structurally changes (schema_changes) UNION those the VIEWED
  // TEST actually captured a snapshot for OR touched (read/stored). The union is what makes READ-ONLY
  // stories work: a detail view (e.g. S3 sku-detail) alters no schema, so it has no schema_changes,
  // but its tests still read stock_records — so the table appears for them. Structure from db-design.
  const touched = new Set(design.changes.filter((c) => c.story_id === story && c.table).map((c) => c.table as string));
  for (const name of byTable.keys()) touched.add(name);
  for (const name of interactions.keys()) touched.add(name);
  // Show EVERY touched table, not just those the CURRENT feature's db-design declares. A story that
  // reads/writes a PRIOR feature's table (e.g. F2's adjust story touching F1's stock_records) captures
  // interactions/snapshots on it, but that table is absent from THIS feature's db-design; intersecting
  // with design.tables (the old behaviour) silently HID all its reads/writes — so "retrieved" came up
  // empty even though the rows were read. db-design tables lead (declared order); extra touched tables
  // follow (sorted), with columns derived from the captured rows.
  const designByName = new Map(design.tables.map((t) => [t.name, t]));
  const ordered = [
    ...design.tables.filter((t) => touched.has(t.name)).map((t) => t.name),
    ...[...touched].filter((n) => !designByName.has(n)).sort(),
  ];

  const tables = ordered.map((name) => {
    const dt = designByName.get(name);
    const s = byTable.get(name);
    const rows = s?.rows ?? [];
    const io = interactions.get(name);
    return {
      name,
      // db-design columns when this feature declares the table, else derived from the captured rows.
      columns: dt?.columns ?? deriveColumns(rows, io?.read ?? [], io?.stored ?? []),
      changes: design.changes.filter((c) => c.story_id === story && c.table === name),
      rows,
      // Per-row provenance: the T# that drove each row into this state (see attributeRows).
      rowDrivers: attributeRows(all, name, rows, testId, s?.ts ?? ""),
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
