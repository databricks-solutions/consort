import { afterEach, describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  isSafeSegment,
  resolverFor,
  storyStage,
  designComplete,
  findPendingGate,
  computeDesignPhases,
  reduceAgents,
  consortDir,
  sftddDir,
} from "./consort";
import type { AgentLogEvent } from "./types";

// Minimal event builder — only the fields the pure functions read.
function ev(event: string, metadata: Record<string, unknown> = {}, extra: Partial<AgentLogEvent> = {}): AgentLogEvent {
  return {
    timestamp: extra.timestamp ?? "2026-07-31T20:00:00.000Z",
    level: "info",
    role: extra.role ?? "orchestrator",
    event,
    message: extra.message ?? "",
    metadata,
  };
}

describe("isSafeSegment (path-traversal guard)", () => {
  it("accepts real feature ids", () => {
    expect(isSafeSegment("F1-stock-visibility")).toBe(true);
    expect(isSafeSegment("F6-split-tracking-code")).toBe(true);
    expect(isSafeSegment("feature_1.v2")).toBe(true);
  });
  it("rejects traversal and separators", () => {
    expect(isSafeSegment("../../etc")).toBe(false);
    expect(isSafeSegment("a/b")).toBe(false);
    expect(isSafeSegment("/abs")).toBe(false);
    expect(isSafeSegment("..")).toBe(false);
    expect(isSafeSegment(".hidden")).toBe(false); // leading dot
    expect(isSafeSegment("")).toBe(false);
  });
});

describe("resolverFor (blocker source → resolver role)", () => {
  it("routes build-lane escalations to the driver", () => {
    expect(resolverFor("driver-refactor")).toBe("driver");
    expect(resolverFor("driver-green")).toBe("driver");
  });
  it("routes by keyword", () => {
    expect(resolverFor("navigator-review")).toBe("navigator");
    expect(resolverFor("test-list-gap")).toBe("test-strategist");
    expect(resolverFor("schema-migration")).toBe("dba");
    expect(resolverFor("spec-mismatch")).toBe("spec-author");
  });
  it("returns null for an unknown source", () => {
    expect(resolverFor("mystery-source")).toBeNull();
  });
});

describe("storyStage / designComplete", () => {
  it("buckets raw Consort statuses", () => {
    expect(storyStage("designing")).toBe("design");
    expect(storyStage("awaiting-gate")).toBe("design");
    expect(storyStage("ready")).toBe("design");
    expect(storyStage("building")).toBe("build");
    // build-green-but-unaccepted stays in build, NOT done (the acceptance gate is the HITL beat)
    expect(storyStage("awaiting-acceptance")).toBe("build");
    expect(storyStage("done")).toBe("done");
    expect(storyStage("discarded")).toBe("done");
  });
  it("treats ready-or-later as design-complete", () => {
    expect(designComplete("designing")).toBe(false);
    expect(designComplete("awaiting-gate")).toBe(false);
    expect(designComplete("ready")).toBe(true);
    expect(designComplete("building")).toBe(true);
    expect(designComplete("done")).toBe(true);
  });
});

describe("findPendingGate", () => {
  it("returns null when there is no gate/escalation", () => {
    expect(findPendingGate([ev("phase.start", { phase: "design" })])).toBeNull();
  });

  it("flags a trailing escalation as pending (the live case we hit this session)", () => {
    const g = findPendingGate([
      ev("phase.start", { phase: "design" }),
      ev("escalation.raised", { story: "S2-stock-home-screen" }, { message: "GREEN verify FAILED" }),
    ]);
    expect(g).not.toBeNull();
    expect(g!.variety).toBe("escalation");
    expect(g!.story).toBe("S2-stock-home-screen");
  });

  it("treats a gate.surfaced with a following resume event as NOT pending", () => {
    // ANY event after the surface means the run resumed — this is exactly what cleared the
    // banner when the drive picked back up.
    const g = findPendingGate([
      ev("gate.surfaced", { gate: "acceptance" }),
      ev("phase.start", { phase: "design" }),
    ]);
    expect(g).toBeNull();
  });

  it("distinguishes a design gate from an escalation", () => {
    const gate = findPendingGate([ev("gate.surfaced", { gate: "spec" })]);
    expect(gate!.variety).toBe("gate");
    expect(gate!.gate).toBe("spec");
  });

  it("uses the LAST surface when several exist", () => {
    const g = findPendingGate([
      ev("gate.surfaced", { gate: "spec" }),
      ev("escalation.raised", { story: "S2" }, { message: "boom" }),
    ]);
    expect(g!.variety).toBe("escalation");
  });
});

