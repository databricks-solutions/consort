import { NextRequest, NextResponse } from "next/server";
import { resolveSource } from "@/lib/sources";
import type { SourceMode } from "@/lib/source";

// Always re-read the source on each request; never cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/state              → the live edge (whole log folded)
// GET /api/state?at=<n>       → time travel: fold only the first n events
// GET /api/state?mode=replay  → replay a corpus from CONSORT_CORPUS_DIR
//
// `at` is clamped inside the fold, so a garbage or out-of-range value degrades to the live
// edge rather than erroring. The response carries atEventIndex / totalEventCount / atLive.
// When scrubbed back the fold reconstructs gates, stories, blockers, feature and lane from
// the log prefix. In LIVE mode test COUNTS are the one thing that can't rewind, flagged via
// progress.testsHistorical; in replay they can, from the corpus's per-turn test-list snapshots.
//
// The route does not know where the data comes from: it asks for a source and folds it. That
// is what let sources/replay.ts drop in without touching this file — the only edit it needed
// was this comment.
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("at");
    const parsed = raw === null ? undefined : Number(raw);
    const upTo = parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;

    const modeParam = req.nextUrl.searchParams.get("mode");
    const requested: SourceMode | undefined =
      modeParam === "live" || modeParam === "replay" ? modeParam : undefined;

    // ?feature=<id> pins the board to one feature (FeatureSwitcher) — a filter over the same
    // playhead, not a seek. An id the folded window hasn't seen is dropped inside the fold, so a
    // stale pin degrades to the playhead's feature rather than emptying the board.
    const featureParam = req.nextUrl.searchParams.get("feature");
    const pinnedFeature = featureParam && featureParam.length > 0 ? featureParam : null;

    const { source, available, note } = resolveSource(requested);
    const state = source.getState(upTo, pinnedFeature);

    // Mode metadata travels alongside the state so the header can show the mode switch
    // without the client re-deriving what the server just decided.
    //
    // `correlationSummary` is optional on the interface (live has no corpus to disagree with),
    // so this stays source-agnostic: any source that can report pairing drift gets it rendered.
    // Scoped to the same playhead as the fold, so the banner describes what is on screen.
    return NextResponse.json({
      ...state,
      source: {
        mode: source.mode,
        describe: source.describe(),
        capabilities: [...source.capabilities],
        availableModes: available,
        note,
        correlation: source.correlationSummary?.(upTo) ?? null,
        correspondence: source.correspondenceSummary?.(upTo) ?? null,
        // Live only: is the record lane capturing a full corpus, or just the agent-log? Drives the
        // FidelityBanner. Null (replay, or any source that doesn't implement it) → no banner.
        fidelity: source.fidelity?.() ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
