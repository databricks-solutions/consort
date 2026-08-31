import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPABILITIES, foldSource, hasCapability, readSource, type Capability, type DashboardSource } from "./source";
import { buildState } from "./consort";
import { LiveSource, resolveSource, currentSource } from "./sources";
import { fold } from "./reducer";
import { CAPABILITY_NAMES, type AgentLogEvent, type DashboardState, type SnapshotInputs, type SourceMeta } from "./types";

// Phase 1 item 3: today's reader moved behind an interface, with NO behavior change. These
// tests pin the contract, and — most importantly — check that going through the interface
// produces byte-identical state to calling the reader directly.

const STOCKFLOW = join(process.env.HOME || "", "Code/consort-lab/stockflow");
const HAS_PROJECT = existsSync(join(STOCKFLOW, ".sftdd"));

describe("source — capability vocabulary", () => {
  it("declares a stable, unique capability list", () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
    // These are the plan's §2 matrix rows; renaming one silently disables a panel.
    expect(CAPABILITIES).toContain("timeline");
    expect(CAPABILITIES).toContain("transport");
    expect(CAPABILITIES).toContain("transcripts");
    expect(CAPABILITIES).toContain("featureStatus");
  });

  it("keeps ONE vocabulary shared with the wire type", () => {
    // source.ts re-exports types.ts's list rather than declaring a second one. Two lists
    // would drift, and the wire type is what UI panels gate on.
    expect(CAPABILITIES).toBe(CAPABILITY_NAMES);
  });

  it("types the wire capabilities as the union, not string[]", () => {
    // Regression for a review finding: `capabilities: string[]` let a typo'd name compile
    // on both sides, so a renamed capability would silently disable a panel forever with no
    // compile error and no test failure. Verified with tsc: a bogus name now errors.
    const meta: SourceMeta = {
      mode: "live",
      describe: "x",
      capabilities: ["timeline", "transcripts"],
      availableModes: ["live", "replay"],
      note: null,
    };
    for (const c of meta.capabilities) expect(CAPABILITY_NAMES).toContain(c);
    // @ts-expect-error — a name outside the vocabulary must not type-check
    const bad: SourceMeta["capabilities"] = ["timelinee"];
    expect(bad).toBeDefined();
  });

  it("hasCapability reads the source's own set", () => {
    const src = new LiveSource();
    expect(hasCapability(src, "timeline")).toBe(true);
    expect(hasCapability(src, "transcripts")).toBe(false);
  });
});

