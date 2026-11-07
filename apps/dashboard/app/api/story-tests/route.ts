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

    // The paths are `.consort/`-relative (artifactAtHead / stepOutputContent both resolve under the
    // project's `.consort/` dir and drop the prefix), never project-root-relative.
    const readRel = (rel: string) =>
      source.artifactAtHead ? source.artifactAtHead(rel) : source.stepOutputContent ? source.stepOutputContent(rel) : null;

    // Prefer HEAD content (live: greens appear as the driver works). Replay has no artifactAtHead but
    // resolves step-output content under its recorded corpus. Either returns ArtifactContent.
    let read = readRel(`features/${feature}/stories/${story}/test-list-per-story.json`);

    if (read === null) {
      return NextResponse.json(
        { error: "This source cannot read story artifacts. In replay, open the turn that authored the test-list.", mode: source.mode },
        { status: 409 },
      );
    }

    // FALLBACK to the DESIGN-authored list. `test-list-per-story.json` is only split out at BUILD start
    // (navigator-red), so between design-complete and the first RED the per-story file is absent — yet
    // the test-strategist has ALREADY authored the story's tests into `analyst-ordered.json` (same
    // `{items:[…]}` shape, per-story scope, each item `status: "pending"`). Showing those is what makes
    // the lightbox list the authored tests at DESIGN time instead of only appearing after navigator-red
    // (the user-reported defect). When the per-story file DOES exist it wins — it carries live status.
    let note: string | undefined = read.content === null ? (read.reason ?? undefined) : undefined;
    if (read.content === null) {
      const authored = readRel(`features/${feature}/stories/${story}/analyst-ordered.json`);
      if (authored && authored.content !== null) {
        read = authored;
        note = "design-authored (analyst-ordered); per-story list not yet split at build";
      }
    }

    // Still absent (story not designed yet, or an older corpus layout): an empty list, not an error —
    // the lightbox shows its "no tests authored yet" state rather than a failure.
    if (read.content === null) {
      return NextResponse.json({ feature, story, mode: source.mode, items: [], note });
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

    // The REAL supersession signal (never inferred): the Navigator's per-AC `superseded-tests.json`
    // (key `tests`, alias `superseded_tests`) and a `regression-assessment.json` with `superseded:true`
    // + a `tests` array — both under `.consort/cycles/<F>/<S>/<AC>/`. A test is superseded ONLY when it
    // is named here; absent artifacts ⇒ nothing superseded. ACs come from the authored items' `ac_id`.
    const readJsonAtHead = (rel: string): unknown | null => {
      const r = source.artifactAtHead ? source.artifactAtHead(rel) : source.stepOutputContent ? source.stepOutputContent(rel) : null;
      if (!r || r.content === null) return null;
      try {
        return JSON.parse(r.content);
      } catch {
        return null;
      }
    };
    const idsFrom = (arr: unknown): string[] =>
      Array.isArray(arr) ? arr.map((t) => (typeof t === "string" ? t : t && typeof t === "object" && typeof (t as { id?: unknown }).id === "string" ? (t as { id: string }).id : null)).filter((x): x is string => x !== null) : [];
    const acIds = [...new Set(items.map((t) => (t && typeof t === "object" ? (t as { ac_id?: unknown }).ac_id : null)).filter((a): a is string => typeof a === "string" && SAFE_SEGMENT.test(a)))];
    const superseded = new Set<string>();
    for (const ac of acIds) {
      const flagged = readJsonAtHead(`cycles/${feature}/${story}/${ac}/superseded-tests.json`) as { tests?: unknown; superseded_tests?: unknown } | null;
      for (const id of idsFrom(flagged?.tests ?? flagged?.superseded_tests)) superseded.add(id);
      const regression = readJsonAtHead(`cycles/${feature}/${story}/${ac}/regression-assessment.json`) as { superseded?: unknown; tests?: unknown } | null;
      if (regression?.superseded === true) for (const id of idsFrom(regression.tests)) superseded.add(id);
    }

    return NextResponse.json({ feature, story, mode: source.mode, items, superseded: [...superseded], ...(note ? { note } : {}) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
