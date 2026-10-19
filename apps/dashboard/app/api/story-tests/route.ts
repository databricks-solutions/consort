import { NextRequest, NextResponse } from "next/server";
import { resolveSource } from "@/lib/sources";
import type { SourceMode } from "@/lib/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/story-tests?feature=<F>&story=<S>            → the tests the navigator authored for a
// GET /api/story-tests?feature=<F>&story=<S>&mode=live    story, with each item's current status.
//
// The data behind the per-story test lightbox. The navigator's authored test-list already lives on
// disk at `.consort/features/<F>/stories/<S>/test-list-per-story.json` with a per-item `status`
// (pending|red|green|refactored|skipped), so this is a pure read — no new agent logging. Live reads
// it at HEAD (so greens appear as the driver turns them); replay reads the corpus copy where it has one.
//
// SECURITY: `feature`/`story` become filesystem path segments. They are validated against a strict
// slug pattern (no slashes, no leading dot/dash, so no `..` traversal) BEFORE the path is built, and
// the read then routes through the same `resolveContained` guard (lib/safepath.ts) every other file
// read uses, which realpath-contains the result under the project's `.consort/`.
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function GET(req: NextRequest) {
  try {
    const feature = req.nextUrl.searchParams.get("feature");
    const story = req.nextUrl.searchParams.get("story");
    if (!feature || !story || !SAFE_SEGMENT.test(feature) || !SAFE_SEGMENT.test(story)) {
      return NextResponse.json({ error: "Missing or invalid ?feature= / ?story=" }, { status: 400 });
    }

    const modeParam = req.nextUrl.searchParams.get("mode");
    const requested: SourceMode | undefined =
      modeParam === "live" || modeParam === "replay" ? modeParam : undefined;

    const { source } = resolveSource(requested);

    // The path is `.consort/`-relative (readArtifactAtHead / stepOutputContent both resolve under the
    // project's `.consort/` dir and drop the prefix), never project-root-relative.
    const rel = `features/${feature}/stories/${story}/test-list-per-story.json`;

    // Prefer HEAD content (live: greens appear as the driver works). Replay has no artifactAtHead but
    // resolves step-output content under its recorded corpus. Either returns ArtifactContent.
    const read = source.artifactAtHead
      ? source.artifactAtHead(rel)
      : source.stepOutputContent
        ? source.stepOutputContent(rel)
        : null;

    if (read === null) {
      return NextResponse.json(
        { error: "This source cannot read story artifacts. In replay, open the turn that authored the test-list.", mode: source.mode },
        { status: 409 },
      );
    }

    // Absent file (story not designed yet, or an older corpus layout): an empty list, not an error —
    // the lightbox shows its "no tests authored yet" state rather than a failure.
    if (read.content === null) {
      return NextResponse.json({ feature, story, mode: source.mode, items: [], note: read.reason });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(read.content);
    } catch {
      return NextResponse.json({ error: "test-list-per-story.json is not valid JSON" }, { status: 422 });
    }

    // The per-story file is `{ feature_id, story_id, ordered_for, items[] }`; tolerate a bare array too.
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : [];

    return NextResponse.json({ feature, story, mode: source.mode, items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