describe("LiveSource — declared shape", () => {
  const src = new LiveSource();

  it("is live mode and describes its project dir", () => {
    expect(src.mode).toBe("live");
    expect(typeof src.describe()).toBe("string");
    expect(src.describe().length).toBeGreaterThan(0);
  });

  it("claims only capabilities a live project can actually satisfy", () => {
    expect(hasCapability(src, "timeline")).toBe(true);
    expect(hasCapability(src, "transport")).toBe(true);
    expect(hasCapability(src, "liveness")).toBe(true);
    expect(hasCapability(src, "featureStatus")).toBe(true);
    expect(hasCapability(src, "artifactPaths")).toBe(true);
    // Claimed now that the artifact panel reads HEAD — live's artifactContent is HEAD-only
    // (the file as it is NOW), which the panel labels, distinct from replay's per-turn snapshot.
    expect(hasCapability(src, "artifactContent")).toBe(true);

    // A live project has no turns/ corpus, so this must NOT be claimed — the hard live/replay wall.
    expect(hasCapability(src, "transcripts")).toBe(false);
  });

  it("declares only capabilities from the known vocabulary", () => {
    for (const c of src.capabilities) expect(CAPABILITIES).toContain(c as Capability);
  });

  it("satisfies the DashboardSource interface structurally", () => {
    const asInterface: DashboardSource = src; // compile-time check
    for (const m of ["describe", "available", "unavailableReason", "events", "snapshot", "getState"]) {
      expect(typeof (asInterface as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });
});

describe("LiveSource.fidelity + capabilities — companion record dir (Phase B)", () => {
  const saved = {
    proj: process.env.CONSORT_PROJECT_DIR,
    rec: process.env.CONSORT_RECORD_DIR,
    recKit: process.env.LAKEBASE_CONSORT_RECORD_DIR,
  };
  let proj: string;
  let rec: string;
  const RICH = ["transcripts", "correspondence", "stepOutputs"] as const;

  // A minimally READABLE ReplaySource corpus: available() requires the agent-log + turns/index.json.
  const makeReadableCorpus = (dir: string) => {
    mkdirSync(join(dir, "turns"), { recursive: true });
    writeFileSync(join(dir, "agent-log.jsonl"), "");
    writeFileSync(join(dir, "turns", "index.json"), JSON.stringify({ turns: [] }));
  };

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "consort-live-"));
    rec = mkdtempSync(join(tmpdir(), "consort-rec-"));
    mkdirSync(join(proj, ".consort"));
    writeFileSync(join(proj, ".consort", "agent-log.jsonl"), "");
    process.env.CONSORT_PROJECT_DIR = proj;
    delete process.env.CONSORT_RECORD_DIR;
    delete process.env.LAKEBASE_CONSORT_RECORD_DIR;
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(rec, { recursive: true, force: true });
    for (const [k, v] of [
      ["CONSORT_PROJECT_DIR", saved.proj],
      ["CONSORT_RECORD_DIR", saved.rec],
      ["LAKEBASE_CONSORT_RECORD_DIR", saved.recKit],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("NOT recording, base capabilities only, for a plain live build (no record dir)", () => {
    const src = new LiveSource();
    expect(src.fidelity()).toEqual({ recording: false });
    for (const c of RICH) expect(src.capabilities.has(c)).toBe(false);
  });

  it("does NOT key off the project's own .consort/turns (the shipped-A3 detection bug)", () => {
    // The record lane writes ELSEWHERE, never the watched .consort/. A stray turns/ or
    // correspondence.jsonl under .consort/ must NOT read as recording without a configured dir.
    mkdirSync(join(proj, ".consort", "turns"));
    writeFileSync(join(proj, ".consort", "correspondence.jsonl"), "");
    expect(new LiveSource().fidelity()).toEqual({ recording: false });
  });

  it("recording + replay-grade capabilities once a companion record dir is readable", () => {
    makeReadableCorpus(rec);
    process.env.CONSORT_RECORD_DIR = rec;
    const src = new LiveSource();
    expect(src.fidelity()).toEqual({ recording: true });
    for (const c of RICH) expect(src.capabilities.has(c)).toBe(true);
  });

  it("NOT recording while the configured record dir has no turns yet (early build)", () => {
    process.env.CONSORT_RECORD_DIR = rec; // exists but empty: no log, no turns/index.json
    const src = new LiveSource();
    expect(src.fidelity()).toEqual({ recording: false });
    expect(src.capabilities.has("transcripts")).toBe(false);
  });

  it("also reads the kit's own LAKEBASE_CONSORT_RECORD_DIR var", () => {
    makeReadableCorpus(rec);
    process.env.LAKEBASE_CONSORT_RECORD_DIR = rec;
    expect(new LiveSource().fidelity()).toEqual({ recording: true });
  });

  it("notices the companion corpus becoming readable mid-run (not memoized)", () => {
    process.env.CONSORT_RECORD_DIR = rec;
    const src = new LiveSource();
    expect(src.fidelity()).toEqual({ recording: false });
    makeReadableCorpus(rec);
    expect(src.fidelity()).toEqual({ recording: true });
    expect(src.capabilities.has("transcripts")).toBe(true);
  });

  it("rewinds correspondence against the LIVE log's playhead, not the companion mirror", () => {
    // The review's finding #1: `upTo` indexes the live agent-log; the companion mirror is a
    // different length, so the horizon must come from the live events. Live log = 2 events; the
    // companion carries 4 correspondence exchanges interleaved around them.
    const ev = (ts: string) =>
      JSON.stringify({ timestamp: ts, level: "info", role: "orchestrator", event: "phase.start", message: "", metadata: {} });
    writeFileSync(
      join(proj, ".consort", "agent-log.jsonl"),
      [ev("2026-01-01T10:00:02Z"), ev("2026-01-01T10:00:06Z")].join("\n"),
    );
    makeReadableCorpus(rec);
    const corr = (at: string, seq: number) =>
      JSON.stringify({ seq, at, direction: "orch-to-hil", ordinal: null, request: { kind: "gate", presentation: { format: "markdown", rendered: "x" } } });
    writeFileSync(
      join(rec, "correspondence.jsonl"),
      [
        corr("2026-01-01T10:00:01Z", 0),
        corr("2026-01-01T10:00:03Z", 1),
        corr("2026-01-01T10:00:05Z", 2),
        corr("2026-01-01T10:00:07Z", 3),
      ].join("\n"),
    );
    process.env.CONSORT_RECORD_DIR = rec;
    const src = new LiveSource();

    // upTo=1 → horizon = live event[0] = 10:00:02 → only the 10:00:01 exchange (NOT the mirror's).
    const at1 = src.correspondenceSummary(1);
    expect(at1.recent.length).toBe(1);
    expect(at1.recent.every((r) => r.at <= "2026-01-01T10:00:02Z")).toBe(true);

    // upTo=2 (the live edge) → horizon = 10:00:06 → 01/03/05, NOT the 10:00:07 exchange.
    expect(src.correspondenceSummary(2).recent.length).toBe(3);
    expect(src.correspondenceSummary().recent.length).toBe(3);
  });

  it("correlates the recorded SUFFIX against companion turns, aligned to the live event tail", () => {
    // Live log carries an earlier-feature navigator turn BEFORE the recording began, then the
    // recorded one. The companion has a turn only for the recorded (later) navigator phase — so a
    // naive whole-log correlation would let the F1 phase.start consume this run's turn and mis-pair.
    const ev = (ts: string, event: string, role: string) =>
      JSON.stringify({ timestamp: ts, level: "info", role, event, message: "", metadata: { phase: "red" } });
    writeFileSync(
      join(proj, ".consort", "agent-log.jsonl"),
      [
        ev("2026-01-01T10:00:01Z", "phase.start", "navigator"), // F1 — before the recording
        ev("2026-01-01T10:00:02Z", "turn.usage", "navigator"), // filler, not a phase.start
        ev("2026-01-01T10:00:05Z", "phase.start", "navigator"), // the RECORDED navigator turn
      ].join("\n"),
    );
    mkdirSync(join(rec, "turns"), { recursive: true });
    writeFileSync(
      join(rec, "turns", "index.json"),
      JSON.stringify({ turns: [{ ordinal: 5, step: 0, label: "nav red", kind: "invoke-role", role: "navigator", dir: "0005-navigator", producedCount: 0, deletedCount: 0 }] }),
    );
    // mirror begins at the recorded event's timestamp — that's how the suffix boundary is found.
    writeFileSync(join(rec, "agent-log.jsonl"), ev("2026-01-01T10:00:05Z", "phase.start", "navigator"));
    process.env.CONSORT_RECORD_DIR = rec;

    const c = new LiveSource().correlationSummary();
    // Positional to the 3 live events: F1 nav → null (excluded), filler → null, recorded nav → turn 5.
    // A whole-log correlation would instead give [5, null, null] — the bug this guards against.
    expect(c.recentTurns).toEqual([null, null, 5]);
    expect(c.paired).toBe(1);
    expect(c.healthy).toBe(true);
  });

  it("stays severity 'ok' on the normal live edge — an in-flight turn the companion hasn't recorded yet", () => {
    // The live log runs one navigator phase.start AHEAD of the companion's recorded turns (the
    // in-flight turn isn't captured yet): a role-EXHAUSTED tail. `report.healthy` trips on it, but the
    // live rule keeps it healthy, so there must be NO DriftBanner. Guards the regression where severity
    // was derived from report.healthy and lit an "info" banner (with a null message) on every live board.
    const ev = (ts: string, event: string, role: string) =>
      JSON.stringify({ timestamp: ts, level: "info", role, event, message: "", metadata: { phase: "red" } });
    writeFileSync(
      join(proj, ".consort", "agent-log.jsonl"),
      [
        ev("2026-01-01T10:00:05Z", "phase.start", "navigator"), // pairs with the recorded turn
        ev("2026-01-01T10:00:09Z", "phase.start", "navigator"), // in-flight: navigator turns are used up → role-exhausted
      ].join("\n"),
    );
    mkdirSync(join(rec, "turns"), { recursive: true });
    writeFileSync(
      join(rec, "turns", "index.json"),
      JSON.stringify({ turns: [{ ordinal: 5, step: 0, label: "nav red", kind: "invoke-role", role: "navigator", dir: "0005-navigator", producedCount: 0, deletedCount: 0 }] }),
    );
    writeFileSync(join(rec, "agent-log.jsonl"), ev("2026-01-01T10:00:05Z", "phase.start", "navigator"));
    process.env.CONSORT_RECORD_DIR = rec;

    const c = new LiveSource().correlationSummary();
    expect(c.paired).toBe(1);
    expect(c.unpairedEvents).toBe(1); // the in-flight navigator turn
    expect(c.healthy).toBe(true);
    expect(c.severity).toBe("ok"); // → DriftBanner renders nothing
    expect(c.message).toBeNull();
  });
});

describe("resolveSource — mode selection", () => {
  const saved = { project: process.env.CONSORT_PROJECT_DIR, corpus: process.env.CONSORT_CORPUS_DIR };

  beforeEach(() => {
    delete process.env.CONSORT_CORPUS_DIR;
  });
  afterEach(() => {
    if (saved.project === undefined) delete process.env.CONSORT_PROJECT_DIR;
    else process.env.CONSORT_PROJECT_DIR = saved.project;
    if (saved.corpus === undefined) delete process.env.CONSORT_CORPUS_DIR;
    else process.env.CONSORT_CORPUS_DIR = saved.corpus;
  });

  it("defaults to live with no note", () => {
    const r = resolveSource();
    expect(r.source.mode).toBe("live");
    expect(r.available).toEqual(["live"]);
    expect(r.note).toBeNull();
  });

  it("degrades a replay request loudly when no corpus is configured", () => {
    // The request must be answered with live + a note, never with a blank board that looks
    // like a run with no events.
    delete process.env.CONSORT_CORPUS_DIR;
    const r = resolveSource("replay");
    expect(r.source.mode).toBe("live");
    expect(r.note).toMatch(/CONSORT_CORPUS_DIR is not set/);
    expect(r.available).toEqual(["live"]);
  });

  it("notes an unusable CONSORT_CORPUS_DIR instead of silently ignoring it", () => {
    // A typo'd corpus path must not quietly remove the replay mode switch — the user set the
    // variable, so they expect replay to be on offer, and silence would look like it worked.
    process.env.CONSORT_CORPUS_DIR = "/tmp/definitely-not-a-corpus";
    const r = resolveSource();
    expect(r.source.mode).toBe("live");
    expect(r.note).toMatch(/unusable/i);
    // ...and the mode is NOT offered, so the switch can't land on an error board.
    expect(r.available).toEqual(["live"]);
  });

  it("names the specific defect when a replay request hits a broken corpus", () => {
    process.env.CONSORT_CORPUS_DIR = "/tmp/definitely-not-a-corpus";
    const r = resolveSource("replay");
    expect(r.source.mode).toBe("live");
    expect(r.note).toMatch(/Replay unavailable/);
    expect(r.note).toMatch(/not found/); // the actual reason, not just "unavailable"
  });

  it("currentSource returns the resolved source", () => {
    expect(currentSource().mode).toBe("live");
  });

  describe("with a usable corpus", () => {
    // A minimal corpus is enough: resolveSource only asks `available()`, which checks for a
    // log and a turns index. Building it here rather than depending on the real corpus keeps
    // mode selection testable on any machine.
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "resolve-corpus-"));
      mkdirSync(join(dir, "turns"), { recursive: true });
      writeFileSync(join(dir, "turns", "index.json"), JSON.stringify({ turns: [] }));
      writeFileSync(join(dir, "agent-log.jsonl"), "");
      process.env.CONSORT_CORPUS_DIR = dir;
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("offers both modes and defaults to live when live is usable", () => {
      // Watching a run in progress is this app's primary job; a corpus sitting on disk is not
      // a reason to stop doing that. The switch appears, the default doesn't move.
      //
      // Requires a real scaffolded project, since "usable" is what decides the default — see
      // the corpus-only case below.
      const project = join(process.env.HOME ?? "", "Code/consort-lab/stockflow");
      if (!existsSync(join(project, ".sftdd"))) return; // no live project on this machine
      process.env.CONSORT_PROJECT_DIR = project;
      const r = resolveSource();
      expect(r.source.mode).toBe("live");
      expect(r.available).toEqual(["live", "replay"]);
      expect(r.note).toBeNull();
    });

    it("falls back to replay when there is no live project to watch", () => {
      // Otherwise a corpus-only setup opens on an error page while a readable corpus sits
      // right there. The note names why the board isn't live, so the switch is discoverable.
      process.env.CONSORT_PROJECT_DIR = "/tmp/definitely-not-a-project";
      const r = resolveSource();
      expect(r.source.mode).toBe("replay");
      expect(r.available).toEqual(["live", "replay"]);
      expect(r.note).toMatch(/No live Consort project found/);
      // ...and the board is usable rather than an error state.
      expect(r.source.getState().ok).toBe(true);
    });

    it("still honours an explicit live request even when live is unusable", () => {
      // The fallback is only for "nothing was asked for". An explicit choice must not be
      // second-guessed, or the switch would be unable to show live's own error.
      process.env.CONSORT_PROJECT_DIR = "/tmp/definitely-not-a-project";
      const r = resolveSource("live");
      expect(r.source.mode).toBe("live");
    });

    it("honours an explicit replay request", () => {
      const r = resolveSource("replay");
      expect(r.source.mode).toBe("replay");
      expect(r.note).toBeNull();
      expect(r.available).toEqual(["live", "replay"]);
    });

    it("reads CONSORT_CORPUS_DIR per call, not once at import", () => {
      // A module-level singleton would pin whatever the env said when the module loaded,
      // which silently breaks both these tests and any future per-request corpus selection.
      expect(resolveSource("replay").source.mode).toBe("replay");
      delete process.env.CONSORT_CORPUS_DIR;
      expect(resolveSource("replay").source.mode).toBe("live");
    });
  });
});

describe("LiveSource — unavailable project", () => {
  const saved = process.env.CONSORT_PROJECT_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.CONSORT_PROJECT_DIR;
    else process.env.CONSORT_PROJECT_DIR = saved;
  });

  it("reports unavailable with an actionable reason when there is no .consort/", () => {
    process.env.CONSORT_PROJECT_DIR = "/tmp/definitely-not-a-consort-project";
    const src = new LiveSource();
    expect(src.available()).toBe(false);
    expect(src.unavailableReason()).toMatch(/No \.consort\//);
    expect(src.unavailableReason()).toMatch(/CONSORT_PROJECT_DIR/);
  });

  it("still yields a well-formed error state rather than throwing", () => {
    process.env.CONSORT_PROJECT_DIR = "/tmp/definitely-not-a-consort-project";
    const s = new LiveSource().getState();
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/No \.consort\//);
    expect(s.agents.length).toBeGreaterThan(0); // an empty board, not a broken one
  });

  it("reports no reason when the project IS available", () => {
    if (!HAS_PROJECT) return;
    process.env.CONSORT_PROJECT_DIR = STOCKFLOW;
    const src = new LiveSource();
    expect(src.available()).toBe(true);
    expect(src.unavailableReason()).toBeNull();
  });
});

