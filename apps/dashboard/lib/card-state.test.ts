import { describe, it, expect } from "vitest";
import { deriveCardStates, type CardState, type FoldView } from "./card-state";
import type { Focus } from "./types";

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
});
