/**
 * Correlation tests.
 *
 * The pairing algorithm cannot detect its own failure (plan §6), so these tests do three
 * distinct jobs, in increasing order of what they'd catch:
 *
 *   1. DIFFERENTIAL vs. Kevin's original JS, transcribed verbatim below and run over the real
 *      421-event corpus. This is the guard that the port didn't change the semantics — the
 *      same technique that caught the `topology.ts` transcription risk in PR #9.
 *   2. GROUND TRUTH on the real corpus: 71/71 invoke-role turns consumed, and the 10
 *      release-engineer events classified as structural rather than as drift.
 *   3. DRIFT DETECTION on synthetic mismatches, because the healthy corpus by definition
 *      exercises none of them. A report that only ever sees a good run is untested where it
 *      matters.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { correlate, driftMessage, kitVersionOfLog, turnByEvent, type TurnIndexEntry } from "./correlate";
import type { AgentLogEvent } from "./types";

const CORPUS_DIR = join(__dirname, "__fixtures__");
const CORPUS_KIT_COMMIT = "cad5f5fb5eb7e59a703722284b6a5858ddf3fff0";

function readCorpusLog(): AgentLogEvent[] {
  return readFileSync(join(CORPUS_DIR, "stockflow-rerecord-agent-log.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as AgentLogEvent];
      } catch {
        return [];
      }
    });
}

function readTurns(): TurnIndexEntry[] {
  const raw = JSON.parse(readFileSync(join(CORPUS_DIR, "stockflow-rerecord-turns-index.json"), "utf8"));
  return raw.turns as TurnIndexEntry[];
}

const LOG = readCorpusLog();
const TURNS = readTurns();

// ---------------------------------------------------------------------------
// 1. Differential: Kevin's algorithm, transcribed verbatim from
// `_dashboard_template.html:312-325`. Deliberately NOT refactored — quirks included — so it
// stands as an independent oracle rather than a paraphrase of the port.

function kevinEventTurn(log: AgentLogEvent[], turns: TurnIndexEntry[]): Record<number, number> {
  const turnByRole: Record<string, TurnIndexEntry[]> = {};
  turns.forEach((t) => {
    if (t.kind === "invoke-role") {
      (turnByRole[t.role!] = turnByRole[t.role!] || []).push(t);
    }
  });
  const roleCursor: Record<string, number> = {};
  const eventTurn: Record<number, number> = {};
  log.forEach((e, i) => {
    if (e.event === "phase.start" && e.role && e.role !== "orchestrator") {
      const list = turnByRole[e.role] || [];
      const k = roleCursor[e.role] || 0;
      if (list[k]) {
        eventTurn[i] = list[k].ordinal;
        roleCursor[e.role] = k + 1;
      }
    }
  });
  return eventTurn;
}

describe("correlate — differential against Kevin's original", () => {
  it("pairs event-for-event identically over the whole corpus", () => {
    const mine = turnByEvent(correlate(LOG, TURNS, CORPUS_KIT_COMMIT));
    const theirs = kevinEventTurn(LOG, TURNS);

    // Same set of paired events, same turn for each. Asserted as sorted pairs so a
    // difference names the event index rather than just failing a size check.
    const asPairs = (m: Map<number, number> | Record<number, number>) =>
      Object.entries(m instanceof Map ? Object.fromEntries(m) : m)
        .map(([k, v]) => [Number(k), v] as const)
        .sort((a, b) => a[0] - b[0]);

    expect(asPairs(mine)).toEqual(asPairs(theirs));
  });

  it("agrees at every prefix, not only on the whole log", () => {
    // Scrubbing calls correlate() with prefixes; a cursor bug could agree at the end and
    // disagree in the middle. Step by 7 to keep this cheap while still covering ~60 points.
    for (let i = 0; i <= LOG.length; i += 7) {
      const slice = LOG.slice(0, i);
      const mine = Object.fromEntries(turnByEvent(correlate(slice, TURNS, CORPUS_KIT_COMMIT)));
      expect(mine).toEqual(kevinEventTurn(slice, TURNS));
    }
  });

  it("differs from Kevin's ONLY by classifying structural roles, not by dropping them", () => {
    // The one intentional deviation: he silently produces no pairing for release-engineer
    // (its role list is empty, so `list[k]` is undefined); we record the same non-pairing but
    // report it as `structural`. Assert the deviation is exactly that and nothing more.
    const report = correlate(LOG, TURNS, CORPUS_KIT_COMMIT);
    const theirs = kevinEventTurn(LOG, TURNS);
    for (const s of report.structural) {
      expect(theirs[s.eventIndex]).toBeUndefined();
      expect(s.role).toBe("release-engineer");
    }
    expect(report.structural.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Ground truth on the real corpus.

describe("correlate — the real stockflow-rerecord corpus", () => {
  it("consumes every invoke-role turn exactly once, with nothing left over", () => {
    const r = correlate(LOG, TURNS, CORPUS_KIT_COMMIT);
    // Measured: 71 invoke-role turns, all consumed. This is the plan §8 claim, pinned.
    expect(r.pairings.length).toBe(71);
    expect(r.unpairedTurns).toEqual([]);
    expect(r.cursors).toEqual({
      "architect-reviewer": { consumed: 9, available: 9 },
      dba: { consumed: 2, available: 2 },
      driver: { consumed: 15, available: 15 },
      navigator: { consumed: 26, available: 26 },
      "product-owner": { consumed: 2, available: 2 },
      "spec-author": { consumed: 9, available: 9 },
      "test-strategist": { consumed: 7, available: 7 },
      "ux-designer": { consumed: 1, available: 1 },
    });
  });

  it("reports the 10 release-engineer events as structural, NOT as drift", () => {
    // The whole point of STRUCTURAL_ROLES: a healthy corpus must read as healthy. Before
    // this distinction existed the same run reported 10 phantom unpaired rows.
    const r = correlate(LOG, TURNS, CORPUS_KIT_COMMIT);
    expect(r.structural.length).toBe(10);
    expect(new Set(r.structural.map((s) => s.phase))).toEqual(new Set(["deploy", "promote"]));
    expect(r.structural.filter((s) => s.phase === "deploy").length).toBe(8);
    expect(r.structural.filter((s) => s.phase === "promote").length).toBe(2);
    expect(r.unpairedEvents).toEqual([]);
    expect(r.healthy).toBe(true);
    expect(driftMessage(r)).toBeNull();
  });

  it("confirms the log's kit stamp against the corpus provenance", () => {
    expect(kitVersionOfLog(LOG)).toBe(CORPUS_KIT_COMMIT);
    const r = correlate(LOG, TURNS, CORPUS_KIT_COMMIT);
    expect(r.kitVersionMatch).toBe(true);
    expect(r.kitVersion).toEqual({ log: CORPUS_KIT_COMMIT, corpus: CORPUS_KIT_COMMIT });
  });

  it("pairs every phase.start that is neither orchestrator nor structural", () => {
    // Completeness from the log's side: nothing eligible is silently ignored.
    const eligible = LOG.filter(
      (e) => e.event === "phase.start" && e.role && e.role !== "orchestrator",
    ).length;
    const r = correlate(LOG, TURNS, CORPUS_KIT_COMMIT);
    expect(r.pairings.length + r.structural.length + r.unpairedEvents.length).toBe(eligible);
  });

  it("stays healthy at every prefix of the corpus", () => {
    // Scrubbing must never make a good corpus look drifted. Unreached turns are expected
    // mid-log, which is exactly why `healthy` ignores unpairedTurns.
    for (let i = 0; i <= LOG.length; i += 5) {
      const r = correlate(LOG.slice(0, i), TURNS, CORPUS_KIT_COMMIT);
      expect(r.healthy, `prefix ${i} reported drift: ${driftMessage(r)}`).toBe(true);
    }
  });

  it("pairs turns in ascending ordinal order per role", () => {
    // The cursor's core invariant. A regression here is the silent mis-mapping the plan
    // warns about, so assert it directly rather than trusting the counts.
    const r = correlate(LOG, TURNS, CORPUS_KIT_COMMIT);
    const seen = new Map<string, number>();
    for (const p of r.pairings) {
      const last = seen.get(p.role);
      if (last !== undefined) expect(p.turnOrdinal).toBeGreaterThan(last);
      seen.set(p.role, p.turnOrdinal);
    }
    // ...and event order is ascending too, so a pairing never points backwards in the log.
    const idx = r.pairings.map((p) => p.eventIndex);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------
// 3. Drift detection. The healthy corpus exercises none of these paths.

describe("correlate — drift is detected and named", () => {
  const ev = (role: string, phase: string, metadata: Record<string, unknown> = {}): AgentLogEvent => ({
    timestamp: "2026-08-01T00:00:00.000Z",
    level: "info",
    role,
    event: "phase.start",
    message: `${role} START ${phase}`,
    metadata: { phase, ...metadata },
  });
  const turn = (ordinal: number, role: string): TurnIndexEntry => ({
    ordinal,
    step: 0,
    label: `${role}-x`,
    kind: "invoke-role",
    role,
    mode: "x",
    dir: `${String(ordinal).padStart(4, "0")}-${role}-x`,
    producedCount: 0,
    deletedCount: 0,
    hasTranscript: true,
  });

  it("flags a log that outruns the corpus (role-exhausted)", () => {
    const r = correlate([ev("driver", "green"), ev("driver", "green")], [turn(0, "driver")]);
    expect(r.pairings.length).toBe(1);
    expect(r.unpairedEvents).toEqual([
      { eventIndex: 1, role: "driver", phase: "green", reason: "role-exhausted" },
    ]);
    expect(r.healthy).toBe(false);
    expect(driftMessage(r)).toContain("log is ahead of the corpus");
  });

  it("distinguishes a role the corpus has never heard of (role-absent)", () => {
    // Much stronger evidence of a different run than merely running out of turns, so it
    // gets its own reason and its own message.
    const r = correlate([ev("navigator", "red")], [turn(0, "driver")]);
    expect(r.unpairedEvents[0].reason).toBe("role-absent");
    expect(driftMessage(r)).toContain("no turns for navigator");
  });

  it("flags an explicit kit-version mismatch as fatal", () => {
    const log = [{ ...ev("driver", "green"), metadata: { phase: "green", kit_commit: "aaaa111" } }];
    const r = correlate(log, [turn(0, "driver")], "bbbb222");
    expect(r.kitVersionMatch).toBe(false);
    expect(r.healthy).toBe(false);
    expect(driftMessage(r)).toContain("different kit versions");
    // Both sides are named, so the UI can show what mismatched.
    expect(driftMessage(r)).toContain("aaaa111");
    expect(driftMessage(r)).toContain("bbbb222");
  });

  it("treats a missing stamp on either side as unknown, not as a mismatch", () => {
    // An older corpus with no provenance must not read as drifted — that would cry wolf on
    // every pre-6e73019 scenario. Unknown is a third state, deliberately.
    const paired = [ev("driver", "green")];
    expect(correlate(paired, [turn(0, "driver")], null).kitVersionMatch).toBeNull();
    expect(correlate(paired, [turn(0, "driver")], null).healthy).toBe(true);
    const stamped = [{ ...ev("driver", "green"), metadata: { phase: "green", kit_commit: "aaaa111" } }];
    expect(correlate(stamped, [turn(0, "driver")], null).kitVersionMatch).toBeNull();
  });

  it("ignores kit_ref, which is a local capture symlink and not a version", () => {
    // provenance.json says so explicitly; keying on it would compare "sftdd-capture-local"
    // against a commit sha and mismatch on every healthy corpus.
    const log = [{ ...ev("driver", "green"), metadata: { phase: "green", kit_ref: "sftdd-capture-local" } }];
    expect(kitVersionOfLog(log)).toBeNull();
  });

  it("detects a version mismatch from an empty prefix, given the full log", () => {
    // Found in review: `kitVersionOfLog` reads events[0], and correlate() is called with
    // prefixes while scrubbing — so at upTo = 0 there was no stamp, no unpaired events, and
    // `healthy` was true. Drift detection switched itself off at the transport's left edge,
    // which is exactly where a viewer starts. The full log is now a separate argument.
    const full = [{ ...ev("driver", "green"), metadata: { phase: "green", kit_commit: "aaaa111" } }];
    const r = correlate([], [turn(0, "driver")], "bbbb222", full);
    expect(r.kitVersionMatch).toBe(false);
    expect(r.healthy).toBe(false);
    expect(driftMessage(r)).toContain("different kit versions");
  });

  it("defaults the full log to the prefix, so existing callers are unchanged", () => {
    const stamped = [{ ...ev("driver", "green"), metadata: { phase: "green", kit_commit: "aaaa111" } }];
    expect(correlate(stamped, [turn(0, "driver")], "aaaa111").kitVersionMatch).toBe(true);
  });

  it("reports turns the log never reached without calling them drift", () => {
    const r = correlate([ev("driver", "green")], [turn(0, "driver"), turn(1, "driver")]);
    expect(r.unpairedTurns).toEqual([{ ordinal: 1, role: "driver", label: "driver-x" }]);
    expect(r.healthy).toBe(true); // a prefix, not a mismatch
  });

  it("ignores non-phase.start events and the orchestrator", () => {
    const noise: AgentLogEvent[] = [
      { ...ev("driver", "green"), event: "turn.usage" },
      ev("orchestrator", "dispatch"),
      { ...ev("driver", "green"), role: "" },
    ];
    const r = correlate(noise, [turn(0, "driver")]);
    expect(r.pairings).toEqual([]);
    expect(r.unpairedEvents).toEqual([]);
    expect(r.cursors.driver).toEqual({ consumed: 0, available: 1 });
  });

  it("handles an empty log and an empty corpus without inventing health problems", () => {
    expect(correlate([], TURNS, CORPUS_KIT_COMMIT).healthy).toBe(true);
    expect(correlate([], []).pairings).toEqual([]);
    // A corpus with no turns at all, against a log that wants them, IS drift.
    const r = correlate([ev("driver", "green")], []);
    expect(r.healthy).toBe(false);
    expect(r.unpairedEvents[0].reason).toBe("role-absent");
  });

  it("only counts invoke-role turns as pairable", () => {
    // The corpus's 55 non-invoke-role turns (gates, dispatch, deploy…) must never be paired
    // to a phase.start, or a gate turn would show up as a role's work.
    const gate: TurnIndexEntry = { ...turn(0, "driver"), kind: "approve-gate", role: null };
    const r = correlate([ev("driver", "green")], [gate, turn(1, "driver")]);
    expect(r.pairings).toEqual([
      { eventIndex: 0, turnOrdinal: 1, role: "driver", phase: "green" },
    ]);
  });
});