// The equivalence that makes this a safe refactor: the interface must be a pass-through.
describe.skipIf(!HAS_PROJECT)("LiveSource — equivalence with the direct reader", () => {
  const saved = process.env.CONSORT_PROJECT_DIR;
  beforeEach(() => {
    process.env.CONSORT_PROJECT_DIR = STOCKFLOW;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CONSORT_PROJECT_DIR;
    else process.env.CONSORT_PROJECT_DIR = saved;
  });

  // Fields that legitimately differ between two reads a moment apart.
  const stripVolatile = (s: DashboardState) => {
    const { generatedAt: _g, snapshotAsOf: _s, ...rest } = s;
    // sessionActive depends on transcript mtimes at read time.
    return { ...rest, agents: rest.agents.map((a) => ({ ...a, sessionActive: null })) };
  };

  it("getState() matches folding events+snapshot by hand", () => {
    const src = new LiveSource();
    const events = src.events();
    expect(events.length).toBeGreaterThan(100);

    const generatedAt = new Date().toISOString();
    const byHand = fold(events, src.snapshot(events, generatedAt), undefined);
    expect(stripVolatile(src.getState())).toEqual(stripVolatile(byHand));
  });

  it("matches at a scrubbed position too", () => {
    const src = new LiveSource();
    const events = src.events();
    const generatedAt = new Date().toISOString();
    for (const at of [0, 12, 210, 380]) {
      const byHand = fold(events, src.snapshot(events, generatedAt), at);
      expect(stripVolatile(src.getState(at)), `at=${at}`).toEqual(stripVolatile(byHand));
    }
  });

  it("events() returns the parsed log, oldest first", () => {
    const events = new LiveSource().events();
    expect(events[0].timestamp <= events[events.length - 1].timestamp).toBe(true);
    for (const e of events.slice(0, 20)) {
      expect(typeof e.event).toBe("string");
      expect(typeof e.role).toBe("string");
    }
  });

  it("snapshot() supplies exactly the SnapshotInputs contract", () => {
    const src = new LiveSource();
    const snap: SnapshotInputs = src.snapshot(src.events(), "2026-08-05T00:00:00.000Z");
    expect(snap.projectDir).toBe(STOCKFLOW);
    expect(snap.generatedAt).toBe("2026-08-05T00:00:00.000Z");
    expect(Array.isArray(snap.handbacks)).toBe(true);
    expect(typeof snap.sessionAgeMs).toBe("number");
    // The three things the audit showed are genuinely snapshot-only.
    expect(snap.status === null || typeof snap.status === "object").toBe(true);
    expect(snap.next === null || typeof snap.next === "object").toBe(true);
  });

  it("is a pure pass-through: repeated getState at a fixed index is stable", () => {
    const src = new LiveSource();
    expect(stripVolatile(src.getState(210))).toEqual(stripVolatile(src.getState(210)));
  });

  // getState() now composes the interface (foldSource) instead of round-tripping
  // consort.buildState(). That is a real change of path, so pin it against the old one.
  it("foldSource matches the pre-refactor buildState path exactly", () => {
    const src = new LiveSource();
    for (const at of [undefined, 0, 12, 210, 380] as (number | undefined)[]) {
      expect(stripVolatile(src.getState(at)), `at=${at ?? "live"}`).toEqual(stripVolatile(buildState(at)));
    }
  });

  it("readSource returns the same state as foldSource, plus the events, in one read", () => {
    const src = new LiveSource();
    const both = readSource(src, 210);
    expect(both.events.length).toBeGreaterThan(100);
    expect(stripVolatile(both.state)).toEqual(stripVolatile(foldSource(src, 210)));
    // the events are the source's own log, not a re-parse of something else
    expect(both.events).toEqual(src.events());
  });
});

