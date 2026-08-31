import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fold, emptyState } from "./reducer";
import { blockersFromLog, storiesFromLog, storyKey } from "./derive";
import type { AgentLogEvent, SnapshotInputs } from "./types";

function ev(
  event: string,
  metadata: Record<string, unknown> = {},
  extra: Partial<AgentLogEvent> = {},
): AgentLogEvent {
  return {
    timestamp: extra.timestamp ?? "2026-07-31T20:00:00.000Z",
    level: "info",
    role: extra.role ?? "orchestrator",
    event,
    message: extra.message ?? "",
    metadata,
  };
}

// No-op snapshot: the fold's disk half supplies nothing, so these tests exercise purely
// the event-derived half. `sessionAgeMs: Infinity` means "no session activity".
function snap(over: Partial<SnapshotInputs> = {}): SnapshotInputs {
  return {
    projectDir: "/tmp/proj",
    next: null,
    status: null,
    handbacks: [],
    sessionAgeMs: Infinity,
    pendingPermission: null,
    generatedAt: "2026-08-05T00:00:00.000Z",
    ...over,
  };
}

// A small synthetic run: two roles taking a turn each, with costs.
const RUN: AgentLogEvent[] = [
  ev("phase.start", { phase: "propose", feature_id: "F1" }, { role: "spec-author" }),
  ev("turn.usage", { cost_usd: 1.5, phase: "propose" }, { role: "spec-author" }),
  ev("handoff", { to_role: "architect-reviewer" }, { role: "spec-author" }),
  ev("phase.start", { phase: "estimate" }, { role: "architect-reviewer" }),
  ev("turn.usage", { cost_usd: 2.25, phase: "estimate" }, { role: "architect-reviewer" }),
];

// The graph-lighting half of the fold. Derived server-side because `recentEvents` is only a
// 40-event tail while the graph needs the whole prefix to know what a run has reached.
describe("fold — topology", () => {
  it("reports reached nodes, the active node, and lane sub-steps", () => {
    const t = fold(RUN, snap()).topology;
    expect(t.passedNodes).toContain("plan");
    // last event carrying a phase is `estimate` → plan
    expect(t.activeNode).toBe("plan");
    expect(t.laneSteps.plan).toEqual(["p-propose", "p-size"]);
    expect(t.laneCurrent).toEqual({ lane: "plan", step: "p-size" });
    expect(t.atTimestamp).toBe(RUN[RUN.length - 1].timestamp);
  });

  it("rewinds with the scrub position — it is pure timeline data", () => {
    const t = fold(RUN, snap(), 2).topology;
    expect(t.laneSteps.plan).toEqual(["p-propose"]);
    expect(t.laneSteps.design).toEqual([]);
    expect(t.atTimestamp).toBe(RUN[1].timestamp);
  });

  it("is empty at the start of the log", () => {
    const t = fold(RUN, snap(), 0).topology;
    expect(t.passedNodes).toEqual([]);
    expect(t.activeNode).toBeNull();
    expect(t.laneCurrent).toBeNull();
    expect(t.atTimestamp).toBeNull();
    expect(t.laneSteps).toEqual({ plan: [], design: [], build: [] });
  });

  it("advances the active node as the run moves between lanes", () => {
    const run = [
      ...RUN,
      ev("phase.start", { phase: "design" }, { role: "dba" }),
      ev("phase.start", { phase: "green" }, { role: "driver" }),
    ];
    expect(fold(run, snap(), 6).topology.activeNode).toBe("design");
    const t = fold(run, snap()).topology;
    expect(t.activeNode).toBe("build");
    expect(t.passedNodes).toEqual(expect.arrayContaining(["plan", "design", "build"]));
  });

  it("does not treat a closing phase.end as an active node", () => {
    // Regression: the real stockflow log ends with phase.end/`workflow`, which maps to plan.
    // Reading that as the active node made a FINISHED run render as "active in Plan".
    const run = [
      ev("phase.start", { phase: "promote" }, { role: "release-engineer" }),
      ev("phase.end", { phase: "workflow" }, { role: "orchestrator" }),
    ];
    expect(fold(run, snap()).topology.activeNode).toBeNull();
    // mid-run, the open phase still lights
    expect(fold(run, snap(), 1).topology.activeNode).toBe("promote");
    // and phase.end doesn't erase what the run reached
    expect(fold(run, snap()).topology.passedNodes).toEqual(expect.arrayContaining(["promote"]));
  });

  it("looks past trailing events that carry no phase", () => {
    const run = [
      ev("phase.start", { phase: "green" }, { role: "driver" }),
      ev("reasoning", {}, { role: "orchestrator" }),
      ev("turn.usage", { cost_usd: 1 }, { role: "driver" }),
    ];
    expect(fold(run, snap()).topology.activeNode).toBe("build");
  });

  it("falls back to intake.supplied, which has no phase", () => {
    const t = fold([ev("intake.supplied", {}, { role: "product-owner" })], snap()).topology;
    expect(t.activeNode).toBe("intake");
    expect(t.passedNodes).toEqual(["intake"]);
  });

  it("emptyState carries a well-formed empty topology", () => {
    const t = emptyState("/tmp/p", "2026-08-05T00:00:00.000Z").topology;
    expect(t.passedNodes).toEqual([]);
    expect(t.activeNode).toBeNull();
    expect(t.laneCurrent).toBeNull();
    expect(t.laneSteps).toEqual({ plan: [], design: [], build: [] });
  });

  it("serializes over JSON without losing shape (Sets would not)", () => {
    // The fold converts Sets to arrays precisely so /api/state can carry this.
    const t = fold(RUN, snap()).topology;
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
    for (const v of t.passedNodes) expect(typeof v).toBe("string");
  });
});

describe("fold — time-travel window", () => {
  it("folds the whole log when upTo is omitted, and reports the live edge", () => {
    const s = fold(RUN, snap());
    expect(s.eventCount).toBe(5);
    expect(s.atEventIndex).toBe(5);
    expect(s.totalEventCount).toBe(5);
    expect(s.atLive).toBe(true);
  });

  it("folds only the first n events when scrubbed back", () => {
    const s = fold(RUN, snap(), 2);
    expect(s.eventCount).toBe(2);
    expect(s.atEventIndex).toBe(2);
    expect(s.totalEventCount).toBe(5); // total still reports the full log
    expect(s.atLive).toBe(false);
  });

  it("does not leak future state into a scrubbed-back board", () => {
    // At index 2 the architect has not started; only the spec-author has spent.
    const s = fold(RUN, snap(), 2);
    const arch = s.agents.find((a) => a.role === "architect-reviewer")!;
    expect(arch.status).toBe("idle");
    expect(arch.turns).toBe(0);
    expect(s.totalCost).toBeCloseTo(1.5);
  });

  it("clamps out-of-range and fractional indices instead of throwing", () => {
    expect(fold(RUN, snap(), -5).atEventIndex).toBe(0);
    expect(fold(RUN, snap(), 999).atEventIndex).toBe(5);
    expect(fold(RUN, snap(), 999).atLive).toBe(true);
    expect(fold(RUN, snap(), 2.7).atEventIndex).toBe(2);
  });

  it("upTo === length is the live edge (identical to omitting it)", () => {
    expect(fold(RUN, snap(), RUN.length)).toEqual(fold(RUN, snap()));
  });

  it("folds an empty log to a zero state that is still 'live'", () => {
    const s = fold([], snap());
    expect(s.eventCount).toBe(0);
    expect(s.atLive).toBe(true);
    expect(s.totalCost).toBe(0);
  });
});

