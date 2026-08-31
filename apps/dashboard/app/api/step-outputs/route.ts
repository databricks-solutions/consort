import { NextRequest, NextResponse } from "next/server";
import { resolveSource } from "@/lib/sources";
import type { SourceMode } from "@/lib/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/step-outputs?node=<id>&feature=<f>   → the deliverables that lifecycle step produced
// GET /api/step-outputs?path=<rel>              → one deliverable's content
// GET /api/step-outputs?...&mode=replay         → explicit mode (defaults as /api/state does)
//
// The WorkflowGraph drill-down. Two shapes over one route, mirroring /api/turn (list vs ?file=):
// `?node=` lists a step's assets, `?path=` reads one. `path` takes precedence when both are given.
//
// SECURITY: `path` is attacker-controlled and becomes a filesystem path. The source's
// `stepOutputContent` routes it through the same audited containment guard (lib/safepath.ts) the
// replay turn-file and live HEAD readers use, rooted at `recorded-artifacts/`. Do not bypass it.
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const modeParam = params.get("mode");
    const requested: SourceMode | undefined =
      modeParam === "live" || modeParam === "replay" ? modeParam : undefined;
    const { source } = resolveSource(requested);

    // Gated on the capability + method presence, not on `mode === "replay"`, so a future live
    // source that can surface step outputs gets this for free and one that can't isn't asked.
    if (!source.capabilities.has("stepOutputs") || !source.stepOutputs || !source.stepOutputContent) {
      return NextResponse.json(
        {
          error: "This source has no step outputs. In replay, point CONSORT_CORPUS_DIR at a recorded corpus.",
          mode: source.mode,
        },
        { status: 409 },
      );
    }

    // Content branch takes precedence: a `?path=` request is asking to read a specific asset.
    const path = params.get("path");
    if (path !== null && path !== "") {
      return NextResponse.json(source.stepOutputContent(path));
    }

    const node = params.get("node");
    if (node === null || node === "") {
      return NextResponse.json({ error: "Missing ?node= (or ?path=)" }, { status: 400 });
    }
    const feature = params.get("feature");
    return NextResponse.json(source.stepOutputs(node, feature));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
