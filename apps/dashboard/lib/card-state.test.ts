import { describe, it, expect } from "vitest";
import { deriveCardStates, foldViewOf, type CardState, type FoldView } from "./card-state";
import type { DashboardState, Focus } from "./types";

const DESIGN = ["d-breakdown", "d-spec", "d-ux-ia", "d-arch", "d-dba", "d-ts", "d-nav"];
const BUILD = ["b-red", "b-green", "b-review", "b-refactor"];

function base(over: Partial<FoldView>): FoldView {
  return {
    focus: { kind: "idle" } as Focus,
    liveStep: null,
    reachedThisPass: new Set(),
    approvedGates: new Set(),
    atLive: true,
    parkedGateStep: null,
    complete: false,
    ...over,
  };
}

/** The ONE card that glows (there must be exactly one), or null. */
function glowing(st: Map<string, CardState>): { id: string; state: CardState } | null {
  const lit = [...st].filter(([, s]) => s !== "base");
  expect(lit.length).toBeLessThanOrEqual(1); // the whole point: never two lit at once
  return lit.length ? { id: lit[0][0], state: lit[0][1] } : null;
}

describe("card-state — exactly ONE card glows: the current locus", () => {
  it("a running agent step glows (current-step); everything else is base", () => {
    // deploy-verify playhead: the release engineer is running dp-verify. The completed design/build
    // steps (incl. the old 'navigator-reflect' box) must NOT glow — they are base now.
    const v = base({
      focus: { kind: "step", lane: "deploy", step: "dp-verify" } as Focus,
      liveStep: "dp-verify",
      reachedThisPass: new Set([...DESIGN, ...BUILD, "dp-deploy", "dp-verify"]),
      approvedGates: new Set(["intake", "plan", "spec", "acceptance"]),
    });
    const st = deriveCardStates(v);
    expect(glowing(st)).toEqual({ id: "dp-verify", state: "current-step" });
    expect(st.get("d-nav")).toBe("base"); // the reported "upstream box still glowing" bug → base
    expect(st.get("dp-deploy")).toBe("base");
  });

  it("the intake gate glows (not the UX designer before it) once intake is APPROVED, between turns", () => {
    // Timeline row 24 (~event 14): UX designer turn done, intake approved, no agent running yet. The
    // locus is the gate the run reached — NOT p-ux-establish, the last role step before it.
    const v = base({
      focus: { kind: "step", lane: "plan", step: "p-ux-establish" } as Focus, // stale carry
      liveStep: null, // nothing running between turns
      reachedThisPass: new Set(["p-intake", "p-ux-establish"]),
      approvedGates: new Set(["intake"]),
      atLive: false,
    });
    const st = deriveCardStates(v);
    expect(glowing(st)).toEqual({ id: "p-intake-gate", state: "current-gate" });
    expect(st.get("p-ux-establish")).toBe("base"); // the reported bug: this must NOT glow
    expect(st.get("p-intake")).toBe("base");
  });

  it("the gate glows while scrubbed onto its just-SURFACED (not yet approved) frame", () => {
    const v = base({
      focus: { kind: "step", lane: "plan", step: "p-ux-establish" } as Focus,
      liveStep: null,
      reachedThisPass: new Set(["p-intake", "p-ux-establish"]),
      approvedGates: new Set(), // not approved yet
      atLive: false,
      parkedGateStep: "p-intake-gate", // laneGate on the gate.surfaced frame
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "p-intake-gate", state: "current-gate" });
  });

  it("a running step WINS over an earlier approved gate (back-edge: new build loop at b-red)", () => {
    const v = base({
      focus: { kind: "step", lane: "build", step: "b-red" } as Focus,
      liveStep: "b-red",
      reachedThisPass: new Set(["b-red"]),
      approvedGates: new Set(["intake", "plan", "spec", "acceptance"]), // b-accept is later in order
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "b-red", state: "current-step" });
  });

  it("LIVE: a just-surfaced gate the run is streaming PAST does NOT glow — the running step does", () => {
    // The reconcile window: spec gate surfaced (laneGate=d-gate) but the navigator is still running
    // d-nav at the live edge. Only the running step glows; the gate stays base until a real park.
    const v = base({
      focus: { kind: "step", lane: "design", step: "d-nav" } as Focus,
      liveStep: "d-nav",
      reachedThisPass: new Set([...DESIGN]),
      atLive: true,
      parkedGateStep: "d-gate",
    });
    const st = deriveCardStates(v);
    expect(glowing(st)).toEqual({ id: "d-nav", state: "current-step" });
    expect(st.get("d-gate")).toBe("base");
  });

  it("LIVE: parked AT the gate (focus=gate) glows the gate", () => {
    const v = base({ focus: { kind: "gate", gate: "spec" } as Focus, reachedThisPass: new Set(DESIGN) });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "d-gate", state: "current-gate" });
  });

  it("an escalation the run is parked on glows (current-escalation)", () => {
    const v = base({
      focus: { kind: "escalation", step: "b-hil" } as Focus,
      reachedThisPass: new Set([...BUILD, "b-hil"]),
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "b-hil", state: "current-escalation" });
  });

  it("idle / finished run glows the FURTHEST milestone reached — exactly one, never the whole board", () => {
    const v = base({
      focus: { kind: "idle" } as Focus,
      liveStep: null,
      reachedThisPass: new Set([...DESIGN, ...BUILD, "dp-deploy", "dp-verify", "dp-pr", "dp-merge"]),
      approvedGates: new Set(["intake", "plan", "spec", "acceptance", "deploy", "promote"]),
    });
    const g = glowing(deriveCardStates(v));
    expect(g).not.toBeNull(); // one locus, not a dark board and not a fully-lit one
  });

  // REGRESSION (the reported bug): a promote RE-DRIVEN on a shipped sprint runs with the coarse phase
  // still reading `complete`. The done-terminal guard must NOT blank an ACTIVELY-RUNNING lane step —
  // the dashboard reducer said laneCurrent=dp-ci, but currentLocus returned null (nothing lit) because
  // the guard ran before the running-step check. One doorway, running step wins first.
  it("LIVE: a running step lights even when the coarse phase reads 'complete' (re-driven promote at wait-ci)", () => {
    const v = base({
      focus: { kind: "step", lane: "deploy", step: "dp-ci" } as Focus,
      liveStep: "dp-ci",
      complete: true, // the sprint snapshot's phase is 'complete'
      atLive: true,
      reachedThisPass: new Set([...DESIGN, ...BUILD, "dp-deploy", "dp-verify", "dp-pr", "dp-ci"]),
      approvedGates: new Set(["intake", "plan", "spec", "acceptance", "deploy"]),
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "dp-ci", state: "current-step" });
  });

  it("LIVE: a SURFACED gate still lights when phase reads 'complete' (re-driven promote paused at its gate)", () => {
    const v = base({
      focus: { kind: "gate", gate: "promote", status: "surfaced" } as Focus,
      liveStep: null,
      complete: true,
      atLive: true,
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "dp-promgate", state: "current-gate" });
  });

  it("LIVE: a truly done run lights NOTHING — an APPROVED promote-gate focus does not re-light the gate", () => {
    const v = base({
      focus: { kind: "gate", gate: "promote", status: "approved" } as Focus,
      liveStep: null,
      complete: true,
      atLive: true,
      reachedThisPass: new Set([...DESIGN, ...BUILD, "dp-deploy", "dp-verify", "dp-pr", "dp-merge"]),
      approvedGates: new Set(["intake", "plan", "spec", "acceptance", "deploy", "promote"]),
    });
    expect(glowing(deriveCardStates(v))).toBeNull(); // Shipped rests; nothing flashes
  });
});