describe("fold — purity and monotonicity", () => {
  it("is pure: same inputs yield deeply equal output", () => {
    expect(fold(RUN, snap(), 3)).toEqual(fold(RUN, snap(), 3));
  });

  it("does not mutate the events array it is given", () => {
    const copy = JSON.parse(JSON.stringify(RUN));
    fold(RUN, snap(), 3);
    expect(RUN).toEqual(copy);
  });

  it("cumulative measures never decrease as the window grows", () => {
    let prevCost = -1;
    let prevEvents = -1;
    let prevTurns = -1;
    for (let i = 0; i <= RUN.length; i++) {
      const s = fold(RUN, snap(), i);
      const turns = s.agents.reduce((n, a) => n + a.turns, 0);
      expect(s.totalCost).toBeGreaterThanOrEqual(prevCost);
      expect(s.eventCount).toBeGreaterThanOrEqual(prevEvents);
      expect(turns).toBeGreaterThanOrEqual(prevTurns);
      prevCost = s.totalCost;
      prevEvents = s.eventCount;
      prevTurns = turns;
    }
  });
});

// The §3a rule, as corrected 2026-08-05. The ORIGINAL reading — "snapshot data always
// describes now, so show current values and label them" — turned out to be wrong in the
// only place it mattered: a viewer scrubbed to event 12 saw "design complete · 2 stories
// done" for a run that was still in `breakdown` with no stories yet, under a badge reading
// "not historical". Labelling a wrong number doesn't make it right.
//
// The corrected rule: derive from the log whatever the log CAN support (gates, stories,
// lane), and for the one thing it genuinely can't — test COUNTS — report
// testsHistorical:false so the UI omits the bar instead of showing a current or zeroed one.
describe("fold — scrubbed-back state is reconstructed from the log, not the snapshot", () => {
  const withStatus = snap({
    status: {
      feature_id: "F1",
      derived_phase: "build",
      stories: [{ story_id: "S1", status: "done", accepted: true }],
      test_list: { total: 10, by_status: { green: 4, red: 1, pending: 5 }, completion_pct: 40 },
      gates: { spec: { status: "approved" } },
    },
    next: { feature: "F1", generated_at: "2026-08-05T12:00:00.000Z" },
  });

  it("does not carry current stories/gates back to an early playhead", () => {
    const live = fold(RUN, withStatus);
    const back = fold(RUN, withStatus, 1);
    // live still trusts the snapshot
    expect(live.stories.map((s) => s.id)).toEqual(["S1"]);
    expect(live.gates).toEqual([{ name: "spec", status: "approved" }]);
    // RUN's first event mentions no story and no gate, so at event 1 neither exists yet
    expect(back.stories).toEqual([]);
    expect(back.gates).toEqual([]);
    expect(back.progress.storiesTotal).toBe(0);
    expect(back.progress.storiesDone).toBe(0);
  });

  it("reports test counts as unavailable rather than wrong when scrubbed", () => {
    const live = fold(RUN, withStatus);
    expect(live.progress.testsHistorical).toBe(true);
    expect(live.progress.testTotal).toBe(10);

    const back = fold(RUN, withStatus, 1);
    expect(back.progress.testsHistorical).toBe(false);
    // zeroed, and flagged — the UI must omit the bar, not render 0/0 as if no tests existed
    expect(back.progress.testTotal).toBe(0);
    expect(back.progress.testPct).toBe(0);
    expect(back.progress.testByStatus).toEqual({ pending: 0, red: 0, green: 0, refactored: 0, skipped: 0 });
  });

  it("takes the lane from the playhead, not from derived_phase", () => {
    // The snapshot says `build`, but event 1 is a `propose` phase.start — still planning.
    expect(fold(RUN, withStatus).lane).toBe("build");
    expect(fold(RUN, withStatus, 1).lane).toBe("design");
  });

  it("does not mark the design lane complete while the run is still designing", () => {
    // Regression for the reported bug: at an early playhead every design phase showed
    // `complete` because computeDesignPhases takes the snapshot-derived lane.
    const back = fold(RUN, withStatus, 1);
    const done = back.designPhases.filter((p) => p.status === "complete").map((p) => p.name);
    expect(done).not.toContain("design");
    expect(done).not.toContain("reflect");
  });

  it("still exposes snapshotAsOf, which now describes only the live edge", () => {
    expect(fold(RUN, withStatus, 1).snapshotAsOf).toBe("2026-08-05T12:00:00.000Z");
  });

  it("falls back to the log at the live edge when there is no snapshot on disk", () => {
    // Regression: gating purely on atLive made the LIVE view show zero stories whenever the
    // status CLI produced nothing, even though the log named them — leaving the live board
    // worse informed than a scrubbed one.
    const storyRun: AgentLogEvent[] = [
      ev("phase.start", { phase: "design", story: "S1" }, { role: "spec-author" }),
      ev("gate.surfaced", { gate: "spec", story: "S1" }, { role: "orchestrator" }),
    ];
    const s = fold(storyRun, snap()); // live, no status on disk
    expect(s.atLive).toBe(true);
    expect(s.stories.map((x) => x.id)).toEqual(["S1"]);
    expect(s.gates).toEqual([{ name: "spec", status: "open" }]);
  });

  it("exposes snapshotAsOf + atLive so the UI can label stale panels", () => {
    const back = fold(RUN, withStatus, 1);
    expect(back.atLive).toBe(false);
    // next.json's generated_at wins as the as-of stamp.
    expect(back.snapshotAsOf).toBe("2026-08-05T12:00:00.000Z");
  });

  it("has no snapshotAsOf when there is no snapshot at all", () => {
    expect(fold(RUN, snap()).snapshotAsOf).toBeNull();
  });
});

describe("fold — liveness only applies at the live edge", () => {
  // An open turn (phase.start with no closing turn.usage) => the role is "working".
  const open: AgentLogEvent[] = [ev("phase.start", { phase: "design" }, { role: "dba" })];

  it("marks a working agent live when a session wrote recently", () => {
    const s = fold(open, snap({ sessionAgeMs: 1000 }));
    expect(s.agents.find((a) => a.role === "dba")!.sessionActive).toBe(true);
  });

  it("marks it not-live when the session has gone quiet", () => {
    const s = fold(open, snap({ sessionAgeMs: 60_000 }));
    expect(s.agents.find((a) => a.role === "dba")!.sessionActive).toBe(false);
  });

  it("leaves sessionActive null when scrubbed back — a past turn is not 'live now'", () => {
    const s = fold([...open, ev("turn.usage", { cost_usd: 1 }, { role: "dba" })], snap({ sessionAgeMs: 1000 }), 1);
    expect(s.atLive).toBe(false);
    expect(s.agents.find((a) => a.role === "dba")!.sessionActive).toBeNull();
  });
});

