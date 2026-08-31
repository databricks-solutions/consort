/**
 * Replay source tests.
 *
 * These run against the REAL corpus when one is on disk, and skip otherwise — the corpus
 * lives in the consort repo / plugin marketplace, not in this repo (only the log and turns
 * index are vendored as fixtures). `CONSORT_TEST_CORPUS_DIR` overrides the search.
 *
 * The pure parsers (`parseTranscript`, `classify`, `readFileContent`) are tested
 * unconditionally, since they take strings and paths rather than a corpus.
 *
 * What these deliberately assert, per the plan's warning that PR #10's log-derived inference
 * was fitted to ONE log: the replay source must NOT hand the fold the corpus's end-state
 * artifacts. Recorded `recorded-artifacts/` describes the run's finish, and feeding that in
 * would resurrect the "finished story at event 12" bug.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReplaySource, classify, clearCorpusCache, parseTranscript, readFileContent } from "./replay";
import { driftMessage } from "../correlate";
import { RECENT_EVENT_TAIL } from "../reducer";

// The corpus ships in the consort repo; the marketplace checkout is where it lands locally.
// v0.3.7 relocated it from examples/sftdd-scenarios/ to examples/replay/corpora/ — try the new
// location first, then the legacy one, so the tests run against either kit version on disk.
const MARKETPLACE = join(process.env.HOME ?? "", ".claude/plugins/marketplaces/databricks-solutions");
const CANDIDATES = [
  process.env.CONSORT_TEST_CORPUS_DIR,
  join(MARKETPLACE, "examples/replay/corpora/stockflow-rerecord"),
  join(MARKETPLACE, "examples/sftdd-scenarios/stockflow-rerecord"),
].filter((p): p is string => !!p);

const CORPUS = CANDIDATES.find((p) => existsSync(join(p, "agent-log.jsonl")));
const KIT_COMMIT = "cad5f5fb5eb7e59a703722284b6a5858ddf3fff0";

// ---------------------------------------------------------------------------
// Pure parsers — no corpus needed.

describe("replay — classify", () => {
  it("treats artifact-root bookkeeping as artifact even when it looks like code", () => {
    // The rule that matters: a JSON under the artifact root is workflow state, not the code the
    // run produced. Showing it in a code view would bury the actual diff. v0.3.7 renamed the root
    // .sftdd/ → .consort/, so both (and legacy .tdd/) must classify the same way.
    expect(classify(".consort/features/F1/test-list.json")).toBe("artifact");
    expect(classify(".consort/planning/feature-proposals.md")).toBe("artifact");
    expect(classify(".sftdd/features/F1/test-list.json")).toBe("artifact");
    expect(classify(".sftdd/planning/feature-proposals.md")).toBe("artifact");
  });

  it("classifies by directory prefix and by extension", () => {
    expect(classify("app/api/stock/route.ts")).toBe("code");
    expect(classify("tests/test_stock.py")).toBe("code");
    expect(classify("alembic/versions/001_init.py")).toBe("code");
    expect(classify("lib/thing.tsx")).toBe("code"); // extension alone is enough
    expect(classify("README.md")).toBe("artifact");
    expect(classify("docs/design.md")).toBe("artifact");
    expect(classify("noext")).toBe("artifact");
  });
});

describe("replay — parseTranscript", () => {
  it("splits prompt / tools / reasoning and strips the prompt fence", () => {
    const md = [
      "# Turn",
      "## Prompt",
      "```",
      "do the thing",
      "and the other thing",
      "```",
      "## Tools used",
      "- Read(a.ts)",
      "- Edit(b.ts)",
      "ignored non-list line",
      "## Final reasoning",
      "I did the thing.",
    ].join("\n");
    expect(parseTranscript(md)).toEqual({
      prompt: "do the thing\nand the other thing",
      tools: ["Read(a.ts)", "Edit(b.ts)"],
      reasoning: "I did the thing.",
    });
  });

  it("handles missing sections and an unfenced prompt", () => {
    expect(parseTranscript("## Prompt\nbare prompt")).toEqual({
      prompt: "bare prompt",
      tools: [],
      reasoning: "",
    });
    expect(parseTranscript("")).toEqual({ prompt: "", tools: [], reasoning: "" });
    // Headers are matched case-insensitively, as in the original.
    expect(parseTranscript("## PROMPT\nx").prompt).toBe("x");
  });
});

describe("replay — readFileContent guards", () => {
  const dir = mkdtempSync(join(tmpdir(), "replay-file-"));
  const put = (rel: string, body: string) => {
    const p = join(dir, "files", rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, body);
  };

  it("refuses to read outside the turn's snapshot directory", () => {
    // Found in review, and it worked: `file(0, "../".repeat(30) + "etc/passwd")` returned the
    // real /etc/passwd, 9344 bytes, with reason null. `rel` reaches here from a request
    // parameter once Phase 3's TurnPanel fetches by path, so this is an arbitrary-file-read
    // primitive. The containment check runs before any stat, so nothing is even probed.
    put("app/a.ts", "export const a = 1;\n");
    for (const evil of [
      "../".repeat(30) + "etc/passwd",
      "../../../provenance.json",
      "../turn.json",
      "/etc/passwd", // absolute paths must not escape either
      "app/../../turn.json", // traversal after a legitimate-looking prefix
      "../files-evil/x.ts", // merely SHARING the prefix must not pass a naive startsWith
    ]) {
      // What matters is that nothing is read. The REASON differs by case and that is fine:
      // a target that exists outside the root is "(outside…)", while one that doesn't exist at
      // all fails realpath first and reports "(not captured…)" — which is also the honest
      // answer, and deliberately doesn't disclose whether a path outside the corpus exists.
      const r = readFileContent(dir, evil);
      expect(r.content, `escaped with ${evil}`).toBeNull();
      expect(r.reason, `escaped with ${evil}`).toMatch(/outside this turn's snapshot|not captured/);
    }
    // ...and normal relative paths still work, including a harmless inner `..`.
    expect(readFileContent(dir, "app/../app/a.ts").content).toBe("export const a = 1;\n");
  });

  it("refuses to follow a symlink out of the snapshot directory", () => {
    // The `../` fix was not enough, and review caught it: `resolve()` is purely LEXICAL and does
    // not follow links, so a corpus containing `files/leak.md -> /etc/passwd` sailed through
    // containment and served 9344 bytes of real /etc/passwd over HTTP 200. A corpus is
    // third-party data — it arrives from a git checkout — so a malicious or careless one must
    // not be able to read the host filesystem. Only realpath closes this.
    symlinkSync("/etc/passwd", join(dir, "files", "leak.md"));
    const r = readFileContent(dir, "leak.md");
    expect(r.content).toBeNull();
    // One reason for every "can't safely read this" case now that the guard is shared
    // (lib/safepath.ts): escaped and non-existent are deliberately indistinguishable, so an
    // attacker can't use the reason string to probe whether an out-of-tree path exists.
    expect(r.reason).toBe("(not captured in this turn's snapshot)");

    // A symlink INSIDE the snapshot is still fine — containment, not a ban on links.
    put("real/inner.ts", "export const x = 1;\n");
    symlinkSync(join(dir, "files", "real", "inner.ts"), join(dir, "files", "link-inner.ts"));
    expect(readFileContent(dir, "link-inner.ts").content).toBe("export const x = 1;\n");

    // A link to a DIRECTORY outside is also blocked, so traversal can't resume past it.
    symlinkSync("/etc", join(dir, "files", "etcdir"));
    expect(readFileContent(dir, "etcdir/passwd").content).toBeNull();
  });

  it("reads a text file, and reports why it can't read the others", () => {
    put("app/a.ts", "export const a = 1;\n");
    put("uv.lock", "lock");
    put("img.png", "\x89PNG");
    put("big.ts", "x".repeat(64 * 1024 + 1));

    expect(readFileContent(dir, "app/a.ts")).toEqual({ content: "export const a = 1;\n", reason: null });
    // Each guard names itself, so a UI can explain the gap instead of showing an empty pane.
    expect(readFileContent(dir, "uv.lock").reason).toBe("(skipped: lock file)");
    expect(readFileContent(dir, "img.png").reason).toContain("binary/non-text");
    expect(readFileContent(dir, "big.ts").reason).toContain("too large to embed");
    expect(readFileContent(dir, "nope.ts").reason).toBe("(not captured in this turn's snapshot)");
    // A directory is not a file — must not throw or read as empty content.
    expect(readFileContent(dir, "app").reason).toBe("(not captured in this turn's snapshot)");
  });

  it("cleans up", () => {
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unavailability — the loud-degradation path, testable without a real corpus.

describe("replay — unavailability names the missing piece", () => {
  it("distinguishes unset, missing, no-log and no-index", () => {
    expect(new ReplaySource("").unavailableReason()).toContain("CONSORT_CORPUS_DIR is not set");
    expect(new ReplaySource("/nonexistent/corpus").unavailableReason()).toContain("not found");

    const dir = mkdtempSync(join(tmpdir(), "replay-corpus-"));
    // A corpus with turns but no log is exactly the pre-6e73019 situation the plan describes,
    // so it gets its own message rather than a generic failure.
    mkdirSync(join(dir, "turns"), { recursive: true });
    writeFileSync(join(dir, "turns", "index.json"), JSON.stringify({ turns: [] }));
    expect(new ReplaySource(dir).unavailableReason()).toContain("no run log");

    // ...and a log with no turns index cannot be correlated.
    writeFileSync(join(dir, "agent-log.jsonl"), "");
    rmSync(join(dir, "turns"), { recursive: true, force: true });
    expect(new ReplaySource(dir).unavailableReason()).toContain("cannot correlate");

    rmSync(dir, { recursive: true, force: true });
  });

  it("an unavailable source folds to an error board, not an empty run", () => {
    // The whole point of `available()`: zero events must never render as "a run that hasn't
    // started yet". Same contract live has.
    const s = new ReplaySource("/nonexistent/corpus");
    const state = s.getState();
    expect(state.error).toContain("not found");
    expect(state.eventCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The real corpus.

describe.skipIf(!CORPUS)("replay — the real stockflow-rerecord corpus", () => {
  const src = () => new ReplaySource(CORPUS!);

  it("is available, and describes itself by scenario name", () => {
    const s = src();
    expect(s.available()).toBe(true);
    expect(s.unavailableReason()).toBeNull();
    expect(s.describe()).toBe("stockflow-rerecord (replay)");
    expect(s.provenance()?.kit_commit).toBe(KIT_COMMIT);
  });

  it("reads the same 421 events as the vendored fixture", () => {
    // The fixture is a byte copy of this file; if they ever diverge, every reducer test
    // asserting corpus behavior is testing something the replay source doesn't serve.
    expect(src().events().length).toBe(421);
  });

  it("declares replay-only capabilities and withholds live-only ones", () => {
    const c = src().capabilities;
    expect(c.has("transcripts")).toBe(true);
    expect(c.has("artifactContent")).toBe(true);
    expect(c.has("transport")).toBe(true);
    // A finished corpus has no live session and no status CLI — claiming these would make
    // panels render banners about liveness that can never be true.
    expect(c.has("liveness")).toBe(false);
    expect(c.has("featureStatus")).toBe(false);
  });

  it("correlates cleanly and reports no drift", () => {
    const r = src().correlation();
    expect(r.healthy).toBe(true);
    expect(r.pairings.length).toBe(71);
    expect(r.structural.length).toBe(10);
    expect(driftMessage(r)).toBeNull();
  });

  it("folds to a shipped board at the live edge", () => {
    const s = src().getState();
    expect(s.error).toBeNull();
    expect(s.eventCount).toBe(421);
    expect(s.lane).toBe("complete");
    expect(s.feature).toBe("F6-split-tracking-code");
    expect(s.atLive).toBe(true);
    // The log-derived halves still work through this source — it is the same fold.
    expect(s.stories.length).toBe(3);
    expect(s.stories.every((st) => st.status === "done")).toBe(true);
  });

  it("serves transcripts and per-turn file snapshots", () => {
    const s = src();
    const t = s.turn(0);
    expect(t?.role).toBe("spec-author");
    expect(t?.produced).toContain(".sftdd/planning/feature-proposals.md");

    const tr = s.transcript(0);
    expect(tr?.prompt.length).toBeGreaterThan(0);

    // The file this turn produced is readable AT that turn — the thing live cannot do.
    const f = s.file(0, ".sftdd/planning/feature-proposals.md");
    expect(f.kind).toBe("artifact");
    expect(f.content).toContain("##");
    expect(f.reason).toBeNull();
  });

  it("blocks traversal through the public file() accessor too", () => {
    // readFileContent is guarded, but assert it through the method a route will actually call.
    const r = src().file(0, "../".repeat(30) + "etc/passwd");
    expect(r.content).toBeNull();
    // Shared guard folds escaped and non-existent into one reason (see the symlink test).
    expect(r.reason).toBe("(not captured in this turn's snapshot)");
  });

  it("resolves every turn in the corpus, whatever fields it happens to carry", () => {
    // Found by driving the route: turn.json's shape is far more optional than first typed.
    // Measured across all 126 turns — `mode` on 36, `story` on 100, `role` on 72, `ac` on 11,
    // 19 turns with neither mode nor story. Treating `mode` as always-present made the panel's
    // header read a missing key. Assert every turn resolves and the invariant fields hold.
    const s = src();
    const turns = s.turns();
    expect(turns.length).toBe(126);
    for (const t of turns) {
      const d = s.turn(t.ordinal);
      expect(d, `turn ${t.ordinal} did not resolve`).not.toBeNull();
      expect(typeof d!.label).toBe("string");
      expect(typeof d!.kind).toBe("string");
      expect(Array.isArray(d!.produced)).toBe(true);
      expect(Array.isArray(d!.deleted)).toBe(true);
    }
    // ...and the optionality is real, not a theory: some turns genuinely lack each field.
    expect(turns.some((t) => t.mode == null)).toBe(true);
    expect(turns.some((t) => t.role == null)).toBe(true);
    expect(turns.some((t) => t.mode == null && t.story == null)).toBe(true);
  });

  it("declares a transcript exactly when one exists", () => {
    // `hasTranscript` is ABSENT (not false) on the 57 turns without one, so the guard relies on
    // undefined being falsy. Swept: 69 declared, 69 returned, 0 mismatches.
    const s = src();
    let declared = 0;
    for (const t of s.turns()) {
      const has = t.hasTranscript === true;
      if (has) declared++;
      expect(!!s.transcript(t.ordinal), `turn ${t.ordinal}`).toBe(has);
    }
    expect(declared).toBe(69);
  });

  it("returns null for turns and files it doesn't have, rather than throwing", () => {
    const s = src();
    expect(s.turn(99999)).toBeNull();
    expect(s.transcript(99999)).toBeNull();
    expect(s.file(99999, "a.ts").reason).toBe("(unknown turn)");
    // A gate turn has no transcript; asking must be safe.
    const gate = s.turns().find((t) => t.kind === "approve-gate" && !t.hasTranscript);
    if (gate) expect(s.transcript(gate.ordinal)).toBeNull();
  });

  // --- the capability live cannot have ---

  it("rewinds test counts, so a scrubbed board shows real historical numbers", () => {
    const s = src();
    // At the live edge, F6's final list: 25 items, all green.
    const live = s.getState();
    expect(live.progress.testTotal).toBe(25);
    expect(live.progress.testByStatus.green).toBe(25);
    expect(live.progress.testsHistorical).toBe(true);

    // Scrubbed back into F1, the counts must be F1's AND from that moment — not F6's, and not
    // F1's end state. Measured snapshots for F1 grow 17 → 23 → 32 as stories are broken down.
    const mid = s.getState(120);
    expect(mid.atLive).toBe(false);
    expect(mid.feature).toBe("F1-stock-visibility");
    // This is the assertion that would fail if the source handed over end-state artifacts:
    // F1 finishes at 32 tests, so a historical read must be strictly smaller here.
    expect(mid.progress.testTotal).toBeGreaterThan(0);
    expect(mid.progress.testTotal).toBeLessThan(32);
    // ...and unlike live, the bar is honest rather than hidden.
    expect(mid.progress.testsHistorical).toBe(true);
  });

  it("test totals track the recorded snapshots exactly, including a rework shrink", () => {
    // Swept rather than spot-checked, per the LaneGraph lesson — and the sweep immediately
    // refuted the obvious invariant. Test totals are NOT monotonic: turn 41 is a
    // `revise-route` (spec-author rework) that DELETES five acceptance criteria for
    // S3-sku-detail-view and rewrites test-list.json from 34 items back to 23. F1's recorded
    // sequence is 17, 17, 23, 23, 34, 23, 32, 32 — a real rework, not a mis-attribution.
    //
    // So the honest assertion is that every value the board shows is one the corpus actually
    // recorded, not that it only ever grows. A snapshot picked from the wrong turn would
    // still be caught, because it would have to be a total the corpus never wrote for that
    // feature at that point.
    const RECORDED: Record<string, number[]> = {
      "F1-stock-visibility": [17, 23, 34, 32],
      "F6-split-tracking-code": [14, 19, 25],
    };
    const s = src();
    for (let at = 0; at <= 421; at += 7) {
      const st = s.getState(at);
      if (st.progress.testTotal === 0) continue; // before this feature had a list
      const allowed = RECORDED[st.feature ?? ""] ?? [];
      expect(allowed, `at=${at} feature=${st.feature}`).toContain(st.progress.testTotal);
    }
  });

  it("reflects the rework shrink at the playhead where it happened", () => {
    // Pin the shrink directly, since it is the most surprising thing replay's test bar does
    // and a future "fix" to make totals monotonic would silently break it.
    const s = src();
    const totals = new Set<number>();
    for (let at = 0; at <= 200; at++) {
      const st = s.getState(at);
      if (st.feature === "F1-stock-visibility" && st.progress.testTotal > 0) {
        totals.add(st.progress.testTotal);
      }
    }
    // 34 appears (turn 39's list) and so does the smaller 23 that follows the rework.
    expect(totals.has(34)).toBe(true);
    expect(totals.has(23)).toBe(true);
  });

  it("does not show a turn's snapshot until that turn has finished", () => {
    // Found in review: a pairing marks where a turn STARTS, but the file it snapshots is
    // written during the turn. Attributing the snapshot to the start showed testTotal = 17 at
    // event 44 while the log's `artifact.written` for that very file is event 45 — the future
    // leaking into the past. Counts must not appear before the log says the file exists.
    const s = src();
    const ev = s.events();
    const writeIdx = ev.findIndex((e) => {
      const md = (e.metadata ?? {}) as Record<string, unknown>;
      return e.event === "artifact.written" && String(md.path ?? "").endsWith("F1-stock-visibility/test-list.json");
    });
    expect(writeIdx).toBeGreaterThan(0); // the corpus does record it
    // At the event just before the file is written, no count may be shown.
    expect(s.getState(writeIdx).progress.testTotal).toBe(0);
  });

  it("takes the highest paired ordinal, not the last pairing", () => {
    // Found in review. Pairings are ordered by eventIndex while ordinals come from independent
    // per-role cursors, so they aren't guaranteed monotonic; trusting the last one would
    // discard every snapshot above it. This corpus is monotone (0 inversions across 71
    // pairings) — which is exactly why the sweep can't catch a regression here — so assert the
    // property that makes the code correct rather than only its output.
    const p = src().correlation().pairings;
    const last = p[p.length - 1].turnOrdinal;
    const max = Math.max(...p.map((x) => x.turnOrdinal));
    expect(last).toBe(max); // documents WHY the corpus can't catch it
    // ...and the live edge still shows the final counts, which is what the max protects.
    expect(src().getState().progress.testTotal).toBe(25);
  });

  it("caches corpus reads across separate instances", () => {
    // The docstring promises a process-lifetime cache, but resolveSource() builds a fresh
    // source per request, so a per-INSTANCE cache would never survive one. Measured cold ~18ms
    // vs warm ~0ms against a 1 s poll — the optimization has to outlive the instance.
    clearCorpusCache();
    const cold = Date.now();
    new ReplaySource(CORPUS!).getState(200);
    const coldMs = Date.now() - cold;

    const warm = Date.now();
    for (let i = 0; i < 5; i++) new ReplaySource(CORPUS!).getState(200); // 5 fresh instances
    const warmMs = (Date.now() - warm) / 5;

    // Generous bound: the point is that a fresh instance doesn't re-read the corpus, not a
    // precise timing. Five cold reads would cost ~5x the first one.
    expect(warmMs).toBeLessThan(Math.max(coldMs, 4));
  });

  it("aligns recentTurns positionally with the fold's recentEvents", () => {
    // The ticker zips these two arrays by index to decide which rows open a turn. A shift of
    // one shows the WRONG transcript and the WRONG code — exactly the silent mis-mapping
    // correlate.ts exists to prevent — so alignment is asserted against the real pairings
    // rather than trusted.
    const s = src();
    const full = s.correlation().pairings;
    const byEvent = new Map(full.map((p) => [p.eventIndex, p.turnOrdinal]));

    for (const at of [0, 1, 39, 40, 41, 120, 260, 421]) {
      const st = s.getState(at);
      const sum = s.correlationSummary(at);
      // Same length as the tail the board actually ships.
      expect(sum.recentTurns.length, `at=${at}`).toBe(st.recentEvents.length);
      // And every entry matches what the full-log correlation says for that absolute event.
      const start = Math.max(0, at - RECENT_EVENT_TAIL);
      sum.recentTurns.forEach((ord, i) => {
        expect(ord, `at=${at} row ${i}`).toBe(byEvent.get(start + i) ?? null);
      });
    }
  });

  it("points every openable ticker row at a turn whose role matches the event", () => {
    // The strongest cheap check on alignment: a pairing claims THIS event began THAT turn, so
    // the turn's role must be the event's role. A shift would mismatch almost immediately.
    const s = src();
    const at = 200;
    const st = s.getState(at);
    const sum = s.correlationSummary(at);
    let checked = 0;
    sum.recentTurns.forEach((ord, i) => {
      if (ord === null) return;
      expect(s.turn(ord)?.role).toBe(st.recentEvents[i].role);
      checked++;
    });
    expect(checked).toBeGreaterThan(0); // the window really does contain openable rows
  });

  it("summarises correlation health for the wire without shipping every pairing", () => {
    const sum = src().correlationSummary();
    expect(sum.healthy).toBe(true);
    expect(sum.message).toBeNull(); // nothing to warn about on a matching corpus
    expect(sum.paired).toBe(71);
    expect(sum.structural).toBe(10);
    expect(sum.unpairedEvents).toBe(0);
    expect(sum.kitVersionMatch).toBe(true);
    // The full report has 71 pairings; the summary must not carry them.
    expect(sum).not.toHaveProperty("pairings");
  });

  it("checks the kit version even at the very start of the log", () => {
    // Found in review: the stamp lives on the first event, so an empty prefix carried no
    // version and a genuine mismatch reported healthy at the transport's left edge.
    const r = src().correlation(0);
    expect(r.kitVersion.log).toBe(KIT_COMMIT);
    expect(r.kitVersionMatch).toBe(true);
  });

  it("shows no test bar before the run has a test list", () => {
    // Early on there is genuinely nothing to show. The honest answer is 0 + no bar, not the
    // end state — this is the "finished story at event 12" bug, restated for test counts.
    const early = src().getState(5);
    expect(early.progress.testTotal).toBe(0);
    expect(early.progress.testsHistorical).toBe(false);
  });

  it("does NOT import the corpus's end-state stories or gates", () => {
    // The plan warns that PR #10's log-derived inference was fitted to one log. The guard is
    // that replay supplies ONLY test counts; stories/gates/phase stay log-derived, so a
    // scrubbed board cannot show a story as done before the log says so.
    const s = src();
    const snap = s.snapshot(s.events(), "2026-08-06T00:00:00.000Z", 120);
    expect(snap.status?.stories).toBeUndefined();
    expect(snap.status?.gates).toBeUndefined();
    expect(snap.status?.derived_phase).toBeUndefined();
    expect(snap.next).toBeNull();
    // No live-only inputs are faked.
    expect(snap.sessionAgeMs).toBe(Infinity);
    expect(snap.handbacks).toEqual([]);
    expect(snap.pendingPermission).toBeNull();
  });

  it("stays pure: the same playhead always folds to the same board", () => {
    // `generatedAt`/`snapshotAsOf` are wall-clock stamps of when the read happened, so they
    // are volatile by design — same convention as source.test.ts.
    const stripVolatile = (s: ReturnType<ReplaySource["getState"]>) => {
      const { generatedAt: _g, snapshotAsOf: _s, ...rest } = s;
      return rest;
    };
    const s = src();
    expect(stripVolatile(s.getState(200))).toEqual(stripVolatile(s.getState(200)));
    // ...and a fresh source agrees with a warm-cached one, so the caches can't skew a read.
    expect(stripVolatile(new ReplaySource(CORPUS!).getState(200))).toEqual(
      stripVolatile(s.getState(200)),
    );
  });

  it("clamps an out-of-range playhead like live does", () => {
    const s = src();
    expect(s.getState(-5).atEventIndex).toBe(0);
    expect(s.getState(99999).atEventIndex).toBe(421);
    expect(s.getState(99999).atLive).toBe(true);
  });
});

describe.skipIf(!CORPUS)("replay — step outputs", () => {
  const src = () => new ReplaySource(CORPUS!);

  it("lists run-level deliverables for the plan node (no feature needed)", () => {
    const out = src().stepOutputs("plan");
    expect(out.node).toBe("plan");
    expect(out.feature).toBeNull();
    const names = out.assets.map((a) => a.name);
    expect(names).toContain("feature-proposals.md");
    expect(names).toContain("estimates.json");
    // Every listed asset carries a root-relative path and a kind.
    for (const a of out.assets) {
      expect(a.path.startsWith("/")).toBe(false);
      expect(["code", "artifact"]).toContain(a.kind);
    }
  });

  it("scopes per-feature deliverables to the feature in force", () => {
    const out = src().stepOutputs("design", "F1-stock-visibility");
    expect(out.feature).toBe("F1-stock-visibility");
    const paths = out.assets.map((a) => a.path);
    // Run-level design docs AND the feature's own spec/db-design, all under this feature.
    expect(paths).toContain("design/design-guide.md");
    expect(paths).toContain("features/F1-stock-visibility/feature-spec.md");
    expect(paths).toContain("features/F1-stock-visibility/db-design.md");
    expect(paths.every((p) => !p.includes("<F>"))).toBe(true);
  });

  it("drops per-feature entries when no feature is in scope", () => {
    const out = src().stepOutputs("design");
    // The run-level design docs still show; the per-feature ones are skipped, not broken links.
    expect(out.assets.some((a) => a.path === "design/design-guide.md")).toBe(true);
    expect(out.assets.some((a) => a.path.startsWith("features/"))).toBe(false);
  });

  it("expands a directory spec (build cycles) into its files", () => {
    const out = src().stepOutputs("build", "F1-stock-visibility");
    const cyclePaths = out.assets.filter((a) => a.path.startsWith("cycles/F1-stock-visibility/"));
    expect(cyclePaths.length).toBeGreaterThan(0);
  });

  it("returns empty assets for a node with no step-output mapping", () => {
    expect(src().stepOutputs("shipped").assets).toEqual([]);
  });

  it("reads a listed deliverable's content", () => {
    const out = src().stepOutputs("plan");
    const proposals = out.assets.find((a) => a.name === "feature-proposals.md")!;
    const content = src().stepOutputContent(proposals.path);
    expect(content.content).not.toBeNull();
    expect(content.reason).toBeNull();
    expect(content.path).toBe(proposals.path);
  });

  it("refuses to read outside recorded-artifacts (containment)", () => {
    const escaped = src().stepOutputContent("../../../../etc/passwd");
    expect(escaped.content).toBeNull();
    expect(escaped.reason).toBe("(not found in recorded artifacts)");
  });
});

// Correspondence lives on the newer corpora (stockflow-full ships both agent-log AND
// correspondence.jsonl); stockflow-rerecord ships none, which is a case worth pinning too.
const FULL = [
  process.env.CONSORT_TEST_FULL_CORPUS_DIR,
  join(MARKETPLACE, "examples/replay/corpora/stockflow-full"),
].filter((p): p is string => !!p).find((p) => existsSync(join(p, "correspondence.jsonl")) && existsSync(join(p, "agent-log.jsonl")));

describe.skipIf(!CORPUS)("replay — correspondence absent", () => {
  it("returns an empty tail when the corpus ships no correspondence.jsonl", () => {
    // stockflow-rerecord has an agent-log but no correspondence — the summary is empty, not null.
    expect(new ReplaySource(CORPUS!).correspondenceSummary().recent).toEqual([]);
  });
});

describe.skipIf(!FULL)("replay — correspondence (stockflow-full)", () => {
  const src = () => new ReplaySource(FULL!);

  it("folds a recent correspondence tail aligned to the playhead", () => {
    const s = src();
    const full = s.correspondenceSummary().recent;
    expect(full.length).toBeGreaterThan(0);
    // Each row is render-ready.
    for (const r of full) {
      expect(typeof r.at).toBe("string");
      expect(typeof r.text).toBe("string");
      expect([null, "approved", "validated"]).toContain(r.outcome);
    }
    // The final exchange carries the run's completion (a merge / promote).
    expect(full[full.length - 1].outcome).not.toBeNull();
  });

  it("rewinds with the transport: an early playhead shows less than the live edge", () => {
    const s = src();
    const early = s.correspondenceSummary(20).recent;
    const live = s.correspondenceSummary().recent;
    // Everything shown early happened at or before the early playhead's newest event.
    const events = s.events();
    const horizon = events[20 - 1]?.timestamp;
    for (const r of early) expect(r.at <= horizon!).toBe(true);
    // And the live edge has surfaced at least as much conversation.
    expect(live.length).toBeGreaterThanOrEqual(early.length);
  });

  it("shows nothing before the first event", () => {
    expect(src().correspondenceSummary(0).recent).toEqual([]);
  });

  it("carries an approved gate exchange in the tail somewhere", () => {
    // Fold the whole run (large tail) and confirm an approval surfaced.
    const all = src().correspondenceSummary(undefined, 500).recent;
    expect(all.some((r) => r.outcome === "approved")).toBe(true);
  });
});
