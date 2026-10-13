import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WORKFLOW,
  LANE_IDS,
  PHASE_TO_NODE,
  matchesStep,
  laneStepForEvent,
  laneProgress,
  latestTurnOrdinalForStep,
  isOuterLoopStep,
  MULTI_STEP_ROLES,
  passedNodes,
  nodeForPhase,
  nodeById,
  STEP_OUTPUTS,
  primaryOutputNodeForRole,
  gateForNode,
  edgeDone,
  reachedThisPass,
  type LaneId,
  type StepMatch,
} from "./topology";
import { ROLES } from "./types";
import type { AgentLogEvent } from "./types";

function ev(
  event: string,
  role: string,
  metadata: Record<string, unknown> = {},
): AgentLogEvent {
  return { timestamp: "2026-08-05T12:00:00.000Z", level: "info", role, event, message: "", metadata };
}

// ---------------------------------------------------------------------------
// Graph shape: every id referenced by an edge must exist, and nothing dangles.

describe("topology — graph integrity", () => {
  it("has unique node ids", () => {
    const ids = WORKFLOW.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every lifecycle edge connects declared nodes", () => {
    const ids = new Set(WORKFLOW.nodes.map((n) => n.id));
    for (const [a, b] of WORKFLOW.edges) {
      expect(ids, `edge from ${a}`).toContain(a);
      expect(ids, `edge to ${b}`).toContain(b);
    }
  });

  it("the spine is reachable from intake and ends at shipped", () => {
    const out = new Map<string, string[]>();
    for (const [a, b] of WORKFLOW.edges) out.set(a, [...(out.get(a) ?? []), b]);
    const seen = new Set<string>();
    const stack = ["intake"];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(out.get(n) ?? []));
    }
    expect(seen.size).toBe(WORKFLOW.nodes.length);
    expect(seen).toContain("shipped");
  });

  it("every declared role is a known Role", () => {
    for (const n of WORKFLOW.nodes) {
      for (const r of n.roles) expect(ROLES).toContain(r);
    }
    for (const lane of LANE_IDS) {
      for (const s of WORKFLOW.lanes[lane].steps) {
        if (s.role) expect(ROLES).toContain(s.role);
        if (s.match?.role) expect(ROLES).toContain(s.match.role);
      }
    }
  });

  it("gate nodes carry no roles and phase nodes are the only tallied ones", () => {
    for (const n of WORKFLOW.nodes) {
      if (n.type === "gate") expect(n.roles).toEqual([]);
    }
  });

  it("every gate node maps to a gate name", () => {
    for (const n of WORKFLOW.nodes) {
      if (n.type === "gate") expect(gateForNode(n.id), n.id).not.toBeNull();
    }
    expect(gateForNode("plan")).toBeNull();
  });

  it("every phaseToNode target is a real node", () => {
    const ids = new Set(WORKFLOW.nodes.map((n) => n.id));
    for (const [phase, node] of Object.entries(PHASE_TO_NODE)) {
      expect(ids, `${phase} -> ${node}`).toContain(node);
    }
  });

  it("latestTurnOrdinalForStep resolves the STEP's latest turn, distinct from the role's other steps", () => {
    // The navigator spans several build steps; clicking one must open THAT step's turn, not the
    // role's latest. Each phase.start begins its step's turn (aligned recentTurns ordinal).
    const ev = (event: string, metadata: Record<string, unknown>): AgentLogEvent => ({
      timestamp: "t", level: "info", role: "navigator", event, message: "", metadata,
    });
    const events: AgentLogEvent[] = [
      ev("phase.start", { phase: "red", buildMode: "red" }), // begins the RED turn
      ev("turn.usage", { phase: "red" }),
      ev("phase.start", { phase: "review", buildMode: "review" }), // begins the REVIEW turn
      ev("turn.usage", { phase: "review" }),
    ];
    const recentTurns = [10, null, 11, null];
    expect(latestTurnOrdinalForStep(events, recentTurns, "b-red")).toBe(10);
    expect(latestTurnOrdinalForStep(events, recentTurns, "b-review")).toBe(11); // NOT 10 — step-specific
    // a step with no turn in the window → null (caller falls back to the role shell, not a wrong turn)
    expect(latestTurnOrdinalForStep(events, recentTurns, "b-refactor")).toBeNull();
  });

  it("latestTurnOrdinalForStep scopes to a STORY so a per-story step does not bleed across rounds", () => {
    // The cross-round bleed this fixes: the SAME step recurs per story (b-red for S1 then S2). Clicking
    // S1's card must resolve S1's turn, not the role's latest (S2's). A reached step with no turn in the
    // asked story → null (→ "not invoked this round"), not a sibling story's turn.
    const ev = (event: string, metadata: Record<string, unknown>): AgentLogEvent => ({
      timestamp: "t", level: "info", role: "navigator", event, message: "", metadata,
    });
    const events: AgentLogEvent[] = [
      ev("phase.start", { phase: "red", buildMode: "red", story: "S1" }),
      ev("turn.usage", { phase: "red", story: "S1" }),
      ev("phase.start", { phase: "red", buildMode: "red", story: "S2" }),
      ev("turn.usage", { phase: "red", story: "S2" }),
    ];
    const recentTurns = [10, null, 20, null];
    // story-scoped: each story resolves ITS OWN turn
    expect(latestTurnOrdinalForStep(events, recentTurns, "b-red", "S1")).toBe(10);
    expect(latestTurnOrdinalForStep(events, recentTurns, "b-red", "S2")).toBe(20);
    // a story that reached the step but took NO turn there → null (not the other story's turn)
    expect(latestTurnOrdinalForStep(events, recentTurns, "b-red", "S3")).toBeNull();
    // no story filter → story-blind (back-compat): the role's latest turn for the step
    expect(latestTurnOrdinalForStep(events, recentTurns, "b-red")).toBe(20);
  });

  it("isOuterLoopStep flags the per-feature breakdown (shown regardless of the per-story round)", () => {
    // d-breakdown ("break into stories") runs ONCE per feature with a story-less turn, so the page
    // resolves it story-blind + exempt from the per-story round scoping; inner-loop steps are not.
    expect(isOuterLoopStep("d-breakdown")).toBe(true);
    expect(isOuterLoopStep("d-spec")).toBe(false);
    expect(isOuterLoopStep("d-ux-ia")).toBe(false);
    expect(isOuterLoopStep("nope")).toBe(false);
  });

  it("MULTI_STEP_ROLES captures roles that own >1 lane step, so a card click can't cross to a sibling step's turn", () => {
    // navigator is the reported case: it owns red/review/assess (+ reflect in design), so clicking
    // navigator-red must NOT fall back to the role's latest turn (which could be navigator-reflect).
    expect(MULTI_STEP_ROLES.has("navigator")).toBe(true);
    expect(MULTI_STEP_ROLES.size).toBeGreaterThan(0);
    // every member genuinely appears in more than one lane step
    for (const role of MULTI_STEP_ROLES) {
      const count = LANE_IDS.reduce((n, l) => n + WORKFLOW.lanes[l].steps.filter((s) => s.role === role).length, 0);
      expect(count).toBeGreaterThan(1);
    }
  });

  it("every lifecycle node + gate has a STEP_OUTPUTS entry, so all are clickable to show outputs", () => {
    // The WorkflowGraph only makes a node clickable when it maps to deliverables. Previously the
    // intake/acceptance/promote gates and the shipped terminal had no entry, so those diamonds/box
    // were dead. Every node must resolve to at least one output spec.
    for (const n of WORKFLOW.nodes) {
      expect(STEP_OUTPUTS[n.id]?.length ?? 0, `${n.id} has no STEP_OUTPUTS entry`).toBeGreaterThan(0);
    }
    // Each entry's paths are keyed to a real spec shape (path present).
    for (const specs of Object.values(STEP_OUTPUTS)) {
      for (const s of specs) expect(typeof s.path).toBe("string");
    }
  });

  it("routes each gate to where its decision actually lives", () => {
    const paths = (node: string) => (STEP_OUTPUTS[node] ?? []).map((s) => s.path);
    // The feature gates.json holds { spec, plan, test_list, deploy, promote } — so those gates open it.
    expect(paths("plangate")).toContain("features/<F>/gates.json");
    expect(paths("specgate")).toContain("features/<F>/gates.json");
    expect(paths("deploygate")).toContain("features/<F>/gates.json");
    expect(paths("promgate")).toContain("features/<F>/gates.json");
    // The intake gate's decision is NOT in that file (intake predates the feature): it opens the
    // intake docs it reviews, not an intake-less gates.json.
    expect(paths("intakegate")).toContain("product-overview.md");
    expect(paths("intakegate")).not.toContain("features/<F>/gates.json");
    // Acceptance is per-story in pipeline.json, NOT the feature gates.json.
    expect(paths("acceptancegate")).toContain("features/<F>/pipeline.json");
    expect(paths("acceptancegate")).not.toContain("features/<F>/gates.json");
  });

  it("surfaces the design lane's fuller output set (spec + test-list + project architecture canon)", () => {
    const paths = STEP_OUTPUTS.design.map((s) => s.path);
    // The test list is authored in design (test-strategist), and the project architecture canon is
    // established here — both were previously missing from the design node.
    expect(paths).toContain("features/<F>/test-list.md");
    expect(paths).toContain("architecture/canon.json");
    // The spec + test-list gate opens the spec and the test list, each in md + json form.
    const spec = STEP_OUTPUTS.specgate.map((s) => s.path);
    expect(spec).toEqual(
      expect.arrayContaining([
        "features/<F>/feature-spec.md",
        "features/<F>/feature-spec.json",
        "features/<F>/test-list.md",
        "features/<F>/test-list.json",
      ]),
    );
  });

  it("surfaces per-story artifacts via <S> specs, so nothing per-story is unreachable", () => {
    // A perStory spec carries an <S> the sources expand across every story dir; each such spec must
    // also be perFeature (it lives under features/<F>/stories) and its path must contain <S>.
    const perStory = Object.entries(STEP_OUTPUTS).flatMap(([node, specs]) =>
      specs.filter((s) => s.perStory).map((s) => ({ node, path: s.path })),
    );
    expect(perStory.length).toBeGreaterThan(0);
    for (const { path } of perStory) {
      expect(path).toContain("<S>");
      expect(path).toContain("<F>");
    }
    const pathsOf = (node: string) => STEP_OUTPUTS[node].filter((s) => s.perStory).map((s) => s.path);
    // design → breakdown + reflect verdict; specgate → per-story test list + acs; deploy → per-story
    // deploy evidence. These were the previously-unreachable per-story deliverables.
    expect(pathsOf("design")).toContain("features/<F>/stories/<S>/reflect-verdict.json");
    expect(pathsOf("specgate")).toContain("features/<F>/stories/<S>/test-list-per-story.json");
    expect(pathsOf("deploy")).toContain("features/<F>/stories/<S>/deploy-evidence.json");
  });

  it("nodeById resolves declared nodes and rejects others", () => {
    expect(nodeById("build")?.label).toBe("Build lane");
    expect(nodeById("nope")).toBeNull();
  });

  it("primaryOutputNodeForRole routes a role to the output-bearing node it authors", () => {
    // The product-owner's first output-bearing node is intake (product-overview/nfrs/design-brief),
    // so a live role click surfaces those deliverables via step-outputs.
    expect(primaryOutputNodeForRole("product-owner")).toBe("intake");
    // Build-lane roles map to the build node (pipeline.json / cycles).
    expect(primaryOutputNodeForRole("driver")).toBe("build");
    expect(primaryOutputNodeForRole("navigator")).toBe("build");
    // release-engineer authors deploy (deploy-evidence) before promote.
    expect(primaryOutputNodeForRole("release-engineer")).toBe("deploy");
    // A node's role that owns no STEP_OUTPUTS entry, or an unknown role, yields null → the caller
    // falls back to the empty role shell rather than opening a dead step panel.
    expect(primaryOutputNodeForRole("orchestrator")).toBeNull();
    expect(primaryOutputNodeForRole("nobody")).toBeNull();
  });
});

