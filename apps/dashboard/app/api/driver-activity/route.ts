import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { consortDir } from "@/lib/consort";
import { resolveContained } from "@/lib/safepath";
import { renderToolMarker, type ToolActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/driver-activity → the LIVE "what is the agent doing right now" tail, for the activity
// ticker's live edge. Reads the always-on `agent-live.log` sidecar (written on every run now, not
// gated on RECORD_DIR), takes the CURRENT (last) turn's segment, and returns its role, its ordered
// tool actions (rendered legible via lib/activity), whether the turn is still open, and the most
// recent reasoning line. Replay / completed turns do NOT use this — they read the turn's recorded
// `tools[]` via /api/turn (the sidecar is a live per-run stream, excluded from the replay corpus),
// so `{ available: false }` is the honest answer when there is no sidecar.
//
// SECURITY: reads a FIXED filename ("agent-live.log") under the project's `.consort`, resolved
// through the same `resolveContained` guard every file read uses. No request-supplied path.
export async function GET(_req: NextRequest) {
  try {
    const abs = resolveContained(consortDir(), "agent-live.log");
    if (!abs) {
      return NextResponse.json({ available: false, reason: "no agent-live.log (replay corpus or no run yet)" });
    }
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      return NextResponse.json({ available: false, reason: "agent-live.log unreadable" });
    }

    // The current turn is everything after the final "=== <ts> TURN START role=… :: …" header.
    const startIdx = text.lastIndexOf("\n=== ");
    const seg = startIdx === -1 ? text : text.slice(startIdx + 1);
    const lines = seg.split("\n");
    const header = lines[0] ?? "";
    const role = header.match(/TURN START role=(\S+)/)?.[1] ?? null;
    const closed = seg.includes("TURN CLOSE");

    const items: ToolActivity[] = [];
    let recentText = "";
    for (const ln of lines.slice(1)) {
      if (ln.startsWith("  · ")) {
        const a = renderToolMarker(ln.slice(4));
        if (a.verb) items.push(a);
      } else if (ln.startsWith("=== ") || ln.startsWith("--- ") || ln.startsWith("  ⏳") || ln.startsWith("  ✖")) {
        continue; // turn boundaries / heartbeat / timeout markers, not activity
      } else if (ln.trim()) {
        recentText = ln.trim(); // latest reasoning delta
      }
    }

    return NextResponse.json({
      available: true,
      role,
      working: !closed,
      items: items.slice(-24), // the recent tail, oldest→newest
      recentText: recentText.slice(0, 180),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