describe("computeDesignPhases", () => {
  it("marks all phases complete once the lane is build", () => {
    const phases = computeDesignPhases([ev("phase.start", { phase: "design" })], "build");
    expect(phases.every((p) => p.status === "complete")).toBe(true);
    expect(phases.some((p) => p.current)).toBe(false);
  });

  it("marks earlier phases complete and the newest in-progress", () => {
    const phases = computeDesignPhases(
      [
        ev("phase.start", { phase: "propose" }),
        ev("phase.start", { phase: "estimate" }),
        ev("phase.start", { phase: "breakdown" }),
      ],
      "design",
    );
    const byName = Object.fromEntries(phases.map((p) => [p.name, p]));
    expect(byName.propose.status).toBe("complete");
    expect(byName.estimate.status).toBe("complete");
    expect(byName.breakdown.status).toBe("in-progress");
    expect(byName.breakdown.current).toBe(true);
    expect(byName.design.status).toBe("not-started");
  });

  it("flags the design⇄reflect loop once reflect has been seen", () => {
    const phases = computeDesignPhases(
      [
        ev("phase.start", { phase: "design" }),
        ev("phase.start", { phase: "reflect" }),
        ev("phase.start", { phase: "design" }),
      ],
      "design",
    );
    const byName = Object.fromEntries(phases.map((p) => [p.name, p]));
    expect(byName.design.looping).toBe(true);
    expect(byName.reflect.looping).toBe(true);
    expect(byName.propose.looping).toBe(false);
  });

  it("ignores unknown phase values in metadata", () => {
    const phases = computeDesignPhases([ev("phase.start", { phase: "not-a-phase" })], "design");
    expect(phases.every((p) => p.status === "not-started")).toBe(true);
  });
});

describe("reduceAgents — issue state clears when the run moves on", () => {
  const orch = (event: string, md: Record<string, unknown> = {}, msg = "") =>
    ev(event, md, { role: "orchestrator", message: msg });
  const get = (events: AgentLogEvent[], role: string) =>
    reduceAgents(events).agents.find((a) => a.role === role)!;

  // NOTE: reduceAgents leaves status "idle" with issues[] populated; the idle→"issue" flip
  // happens later in buildState. So these assert on issues[] — the thing this fix changed.
  it("keeps a trailing escalation as an open issue (nothing cleared it)", () => {
    const o = get(
      [
        orch("phase.start", { phase: "build" }),
        orch("phase.end", { phase: "build" }),
        orch("escalation.raised", { story: "S2" }, "GREEN verify failed"),
      ],
      "orchestrator",
    );
    expect(o.issues.length).toBe(1);
  });

  it("clears a resolved escalation once the role starts a later phase (the live bug)", () => {
    // Exactly the stockflow case: escalations on S2, then the orchestrator resumes (starts
    // build for the next story). The issues are resolved and must not pin it red.
    const o = get(
      [
        orch("phase.start", { phase: "build" }),
        orch("escalation.raised", { story: "S2" }, "GREEN verify failed"),
        orch("escalation.raised", { story: "S2" }, "REFACTOR verify failed"),
        orch("phase.start", { phase: "build" }, "orchestrator START build"), // run moved on
      ],
      "orchestrator",
    );
    expect(o.issues.length).toBe(0);
  });

  it("clears issues per role independently", () => {
    // navigator flags a concern, then re-starts a phase → cleared; driver's later concern stays.
    const { agents } = reduceAgents([
      ev("phase.start", { phase: "review" }, { role: "navigator" }),
      ev("concern.flagged", { note: "n1" }, { role: "navigator" }),
      ev("phase.start", { phase: "review" }, { role: "navigator" }), // clears navigator
      ev("phase.start", { phase: "green" }, { role: "driver" }),
      ev("concern.flagged", { note: "d1" }, { role: "driver" }), // driver still open (trailing)
    ]);
    expect(agents.find((a) => a.role === "navigator")!.issues.length).toBe(0);
    expect(agents.find((a) => a.role === "driver")!.issues.length).toBe(1);
  });
});

