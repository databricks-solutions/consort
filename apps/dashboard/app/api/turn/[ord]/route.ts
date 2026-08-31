import { NextRequest, NextResponse } from "next/server";
import { resolveSource } from "@/lib/sources";
import { classify } from "@/lib/sources/replay";
import type { SourceMode } from "@/lib/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/turn/<ord>                  → a recorded turn: metadata, transcript, produced files
// GET /api/turn/<ord>?file=<rel>       → one produced file's snapshot content
// GET /api/turn/<ord>?mode=replay      → explicit mode (defaults as /api/state does)
//
// Served lazily, per the plan's decision 1: Kevin's build embeds all 126 turns into a 1.5 MB
// single-file HTML, which is a virtue for offline sharing but the wrong runtime model. Fetching
// one turn on demand keeps the first paint fast and lets the same UI serve live and replay.
//
// File contents are NOT included in the turn payload for the same reason — a turn can produce
// a dozen files and the panel shows one at a time. `?file=` fetches the selected one.
//
// SECURITY: `file` is attacker-controlled and becomes a filesystem path. `readFileContent`
// resolves it and requires containment under <turn>/files/, which is why this route can pass it
// through — review found that check missing, and traversal read /etc/passwd. Do not bypass it.
export async function GET(req: NextRequest, ctx: { params: Promise<{ ord: string }> }) {
  try {
    const { ord: ordRaw } = await ctx.params;
    // Require plain digits, then parse. `Number()` alone is too permissive for a path segment:
    // `Number("")` is 0 (so an empty ordinal would serve turn 0), `Number(" 1 ")` is 1, and
    // `Number("1e3")` is 1000 — each silently resolving to a turn the caller didn't ask for.
    const ord = /^\d+$/.test(ordRaw) ? Number(ordRaw) : NaN;
    if (!Number.isSafeInteger(ord)) {
      return NextResponse.json({ error: `Not a turn ordinal: ${JSON.stringify(ordRaw)}` }, { status: 400 });
    }

    const modeParam = req.nextUrl.searchParams.get("mode");
    const requested: SourceMode | undefined =
      modeParam === "live" || modeParam === "replay" ? modeParam : undefined;
    const { source } = resolveSource(requested);

    // Turns come from a recorded `turns/` corpus, which the `transcripts` capability encodes.
    // Replay always has one; a LIVE board has one only when a companion record dir is configured
    // and producing (Phase B). Gate on the capability + method presence, NOT `instanceof
    // ReplaySource`, so a recording live source serves turns too. Answer 409 rather than 404 — the
    // turn isn't missing, this source fundamentally has no turns corpus (yet).
    if (!source.capabilities.has("transcripts") || !source.turn || !source.file || !source.transcript) {
      return NextResponse.json(
        {
          error:
            "Turns are recorded per-run. They exist in replay mode, or in a live build recording to a companion record dir (CONSORT_RECORD_DIR); this source has none.",
          mode: source.mode,
        },
        { status: 409 },
      );
    }

    const turn = source.turn(ord);
    if (!turn) return NextResponse.json({ error: `No turn ${ord} in this corpus` }, { status: 404 });

    const rel = req.nextUrl.searchParams.get("file");
    if (rel !== null) {
      // A file request answers only about that file, so the panel's tab switch is one small
      // response rather than the whole turn again.
      const f = source.file(ord, rel);
      return NextResponse.json({ ord, path: rel, ...f });
    }

    return NextResponse.json({
      ...turn,
      // Classified here rather than in the client so "is this code or an artifact?" has exactly
      // one definition, shared with the file response above.
      //
      // `classify` directly, NOT `source.file()`: the latter also reads the file, so this
      // discarded every produced file's contents just to keep `.kind` — 82 KB across 21 files
      // for turn 81, 187 KB for turn 15. That is precisely the per-request cost this route
      // exists to avoid. `classify` is a pure string function on the path.
      //
      // `?? []` on both lists because turn.json genuinely omits keys (this PR relaxed most of
      // TurnDetail to optional for that reason, and a turn without `produced` 500'd here).
      produced: (turn.produced ?? []).map((p) => ({ path: p, kind: classify(p) })),
      deleted: turn.deleted ?? [],
      transcript: source.transcript(ord),
      // The transcript SUMMARY (model, tool count) lives on turn.json under the same key, so
      // it would be shadowed by the parsed body above. Keep both, named distinctly.
      transcriptSummary: turn.transcript ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
