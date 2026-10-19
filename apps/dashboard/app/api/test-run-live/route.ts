import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { consortDir } from "@/lib/consort";
import { resolveContained } from "@/lib/safepath";
import { reduceTestRunLog } from "@/lib/test-run";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/test-run-live → the LIVE per-test tail, for the test lightbox's live edge. Reads
// `.consort/test-run.jsonl`, which the scaffolded per-stack reporters (pytest / Playwright / Vitest,
// see lakebase-scm-utils templates) append to as each `@T<id>`-tagged test finishes. Reduces to the
// LATEST status per (test_id, file) — the last line for a key wins — so a test rerun within a cycle
// shows its final state. Mirrors /api/driver-activity: a per-run stream, NOT part of the replay
// corpus, so replay colours bubbles from the recorded `test.result` fold instead; `{ available:false }`
// is the honest answer when there is no ledger (replay, or no run yet).
//
// SECURITY: a FIXED filename ("test-run.jsonl") under the project `.consort`, resolved through the
// same `resolveContained` guard every file read uses. No request-supplied path.
export async function GET(_req: NextRequest) {
  try {
    const abs = resolveContained(consortDir(), "test-run.jsonl");
    if (!abs) {
      return NextResponse.json({ available: false, reason: "no test-run.jsonl (replay corpus or no run yet)" });
    }
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      return NextResponse.json({ available: false, reason: "test-run.jsonl unreadable" });
    }

    return NextResponse.json({ available: true, entries: reduceTestRunLog(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