// A source is meant to be substitutable — that is the whole point of the interface. This
// stand-in proves the fold needs nothing from the filesystem, which is what Phase 2's replay
// source will rely on.
describe("DashboardSource — a fake source satisfies the contract", () => {
  const events: AgentLogEvent[] = [
    { timestamp: "2026-08-05T10:00:00.000Z", level: "info", role: "spec-author", event: "phase.start", message: "", metadata: { phase: "propose", feature_id: "F1" } },
    { timestamp: "2026-08-05T10:01:00.000Z", level: "info", role: "spec-author", event: "turn.usage", message: "", metadata: { cost_usd: 1.25, phase: "propose" } },
  ];

  class FakeSource implements DashboardSource {
    readonly mode = "replay" as const;
    readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(["timeline", "transport", "transcripts"]);
    describe() {
      return "fake-corpus";
    }
    available() {
      return true;
    }
    unavailableReason() {
      return null;
    }
    events() {
      return events;
    }
    snapshot(_e: AgentLogEvent[], generatedAt: string): SnapshotInputs {
      return {
        projectDir: "/fake",
        next: null,
        status: null,
        handbacks: [],
        sessionAgeMs: Infinity,
        pendingPermission: null,
        generatedAt,
      };
    }
    getState(upTo?: number) {
      return fold(this.events(), this.snapshot(this.events(), "2026-08-05T10:02:00.000Z"), upTo);
    }
  }

  it("folds without any filesystem access", () => {
    const s = new FakeSource().getState();
    expect(s.ok).toBe(true);
    expect(s.feature).toBe("F1");
    expect(s.totalCost).toBeCloseTo(1.25);
    expect(s.eventCount).toBe(2);
  });

  it("time-travels like the live source does", () => {
    const src = new FakeSource();
    expect(src.getState(1).totalCost).toBe(0);
    expect(src.getState(1).atLive).toBe(false);
    expect(src.getState().atLive).toBe(true);
  });

  it("can claim replay-only capabilities the live source cannot", () => {
    const src = new FakeSource();
    expect(hasCapability(src, "transcripts")).toBe(true);
    expect(hasCapability(new LiveSource(), "transcripts")).toBe(false);
  });
});
