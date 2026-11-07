import { NextRequest, NextResponse } from "next/server";
import { resolveSource } from "@/lib/sources";
import type { SourceMode } from "@/lib/source";

// Always re-read the source on each request; never cache. (The read itself is mtime-cached
// inside `source.events()` → `readEvents()`, so a poll that hits an unchanged log is cheap.)
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/events?mode=live|replay
//
// The RAW event log, oldest first, plus its length — the SAME array `/api/state` folds. It exists
// so the client can fold the board ITSELF while the scrubber is dragging: `fold(events, EMPTY_SNAP,
// at, pinned)` runs synchronously in the browser (the fold is pure/isomorphic), so the board tracks
// the playhead every render instead of waiting for a `/api/state` round-trip to settle on STOP.
// Served off `source.events()` (the mtime cache), on the same 2s cadence as the activity timeline,
// so a live run's new events reach the client and the scrubber's right edge keeps growing.
//
// Source-agnostic, exactly like /api/state: ask resolveSource for the events, return them. A replay
// corpus and a live tail both flow through here unchanged.
export async function GET(req: NextRequest) {
  try {
    const modeParam = req.nextUrl.searchParams.get("mode");
    const requested: SourceMode | undefined =
      modeParam === "live" || modeParam === "replay" ? modeParam : undefined;

    const { source, available } = resolveSource(requested);
    if (!available) {
      return NextResponse.json({ available: false, mode: source.mode, totalEventCount: 0, events: [] });
    }
    const events = source.events();
    return NextResponse.json({ available: true, mode: source.mode, totalEventCount: events.length, events });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
