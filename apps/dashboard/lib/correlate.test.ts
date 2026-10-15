/**
 * Correlation tests.
 *
 * The pairing algorithm cannot detect its own failure (plan §6), so these tests do three
 * distinct jobs, in increasing order of what they'd catch:
 *
 *   1. DIFFERENTIAL vs. an independent reference implementation of the pairing algorithm,
 *      transcribed below and run over the real 421-event corpus. This guards that a refactor of
 *      the production path cannot silently change the pairing semantics.
 *   2. GROUND TRUTH on the real corpus: 71/71 invoke-role turns consumed, and the 10
 *      release-engineer events classified as structural rather than as drift.
 *   3. DRIFT DETECTION on synthetic mismatches, because the healthy corpus by definition
 *      exercises none of them. A report that only ever sees a good run is untested where it
 *      matters.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { correlate, driftMessage, driftSeverity, kitVersionOfLog, latestTurnByRole, latestTurnByStep, turnByEvent, type TurnIndexEntry } from "./correlate";
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
// 1. Differential: a reference implementation of the pairing algorithm, transcribed below.
// Deliberately NOT refactored — quirks included — so it stands as an independent check rather
// than a paraphrase of the production code.

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

describe("latestTurnByRole — full-corpus role → latest reached turn", () => {
  const turns: Pick<TurnIndexEntry, "ordinal" | "role">[] = [
    { ordinal: 1, role: "spec-author" },
    { ordinal: 2, role: "product-owner" },
    { ordinal: 5, role: "navigator" },
    { ordinal: 8, role: "navigator" }, // a later navigator turn – should win over #5
    { ordinal: 9, role: null }, // no role – skipped
  ];

  it("keeps each role's HIGHEST reached ordinal, across the whole index (not just a tail)", () => {
    const reached = new Set([1, 2, 5, 8, 9]);
    expect(latestTurnByRole(turns, reached)).toEqual({
      "spec-author": 1,
      "product-owner": 2,
      navigator: 8,
    });
  });

  it("is scoped to REACHED ordinals, so scrubbing back narrows it", () => {
    // Playhead before turn 8: navigator's latest reached is #5, and product-owner not yet reached.
    const reached = new Set([1, 5]);
    expect(latestTurnByRole(turns, reached)).toEqual({ "spec-author": 1, navigator: 5 });
  });

  it("returns {} when nothing is reached", () => {
    expect(latestTurnByRole(turns, new Set())).toEqual({});
  });
});

describe("latestTurnByStep — full-corpus STEP+STORY → latest reached turn (the lane-card resolver)", () => {
  // The real turns/index.json shape: role + `mode` (= phase) + story. The breakdown is story-less; the
  // per-story design turns carry their story. latestTurnByStep must key them step+story so a card opens
  // ITS OWN step's turn for the round in view — the #0 breakdown AND an early story's spec from a late
  // playhead — never a sibling step's or round's turn.
  const turns: Pick<TurnIndexEntry, "ordinal" | "role" | "mode" | "story">[] = [
    { ordinal: 0, role: "spec-author", mode: "breakdown", story: null }, // outer loop → d-breakdown, story-less
    { ordinal: 1, role: "spec-author", mode: null, story: "S1-file-stock" }, // d-spec (S1)
    { ordinal: 2, role: "ux-designer", mode: "ia", story: "S1-file-stock" }, // d-ux-ia (S1)
    { ordinal: 22, role: "spec-author", mode: null, story: "S3-sku-detail-view" }, // d-spec (S3)
    { ordinal: 25, role: "ux-designer", mode: "ia", story: "S3-sku-detail-view" }, // d-ux-ia (S3)
  ];

  it("resolves the breakdown (#0, out of any window) under its story-less key, and each story's spec to ITS own turn", () => {
    const m = latestTurnByStep(turns, new Set([0, 1, 2, 22, 25]));
    expect(m["d-breakdown|"]).toBe(0); // the outer-loop breakdown, resolvable whole-corpus
    expect(m["d-spec|S1-file-stock"]).toBe(1);
    expect(m["d-spec|S3-sku-detail-view"]).toBe(22); // S3's spec, NOT S1's — no cross-round bleed
    expect(m["d-ux-ia|S3-sku-detail-view"]).toBe(25);
  });

  it("is scoped to reached ordinals (scrubbing back): S3's spec disappears before its turn is reached", () => {
    const m = latestTurnByStep(turns, new Set([0, 1, 2]));
    expect(m["d-spec|S3-sku-detail-view"]).toBeUndefined();
    expect(m["d-spec|S1-file-stock"]).toBe(1);
    expect(m["d-breakdown|"]).toBe(0);
  });

  // The build cycle, as the recorder actually writes it: the BASE turns record NO mode (the navigator
  // RED turn, the driver GREEN turn); the VARIANT turns record their buildMode as `mode` (review /
  // refactor). The resolver must map each to ITS OWN step — the bug was: RED/REVIEW resolved to nothing
  // ("hasn't run"), and the refactor turn (mode="refactor") fell onto b-green (phase-only synth never set
  // buildMode, so b-green's buildModeNot didn't exclude it), so clicking driver-GREEN showed the REFACTOR.
  it("maps the build cycle's base + variant turns each to its OWN step (no refactor-onto-green bleed)", () => {
    const build: Pick<TurnIndexEntry, "ordinal" | "role" | "mode" | "story">[] = [
      { ordinal: 10, role: "navigator", mode: null, story: "S1-file-stock" }, // RED (no mode) → b-red
      { ordinal: 11, role: "driver", mode: null, story: "S1-file-stock" }, // GREEN (no mode) → b-green
      { ordinal: 12, role: "navigator", mode: "review", story: "S1-file-stock" }, // review → b-review
      { ordinal: 13, role: "driver", mode: "refactor", story: "S1-file-stock" }, // refactor → b-refactor
    ];
    const m = latestTurnByStep(build, new Set([10, 11, 12, 13]));
    expect(m["b-red|S1-file-stock"]).toBe(10); // was: undefined ("hasn't run")
    expect(m["b-green|S1-file-stock"]).toBe(11); // was: 13 (showed the refactor turn)
    expect(m["b-review|S1-file-stock"]).toBe(12); // was: undefined ("hasn't run")
    expect(m["b-refactor|S1-file-stock"]).toBe(13);
  });
});

describe("correlate — differential against the reference implementation", () => {
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

  it("differs from the reference ONLY by classifying structural roles, not by dropping them", () => {
    // The one intentional deviation: the reference silently produces no pairing for
    // release-engineer (its role list is empty, so `list[k]` is undefined); we record the same
    // non-pairing but report it as `structural`. Assert the deviation is exactly that and nothing more.
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
    // A log-ahead tail is the normal live edge — a quiet caveat, not a prominent warning.
    expect(driftSeverity(r)).toBe("info");
  });

  it("is 'ok' severity (no banner) when the log pairs cleanly", () => {
    const r = correlate([ev("driver", "green")], [turn(0, "driver")]);
    expect(r.healthy).toBe(true);
    expect(driftSeverity(r)).toBe("ok");
  });

  it("distinguishes a role the corpus has never heard of (role-absent)", () => {
    // Much stronger evidence of a different run than merely running out of turns, so it
    // gets its own reason and its own message.
    const r = correlate([ev("navigator", "red")], [turn(0, "driver")]);
    expect(r.unpairedEvents[0].reason).toBe("role-absent");
    expect(driftMessage(r)).toContain("no turns for navigator");
    // A role the corpus never recorded = likely a different run: the one case worth flagging loudly.
    expect(driftSeverity(r)).toBe("warning");
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
    // Pairing IS unreliable (healthy=false), but a kit drift is a benign, expected caveat — the
    // banner surfaces it quietly (info), not as the critical-red alert it used to.
    expect(driftSeverity(r)).toBe("info");
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

// ---------------------------------------------------------------------------
// 4. Story scope confines a phantom phase.start (the stockflow-3-90 defect): a role turn that
// STARTED but recorded no invoke-role turn (a died/retried turn) must not slide every later
// pairing for that role across story boundaries.

describe("correlate — story scope confines a phantom phase.start", () => {
  const ps = (role: string, story: string): AgentLogEvent => ({
    timestamp: "2026-09-12T00:00:00.000Z",
    level: "info",
    role,
    event: "phase.start",
    message: `${role} START design`,
    metadata: { phase: "design", story },
  });
  const t = (ordinal: number, role: string, story: string | null): TurnIndexEntry => ({
    ordinal,
    step: 0,
    label: `${role}-x`,
    kind: "invoke-role",
    role,
    story,
    dir: `${String(ordinal).padStart(4, "0")}-${role}`,
    producedCount: 0,
    deletedCount: 0,
    hasTranscript: true,
  });

  // The exact shape observed on stockflow-3-90: test-strategist emitted 5 phase.starts for S1 but
  // only 4 S1 invoke-role turns were recorded (one died/retried turn recorded nothing), then 1
  // phase.start + 1 recorded turn for S2. S2's turn IS in the corpus (ordinal 104).
  const events = [
    ps("test-strategist", "S1"),
    ps("test-strategist", "S1"),
    ps("test-strategist", "S1"),
    ps("test-strategist", "S1"),
    ps("test-strategist", "S1"), // 5th S1 phase.start — the phantom (its turn recorded nothing)
    ps("test-strategist", "S2"), // the row the user saw with no #ord
  ];
  const turns = [
    t(7, "test-strategist", "S1"),
    t(11, "test-strategist", "S1"),
    t(15, "test-strategist", "S1"),
    t(19, "test-strategist", "S1"), // 4 S1 turns, not 5
    t(104, "test-strategist", "S2"), // S2's turn IS recorded
  ];

  it("pairs S2's phase.start to its OWN turn (104), not stolen by the S1 phantom", () => {
    const r = correlate(events, turns);
    const byEvent = turnByEvent(r);
    expect(byEvent.get(5)).toBe(104); // S2 phase.start → ordinal 104 (gets its #ord back)
    expect([0, 1, 2, 3].map((i) => byEvent.get(i))).toEqual([7, 11, 15, 19]); // S1 turns paired in order
    // Exactly ONE unpaired event, and it is the phantom's own phase.start (the 5th S1), NOT S2.
    expect(r.unpairedEvents).toEqual([
      { eventIndex: 4, role: "test-strategist", phase: "design", reason: "role-exhausted" },
    ]);
    // Pairings stay ascending per role (no backwards jump introduced by story matching).
    const ords = r.pairings.map((p) => p.turnOrdinal);
    expect(ords).toEqual([...ords].sort((a, b) => a - b));
  });

  it("a role-ONLY cursor WOULD mis-pair S2 — which is exactly what the story scope prevents", () => {
    // The reference transcription (kept in this file) pairs by role order alone: the
    // 5th S1 phase.start grabs S2's turn and S2's own phase.start is left with nothing.
    const theirs = kevinEventTurn(events, turns);
    expect(theirs[4]).toBe(104); // S1's phantom phase.start wrongly took S2's turn
    expect(theirs[5]).toBeUndefined(); // S2's phase.start → no turn → the missing #ord
  });

  it("falls back to plain role order when the turns carry no story (older corpus, byte-identical)", () => {
    const noStory = turns.map((x) => t(x.ordinal, "test-strategist", null));
    const r = correlate(events, noStory);
    // 6 phase.starts, 5 story-less turns → first 5 pair in order, the 6th is the drift tail.
    expect(r.pairings.map((p) => p.turnOrdinal)).toEqual([7, 11, 15, 19, 104]);
    expect(r.unpairedEvents.map((u) => u.eventIndex)).toEqual([5]);
  });
});

describe("gate pairing — HITL gate turns get a #ordinal via gatePairings (not just invoke-role turns)", () => {
  const ev = (event: string, gate?: string): AgentLogEvent =>
    ({ timestamp: "2026-01-01T00:00:00.000Z", level: "info", role: "orchestrator", event, ...(gate ? { metadata: { gate } } : {}) }) as AgentLogEvent;
  const gturn = (ordinal: number, kind: string): TurnIndexEntry =>
    ({ ordinal, step: 0, label: kind, kind, dir: `${ordinal}-${kind}`, producedCount: 0, deletedCount: 0 }) as TurnIndexEntry;
  const byGate = (events: AgentLogEvent[], turns: TurnIndexEntry[]) =>
    new Map(correlate(events, turns, null, events).gatePairings.map((p) => [p.eventIndex, p.turnOrdinal]));

  it("pairs the planning + ship gate approvals to their turns by gate name (the #3/#5/deploy/promote the user missed)", () => {
    const events = [ev("gate.approved", "backlog"), ev("gate.approved", "plan"), ev("gate.approved", "deploy"), ev("gate.approved", "promote")];
    const turns = [gturn(3, "approve-backlog-gate"), gturn(5, "approve-plan-gate"), gturn(77, "approve-deploy-gate"), gturn(81, "approve-promote-gate")];
    const m = byGate(events, turns);
    expect(m.get(0)).toBe(3); // backlog -> #3
    expect(m.get(1)).toBe(5); // plan -> #5
    expect(m.get(2)).toBe(77); // deploy -> #77
    expect(m.get(3)).toBe(81); // promote -> #81
  });

  it("pairs gate.surfaced to the surface-gate turn, then gate.approved to the approve-gate turn (the spec gate's two turns)", () => {
    const events = [ev("gate.surfaced", "spec"), ev("gate.approved", "spec")];
    const turns = [gturn(66, "surface-gate"), gturn(67, "approve-gate")];
    const m = byGate(events, turns);
    expect(m.get(0)).toBe(66);
    expect(m.get(1)).toBe(67);
  });

  it("leaves an extra gate approval un-numbered (a re-plan emits more approvals than recorded gate turns) and does NOT count it as drift", () => {
    const events = [ev("gate.approved", "intake"), ev("gate.approved", "intake")];
    const turns = [gturn(0, "approve-intake-gate")]; // only ONE recorded turn for two approvals
    const r = correlate(events, turns, null, events);
    const m = new Map(r.gatePairings.map((p) => [p.eventIndex, p.turnOrdinal]));
    expect(m.get(0)).toBe(0);
    expect(m.has(1)).toBe(false); // extra left un-numbered, gracefully
    expect(r.unpairedEvents).toHaveLength(0); // gate events are never counted as drift
    expect(r.healthy).toBe(true);
    expect(r.pairings).toHaveLength(0); // gate pairings never pollute the invoke-role `pairings`
  });

  it("keeps `pairings` pure invoke-role (gate turns excluded) so the differential/ground-truth invariants hold", () => {
    const events = [
      { timestamp: "t", level: "info", role: "spec-author", event: "phase.start", metadata: { phase: "propose" } },
      ev("gate.approved", "backlog"),
    ] as AgentLogEvent[];
    const turns = [{ ...gturn(1, "invoke-role"), role: "spec-author" } as TurnIndexEntry, gturn(3, "approve-backlog-gate")];
    const r = correlate(events, turns, null, events);
    expect(r.pairings.map((p) => p.turnOrdinal)).toEqual([1]); // only the invoke-role turn
    expect(r.gatePairings.map((p) => p.turnOrdinal)).toEqual([3]); // the gate turn, kept separate
  });
});