// Regression guard (the "scrubber does not rewind the glow" report): the one-locus refactor keyed the
// glow on live-only `laneCurrent` (null on every scrubbed fold) + the furthest-reached fallback, so the
// lit card stopped ALIGNING to the scrubber. On a SCRUBBED frame the glow must follow the server-folded
// `focus.step` (the playhead), while a parked/approved gate still outranks a trailing step.
describe("card-state — a SCRUBBED frame aligns the glow to the folded focus (scrubber playhead)", () => {
  it("lights the scrubbed focus step even though laneCurrent/liveStep is null on a scrubbed fold", () => {
    const v = base({
      focus: { kind: "step", lane: "design", step: "d-ux-ia" } as Focus, // the folded playhead step
      liveStep: null, // laneCurrent is null on every scrubbed fold — the regression's blind spot
      reachedThisPass: new Set(["d-breakdown", "d-spec", "d-ux-ia"]),
      atLive: false,
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "d-ux-ia", state: "current-step" });
  });

  it("lights the focus step at a PASS BOUNDARY where reachedThisPass is empty (previously went dark)", () => {
    const v = base({
      focus: { kind: "step", lane: "design", step: "d-breakdown" } as Focus,
      liveStep: null,
      reachedThisPass: new Set(), // a new feature/phase just started at this scrub position
      atLive: false,
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "d-breakdown", state: "current-step" });
  });

  it("the glow MOVES as the scrubber advances through a lane (not stuck on current)", () => {
    const at = (step: string, reached: string[]) =>
      glowing(deriveCardStates(base({ focus: { kind: "step", lane: "design", step } as Focus, liveStep: null, reachedThisPass: new Set(reached), atLive: false })));
    expect(at("d-breakdown", ["d-breakdown"])?.id).toBe("d-breakdown");
    expect(at("d-dba", ["d-breakdown", "d-spec", "d-ux-ia", "d-arch", "d-dba"])?.id).toBe("d-dba");
    expect(at("d-nav", DESIGN)?.id).toBe("d-nav");
  });

  it("a PARKED/surfaced gate still outranks the trailing focus step on a scrubbed frame", () => {
    const v = base({
      focus: { kind: "step", lane: "plan", step: "p-ux-establish" } as Focus,
      liveStep: null,
      reachedThisPass: new Set(["p-intake", "p-ux-establish"]),
      atLive: false,
      parkedGateStep: "p-intake-gate",
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "p-intake-gate", state: "current-gate" });
  });

  it("at the LIVE edge the glow is UNCHANGED (liveStep still wins; focus.step is not used as a scrub candidate)", () => {
    const v = base({
      focus: { kind: "step", lane: "build", step: "b-red" } as Focus,
      liveStep: "b-green", // live running step differs from a lagging focus carry
      reachedThisPass: new Set(["b-red", "b-green"]),
      atLive: true,
    });
    expect(glowing(deriveCardStates(v))).toEqual({ id: "b-green", state: "current-step" });
  });
});

