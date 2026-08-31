import { NextRequest, NextResponse } from "next/server";
import { resolveSource } from "@/lib/sources";
import type { SourceMode } from "@/lib/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/planning              → the run's planning artifacts for the current source
// GET /api/planning?mode=replay  → explicit mode (defaults as /api/state does)
//
// Planning is a STATIC snapshot of the run's start — proposals, t-shirt sizes, sprint backlog,
// plan gate — not timeline state, so it takes no `at`: there is no honest per-playhead version
// (the plan gate was approved once). Served on its own route rather than folded into
// /api/state so the board doesn't carry it on every 1 Hz poll; the BacklogPanel fetches it once.
//
// Source-agnostic: the route asks the resolved source for `planning()` and 409s if the source
// doesn't offer it — gated on the `planningBacklog` capability, the same pattern /api/turn uses
// for the replay-only `transcripts` capability.
export async function GET(req: NextRequest) {
  try {
    const modeParam = req.nextUrl.searchParams.get("mode");
    const requested: SourceMode | undefined =
      modeParam === "live" || modeParam === "replay" ? modeParam : undefined;

    const { source } = resolveSource(requested);

    // A source that doesn't declare planningBacklog (or doesn't implement planning()) has no
    // backlog to show. 409, not 404: the panel isn't missing a resource, this source can't have
    // one — the same distinction /api/turn draws for a live project with no turns corpus.
    if (!source.capabilities.has("planningBacklog") || !source.planning) {
      return NextResponse.json(
        {
          error: "This source has no planning artifacts.",
          mode: source.mode,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(source.planning());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