describe("fold — a role's turn closes on the next dispatch (replay/no-token runs)", () => {
  // REPLAY runs never spawn the model, so they emit NO turn.usage — the event that
  // otherwise closes a role's turn. Design/build roles also never emit phase.end (only
  // orchestrator + release-engineer do). Before this fix, that left every design/build role
  // pinned "working" for the whole mid-run window (only the terminal phase.end/workflow
  // eventually cleared them), so a live viewer saw ghost concurrency — e.g. navigator+driver
  // "working" while release-engineer promotes. The log always has a `handoff` between roles;
  // the orchestrator dispatching the NEXT role proves the previous role's turn is over.

  it("closes an open turn when the orchestrator hands off to another role", () => {
    const evs: AgentLogEvent[] = [
      ev("phase.start", { phase: "estimate" }, { role: "architect-reviewer" }),
      // no turn.usage (replay) — then the orchestrator dispatches the next role:
      ev("handoff", { to_role: "dba", phase: "db-design" }, { role: "orchestrator" }),
      ev("phase.start", { phase: "db-design" }, { role: "dba" }),
    ];
    const s = fold(evs, snap());
    // architect-reviewer finished before dba started — it must not still be "working".
    expect(s.agents.find((a) => a.role === "architect-reviewer")!.status).toBe("idle");
    // dba is the one genuinely working now.
    expect(s.agents.find((a) => a.role === "dba")!.status).toBe("working");
  });

  it("does not close the incoming role's own turn on its dispatch handoff", () => {
    // The handoff names to_role=dba and is immediately followed by dba's phase.start;
    // dba must end up working, not cleared.
    const evs: AgentLogEvent[] = [
      ev("handoff", { to_role: "dba", phase: "db-design" }, { role: "orchestrator" }),
      ev("phase.start", { phase: "db-design" }, { role: "dba" }),
    ];
    const s = fold(evs, snap());
    expect(s.agents.find((a) => a.role === "dba")!.status).toBe("working");
  });

  it("mid-run: only the currently-dispatched role is working, not finished ones (replay fixture)", () => {
    // The real cold-run replay log: at a mid-run slice, design/build roles that have handed
    // off must be idle, not ghost-working.
    const evs = readReplay();
    // Slice to just after release-engineer has started PROMOTE (nav/driver long done — including
    // their cycle reruns). Must match phase === "promote", not the first RE phase.start, which is
    // an earlier `deploy` at the end of TDD cycle 1 and would leave the nav/driver reruns unseen.
    const promoteStart = evs.findIndex(
      (e) => e.role === "release-engineer" && e.event === "phase.start" && (e.metadata as Record<string, unknown>)?.phase === "promote",
    );
    expect(promoteStart).toBeGreaterThan(0);
    const s = fold(evs.slice(0, promoteStart + 1), snap());
    const status = (r: string) => s.agents.find((a) => a.role === r)!.status;
    // The ghosts from the screenshot — all finished before promote:
    for (const r of ["spec-author", "ux-designer", "architect-reviewer", "dba", "test-strategist", "navigator", "driver"]) {
      expect(status(r), `${r} should be idle mid-promote`).not.toBe("working");
    }
    // release-engineer is the one actually working.
    expect(status("release-engineer")).toBe("working");
  });

  it("the replay log genuinely emits no turn.usage (guards the premise of this fix)", () => {
    const evs = readReplay();
    expect(evs.some((e) => e.event === "turn.usage")).toBe(false);
  });

  it("a handoff with no to_role does not idle the genuinely-active role", () => {
    // Defensive: closeOtherTurns(null) would clear EVERY open turn. A to_role-less handoff must
    // be a no-op for turn-closing, leaving the working role working.
    const evs: AgentLogEvent[] = [
      ev("phase.start", { phase: "db-design" }, { role: "dba" }),
      ev("handoff", {}, { role: "orchestrator" }), // no to_role
    ];
    const s = fold(evs, snap());
    expect(s.agents.find((a) => a.role === "dba")!.status).toBe("working");
  });

  it("closes a role that emits no turn.usage even in a LIVE run (product-owner)", () => {
    // Not a replay-only concern: product-owner emits only intake.supplied/phase.start/
    // gate.approved — never turn.usage — so the next dispatch is what closes its turn, live too.
    const evs: AgentLogEvent[] = [
      ev("phase.start", { phase: "author-requests" }, { role: "product-owner" }),
      ev("gate.approved", { gate: "plan" }, { role: "product-owner" }),
      ev("handoff", { to_role: "spec-author", phase: "propose" }, { role: "orchestrator" }),
      ev("phase.start", { phase: "propose" }, { role: "spec-author" }),
    ];
    const s = fold(evs, snap());
    expect(s.agents.find((a) => a.role === "product-owner")!.status).toBe("idle");
    expect(s.agents.find((a) => a.role === "spec-author")!.status).toBe("working");
  });
});

describe("fold — blockers and resolver routing", () => {
  it("routes a blocker to the handback role and flips that agent to issue", () => {
    const s = fold(
      RUN,
      snap({
        next: { feature: "F1", state: { blockers: [{ source: "unknown-thing", reason: "boom", story: "S1" }] } },
        handbacks: [{ role: "dba", story: "S1" }],
      }),
    );
    expect(s.blockers[0].resolverRole).toBe("dba");
    expect(s.agents.find((a) => a.role === "dba")!.status).toBe("issue");
  });

  it("falls back to a keyword guess when no handback matches", () => {
    const s = fold(
      RUN,
      snap({ next: { feature: "F1", state: { blockers: [{ source: "driver-green", reason: "boom" }] } } }),
    );
    expect(s.blockers[0].resolverRole).toBe("driver");
  });
});

describe("storyKey — a story is (feature, id), unambiguously", () => {
  // A story id is only unique WITHIN a feature (the corpus's two sprints both use S1/S2/S3),
  // so the key is composite. These pin that no two distinct pairs can share a key — a
  // collision silently merges two stories' progress, which is the bug class that keying by
  // bare story id was.
  it("keeps distinct (feature, story) pairs distinct even when they contain the separator", () => {
    expect(storyKey("F1/x", "y")).not.toBe(storyKey("F1", "x/y"));
    expect(storyKey("F1", "S1")).toBe(storyKey("F1", "S1")); // and is stable
  });

  it("does not let a feature named '?' collide with the unknown-feature bucket", () => {
    // The sentinel shares a namespace with real feature ids, so it is escaped too. `?` is a
    // legal id, and storiesFromLog's rekey path builds and looks up the unknown key directly.
    expect(storyKey(null, "S1")).not.toBe(storyKey("?", "S1"));
  });

  it("escapes the escape character, so escaping can't be forged", () => {
    // Without escaping `~` first, a literal "~1" in an id would decode as the separator.
    expect(storyKey("F~1x", "y")).not.toBe(storyKey("F", "x/y"));
    expect(storyKey("F~2", "S1")).not.toBe(storyKey(null, "S1"));
  });

  it("is unchanged for the ordinary ids both real logs actually contain", () => {
    // Measured: no feature or story id in either log contains `/` or `~`, so the escaping is
    // defensive and must not alter the keys in use.
    expect(storyKey("F1-stock-visibility", "S1-file-stock")).toBe("F1-stock-visibility/S1-file-stock");
  });
});