describe("foldViewOf — approvedGates is slice-scoped (the promote-lit-at-deploy-gate bug)", () => {
  const topo = (over: Partial<DashboardState["topology"]> = {}): DashboardState["topology"] => ({
    passedNodes: [], activeNode: null, laneSteps: {}, reachedThisPass: [], laneCurrent: null,
    laneLast: {}, laneGate: null, atTimestamp: null, approvedGatesAtPlayhead: [], ...over,
  });
  const st = (over: Partial<DashboardState>): DashboardState =>
    ({ focus: { kind: "idle" }, atLive: false, phase: "deploy", gates: [], topology: topo(), ...over }) as unknown as DashboardState;

  it("uses topology.approvedGatesAtPlayhead, NOT the full-run state.gates", () => {
    // Scrubbed to the deploy-gate event: the playhead has approved only `deploy`, but the full-run
    // snapshot gates also carry `promote` (approved later). The locus set must exclude promote.
    const v = foldViewOf(st({
      topology: topo({ approvedGatesAtPlayhead: ["deploy"] }),
      gates: [{ name: "deploy", status: "approved" }, { name: "promote", status: "approved" }] as DashboardState["gates"],
    }));
    expect([...v.approvedGates].sort()).toEqual(["deploy"]); // promote NOT leaked from full-run gates
  });

  it("falls back to state.gates when approvedGatesAtPlayhead is absent (pre-field fixtures byte-identical)", () => {
    const v = foldViewOf(st({
      topology: { ...topo(), approvedGatesAtPlayhead: undefined as unknown as string[] },
      gates: [{ name: "deploy", status: "approved" }] as DashboardState["gates"],
    }));
    expect([...v.approvedGates]).toEqual(["deploy"]);
  });
});