describe("topology — lane integrity", () => {
  it("lane step ids are unique within a lane and across lanes", () => {
    const all: string[] = [];
    for (const lane of LANE_IDS) {
      const ids = WORKFLOW.lanes[lane].steps.map((s) => s.id);
      expect(new Set(ids).size, lane).toBe(ids.length);
      all.push(...ids);
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it("lane edges and backEdges reference steps in that lane", () => {
    for (const lane of LANE_IDS) {
      const l = WORKFLOW.lanes[lane];
      const ids = new Set(l.steps.map((s) => s.id));
      for (const [a, b] of l.edges) {
        expect(ids, `${lane} edge from ${a}`).toContain(a);
        expect(ids, `${lane} edge to ${b}`).toContain(b);
      }
      for (const [a, b] of l.backEdges) {
        expect(ids, `${lane} back-edge from ${a}`).toContain(a);
        expect(ids, `${lane} back-edge to ${b}`).toContain(b);
      }
    }
  });

  it("only gates + raise-to-HIL terminals may have a null match (nothing else is unlightable)", () => {
    for (const lane of LANE_IDS) {
      for (const s of WORKFLOW.lanes[lane].steps) {
        // Human gates and the per-lane raise-to-HIL escalation terminals are the only steps that
        // never light from an event (match:null) – their state comes from the human / an escalation.
        if (s.match === null) expect(s.gate === true || s.escalation === true, s.id).toBe(true);
      }
    }
  });

  it("keeps the honest-GREEN branch structure: assess fans out to repair / permissive / HIL", () => {
    const back = WORKFLOW.lanes.build.backEdges.map(([a, b]) => `${a}->${b}`);
    expect(back).toContain("b-verify->b-assess"); // verify fails
    expect(back).toContain("b-assess->b-repair"); // regression
    expect(back).toContain("b-assess->b-perm"); // supersession
    expect(back).toContain("b-assess->b-hil"); // genuine → escalate
    // The repair/perm → GREEN re-verify lines are intentionally NOT drawn (removed from the graph);
    // the recovery paths' re-verify is left implicit rather than cluttering the lane with risers.
    expect(back).not.toContain("b-repair->b-green");
    expect(back).not.toContain("b-perm->b-green");
  });

  it("marks the fail/side paths as branches, not happy path", () => {
    const byId = new Map(WORKFLOW.lanes.build.steps.map((s) => [s.id, s]));
    for (const id of ["b-assess", "b-repair", "b-perm"]) expect(byId.get(id)?.branch, id).toBe(true);
    for (const id of ["b-red", "b-green", "b-review"]) expect(byId.get(id)?.branch, id).toBeUndefined();
  });

  it("design lane reflect loops back to the spec author (and can escalate to HIL)", () => {
    expect(WORKFLOW.lanes.design.backEdges).toEqual([
      ["d-nav", "d-spec", "revise on findings"],
      ["d-nav", "d-hil", "escalate"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Phase → lane mapping.

describe("nodeForPhase", () => {
  it("maps the lifecycle phases", () => {
    expect(nodeForPhase("propose")).toBe("plan");
    expect(nodeForPhase("design")).toBe("design");
    expect(nodeForPhase("green")).toBe("build");
    expect(nodeForPhase("deploy")).toBe("deploy");
    expect(nodeForPhase("promote")).toBe("promote");
  });

  it("puts assess and assess-refactor in the BUILD lane, not plan", () => {
    // assess* is the honest-GREEN "regression or supersession?" decision inside the
    // build cycle, so it lights the build lane — mapping it to plan would jump the
    // top-level graph back to Plan mid-build.
    expect(nodeForPhase("assess")).toBe("build");
    expect(nodeForPhase("assess-refactor")).toBe("build");
  });

  it("normalizes whitespace and casing instead of enumerating misspellings", () => {
    expect(nodeForPhase("estimate ")).toBe("plan");
    expect(nodeForPhase(" red ")).toBe("build");
    expect(nodeForPhase("RED")).toBe("build");
  });

  it("returns null for absent or unknown phases", () => {
    expect(nodeForPhase(null)).toBeNull();
    expect(nodeForPhase(undefined)).toBeNull();
    expect(nodeForPhase("")).toBeNull();
    expect(nodeForPhase("   ")).toBeNull();
    expect(nodeForPhase("not-a-phase")).toBeNull();
  });

  it("does not inherit from Object.prototype", () => {
    // Phase names come from log metadata, so a bare table[key] would resolve these to
    // functions — which are truthy, so they'd slip past a `!nodeForPhase(p)` guard and
    // land in the Set<string> that passedNodes builds.
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(nodeForPhase(key), key).toBeNull();
      expect(gateForNode(key), key).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Predicate semantics — the subtle part of event matching.

describe("matchesStep", () => {
  it("never matches a null predicate", () => {
    expect(matchesStep(null, ev("phase.start", "driver"))).toBe(false);
  });

  it("eventPrefix decides alone, ignoring role and phase", () => {
    const m: StepMatch = { eventPrefix: "verify" };
    expect(matchesStep(m, ev("verify.passed", "driver"))).toBe(true);
    expect(matchesStep(m, ev("verify.failed", "orchestrator", { phase: "red" }))).toBe(true);
    expect(matchesStep(m, ev("cycle.green", "driver"))).toBe(false);
  });

  it("event decides alone on EXACT equality, distinct from a prefix", () => {
    const m: StepMatch = { event: "deploy.verified" };
    expect(matchesStep(m, ev("deploy.verified", "release-engineer", { phase: "deploy" }))).toBe(true);
    // exact, not a prefix: a longer name that merely starts the same must not match
    expect(matchesStep(m, ev("deploy.verified.extra", "release-engineer"))).toBe(false);
    expect(matchesStep(m, ev("deploy.start", "release-engineer"))).toBe(false);
    // role/phase are not consulted
    expect(matchesStep(m, ev("deploy.verified", "orchestrator"))).toBe(true);
  });

  it("requires role equality", () => {
    const m: StepMatch = { role: "dba" };
    expect(matchesStep(m, ev("phase.start", "dba"))).toBe(true);
    expect(matchesStep(m, ev("phase.start", "driver"))).toBe(false);
  });

  it("phaseAny requires membership", () => {
    const m: StepMatch = { role: "architect-reviewer", phaseAny: ["estimate", "estimate-committed"] };
    expect(matchesStep(m, ev("phase.start", "architect-reviewer", { phase: "estimate" }))).toBe(true);
    expect(matchesStep(m, ev("phase.start", "architect-reviewer", { phase: "estimate-committed" }))).toBe(true);
    expect(matchesStep(m, ev("phase.start", "architect-reviewer", { phase: "design" }))).toBe(false);
    // a missing phase cannot be a member
    expect(matchesStep(m, ev("phase.start", "architect-reviewer"))).toBe(false);
  });

  it("phaseNot excludes listed phases but a MISSING phase does not exclude", () => {
    const m: StepMatch = { role: "spec-author", phaseNot: ["propose", "estimate"] };
    expect(matchesStep(m, ev("phase.start", "spec-author", { phase: "design" }))).toBe(true);
    expect(matchesStep(m, ev("phase.start", "spec-author", { phase: "propose" }))).toBe(false);
    // this is what lets a role's non-phase events (e.g. artifact.written) still light it
    expect(matchesStep(m, ev("artifact.written", "spec-author"))).toBe(true);
  });

  it("buildModeNot excludes listed modes but a MISSING buildMode does not", () => {
    const m: StepMatch = { role: "driver", buildModeNot: ["refactor", "repair"] };
    expect(matchesStep(m, ev("phase.start", "driver", { buildMode: "repair" }))).toBe(false);
    expect(matchesStep(m, ev("phase.start", "driver", { phase: "green" }))).toBe(true);
  });

  it("buildModeAny accepts the phase as a fallback when buildMode is absent", () => {
    // reflect is logged with phase=reflect and sometimes no buildMode on phase.start
    const m: StepMatch = { role: "navigator", buildMode: "reflect", phase: "reflect" };
    expect(matchesStep(m, ev("phase.start", "navigator", { buildMode: "reflect" }))).toBe(true);
    expect(matchesStep(m, ev("phase.start", "navigator", { phase: "reflect" }))).toBe(true);
    expect(matchesStep(m, ev("phase.start", "navigator", { phase: "red" }))).toBe(false);
    expect(matchesStep(m, ev("phase.start", "navigator"))).toBe(false);
  });

  it("phase is a hard requirement only when no buildMode constraint is present", () => {
    const m: StepMatch = { role: "spec-author", phase: "propose" };
    expect(matchesStep(m, ev("phase.start", "spec-author", { phase: "propose" }))).toBe(true);
    expect(matchesStep(m, ev("phase.start", "spec-author", { phase: "design" }))).toBe(false);
    expect(matchesStep(m, ev("phase.start", "spec-author"))).toBe(false);
  });

  // The build-cycle GREEN outcomes must land on their OWN step, not be shadowed by b-green. b-green
  // matches any driver event whose buildMode is not in its buildModeNot, and it is declared BEFORE
  // b-repair/b-perm — so a `green-superseded`/`refactor-superseded` driver turn matched b-green first
  // and its own step (b-perm) never lit. `repair` is excluded from b-green, so it reaches b-repair.
  it("routes each driver build-outcome phase.start to its own build step (not shadowed by b-green)", () => {
    const step = (bm: string | undefined) =>
      laneStepForEvent(ev("phase.start", "driver", { story: "S1", ...(bm ? { phase: bm, buildMode: bm } : { phase: "green" }) }));
    expect(step(undefined)).toEqual({ lane: "build", step: "b-green" }); // plain GREEN (no buildMode)
    expect(step("repair")).toEqual({ lane: "build", step: "b-repair" }); // regression repair
    expect(step("green-superseded")).toEqual({ lane: "build", step: "b-perm" }); // supersession
    expect(step("refactor-superseded")).toEqual({ lane: "build", step: "b-perm" }); // refactor-time supersession
    expect(step("refactor")).toEqual({ lane: "build", step: "b-refactor" }); // structure refactor
  });

  it("ignores non-string metadata rather than coercing it", () => {
    expect(matchesStep({ role: "driver", phase: "green" }, ev("x", "driver", { phase: 7 }))).toBe(false);
    // a numeric buildMode is treated as absent, so phaseNot/buildModeNot don't exclude
    expect(matchesStep({ role: "driver", buildModeNot: ["repair"] }, ev("x", "driver", { buildMode: 1 }))).toBe(true);
  });

  it("tolerates a missing metadata object entirely", () => {
    const e: AgentLogEvent = { timestamp: "t", level: "info", role: "dba", event: "x", message: "" };
    expect(matchesStep({ role: "dba" }, e)).toBe(true);
    expect(matchesStep({ role: "dba", phase: "design" }, e)).toBe(false);
  });
});

describe("laneStepForEvent", () => {
  it("routes representative events to the expected lane and step", () => {
    expect(laneStepForEvent(ev("phase.start", "spec-author", { phase: "propose" }))).toEqual({
      lane: "plan",
      step: "p-propose",
    });
    expect(laneStepForEvent(ev("phase.start", "dba", { phase: "design" }))).toEqual({
      lane: "design",
      step: "d-dba",
    });
    expect(laneStepForEvent(ev("phase.start", "navigator", { phase: "red" }))).toEqual({
      lane: "build",
      step: "b-red",
    });
    expect(laneStepForEvent(ev("phase.start", "driver", { phase: "green" }))).toEqual({
      lane: "build",
      step: "b-green",
    });
    expect(laneStepForEvent(ev("verify.passed", "orchestrator"))).toEqual({
      lane: "build",
      step: "b-verify",
    });
    expect(
      laneStepForEvent(ev("phase.start", "navigator", { phase: "assess", buildMode: "assess" })),
    ).toEqual({ lane: "build", step: "b-assess" });
    expect(
      laneStepForEvent(ev("phase.start", "driver", { phase: "repair", buildMode: "repair" })),
    ).toEqual({ lane: "build", step: "b-repair" });
  });

  it("returns null for events that light nothing", () => {
    expect(laneStepForEvent(null)).toBeNull();
    expect(laneStepForEvent(undefined)).toBeNull();
    // orchestrator owns no sub-step
    expect(laneStepForEvent(ev("handoff", "orchestrator", { phase: "design" }))).toBeNull();
  });

  it("first match wins across lanes in plan→design→build order", () => {
    // spec-author in `propose` matches p-propose; d-spec excludes propose, so no ambiguity
    const hit = laneStepForEvent(ev("phase.start", "spec-author", { phase: "propose" }));
    expect(hit?.lane).toBe("plan");
  });
});

describe("laneProgress / passedNodes", () => {
  const events = [
    ev("intake.supplied", "orchestrator"),
    ev("phase.start", "spec-author", { phase: "propose" }),
    ev("phase.start", "architect-reviewer", { phase: "estimate" }),
    ev("phase.start", "dba", { phase: "design" }),
    ev("phase.start", "navigator", { phase: "red" }),
    ev("phase.start", "driver", { phase: "green" }),
  ];

  it("accumulates reached steps and tracks the playhead step", () => {
    const p = laneProgress(events);
    expect([...p.done.plan]).toEqual(["p-intake", "p-propose", "p-size"]);
    expect([...p.done.design]).toEqual(["d-dba"]);
    expect([...p.done.build]).toEqual(["b-red", "b-green"]);
    expect(p.last.plan).toBe("p-size");
    expect(p.current).toEqual({ lane: "build", step: "b-green" });
  });

  it("current follows the event AT the playhead, not the last match", () => {
    // fold through the unmatched orchestrator handoff: nothing is current
    const withTrailingNoise = [...events, ev("handoff", "orchestrator", { phase: "design" })];
    const p = laneProgress(withTrailingNoise);
    expect(p.current).toBeNull();
    // but the reached set is unchanged
    expect([...p.done.build]).toEqual(["b-red", "b-green"]);
  });

  it("a gate.approved at the playhead is not `current` — the surfacing agent stops glowing", () => {
    // The PO drafts intake, then the intake gate is approved. gate.approved carries the PO's role
    // and phase, so it MATCHES the PO's p-intake step — which would re-light the product owner the
    // instant intake is approved ("glowing again" past the phase). A gate boundary is not agent
    // work, so `current` must be null; p-intake stays in the done set.
    const withGate = [
      ev("phase.start", "product-owner", { phase: "intake" }),
      ev("gate.surfaced", "product-owner", { phase: "intake", gate: "intake" }),
      ev("gate.approved", "product-owner", { phase: "intake", gate: "intake" }),
    ];
    const p = laneProgress(withGate);
    expect(p.current).toBeNull(); // no step glows at the gate boundary
    expect(p.done.plan.has("p-intake")).toBe(true); // the PO's drafting still reads as done
  });

  // --- feature scoping ------------------------------------------------------
  // Lane progress described the whole RUN, not the current feature. On a multi-feature run
  // that is wrong in a user-visible way: in the stockflow-rerecord corpus, at event 230 the
  // second sprint has barely started designing, yet every build sub-step and every lifecycle
  // node through `promote` read as reached — inherited from sprint 1. A lane graph drawn from
  // that shows a completed build lane for a feature that has not written a line of code.
  describe("feature scoping", () => {
    const twoFeatures = [
      ev("phase.start", "spec-author", { phase: "propose", feature_id: "F1" }),
      ev("phase.start", "dba", { phase: "design", feature_id: "F1" }),
      ev("phase.start", "navigator", { phase: "red", feature_id: "F1" }),
      ev("phase.start", "driver", { phase: "green", feature_id: "F1" }),
      ev("phase.start", "release-engineer", { phase: "deploy", feature_id: "F1" }),
      // sprint 2 opens: nothing built for it yet
      ev("phase.start", "spec-author", { phase: "propose", feature_id: "F2" }),
      ev("phase.start", "dba", { phase: "design", feature_id: "F2" }),
    ];

    it("laneProgress scoped to a feature ignores other features' steps", () => {
      const all = laneProgress(twoFeatures);
      expect([...all.done.build]).toEqual(["b-red", "b-green"]); // unscoped: F1's build work

      const f2 = laneProgress(twoFeatures, undefined, "F2");
      expect([...f2.done.build]).toEqual([]); // F2 has built nothing
      expect([...f2.done.design]).toEqual(["d-dba"]);
      expect([...f2.done.plan]).toEqual(["p-propose"]);

      const f1 = laneProgress(twoFeatures, undefined, "F1");
      expect([...f1.done.build]).toEqual(["b-red", "b-green"]);
    });

    it("passedNodes scoped to a feature does not inherit an earlier feature's spine", () => {
      expect([...passedNodes(twoFeatures)]).toContain("deploy"); // unscoped
      const f2 = passedNodes(twoFeatures, undefined, "F2");
      expect([...f2].sort()).toEqual(["design", "plan"]);
      expect(f2.has("deploy")).toBe(false);
      expect(f2.has("build")).toBe(false);
    });

    it("scoping composes with upTo", () => {
      const p = laneProgress(twoFeatures, 6, "F2");
      expect([...p.done.plan]).toEqual(["p-propose"]);
      expect(p.done.design.size).toBe(0); // F2's design is event 6, excluded by upTo=6
    });

    it("omitting the feature preserves today's whole-run behavior exactly", () => {
      // The scoping argument is additive: every existing caller must be unaffected.
      expect(laneProgress(twoFeatures, undefined, undefined)).toEqual(laneProgress(twoFeatures));
      expect([...passedNodes(twoFeatures, undefined, undefined)]).toEqual([...passedNodes(twoFeatures)]);
    });

    it("ignores an unreliable feature_id on reasoning events", () => {
      // Same hazard PR #12 handled: `reasoning` events carry a story id or truncated feature
      // in feature_id. They must not attribute lane progress to a bogus feature.
      const withReasoning = [
        ev("phase.start", "navigator", { phase: "red", feature_id: "F1" }),
        ev("reasoning", "driver", { phase: "green", feature_id: "S3-some-story" }),
      ];
      // The reasoning event's phase still counts for the feature in force (F1), not "S3-...".
      expect(laneProgress(withReasoning, undefined, "S3-some-story").done.build.size).toBe(0);
    });

    it("attributes events with no feature_id to the feature in force", () => {
      // Not every event stamps a feature; carry the last one forward, as storiesFromLog does.
      const carried = [
        ev("phase.start", "spec-author", { phase: "propose", feature_id: "F1" }),
        ev("phase.start", "navigator", { phase: "red" }), // no feature_id — still F1
      ];
      expect([...laneProgress(carried, undefined, "F1").done.build]).toEqual(["b-red"]);
      expect([...laneProgress(carried, undefined, "F2").done.build]).toEqual([]);
    });
  });

  it("is a prefix fold: upTo windows the log", () => {
    const p = laneProgress(events, 3);
    expect([...p.done.plan]).toEqual(["p-intake", "p-propose", "p-size"]);
    expect(p.done.design.size).toBe(0);
    expect(p.done.build.size).toBe(0);
    expect(p.current).toEqual({ lane: "plan", step: "p-size" });
  });

  it("clamps out-of-range and negative upTo", () => {
    expect(laneProgress(events, 999).done.build.size).toBe(2);
    const empty = laneProgress(events, 0);
    expect(empty.current).toBeNull();
    expect(empty.done.plan.size).toBe(0);
    expect(laneProgress(events, -5).done.plan.size).toBe(0);
  });

  it("handles an empty log", () => {
    const p = laneProgress([]);
    expect(p.current).toBeNull();
    expect(p.last).toEqual({ plan: null, design: null, build: null, deploy: null });
    expect(passedNodes([]).size).toBe(0);
  });

  it("passedNodes keeps its Set to real node ids on hostile phase names", () => {
    const hostile = passedNodes([ev("phase.start", "driver", { phase: "constructor" })]);
    expect(hostile.size).toBe(0);
    // and the set never holds a non-string, which would break JSON round-tripping
    for (const v of passedNodes(events)) expect(typeof v).toBe("string");
  });

  it("passedNodes derives intake from the event name and the rest from phases", () => {
    const seen = passedNodes(events);
    expect(seen).toContain("intake");
    expect(seen).toContain("plan");
    expect(seen).toContain("design");
    expect(seen).toContain("build");
    expect(seen).not.toContain("deploy");
  });

  it("passedNodes windows on upTo and never shrinks as upTo grows", () => {
    let prev = 0;
    for (let i = 0; i <= events.length; i++) {
      const n = passedNodes(events, i).size;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it("does not mutate the events it folds", () => {
    const before = JSON.stringify(events);
    laneProgress(events);
    passedNodes(events);
    expect(JSON.stringify(events)).toBe(before);
  });

  it("edgeDone requires both endpoints reached", () => {
    const p = laneProgress(events);
    expect(edgeDone("build", ["b-red", "b-green"], p)).toBe(true);
    expect(edgeDone("build", ["b-green", "b-verify"], p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The intended workflow, asserted directly: the three agent lanes (plan, design, build), the
// lifecycle spine, and the phase→lane mapping, each written out as the shape the dashboard should
// render. A hand-authored spec, so an accidental change to the topology breaks a test here.

describe("topology — the intended workflow (lanes, steps, nodes)", () => {
  const stepOf = (lane: LaneId, id: string) => {
    const s = WORKFLOW.lanes[lane].steps.find((x) => x.id === id);
    if (!s) throw new Error(`${lane}/${id} not found`);
    return s;
  };

  describe("the plan lane", () => {
    const plan = WORKFLOW.lanes.plan;

    it("has the plan title and its ordered steps", () => {
      expect(plan.title).toBe("Plan  ·  sprint planning");
      expect(plan.steps.map((s) => s.id)).toEqual([
        "p-intake",
        "p-ux-establish",
        "p-intake-gate",
        "p-propose",
        "p-size",
        "p-backlog-gate",
        "p-req",
        "p-gate",
      ]);
    });

    it("owns each working step by role and lights it from the right event", () => {
      expect(stepOf("plan", "p-intake").role).toBe("product-owner");
      expect(stepOf("plan", "p-intake").match).toEqual({ role: "product-owner", eventPrefix: "intake", phaseAny: ["intake"] });
      expect(stepOf("plan", "p-ux-establish").role).toBe("ux-designer");
      expect(stepOf("plan", "p-ux-establish").match).toEqual({ role: "ux-designer", phase: "establish" });
      expect(stepOf("plan", "p-propose").role).toBe("spec-author");
      expect(stepOf("plan", "p-propose").match).toEqual({ role: "spec-author", phase: "propose" });
      expect(stepOf("plan", "p-size").role).toBe("architect-reviewer");
      expect(stepOf("plan", "p-size").match).toEqual({ role: "architect-reviewer", phaseAny: ["estimate", "estimate-committed"] });
      expect(stepOf("plan", "p-req").role).toBe("product-owner");
      expect(stepOf("plan", "p-req").match).toEqual({ role: "product-owner", phaseAny: ["author-requests", "feature"] });
    });

    it("has three human gates that light only from gate state", () => {
      for (const id of ["p-intake-gate", "p-backlog-gate", "p-gate"]) {
        expect(stepOf("plan", id).gate, id).toBe(true);
        expect(stepOf("plan", id).match, id).toBeNull();
      }
    });

    it("wires the plan spine and carries no back-edges", () => {
      expect(plan.edges.map((e) => [...e])).toEqual([
        ["p-intake", "p-ux-establish"],
        ["p-ux-establish", "p-intake-gate"],
        ["p-intake-gate", "p-propose"],
        ["p-propose", "p-size"],
        ["p-size", "p-backlog-gate"],
        ["p-backlog-gate", "p-req"],
        ["p-req", "p-gate"],
      ]);
      expect(plan.backEdges).toEqual([]);
    });
  });

  describe("the design lane", () => {
    const design = WORKFLOW.lanes.design;

    it("has the design title and its ordered steps", () => {
      expect(design.title).toBe("Design lane  ·  spec-first (per story)");
      expect(design.steps.map((s) => s.id)).toEqual([
        "d-breakdown",
        "d-spec",
        "d-ux-ia",
        "d-arch",
        "d-dba",
        "d-ts",
        "d-nav",
        "d-gate",
        "d-hil",
      ]);
    });

    it("owns each working step by role and match", () => {
      expect(stepOf("design", "d-breakdown").role).toBe("spec-author");
      expect(stepOf("design", "d-breakdown").match).toEqual({ role: "spec-author", phase: "breakdown" });
      expect(stepOf("design", "d-spec").role).toBe("spec-author");
      expect(stepOf("design", "d-spec").match).toEqual({ role: "spec-author", phaseNot: ["propose", "estimate", "author-requests", "breakdown"] });
      expect(stepOf("design", "d-ux-ia").role).toBe("ux-designer");
      expect(stepOf("design", "d-ux-ia").match).toEqual({ role: "ux-designer", phase: "ia" });
      expect(stepOf("design", "d-arch").role).toBe("architect-reviewer");
      expect(stepOf("design", "d-arch").match).toEqual({ role: "architect-reviewer", phaseNot: ["estimate"] });
      expect(stepOf("design", "d-dba").role).toBe("dba");
      expect(stepOf("design", "d-dba").match).toEqual({ role: "dba" });
      expect(stepOf("design", "d-ts").role).toBe("test-strategist");
      expect(stepOf("design", "d-ts").match).toEqual({ role: "test-strategist" });
      expect(stepOf("design", "d-nav").role).toBe("navigator");
      // Lights on the per-story reflect/critique turn AND the feature-complete reconcile turn.
      expect(stepOf("design", "d-nav").match).toEqual({ role: "navigator", buildModeAny: ["reflect", "reconcile"], phaseAny: ["reflect", "reconcile"] });
    });

    it("has a spec gate and a raise-to-HIL terminal, neither lit by events", () => {
      expect(stepOf("design", "d-gate").gate).toBe(true);
      expect(stepOf("design", "d-gate").role).toBeNull();
      expect(stepOf("design", "d-gate").match).toBeNull();
      expect(stepOf("design", "d-hil").escalation).toBe(true);
      expect(stepOf("design", "d-hil").role).toBeNull();
      expect(stepOf("design", "d-hil").match).toBeNull();
    });

    it("wires the design spine and the revise/escalate back-edges", () => {
      expect(design.edges.map((e) => [...e])).toEqual([
        ["d-breakdown", "d-spec"],
        ["d-spec", "d-ux-ia"],
        ["d-ux-ia", "d-arch"],
        ["d-arch", "d-dba"],
        ["d-dba", "d-ts"],
        ["d-ts", "d-nav"],
        ["d-nav", "d-gate"],
      ]);
      expect(design.backEdges.map((e) => [...e])).toEqual([
        ["d-nav", "d-spec", "revise on findings"],
        ["d-nav", "d-hil", "escalate"],
      ]);
    });
  });

  describe("the build lane", () => {
    const build = WORKFLOW.lanes.build;

    it("has the build title and its ordered steps", () => {
      expect(build.title).toBe("Build lane  ·  honest-GREEN cycle (Branched-Database TDD)");
      expect(build.steps.map((s) => s.id)).toEqual([
        "b-red",
        "b-green",
        "b-verify",
        "b-review",
        "b-refactor",
        "b-assess",
        "b-repair",
        "b-perm",
        "b-hil",
        "b-accept",
      ]);
    });

    it("owns the happy-path steps by role and match", () => {
      expect(stepOf("build", "b-red").role).toBe("navigator");
      expect(stepOf("build", "b-red").match).toEqual({ role: "navigator", phase: "red", buildModeNot: ["reflect", "review", "assess", "assess-refactor", "assess-deploy"] });
      expect(stepOf("build", "b-green").role).toBe("driver");
      expect(stepOf("build", "b-green").match).toEqual({ role: "driver", buildModeNot: ["refactor", "repair", "refactor-superseded", "refactor-deploy", "green-superseded"] });
      expect(stepOf("build", "b-review").role).toBe("navigator");
      expect(stepOf("build", "b-review").match).toEqual({ role: "navigator", buildMode: "review" });
      expect(stepOf("build", "b-refactor").role).toBe("driver");
      expect(stepOf("build", "b-refactor").match).toEqual({ role: "driver", buildModeAny: ["refactor"] });
    });

    it("marks the fail/side steps as branches with their own modes", () => {
      expect(stepOf("build", "b-assess").role).toBe("navigator");
      expect(stepOf("build", "b-assess").branch).toBe(true);
      expect(stepOf("build", "b-assess").match).toEqual({ role: "navigator", buildModeAny: ["assess", "assess-refactor"] });
      expect(stepOf("build", "b-repair").role).toBe("driver");
      expect(stepOf("build", "b-repair").branch).toBe(true);
      expect(stepOf("build", "b-repair").match).toEqual({ role: "driver", buildModeAny: ["repair"] });
      expect(stepOf("build", "b-perm").role).toBe("driver");
      expect(stepOf("build", "b-perm").branch).toBe(true);
      expect(stepOf("build", "b-perm").match).toEqual({ role: "driver", buildModeAny: ["green-superseded", "refactor-superseded"] });
    });

    it("gives verify to the release-engineer, lit by the verify.* events", () => {
      expect(stepOf("build", "b-verify").role).toBe("release-engineer");
      expect(stepOf("build", "b-verify").gate).toBe(true);
      expect(stepOf("build", "b-verify").match).toEqual({ eventPrefix: "verify" });
    });

    it("has an acceptance gate and a raise-to-HIL terminal, neither lit by events", () => {
      expect(stepOf("build", "b-accept").gate).toBe(true);
      expect(stepOf("build", "b-accept").role).toBeNull();
      expect(stepOf("build", "b-accept").match).toBeNull();
      expect(stepOf("build", "b-hil").escalation).toBe(true);
      expect(stepOf("build", "b-hil").role).toBeNull();
      expect(stepOf("build", "b-hil").match).toBeNull();
    });

    it("wires the TDD loop spine and the verify-fail back-edges", () => {
      expect(build.edges.map((e) => [...e])).toEqual([
        ["b-red", "b-green"],
        ["b-green", "b-verify"],
        ["b-verify", "b-review"],
        ["b-review", "b-refactor"],
        ["b-refactor", "b-red"],
        ["b-refactor", "b-accept"],
      ]);
      expect(build.backEdges.map((e) => [...e])).toEqual([
        ["b-verify", "b-assess", "verify fails"],
        ["b-assess", "b-repair", "regression"],
        ["b-assess", "b-perm", "supersession"],
        ["b-assess", "b-hil", "genuine"],
      ]);
    });
  });

  describe("the lifecycle spine", () => {
    it("lists the lifecycle nodes in order with their labels, roles and types", () => {
      expect(WORKFLOW.nodes.map((n) => ({ id: n.id, label: n.label, roles: n.roles, type: n.type }))).toEqual([
        { id: "intake", label: "Intake", roles: ["product-owner"], type: "phase" },
        { id: "intakegate", label: "intake gate", roles: [], type: "gate" },
        { id: "plan", label: "Plan", roles: ["spec-author", "architect-reviewer", "product-owner"], type: "phase" },
        { id: "plangate", label: "plan gate", roles: [], type: "gate" },
        { id: "design", label: "Design lane", roles: ["spec-author", "architect-reviewer", "dba", "test-strategist", "ux-designer"], type: "phase" },
        { id: "specgate", label: "spec + test-list gates", roles: [], type: "gate" },
        { id: "build", label: "Build lane", roles: ["navigator", "driver"], type: "phase" },
        { id: "acceptancegate", label: "acceptance gate", roles: [], type: "gate" },
        { id: "deploy", label: "Deploy", roles: ["release-engineer"], type: "phase" },
        { id: "deploygate", label: "deploy gate", roles: [], type: "gate" },
        { id: "promote", label: "Promote", roles: ["release-engineer"], type: "phase" },
        { id: "promgate", label: "promote gate", roles: [], type: "gate" },
        { id: "shipped", label: "Shipped", roles: [], type: "phase" },
      ]);
    });

    it("wires the lifecycle edges, closing the loop from shipped back to plan", () => {
      expect(WORKFLOW.edges.map((e) => [...e])).toEqual([
        ["intake", "intakegate"],
        ["intakegate", "plan"],
        ["plan", "plangate"],
        ["plangate", "design"],
        ["design", "specgate"],
        ["specgate", "build"],
        ["build", "acceptancegate"],
        ["acceptancegate", "deploy"],
        ["deploy", "deploygate"],
        ["deploygate", "promote"],
        ["promote", "promgate"],
        ["promgate", "shipped"],
        ["shipped", "plan"],
      ]);
    });
  });

  describe("phase-to-lane mapping", () => {
    it("maps every known log phase to its lifecycle node", () => {
      expect(PHASE_TO_NODE).toEqual({
        intake: "intake",
        propose: "plan",
        estimate: "plan",
        "estimate-committed": "plan",
        "author-requests": "plan",
        breakdown: "design",
        establish: "plan",
        ia: "design",
        feature: "plan",
        workflow: "plan",
        design: "design",
        reflect: "design",
        reconcile: "design",
        build: "build",
        red: "build",
        green: "build",
        refactor: "build",
        review: "build",
        repair: "build",
        assess: "build",
        "assess-refactor": "build",
        deploy: "deploy",
        promote: "promote",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// The deploy lane is dashboard-native: deploy and promote are deterministic CLI effects with no
// inter-agent sub-workflow, so it is asserted directly here. It combines the deploy + promote
// phases, attributes every deterministic step to the release-engineer, and keeps its two human
// gates unlightable.

describe("topology — the deploy lane (dashboard-native)", () => {
  const deploy = WORKFLOW.lanes.deploy;

  it("exists and sits immediately after build in LANE_IDS", () => {
    expect(deploy).toBeDefined();
    expect(LANE_IDS.indexOf("deploy")).toBe(LANE_IDS.indexOf("build") + 1);
  });

  it("lays out the deploy + promote phases plus the self-heal arm, in order", () => {
    expect(deploy.steps.map((s) => s.id)).toEqual([
      "dp-deploy", "dp-verify", "dp-gate",
      "dp-pr", "dp-ci", "dp-promgate", "dp-merge",
      "dp-assess", "dp-refactor", "dp-hil", "dp-promote-hil",
    ]);
  });

  it("attributes every deterministic step to the release-engineer, leaving gates ownerless", () => {
    const byId = new Map(deploy.steps.map((s) => [s.id, s]));
    for (const id of ["dp-deploy", "dp-verify", "dp-pr", "dp-ci", "dp-merge"]) {
      expect(byId.get(id)?.role, id).toBe("release-engineer");
    }
    for (const id of ["dp-gate", "dp-promgate", "dp-hil", "dp-promote-hil"]) expect(byId.get(id)?.role, id).toBeNull();
  });

  it("keeps the two human gates unlightable (→ purple) and both escalation terminals", () => {
    const byId = new Map(deploy.steps.map((s) => [s.id, s]));
    for (const id of ["dp-gate", "dp-promgate"]) {
      expect(byId.get(id)?.gate, id).toBe(true);
      expect(byId.get(id)?.match, id).toBeNull(); // match:null → isHumanGate → purple
    }
    for (const id of ["dp-hil", "dp-promote-hil"]) {
      expect(byId.get(id)?.escalation, id).toBe(true);
      expect(byId.get(id)?.match, id).toBeNull();
    }
  });

  it("lights deploy/verify from deploy.* events and advances the promote steps by their narration", () => {
    expect(laneStepForEvent(ev("deploy.start", "release-engineer"))).toEqual({ lane: "deploy", step: "dp-deploy" });
    expect(laneStepForEvent(ev("deploy.verified", "release-engineer"))).toEqual({ lane: "deploy", step: "dp-verify" });
    // The promote phase.start (no per-step narration yet) lights the first sub-step, dp-pr.
    expect(laneStepForEvent(ev("phase.start", "release-engineer", { phase: "promote" }))).toEqual({
      lane: "deploy",
      step: "dp-pr",
    });
    // The promote sub-steps emit no distinct event NAME — only the orchestrator's per-action reasoning
    // narration — so the playhead ADVANCES through them by that narration (was: pinned on dp-pr for the
    // whole promote phase, so wait-ci/merge never lit). Built raw because this file's `ev` fixes
    // message to "" (the narration is what tells the sub-steps apart).
    const promoteReason = (kind: string): AgentLogEvent => ({
      timestamp: "2026-08-05T12:00:00.000Z", level: "info", role: "orchestrator",
      event: "reasoning", message: `orchestrator: ${kind}`, metadata: { phase: "promote" },
    });
    expect(laneStepForEvent(promoteReason("prepare-pr"))).toEqual({ lane: "deploy", step: "dp-pr" });
    expect(laneStepForEvent(promoteReason("wait-ci"))).toEqual({ lane: "deploy", step: "dp-ci" });
    expect(laneStepForEvent(promoteReason("merge"))).toEqual({ lane: "deploy", step: "dp-merge" });
  });

  it("anchors the deploy self-heal to the DEPLOY lane: assess-deploy -> dp-assess, refactor-deploy -> dp-refactor", () => {
    // The deploy-verify self-heal is the DEPLOY lane's Navigator/Driver work, so it must light the
    // deploy lane's bubbles — NOT the build lane's b-assess (which no longer matches assess-deploy).
    expect(
      laneStepForEvent(ev("phase.start", "navigator", { phase: "assess", buildMode: "assess-deploy" })),
    ).toEqual({ lane: "deploy", step: "dp-assess" });
    // refactor-deploy likewise: no build-lane claimant, so dp-refactor (Scope-deploy) lights.
    expect(
      laneStepForEvent(ev("phase.start", "driver", { phase: "refactor", buildMode: "refactor-deploy" })),
    ).toEqual({ lane: "deploy", step: "dp-refactor" });
  });

  it("wires the happy-path spine and the self-heal back-edges", () => {
    expect(deploy.edges.map(([a, b]) => `${a}->${b}`)).toEqual([
      "dp-deploy->dp-verify", "dp-verify->dp-gate", "dp-gate->dp-pr",
      "dp-pr->dp-ci", "dp-ci->dp-promgate", "dp-promgate->dp-merge",
    ]);
    const back = deploy.backEdges.map(([a, b]) => `${a}->${b}`);
    expect(back).toContain("dp-verify->dp-assess"); // verify fails
    expect(back).toContain("dp-refactor->dp-deploy"); // re-deploy after scoping
    expect(back).toContain("dp-assess->dp-hil"); // genuine failure → escalate
    // The promote SCM steps have no self-heal — a non-zero exit escalates straight to the HIL.
    expect(back).toContain("dp-pr->dp-promote-hil"); // prepare-pr fails
    expect(back).toContain("dp-ci->dp-promote-hil"); // CI red
    expect(back).toContain("dp-merge->dp-promote-hil"); // merge conflict
  });
});

// ---------------------------------------------------------------------------
// laneStepForEvent — the event → {lane, step} mapping that lights the lane graphs.
//
// Hand-authored expectations for the load-bearing cases: one representative event per
// lane/step predicate, asserting the sub-step it is intended to light. First-match wins
// across lanes (plan → design → build → deploy) and across steps within a lane, so these
// also pin the ordering that keeps a role's design work from lighting its planning step
// (and vice versa).

describe("laneStepForEvent — intended lane/step per event", () => {
  it("spec-author `breakdown` → design/d-breakdown", () => {
    expect(laneStepForEvent(ev("phase.start", "spec-author", { phase: "breakdown" }))).toEqual({
      lane: "design",
      step: "d-breakdown",
    });
  });

  it("spec-author non-planning phase → design/d-spec", () => {
    // d-spec excludes the planning phases (propose/estimate/author-requests/breakdown), so any
    // other spec-author phase is the design-lane acceptance-criteria work.
    expect(laneStepForEvent(ev("phase.start", "spec-author", { phase: "author-ac" }))).toEqual({
      lane: "design",
      step: "d-spec",
    });
  });

  it("ux-designer `establish` → plan/p-ux-establish", () => {
    expect(laneStepForEvent(ev("phase.start", "ux-designer", { phase: "establish" }))).toEqual({
      lane: "plan",
      step: "p-ux-establish",
    });
  });

  it("ux-designer `ia` → design/d-ux-ia", () => {
    expect(laneStepForEvent(ev("phase.start", "ux-designer", { phase: "ia" }))).toEqual({
      lane: "design",
      step: "d-ux-ia",
    });
  });

  it("architect (non-estimate phase) → design/d-arch", () => {
    expect(laneStepForEvent(ev("phase.start", "architect-reviewer", { phase: "annotate" }))).toEqual({
      lane: "design",
      step: "d-arch",
    });
  });

  it("architect `estimate` → plan/p-size", () => {
    // The architect acts in BOTH lanes; the estimate phase is the planning-lane sizing step, so
    // it must light plan/p-size and not the design-lane annotation.
    expect(laneStepForEvent(ev("phase.start", "architect-reviewer", { phase: "estimate" }))).toEqual({
      lane: "plan",
      step: "p-size",
    });
  });

  it("dba → design/d-dba", () => {
    expect(laneStepForEvent(ev("phase.start", "dba", { phase: "realize" }))).toEqual({
      lane: "design",
      step: "d-dba",
    });
  });

  it("test-strategist → design/d-ts", () => {
    expect(laneStepForEvent(ev("phase.start", "test-strategist", { phase: "test-list" }))).toEqual({
      lane: "design",
      step: "d-ts",
    });
  });

  it("navigator `reflect` → design/d-nav", () => {
    expect(
      laneStepForEvent(ev("phase.start", "navigator", { phase: "reflect", buildMode: "reflect" })),
    ).toEqual({ lane: "design", step: "d-nav" });
  });

  it("navigator `reconcile` (feature-complete cross-story) → design/d-nav (lights the same step)", () => {
    expect(
      laneStepForEvent(ev("phase.start", "navigator", { phase: "reconcile", buildMode: "reconcile" })),
    ).toEqual({ lane: "design", step: "d-nav" });
  });

  it("navigator `red` → build/b-red", () => {
    expect(laneStepForEvent(ev("phase.start", "navigator", { phase: "red" }))).toEqual({
      lane: "build",
      step: "b-red",
    });
  });

  it("driver `green` → build/b-green", () => {
    expect(laneStepForEvent(ev("phase.start", "driver", { phase: "green" }))).toEqual({
      lane: "build",
      step: "b-green",
    });
  });

  it("driver `refactor` → build/b-refactor", () => {
    // b-green matches a driver turn unless its buildMode is one of the specialized outcomes, so
    // a refactor turn must skip b-green and light its own step.
    expect(
      laneStepForEvent(ev("phase.start", "driver", { phase: "refactor", buildMode: "refactor" })),
    ).toEqual({ lane: "build", step: "b-refactor" });
  });

  it("product-owner `intake` phase → plan/p-intake", () => {
    expect(laneStepForEvent(ev("phase.start", "product-owner", { phase: "intake" }))).toEqual({
      lane: "plan",
      step: "p-intake",
    });
  });

  it("an `intake`-prefixed seed event → plan/p-intake (name alone, any role)", () => {
    expect(laneStepForEvent(ev("intake.supplied", "orchestrator", {}))).toEqual({
      lane: "plan",
      step: "p-intake",
    });
  });

  it("product-owner `author-requests` → plan/p-req", () => {
    expect(laneStepForEvent(ev("phase.start", "product-owner", { phase: "author-requests" }))).toEqual({
      lane: "plan",
      step: "p-req",
    });
  });

  it("a `verify`-prefixed event → build/b-verify (name alone)", () => {
    // b-verify matches on the event-name prefix alone, so a release-cycle verify lights it before
    // any later lane is consulted.
    expect(laneStepForEvent(ev("verify.passed", "release-engineer", {}))).toEqual({
      lane: "build",
      step: "b-verify",
    });
  });

  it("`deploy.start` → deploy/dp-deploy", () => {
    expect(laneStepForEvent(ev("deploy.start", "release-engineer", {}))).toEqual({
      lane: "deploy",
      step: "dp-deploy",
    });
  });

  it("`deploy.verified` → deploy/dp-verify", () => {
    expect(laneStepForEvent(ev("deploy.verified", "release-engineer", {}))).toEqual({
      lane: "deploy",
      step: "dp-verify",
    });
  });

  it("an unmatched event → null", () => {
    // laneStepForEvent returns null (not {lane:null, step:null}) when nothing lights.
    expect(laneStepForEvent(ev("handoff", "orchestrator", {}))).toBeNull();
  });
});

const HOME = process.env.HOME || "";

interface LogFixture {
  name: string;
  path: string;
  // Sub-steps this particular run legitimately never reaches, with the reason. Declared
  // per fixture rather than inferred from the name, so renaming a fixture can't silently
  // change how strict its assertions are.
  neverLit: Record<string, string>;
}

// The live run in this lab (380 events) and the shipped replay corpus (421 events).
// Between them, every non-gate sub-step lights except the one noted below — including
// b-verify (release-engineer emits verify.passed) and b-perm (driver, buildMode refactor).
const LOGS: LogFixture[] = [
  {
    name: "live stockflow",
    // v0.3.7 renames .sftdd → .consort (auto-migrated on next run); resolve current then legacy.
    path:
      [".consort", ".sftdd", ".tdd"]
        .map((r) => join(HOME, "Code/consort-lab/stockflow", r, "agent-log.jsonl"))
        .find((p) => existsSync(p)) ?? join(HOME, "Code/consort-lab/stockflow/.consort/agent-log.jsonl"),
    neverLit: {
      // The corpus log DOES light p-req, which is what shows the predicate is right.
      "plan/p-req": "live: product-owner emits only gate.approved, never the author-requests phase",
    },
  },
  {
    name: "replay stockflow-rerecord",
    // v0.3.7 relocated the corpus to examples/replay/corpora/; prefer it, fall back to legacy.
    path:
      [
        join(HOME, ".claude/plugins/marketplaces/databricks-solutions/examples/replay/corpora/stockflow-rerecord/agent-log.jsonl"),
        join(HOME, ".claude/plugins/marketplaces/databricks-solutions/examples/sftdd-scenarios/stockflow-rerecord/agent-log.jsonl"),
      ].find((p) => existsSync(p)) ??
      join(HOME, ".claude/plugins/marketplaces/databricks-solutions/examples/replay/corpora/stockflow-rerecord/agent-log.jsonl"),
    neverLit: {},
  },
];

function readLog(p: string): AgentLogEvent[] {
  return readFileSync(p, "utf8")
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

for (const { name, path, neverLit } of LOGS) {
  describe.skipIf(!existsSync(path))(`topology — real-log coverage (${name})`, () => {
    it("lights a meaningful share of the log", () => {
      const events = readLog(path);
      const lit = events.filter((e) => laneStepForEvent(e) !== null).length;
      expect(lit).toBeGreaterThan(events.length * 0.1);
    });

    it("every phase present in the log maps to a lifecycle node", () => {
      // Guards against a new kit phase silently falling off the graph — the failure
      // that hid `assess-refactor`.
      const unmapped = new Set<string>();
      for (const e of readLog(path)) {
        const md = (e.metadata || {}) as Record<string, unknown>;
        const p = md.phase;
        if (typeof p === "string" && p.trim() && !nodeForPhase(p)) unmapped.add(p);
      }
      expect([...unmapped]).toEqual([]);
    });

    it("reaches the full lifecycle spine over a complete run", () => {
      const seen = passedNodes(readLog(path));
      for (const id of ["plan", "design", "build", "deploy"]) expect(seen, id).toContain(id);
    });

    it("exercises every non-gate sub-step across a complete run", () => {
      // If a step never lights on a real full run its predicate is suspect, so require
      // every one to light except those this fixture declares (with a reason) as
      // legitimately unreachable for what that run actually did.
      const p = laneProgress(readLog(path));
      const missing: string[] = [];
      for (const lane of LANE_IDS) {
        for (const s of WORKFLOW.lanes[lane].steps) {
          if (s.match === null) continue; // human gates never light from events
          if (!p.done[lane].has(s.id)) missing.push(`${lane}/${s.id}`);
        }
      }
      expect(missing.filter((m) => !(m in neverLit))).toEqual([]);
    });

    it("declares no stale neverLit exemptions", () => {
      // Keeps the exemption list honest: if a step starts lighting (new kit, new corpus),
      // its entry must be removed rather than quietly masking a future regression.
      const p = laneProgress(readLog(path));
      const nowLit = Object.keys(neverLit).filter((k) => {
        const [lane, step] = k.split("/") as [LaneId, string];
        return p.done[lane]?.has(step);
      });
      expect(nowLit).toEqual([]);
    });

    it("laneProgress is a monotonic prefix fold over the real log", () => {
      const events = readLog(path);
      let prev = 0;
      for (let i = 0; i <= events.length; i += 17) {
        const p = laneProgress(events, i);
        const total = LANE_IDS.reduce((n, l) => n + p.done[l].size, 0);
        expect(total).toBeGreaterThanOrEqual(prev);
        prev = total;
      }
    });
  });
}

describe("laneProgress — a `reasoning` event holds the turn's step (no highlight jump)", () => {
  it("driver `reasoning` during a REFACTOR turn stays on b-refactor (not b-green)", () => {
    const events = [
      ev("phase.start", "driver", { phase: "refactor", buildMode: "refactor" }),
      ev("reasoning", "driver", {}), // narration: carries no phase/buildMode
    ];
    expect(laneProgress(events).current).toEqual({ lane: "build", step: "b-refactor" });
  });

  it("driver `reasoning` during a base GREEN turn stays on b-green (mode reset at phase.start)", () => {
    const events = [
      ev("phase.start", "driver", { phase: "refactor", buildMode: "refactor" }),
      ev("phase.end", "driver", { phase: "refactor" }),
      ev("phase.start", "driver", { phase: "green" }), // new green turn — no buildMode
      ev("reasoning", "driver", {}),
    ];
    expect(laneProgress(events).current).toEqual({ lane: "build", step: "b-green" });
  });

  it("navigator `reasoning` during a REVIEW turn stays on b-review", () => {
    const events = [
      ev("phase.start", "navigator", { phase: "review", buildMode: "review" }),
      ev("reasoning", "navigator", {}),
    ];
    expect(laneProgress(events).current).toEqual({ lane: "build", step: "b-review" });
  });
});

// ---------------------------------------------------------------------------
// reachedThisPass: the pass-scoped traversal (what the DAG followed THIS iteration),
// which resets a looping lane at its first-step re-entry so a new loop's later nodes
// read "not yet run" instead of carrying the previous loop's results.

describe("topology — reachedThisPass (pass-scoped traversal)", () => {
  // One full build cycle, then a NEW cycle's RED (the b-refactor→b-red loop edge).
  const red = ev("phase.start", "navigator", { phase: "red" }); // b-red
  const green = ev("phase.start", "driver", {}); // b-green (no excluded buildMode)
  const review = ev("phase.start", "navigator", { buildMode: "review" }); // b-review
  const refactor = ev("phase.start", "driver", { buildMode: "refactor" }); // b-refactor
  const cycle1 = [red, green, review, refactor];

  it("accumulates the steps traversed WITHIN a pass", () => {
    const reached = reachedThisPass(cycle1);
    expect([...reached].sort()).toEqual(["b-green", "b-red", "b-refactor", "b-review"]);
  });

  it("RESETS the looping lane when its first step (b-red) is re-entered — a new loop", () => {
    // After one full cycle, a SECOND b-red begins the next TDD loop: green/review/refactor from
    // the PRIOR loop must drop out, so clicking them reads "not yet run" rather than last cycle's turn.
    const reached = reachedThisPass([...cycle1, red]);
    expect([...reached]).toEqual(["b-red"]);
    expect(reached.has("b-green")).toBe(false);
    expect(reached.has("b-review")).toBe(false);
    expect(reached.has("b-refactor")).toBe(false);
  });

  it("keeps a verify-fail BRANCH that ran this pass, and omits one that did not", () => {
    const verify = ev("verify.start", "release-engineer", {}); // b-verify (eventPrefix verify)
    const assess = ev("phase.start", "navigator", { buildMode: "assess" }); // b-assess (branch)
    const repair = ev("phase.start", "driver", { buildMode: "repair" }); // b-repair (branch)
    const ran = reachedThisPass([red, green, verify, assess, repair]);
    expect(ran.has("b-assess")).toBe(true);
    expect(ran.has("b-repair")).toBe(true);
    // A pass that went straight through never lights the branch.
    const straight = reachedThisPass([red, green, review, refactor]);
    expect(straight.has("b-assess")).toBe(false);
    expect(straight.has("b-repair")).toBe(false);
  });

  it("does NOT reset an UPSTREAM lane: a design step stays reached through the build loop", () => {
    const dSpec = ev("phase.start", "spec-author", { phase: "design" }); // d-spec
    const reached = reachedThisPass([dSpec, ...cycle1, red]);
    expect(reached.has("d-spec")).toBe(true); // design is behind the frontier, never reset
    expect(reached.has("b-green")).toBe(false); // the build loop still reset at the new red
  });

  it("honors upTo (scrubber parity): folding mid-loop matches the live fold to that point", () => {
    // At upTo = 3 (red, green, review folded; refactor not yet), the pass has reached red/green/review.
    const reached = reachedThisPass([...cycle1, red], 3);
    expect([...reached].sort()).toEqual(["b-green", "b-red", "b-review"]);
    expect(reached.has("b-refactor")).toBe(false);
  });
});