describe("emptyState", () => {
  it("is a not-ok board with every role idle and zero cost", () => {
    const s = emptyState("/tmp/proj", "2026-08-05T00:00:00.000Z");
    expect(s.ok).toBe(false);
    expect(s.totalCost).toBe(0);
    expect(s.agents.every((a) => a.status === "idle")).toBe(true);
    expect(s.atLive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Golden fold against the REAL log from the stockflow run in this lab. Guards the
// refactor against drift on production-shaped data (many roles, gates, escalations,
// deploys) rather than only hand-built fixtures. Skipped if the log isn't present, so
// the suite stays green on a clean checkout.
// v0.3.7 renames the artifact root .sftdd → .consort and auto-migrates old projects on next run,
// so resolve the current root first and fall back to the legacy one.
const STOCKFLOW = join(process.env.HOME || "", "Code/consort-lab/stockflow");
const REAL_LOG =
  [".consort", ".sftdd", ".tdd"]
    .map((r) => join(STOCKFLOW, r, "agent-log.jsonl"))
    .find((p) => existsSync(p)) ?? join(STOCKFLOW, ".consort", "agent-log.jsonl");

function readReal(): AgentLogEvent[] {
  return readFileSync(REAL_LOG, "utf8")
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

// The bug as actually reported, against the real log: "slider at 12/380 and status shows
// design complete and 2 stories complete". Event 12 is mid-`breakdown` — design hasn't
// started and no story has been mentioned yet.
describe.skipIf(!existsSync(REAL_LOG))("fold — the reported scrub-back bug, on the real log", () => {
  it("at event 12: no stories, no gates, design not started", () => {
    const s = fold(readReal(), snap(), 12);
    expect(s.stories).toEqual([]);
    expect(s.progress.storiesDone).toBe(0);
    expect(s.gates).toEqual([]);
    expect(s.lane).toBe("design");

    const byName = new Map(s.designPhases.map((p) => [p.name, p.status]));
    expect(byName.get("breakdown")).toBe("in-progress");
    expect(byName.get("design")).toBe("not-started");
    expect(byName.get("reflect")).toBe("not-started");
    expect(s.progress.testsHistorical).toBe(false);
  });

  it("stories appear only once the log first mentions them", () => {
    const events = readReal();
    // S1 first appears at event 21, S2 at 205, S3 at 227.
    expect(fold(events, snap(), 20).stories).toEqual([]);
    expect(fold(events, snap(), 25).stories.map((s) => s.id)).toEqual(["S1-record-stock"]);
    expect(fold(events, snap(), 210).stories.length).toBe(2);
    expect(fold(events, snap(), 300).stories.length).toBe(3);
  });

  it("story count is monotonic and never exceeds the live count", () => {
    const events = readReal();
    const liveCount = fold(events, snap()).stories.length;
    let prev = 0;
    for (let i = 0; i <= events.length; i += 20) {
      const n = fold(events, snap(), i).stories.length;
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeLessThanOrEqual(Math.max(liveCount, n));
      prev = n;
    }
  });

  it("keeps the lane in design while design is still running for a later story", () => {
    // Event 210 is spec-author in `design` for S2 — an earlier reflect must not make this
    // read as "build" (reflect maps to the build node in phaseToNode).
    expect(fold(readReal(), snap(), 210).lane).toBe("design");
  });

  it("does not carry current blockers back to a playhead before they existed", () => {
    // next.json's blockers describe NOW, so a GREEN-verify failure showed at event 0 —
    // before the run had written a line of code.
    const events = readReal();
    const withBlocker = snap({
      next: {
        feature: "F1",
        state: { blockers: [{ source: "driver-green", reason: "GREEN verify failed", story: "S3-sku-detail-view" }] },
      },
    });
    expect(fold(events, withBlocker, 0).blockers).toEqual([]);
    expect(fold(events, withBlocker, 12).blockers).toEqual([]);
    // at the live edge next.json is still authoritative
    expect(fold(events, withBlocker).blockers.length).toBe(1);
  });

  it("surfaces a log escalation only while it is unresolved", () => {
    // #263 is escalation.raised for S2; work resumes at #266, which clears it.
    const events = readReal();
    const atEscalation = fold(events, snap(), 264).blockers;
    expect(atEscalation.length).toBe(1);
    expect(atEscalation[0].source).toBe("driver-green");
    expect(atEscalation[0].story).toBe("S2-stock-home-screen");
    // resolver routing still works off log-derived blockers
    expect(atEscalation[0].resolverRole).toBe("driver");
    // once the run moves on, it is no longer outstanding
    expect(fold(events, snap(), 266).blockers).toEqual([]);
  });

  it("takes the feature from the log when scrubbed, not from next.json", () => {
    // next.json names the feature being worked NOW; 200 events ago it may differ.
    const events = readReal();
    const stale = snap({ next: { feature: "F9-some-later-feature" } });
    expect(fold(events, stale, 12).feature).toBe("F1-stock-visibility");
    expect(fold(events, stale).feature).toBe("F9-some-later-feature"); // live: snapshot wins
  });

  it("reports a finished run as complete, whatever derived_phase claims", () => {
    // Reported: at 380/380 the Build bar still said "· in progress" with 13/29. The counts
    // were right (16 tests genuinely never got written) but the run was over — promote was
    // approved at #377 and phase.end/workflow landed at #379. next.json's derived_phase sits
    // at "build" forever after, so trusting it kept the lane active on a shipped run.
    const s = fold(readReal(), snap({ next: { feature: "F1", state: { derived_phase: "build" } } }));
    expect(s.lane).toBe("complete");
    expect(s.phase).toBe("complete");
    // and nothing should be left working on a finished run
    expect(s.agents.filter((a) => a.status === "working")).toEqual([]);
    expect(s.agents.filter((a) => a.status === "on-deck")).toEqual([]);
  });

  it("tracks the lane forward through deploy and promote without falling back to design", () => {
    // Regression: at event 372 the last folded event is phase.end/deploy, so nothing is
    // active — and the lane fell through to "design" on a run that had just deployed.
    const events = readReal();
    const laneAt = (n: number) => fold(events, snap(), n).lane;
    expect(laneAt(370)).toBe("build"); // deploying
    expect(laneAt(372)).toBe("build"); // deploy just closed; must NOT read as design
    expect(laneAt(376)).toBe("complete"); // promote has started
    expect(laneAt(380)).toBe("complete"); // run ended
  });

  it("at the live edge, a verified story is done even if the CLI says `ready`", () => {
    // Reported: at 380/380 the board showed S1 still in design. The status CLI reports S1 as
    // `ready` (a design-bucket status) although the log has cycle.review, cycle.refactored
    // and verify.passed for it at #350/#355/#360, and next.json says awaiting-acceptance.
    // The log can't un-happen, so the furthest-along evidence wins.
    const events = readReal();
    const stale = snap({
      status: {
        feature_id: "F1-stock-visibility",
        derived_phase: "build",
        stories: [
          { story_id: "S1-record-stock", status: "ready" },
          { story_id: "S2-stock-home-screen", status: "done", accepted: true },
          { story_id: "S3-sku-detail-view", status: "done", accepted: true },
        ],
      },
    });
    const s1 = fold(events, stale).stories.find((x) => x.id === "S1-record-stock")!;
    expect(s1.stage).toBe("done");
    expect(s1.active).toBe(false);
    expect(fold(events, stale).progress.storiesDone).toBe(3);
  });

  it("never drags a story BACKWARDS from what the CLI reports", () => {
    // The reconciliation is one-directional: it may only advance a story. If the CLI knows
    // more than the log (acceptance approved out-of-band), that must stand.
    const events = readReal();
    const ahead = snap({
      status: {
        feature_id: "F1-stock-visibility",
        derived_phase: "complete",
        stories: [{ story_id: "S1-record-stock", status: "done", accepted: true }],
      },
    });
    expect(fold(events, ahead).stories[0].status).toBe("done");
  });

  it("a story only reaches done once verify.passed lands for it", () => {
    const events = readReal();
    // S2's verify.passed is at event 289.
    const before = fold(events, snap(), 289).stories.find((s) => s.id === "S2-stock-home-screen");
    const after = fold(events, snap(), 290).stories.find((s) => s.id === "S2-stock-home-screen");
    expect(before?.status).not.toBe("done");
    expect(after?.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// The MULTI-FEATURE corpus: stockflow-rerecord, 421 events, two sprints that each ship a
// feature end-to-end (F1-stock-visibility then F6-split-tracking-code). Vendored rather
// than read from the plugin cache because Kevin shipped it corpus-only in 6e73019 with no
// version bump, so the installed 0.3.6 cache does NOT contain it (same reasoning as the
// committed kevin-workflow.json: pin the upstream shape we derived against).
//
// Every earlier real-log test above uses `stockflow`, which is SINGLE-feature. That is
// exactly why flat story keying survived Phase 1 undetected: both features here number
// their stories S1/S2/S3, so a story id is only unique WITHIN a feature.
const CORPUS_LOG = join(__dirname, "__fixtures__/stockflow-rerecord-agent-log.jsonl");

function readCorpus(): AgentLogEvent[] {
  return readFileSync(CORPUS_LOG, "utf8")
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

// A real REPLAY run's log (captured from the cold-run F1 replay). Unlike the corpus fixture
// above — which is a recording of a real *live* run and so carries turn.usage — a replay never
// spawns the model, so it emits ZERO turn.usage. This is the fixture that exercises the
// no-token turn-closing path.
const REPLAY_LOG = join(__dirname, "__fixtures__/stockflow-f1-replay-agent-log.jsonl");

function readReplay(): AgentLogEvent[] {
  return readFileSync(REPLAY_LOG, "utf8")
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

describe("fold — multi-feature run (stockflow-rerecord corpus)", () => {
  it("reads the vendored corpus and its provenance", () => {
    const events = readCorpus();
    expect(events.length).toBe(421);
    // The version anchor travels with the corpus, stamped on the first event's metadata.
    const md = events[0].metadata as Record<string, unknown>;
    expect(md.kit_describe).toBe("v0.3.6");
    expect(md.kit_commit).toBe("cad5f5fb5eb7e59a703722284b6a5858ddf3fff0");
  });

  it("keeps the two features' stories distinct", () => {
    // THE BUG: story ids repeat across features (both sprints have S1/S2/S3), so keying by
    // bare story id collapsed six real stories. Asserted on the raw derivation, which spans
    // the whole run — the fold then scopes to one feature (see the next test).
    const all = storiesFromLog(readCorpus());
    const keys = all.map((x) => `${x.feature}/${x.id}`);
    expect(new Set(keys).size).toBe(6);
    expect(keys).toEqual([
      "F1-stock-visibility/S1-file-stock",
      "F1-stock-visibility/S2-stock-by-location-table",
      "F1-stock-visibility/S3-sku-detail-view",
      "F6-split-tracking-code/S1-split-columns-migration",
      "F6-split-tracking-code/S2-reversible-down-migration",
      "F6-split-tracking-code/S3-stock-shows-split-fields",
    ]);
    // Every one shipped, so a collapsed key would silently look "correct" at the live edge.
    expect(all.every((s) => s.status === "done")).toBe(true);
  });

  it("shows only the active feature's stories, not every story ever run", () => {
    // The user-visible bug at the sprint boundary: event 217 approves the F6 plan gate, so
    // the board is now on sprint 2 — but the story list still showed three *completed* F1
    // stories with no sign a second feature had begun. Stories must be scoped to the
    // feature the playhead is on.
    const events = readCorpus();
    const at217 = fold(events, snap(), 217);
    expect(at217.feature).toBe("F6-split-tracking-code");
    expect(at217.stories.map((s) => s.id)).toEqual([]);
    expect(at217.progress.storiesTotal).toBe(0);
    expect(at217.progress.storiesDone).toBe(0);

    // Mid-sprint-2: only F6's stories, and F6's S1 is its own story — not F1's S1 resurfacing.
    const at300 = fold(events, snap(), 300);
    expect(at300.feature).toBe("F6-split-tracking-code");
    expect(at300.stories.map((s) => s.id)).toEqual([
      "S1-split-columns-migration",
      "S2-reversible-down-migration",
    ]);
    expect(at300.stories.every((s) => s.feature === "F6-split-tracking-code")).toBe(true);
  });

  it("scopes progress counts to the active feature", () => {
    // At the end of sprint 1 the board should read 3/3 — not 3-of-6, and at the end of
    // sprint 2 it should read 3/3 again rather than 6/6.
    const events = readCorpus();
    const endOfSprint1 = fold(events, snap(), 212);
    expect(endOfSprint1.feature).toBe("F1-stock-visibility");
    expect(endOfSprint1.progress.storiesTotal).toBe(3);
    expect(endOfSprint1.progress.storiesDone).toBe(3);

    const live = fold(events, snap());
    expect(live.feature).toBe("F6-split-tracking-code");
    expect(live.progress.storiesTotal).toBe(3);
    expect(live.progress.storiesDone).toBe(3);
  });

  it("ignores a feature_id that is really a story id", () => {
    // Upstream data quality: three `reasoning` events from driver carry a story id (or a
    // truncated "F1") in feature_id. Those must not invent a feature or re-scope the board.
    const events = readCorpus();
    // Event 179 is one such event (feature_id="S3-sku-detail-view"); the run is on F1 there.
    expect(fold(events, snap(), 180).feature).toBe("F1-stock-visibility");
    expect(fold(events, snap(), 116).feature).toBe("F1-stock-visibility");
    // And 378 sits just after feature_id="S3-stock-shows-split-fields" during sprint 2.
    expect(fold(events, snap(), 378).feature).toBe("F6-split-tracking-code");
  });

  it("does not treat the first sprint's end as the whole run ending", () => {
    // Found by running the app, not by these tests: the board read "complete" from event 213
    // to the end of the log — through the whole of sprint 2. `phase.end`/`workflow` fires once
    // PER FEATURE (213 ends F1, 420 ends F6), and runEnded was sticky, so sprint 1 finishing
    // retired the entire board: every agent bubble went calm and the lane froze at complete
    // while F6 was still designing and building. stockflow has exactly one such event, which
    // is why this survived Phase 1.
    const events = readCorpus();
    // Folding exactly TO sprint 1's end (213/214) legitimately reads complete: the slice ends
    // on phase.end/workflow with nothing reopened yet. The bug was that it STAYED complete.
    expect(fold(events, snap(), 215).lane).toBe("design"); // sprint 2's plan lane opens
    expect(fold(events, snap(), 230).lane).toBe("design"); // F6 is designing
    expect(fold(events, snap(), 260).lane).toBe("build"); // ...and building
    expect(fold(events, snap(), 300).lane).not.toBe("complete");
    expect(fold(events, snap(), 380).lane).toBe("build");
    // The run really has ended at the log's end, and only there.
    expect(fold(events, snap()).lane).toBe("complete");
    expect(fold(events, snap(), 421).lane).toBe("complete");
  });

  it("stays complete when a trailing event follows the final workflow end", () => {
    // The runEnded reset must not be so wide that one stray event revives a shipped run —
    // that is the "Build · in progress" / spinning-bubbles bug PR #10 fixed. Both real logs
    // end exactly on phase.end/workflow, but nothing guarantees a log has no trailing
    // handoff, so assert the guard directly. A wind-down handoff names a role WITHOUT
    // dispatching into a phase — unlike all 71 real handoffs in this corpus, which carry one.
    const events = readCorpus();
    const trailingHandoff = [
      ...events,
      ev("handoff", { to_role: "orchestrator", feature_id: "F6-split-tracking-code" }),
    ];
    const s = fold(trailingHandoff, snap());
    expect(s.lane).toBe("complete");
    expect(s.agents.filter((a) => a.status === "working" || a.status === "on-deck")).toEqual([]);

    // ...but a real phase.start after the end DOES mean a new workflow began.
    const trailingStart = [
      ...events,
      ev("phase.start", { phase: "propose", feature_id: "F7-next" }, { role: "spec-author" }),
    ];
    expect(fold(trailingStart, snap()).lane).toBe("design");
  });

  it("puts agents back to work after the first sprint ends", () => {
    // The same sticky flag also suppressed the working/on-deck finalize step, so a run in
    // full flight showed eight idle bubbles.
    const events = readCorpus();
    const mid = fold(events, snap(), 230);
    expect(mid.agents.some((a) => a.status === "working" || a.status === "on-deck")).toBe(true);
    // ...and a genuinely finished run still shows nothing working.
    const end = fold(events, snap());
    expect(end.agents.filter((a) => a.status === "working" || a.status === "on-deck")).toEqual([]);
  });

  it("does not split a story that was named before its feature was stamped", () => {
    // The composite key embeds the feature, so a story seen before any feature_id lands and
    // again afterwards would be keyed twice (null/S1 and F1/S1) — one real story rendered as
    // two rows with divergent stages, and double-counted in storiesTotal. Both real logs
    // stamp a feature before the first story (event 11 vs 26 in the corpus), so nothing in
    // them exercises this; it is a shape a design-lane-only log could easily have.
    const events = [
      ev("phase.start", { phase: "design", story: "S1" }, { role: "spec-author" }),
      ev("phase.start", { phase: "design", story: "S1", feature_id: "F1" }, { role: "spec-author" }),
    ];
    const s = storiesFromLog(events);
    expect(s.length).toBe(1);
    expect(s[0].id).toBe("S1");
    expect(s[0].feature).toBe("F1"); // the resolved feature wins over the unknown one

    // Evidence recorded while the feature was unknown must survive the merge.
    const withEvidence = [
      ev("phase.start", { phase: "design", story: "S2" }, { role: "spec-author" }),
      ev("verify.passed", { story: "S2" }, { role: "driver" }),
      ev("phase.start", { phase: "design", story: "S2", feature_id: "F1" }, { role: "spec-author" }),
    ];
    const merged = storiesFromLog(withEvidence);
    expect(merged.length).toBe(1);
    expect(merged[0].feature).toBe("F1");
    expect(merged[0].status).toBe("done"); // verify.passed from the pre-feature window

    // And the fold reports one story, not two.
    const folded = fold(events, snap());
    expect(folded.stories.length).toBe(1);
    expect(folded.progress.storiesTotal).toBe(1);
  });

  it("does not inherit the previous sprint's graph progress", () => {
    // The lifecycle graph and lane graphs light from topology.passedNodes / laneSteps, which
    // described the whole RUN. At event 230 sprint 2 has only begun designing, yet the graph
    // showed deploy+promote reached and all seven build sub-steps done — a shipped lifecycle
    // for a feature that had not written a line of code. This is the bug LaneGraph would have
    // rendered three times over, and it was already visible in WorkflowGraph.
    const events = readCorpus();
    const at230 = fold(events, snap(), 230);
    expect(at230.feature).toBe("F6-split-tracking-code");
    expect(at230.topology.passedNodes).not.toContain("deploy");
    expect(at230.topology.passedNodes).not.toContain("promote");
    expect(at230.topology.laneSteps.build).toEqual([]);

    // Sprint 1, at its end, legitimately HAS reached all of it.
    const at212 = fold(events, snap(), 212);
    expect(at212.feature).toBe("F1-stock-visibility");
    expect(at212.topology.passedNodes).toContain("promote");
    expect(at212.topology.laneSteps.build.length).toBeGreaterThan(0);

    // And by the end of sprint 2, F6 has genuinely built and shipped on its own evidence.
    const live = fold(events, snap());
    expect(live.topology.passedNodes).toContain("promote");
    expect(live.topology.laneSteps.build.length).toBeGreaterThan(0);
  });

  it("attributes sprint-1 planning to no feature, because the log stamps none yet", () => {
    // A real consequence of scoping, documented rather than papered over. The corpus opens
    // with propose/estimate/author-requests carrying feature_id: "" (events 3-10) — the
    // planning lane runs BEFORE a feature exists to attribute it to, which is honest: it is
    // deciding *what* the feature will be. Only from `breakdown` (event 13) does F1 appear.
    //
    // So F1's scoped plan lane shows only what ran after it was named, and sprint 2's shows
    // `estimate-committed` (event 369, carried forward from F6). The alternative — crediting
    // pre-feature planning to whichever feature happens to come next — would be a guess.
    const events = readCorpus();
    // Early: planning is running but no feature is named yet.
    expect(fold(events, snap(), 11).feature).toBeNull();
    expect(fold(events, snap(), 11).topology.laneSteps.plan).toEqual(["p-propose", "p-size", "p-req"]);
    // Once F1 is named, its own scoped view excludes the pre-naming planning steps.
    const f1 = fold(events, snap(), 20);
    expect(f1.feature).toBe("F1-stock-visibility");
    expect(f1.topology.laneSteps.plan).toEqual([]);
    // F6 picks up the estimate-committed that ran under it late in the run.
    expect(fold(events, snap()).topology.laneSteps.plan).toEqual(["p-size"]);
  });

  it("story counts stay monotonic WITHIN a feature across the whole corpus", () => {
    // Across the run the count legitimately DROPS at the sprint boundary (a new feature
    // starts with no stories), so the global monotonicity the stockflow suite asserts does
    // not hold here. Per-feature it must.
    const events = readCorpus();
    const seen = new Map<string, number>();
    for (let i = 0; i <= events.length; i += 5) {
      const s = fold(events, snap(), i);
      if (!s.feature) continue;
      const prev = seen.get(s.feature) ?? 0;
      expect(s.stories.length).toBeGreaterThanOrEqual(prev);
      seen.set(s.feature, s.stories.length);
    }
    expect(seen.get("F1-stock-visibility")).toBe(3);
    expect(seen.get("F6-split-tracking-code")).toBe(3);
  });
});

describe("fold — features[] enumeration (FeatureSwitcher list)", () => {
  it("lists both corpus features in log order with done/active flags", () => {
    const events = readCorpus();

    // At the live edge both sprints have shipped: both done, F6 (the last-seen) is active.
    const live = fold(events, snap());
    expect(live.features).toEqual([
      { id: "F1-stock-visibility", done: true, active: false },
      { id: "F6-split-tracking-code", done: true, active: true },
    ]);
  });

  it("marks a feature done only once its phase.end/workflow has fired", () => {
    const events = readCorpus();
    // F1's phase.end/workflow is event index 213, so it enters the fold at upTo=214. Before
    // that F1 is active-not-done.
    const before = fold(events, snap(), 213);
    expect(before.features).toEqual([
      { id: "F1-stock-visibility", done: false, active: true },
    ]);
    // Just past F1's end, before F6's id first appears (event index 216 stamps it): F1 is done
    // and still the last feature seen, so it stays `active` until a second feature arrives.
    const between = fold(events, snap(), 214);
    expect(between.features).toEqual([
      { id: "F1-stock-visibility", done: true, active: true },
    ]);
    // Mid sprint 2: F1 done and no longer active, F6 active but not yet done.
    const mid = fold(events, snap(), 300);
    expect(mid.features).toEqual([
      { id: "F1-stock-visibility", done: true, active: false },
      { id: "F6-split-tracking-code", done: false, active: true },
    ]);
  });

  it("is empty before any feature_id is stamped", () => {
    // Events 0–10 precede F1's first feature_id (event 11), so the switcher has nothing to list.
    expect(fold(readCorpus(), snap(), 5).features).toEqual([]);
  });
});

describe("fold — pinning a feature (FeatureSwitcher)", () => {
  it("re-scopes the board to a past feature without moving the playhead", () => {
    const events = readCorpus();
    const at = 300; // mid sprint 2; playhead's own feature is F6.
    const unpinned = fold(events, snap(), at);
    expect(unpinned.feature).toBe("F6-split-tracking-code");
    expect(unpinned.pinnedFeature).toBeNull();

    const pinned = fold(events, snap(), at, "F1-stock-visibility");
    // The board now shows F1...
    expect(pinned.feature).toBe("F1-stock-visibility");
    expect(pinned.pinnedFeature).toBe("F1-stock-visibility");
    expect(pinned.stories.every((s) => s.feature === "F1-stock-visibility")).toBe(true);
    expect(pinned.stories.map((s) => s.id)).toEqual([
      "S1-file-stock",
      "S2-stock-by-location-table",
      "S3-sku-detail-view",
    ]);
    // ...and its lifecycle graph reflects the SHIPPED F1, not F6's in-progress state: it reached
    // promote, and because F1's own workflow has ended, nothing reads as active and the lane is
    // complete — it does NOT borrow F6's opening "design"/"plan".
    expect(pinned.topology.passedNodes).toContain("promote");
    expect(pinned.topology.activeNode).toBeNull();
    expect(pinned.lane).toBe("complete");
    // ...but the playhead is unmoved: this is a filter, not a seek.
    expect(pinned.atEventIndex).toBe(at);
    expect(pinned.atEventIndex).toBe(unpinned.atEventIndex);
  });

  it("omits the test bar when the pin diverges from the playhead's feature", () => {
    const events = readCorpus();
    // Historical test counts come from the snapshot at the playhead, which describes F6 here.
    // Attributing them to a pinned F1 would be a wrong number under the right label — omit them.
    const pinned = fold(
      events,
      snap({ status: { feature_id: "F6-split-tracking-code", test_list: { total: 25, by_status: { green: 5 }, completion_pct: 20 } }, statusIsHistorical: true }),
      300,
      "F1-stock-visibility",
    );
    expect(pinned.pinnedFeature).toBe("F1-stock-visibility");
    expect(pinned.progress.testsHistorical).toBe(false);
    expect(pinned.progress.testTotal).toBe(0);
  });

  it("does not set pinnedFeature when the pin coincides with the playhead's feature", () => {
    const events = readCorpus();
    // Pinning the feature you're already on is a no-op divergence: the bar stays honest.
    const s = fold(events, snap({ status: { feature_id: "F6-split-tracking-code", test_list: { total: 25, by_status: { green: 5 }, completion_pct: 20 } }, statusIsHistorical: true }), 300, "F6-split-tracking-code");
    expect(s.feature).toBe("F6-split-tracking-code");
    expect(s.pinnedFeature).toBeNull();
    expect(s.progress.testsHistorical).toBe(true);
    expect(s.progress.testTotal).toBe(25);
  });

  it("drops a stale pin the window has not seen, falling back to the playhead's feature", () => {
    const events = readCorpus();
    // At event 200 only F1 exists; pinning F6 (not yet seen) must degrade, not empty the board.
    const s = fold(events, snap(), 200, "F6-split-tracking-code");
    expect(s.feature).toBe("F1-stock-visibility");
    expect(s.pinnedFeature).toBeNull();
    expect(s.stories.length).toBeGreaterThan(0);
    // A garbage id degrades the same way.
    expect(fold(events, snap(), 200, "F999-nope").feature).toBe("F1-stock-visibility");
  });

  it("scopes gates to the pinned feature, matching that feature's own live edge", () => {
    // Review finding: gates were left unscoped under a divergent pin, so a pinned shipped F1
    // showed F6's open gates. A pinned view of F1 must equal what F1 showed at ITS OWN end
    // (event 213) — the pin means "show me F1", not "show me now".
    const events = readCorpus();
    const f1AtOwnEnd = fold(events, snap(), 213); // scrubbed to F1's workflow-end, no pin
    const f1Pinned = fold(events, snap(), 421, "F1-stock-visibility"); // live edge, pinned to F1
    expect(f1Pinned.pinnedFeature).toBe("F1-stock-visibility");
    expect(f1Pinned.gates).toEqual(f1AtOwnEnd.gates);

    // And at event 260 the unpinned F6 board has a `test_list` gate F1 never had; the pin drops it.
    const at260 = fold(events, snap(), 260);
    const pinnedAt260 = fold(events, snap(), 260, "F1-stock-visibility");
    expect(at260.gates.some((g) => g.name === "test_list")).toBe(true);
    expect(pinnedAt260.gates.some((g) => g.name === "test_list")).toBe(false);
  });

  it("scopes blockers to the pinned feature", () => {
    // Same honesty rule as gates: an escalation on the ACTIVE feature must not surface under a
    // pinned past one. Synthetic, since the corpus logs no escalations: F1 shipped, F6 has an
    // open escalation at the live edge.
    const run = [
      ev("phase.start", { phase: "propose", feature_id: "F1" }, { role: "spec-author" }),
      ev("phase.end", { phase: "workflow", feature_id: "F1" }, { role: "orchestrator" }),
      ev("phase.start", { phase: "green", feature_id: "F6", story: "S1" }, { role: "driver" }),
      ev("escalation.raised", { feature_id: "F6", story: "S1", source: "verify" }, { role: "driver", message: "GREEN verify failed" }),
    ];
    // The log-derived blocker set (what a divergent pin uses) is F6's alone: unscoped it has the
    // escalation, scoped to F6 it keeps it, scoped to the shipped F1 it is empty.
    expect(blockersFromLog(run).length).toBe(1);
    expect(blockersFromLog(run, "F6").length).toBe(1);
    expect(blockersFromLog(run, "F1").length).toBe(0);
    // And through the fold: a divergent pin onto F1 derives from the scoped log, so no F6
    // escalation surfaces under F1. (The live-edge unpinned board reads blockers from next.json,
    // a separate path; the pin path is the one this fix touches.)
    const pinned = fold(run, snap(), undefined, "F1");
    expect(pinned.pinnedFeature).toBe("F1");
    expect(pinned.blockers.length).toBe(0);
  });

  it("clears a feature's done flag if its work resumes after a workflow-end", () => {
    // Review finding: featuresFromLog kept `done` set forever, unlike runEnded which resets on a
    // resume. A re-opened feature must not read as done (which would force lane='complete' via
    // pinnedDone). Both real logs never resume a feature, so this is a synthetic guard.
    const run = [
      ev("phase.start", { phase: "propose", feature_id: "F1" }, { role: "spec-author" }),
      ev("phase.end", { phase: "workflow", feature_id: "F1" }, { role: "orchestrator" }),
      ev("phase.start", { phase: "red", feature_id: "F1", story: "S1" }, { role: "driver" }),
    ];
    // After the resume F1 is no longer done, and a pin onto it does NOT force complete.
    expect(fold(run, snap()).features).toEqual([{ id: "F1", done: false, active: true }]);
    // At the workflow-end (folding exactly 2 events) it IS done.
    expect(fold(run, snap(), 2).features).toEqual([{ id: "F1", done: true, active: true }]);
  });

  it("marks the switcher's active feature from the playhead, not just the last log id", () => {
    // Review finding: divergence was computed against playheadFeature but the header label read
    // the last-log-seen `active` flag; at the live edge next.json's feature can differ. The fold
    // now re-derives `active` against playheadFeature so the two agree. next.feature wins here.
    const run = [
      ev("phase.start", { phase: "propose", feature_id: "F1" }, { role: "spec-author" }),
      ev("phase.start", { phase: "design", feature_id: "F6" }, { role: "dba" }),
    ];
    // next.json names F1 even though the last log event stamped F6: playhead follows next.json.
    const s = fold(run, snap({ next: { feature: "F1" } }));
    expect(s.feature).toBe("F1");
    expect(s.features.find((f) => f.active)?.id).toBe("F1");
    expect(s.features.filter((f) => f.active).length).toBe(1);
  });
});

describe("fold — story scoping is strict (PR #12 null-feature leak)", () => {
  it("never leaks a null-feature story into a feature's view, across every corpus prefix", () => {
    // The PR #12 finding: `s.feature === null` used to pass through to every feature. Fixed to
    // strict scoping. Measured across every prefix of the real corpus: 0 produce a null-feature
    // story, so this is byte-identical on real data — the sweep pins that it stays so, and that
    // no scoped view ever contains a foreign-feature story.
    const events = readCorpus();
    for (let i = 0; i <= events.length; i++) {
      const s = fold(events, snap(), i);
      if (!s.feature) continue;
      for (const story of s.stories) {
        expect(story.feature).toBe(s.feature);
      }
    }
  });

  it("shows every story when no feature is in force at all", () => {
    // A log that never stamps a feature_id: the scoping guard must not empty the board. Here the
    // fold's `feature` is null, so all stories show (unchanged behavior).
    const noFeature = [
      ev("phase.start", { phase: "design", story: "S1" }, { role: "spec-author" }),
      ev("phase.start", { phase: "red", story: "S1" }, { role: "driver" }),
    ];
    const s = fold(noFeature, snap());
    expect(s.feature).toBeNull();
    expect(s.stories.map((x) => x.id)).toEqual(["S1"]);
  });
});

describe.skipIf(!existsSync(REAL_LOG))("fold — golden, real stockflow log", () => {
  it("folds the full log without throwing and reports a sane live edge", () => {
    const events = readReal();
    expect(events.length).toBeGreaterThan(100);
    const s = fold(events, snap());
    expect(s.ok).toBe(true);
    expect(s.atLive).toBe(true);
    expect(s.eventCount).toBe(events.length);
    expect(s.totalCost).toBeGreaterThan(0);
  });

  it("stays monotonic across the whole real run", () => {
    const events = readReal();
    // Sample ~20 evenly spaced indices; folding all 379 individually is needless work.
    const step = Math.max(1, Math.floor(events.length / 20));
    let prevCost = -1;
    let prevEvents = -1;
    for (let i = 0; i <= events.length; i += step) {
      const s = fold(events, snap(), i);
      expect(s.totalCost).toBeGreaterThanOrEqual(prevCost);
      expect(s.eventCount).toBeGreaterThanOrEqual(prevEvents);
      expect(s.atEventIndex).toBe(Math.min(i, events.length));
      prevCost = s.totalCost;
      prevEvents = s.eventCount;
    }
  });

  it("agrees with the live edge when folding at exactly the log length", () => {
    const events = readReal();
    expect(fold(events, snap(), events.length)).toEqual(fold(events, snap()));
  });

  it("attributes cost to more than one role on a real run", () => {
    const s = fold(readReal(), snap());
    expect(s.agents.filter((a) => a.cost > 0).length).toBeGreaterThan(1);
  });
});