describe("reduceAgents — the run ending calms every bubble", () => {
  const get = (events: AgentLogEvent[], role: string) =>
    reduceAgents(events).agents.find((a) => a.role === role)!;

  // The live bug: at workflow end the last role to run has an open turn (its phase.start
  // had no closing turn.usage/phase.end, and no later handoff/phase.start cleared it), so
  // the finalize step pinned it "working" forever. The terminal workflow phase.end is the
  // signal the whole run is over — after it, nothing is working.
  it("idles a role left mid-turn once the workflow phase.end fires", () => {
    const re = get(
      [
        ev("phase.start", { phase: "deploy" }, { role: "release-engineer" }),
        ev("phase.end", { phase: "workflow" }, { role: "orchestrator" }), // run complete
      ],
      "release-engineer",
    );
    expect(re.status).toBe("idle");
  });

  it("clears a dangling on-deck role when the run completes", () => {
    // A handoff dispatched navigator but the run ended before it started — no lingering on-deck.
    const { agents, onDeck } = reduceAgents([
      ev("handoff", { to_role: "navigator" }, { role: "orchestrator" }),
      ev("phase.end", { phase: "workflow" }, { role: "orchestrator" }),
    ]);
    expect(onDeck).toBeNull();
    expect(agents.find((a) => a.role === "navigator")!.status).toBe("idle");
  });

  it("a non-terminal phase.end (a normal turn boundary) does NOT calm other roles", () => {
    // Only the workflow-level phase.end ends the run; a per-phase phase.end must not
    // idle a different role that is genuinely mid-turn.
    const drv = get(
      [
        ev("phase.start", { phase: "green" }, { role: "driver" }),
        ev("phase.end", { phase: "build" }, { role: "navigator" }), // navigator's turn ended, not the run
      ],
      "driver",
    );
    expect(drv.status).toBe("working");
  });
});

describe("consortDir — artifact-root resolution (v0.3.7 .sftdd → .consort rename)", () => {
  const saved = process.env.CONSORT_PROJECT_DIR;
  const made: string[] = [];
  afterEach(() => {
    if (saved === undefined) delete process.env.CONSORT_PROJECT_DIR;
    else process.env.CONSORT_PROJECT_DIR = saved;
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function projectWith(roots: string[]): string {
    const proj = mkdtempSync(join(tmpdir(), "consort-proj-"));
    made.push(proj);
    for (const r of roots) mkdirSync(join(proj, r));
    process.env.CONSORT_PROJECT_DIR = proj;
    return proj;
  }

  it("prefers .consort/ when present", () => {
    const proj = projectWith([".consort", ".sftdd"]);
    expect(consortDir()).toBe(join(proj, ".consort"));
  });
  it("falls back to legacy .sftdd/ for a pre-rename project", () => {
    const proj = projectWith([".sftdd"]);
    expect(consortDir()).toBe(join(proj, ".sftdd"));
  });
  it("honours the oldest .tdd/ root when it is the only one", () => {
    const proj = projectWith([".tdd"]);
    expect(consortDir()).toBe(join(proj, ".tdd"));
  });
  it("defaults to .consort/ when no root exists yet (project not scaffolded)", () => {
    const proj = projectWith([]);
    expect(basename(consortDir())).toBe(".consort");
  });
  it("sftddDir alias resolves identically", () => {
    projectWith([".consort"]);
    expect(sftddDir()).toBe(consortDir());
  });
});
