import { NextRequest, NextResponse } from "next/server";
import { resolveSource } from "@/lib/sources";
import type { SourceMode } from "@/lib/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/artifact?path=<rel>            → an artifact the log named, read at the project's HEAD
// GET /api/artifact?path=<rel>&mode=live  → explicit mode (defaults as /api/state does)
//
// The live half of the turn drill-down. A live project has no per-turn corpus, so the deepest it
// can show for an `artifact.written` row is the file as it is NOW — HEAD content. Replay shows
// richer per-turn snapshots through /api/turn instead, so it does NOT implement `artifactAtHead`;
// this route 409s there rather than pretending, the same shape /api/turn uses for a live project
// with no turns corpus.
//
// SECURITY: `path` is attacker-controlled and becomes a filesystem path. `readArtifactAtHead`
// (via lib/safepath.ts) realpath-resolves it and requires containment under `.sftdd/` before any
// read — the same audited guard the replay file reader uses. Do not bypass it.
export async function GET(req: NextRequest) {
  try {
    const rel = req.nextUrl.searchParams.get("path");
    if (rel === null || rel === "") {
      return NextResponse.json({ error: "Missing ?path=" }, { status: 400 });
    }

    const modeParam = req.nextUrl.searchParams.get("mode");
    const requested: SourceMode | undefined =
      modeParam === "live" || modeParam === "replay" ? modeParam : undefined;

    const { source } = resolveSource(requested);

    // Gated on the capability + method presence, not on `mode === "live"`, so a future source
    // that can read HEAD gets this for free and one that can't isn't asked. Replay lands here:
    // it has artifactContent but as per-turn snapshots, reached through /api/turn.
    if (!source.capabilities.has("artifactContent") || !source.artifactAtHead) {
      return NextResponse.json(
        {
          error: "This source has no HEAD artifact content. In replay, open the turn that produced the file instead.",
          mode: source.mode,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(source.artifactAtHead(rel));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
