// Card lighting — the SINGLE source of truth for what visual state each lane-step card is in.
//
// The model is deliberately BINARY (see CARD-LIGHTING-DESIGN.md): exactly ONE card glows — the
// current locus (the playhead) — and every other card renders in ONE uniform `base` style. There is
// no "dim" vs "faint" vs "done" vs "upcoming" gradation; those multiple display modes were the source
// of every lighting bug (a completed upstream box glowing like live work, two gates lit at once, the
// last role step glowing instead of the gate the run actually reached). One glow, one base.
//
//   SRP — all "which card is current" logic lives in `currentLocus`; all "how it looks" lives in the
//         renderer's state->style map. OCP — a new glow colour is a new `current-*` member + one row.
//         DIP — LaneGraph depends on this CardState abstraction, not on focus/reached internals.

import { GATE_KEY_BY_STEP, GATE_STEP_BY_KEY } from "./gates";
import { LANE_IDS, WORKFLOW, type LaneId } from "./topology";
import type { DashboardState, Focus } from "./types";

/** The semantic state of one lane-step CARD. Exactly one card is a `current-*` (it glows); every
 *  other card is `base`. Presentation (colour / glow) is NOT here — the renderer maps this to a style. */
export type CardState =
  | "current-step" //        the step the running agent is ON — glows in its role colour
  | "current-gate" //        the gate the playhead sits on (parked / just-reached) — glows gate-purple
  | "current-escalation" //  the raise-to-HIL terminal the run is parked on — glows critical-red
  | "base"; //               every other card — ONE uniform style, no gradations

/** lane <-> lifecycle spine. SINGLE home for this mapping (the renderer imports it instead of keeping
 *  its own copy). `after` = the lifecycle nodes that, once passed, put this lane behind the playhead. */
export const LANE_NODE: Record<LaneId, { own: string; after: readonly string[] }> = {
  plan: { own: "plan", after: ["design", "build", "deploy"] },
  design: { own: "design", after: ["build", "deploy"] },
  build: { own: "build", after: ["deploy"] },
  deploy: { own: "deploy", after: [] },
};

/** Everything the deriver needs from the fold — nothing more. Keeps it pure + unit-testable (no
 *  DashboardState, no React). The reducer already computes all of these. */
export interface FoldView {
  focus: Focus; //                        the playhead abstraction (step | gate | escalation | idle)
  liveStep: string | null; //             the GENUINELY running step (topology.laneCurrent?.step) — null
  //                                       between turns. Distinct from `focus`, whose carry can hold a
  //                                       stale pre-gate step; this is what makes the glow land on the
  //                                       live agent on a back-edge yet fall to the gate between turns.
  reachedThisPass: ReadonlySet<string>; // step ids traversed to reach the playhead, this pass
  approvedGates: ReadonlySet<string>; //  gate KEYS with an APPROVED record (a reached milestone)
  atLive: boolean; //                     is the playhead at the LIVE frontier (vs scrubbed into history)?
  parkedGateStep: string | null; //       the gate STEP id the current frame sits on (topology.laneGate)
}

/** step id -> its lane. Derived once from WORKFLOW so it can never drift from the lane definitions. */
const STEP_LANE: Readonly<Record<string, LaneId>> = (() => {
  const m: Record<string, LaneId> = {};
  for (const lane of LANE_IDS) for (const s of WORKFLOW.lanes[lane].steps) m[s.id] = lane;
  return m;
})();

/** Global run order: lane order, then step order within the lane. Lets us pick the FURTHEST-along
 *  reached point as the between-turns locus (so an approved gate outranks the role step before it). */
const ORDER: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  let i = 0;
  for (const lane of LANE_IDS) for (const s of WORKFLOW.lanes[lane].steps) m.set(s.id, i++);
  return m;
})();

/**
 * The ONE gate step (if any) the playhead is positioned ON right now — the "awaiting / replaying a
 * decision" locus. Two fold signals, one concept:
 *   - LIVE park: `focus.kind === "gate"` — the run has stopped at the gate awaiting a human now.
 *   - SCRUBBED replay (`!atLive`): the board is parked on a historical `gate.surfaced` frame, so the
 *     gate step the frame sits on (`parkedGateStep`) re-glows to replay that moment.
 * At the LIVE edge a gate counts ONLY when parked (focus=gate), never from `parkedGateStep` alone — a
 * live run streaming PAST a just-surfaced gate (the reconcile turn, a role step still running) must
 * not light it. That is why `parkedGateStep` counts only when `!atLive`.
 */
function pendingGateStep(v: FoldView): string | null {
  if (v.focus.kind === "gate") return GATE_STEP_BY_KEY[v.focus.gate] ?? null;
  return v.atLive ? null : v.parkedGateStep;
}

/**
 * The single current locus — the one card that glows. Precedence:
 *   1. A genuinely RUNNING agent step (`liveStep`). Wins over any earlier-reached gate — the back-edge
 *      case: a new build loop at `b-red` glows `b-red`, not the already-approved acceptance gate.
 *   2. A gate the playhead sits on (`pendingGateStep`) or an escalation the run is parked on.
 *   3. Between turns / idle: the FURTHEST-along point the run has reached this pass — a role step or an
 *      APPROVED gate. After a gate approval that is the gate (it outranks the pre-gate role step), so
 *      the locus sits on the gate, not the last role turn before it.
 */
/** The one locus: a step id, what kind of locus it is, and the lane it lives in. */
export interface Locus {
  step: string;
  kind: "step" | "gate" | "escalation";
  lane: LaneId;
}

export function currentLocus(v: FoldView): Locus | null {
  const withLane = (step: string, kind: Locus["kind"]): Locus | null => {
    const lane = STEP_LANE[step];
    return lane ? { step, kind, lane } : null;
  };

  if (v.liveStep && STEP_LANE[v.liveStep]) return withLane(v.liveStep, "step");

  const pg = pendingGateStep(v);
  if (pg) return withLane(pg, "gate");
  if (v.focus.kind === "escalation" && v.focus.step) return withLane(v.focus.step, "escalation");

  // Between turns / idle: the FURTHEST-along point reached this pass — a reached role step, or an
  // approved gate (which outranks the pre-gate role step). A plain loop (no closure) so the pick is
  // obvious and TS can track it.
  const candidates: { id: string; kind: "step" | "gate" }[] = [...v.reachedThisPass].map((id) => ({ id, kind: "step" }));
  for (const key of v.approvedGates) {
    const s = GATE_STEP_BY_KEY[key];
    if (s) candidates.push({ id: s, kind: "gate" });
  }
  let best: { id: string; kind: "step" | "gate" } | null = null;
  for (const c of candidates) {
    const o = ORDER.get(c.id);
    if (o == null) continue;
    if (!best || o > (ORDER.get(best.id) ?? -1)) best = c;
  }
  return best ? withLane(best.id, best.kind) : null;
}

/**
 * The locus re-expressed as a `Focus` — so EVERY highlight surface (the glowing card, the active LANE
 * panel, the lifecycle SPINE node + its colour) can read the SAME single source through the one
 * `activeColorForFocus` key, instead of each re-deriving "what's active" from the raw `state.focus`
 * (whose between-turns carry can lag onto a stale step). `idle` when there is no locus.
 */
export function locusFocus(v: FoldView): Focus {
  const loc = currentLocus(v);
  if (!loc) return { kind: "idle" };
  if (loc.kind === "escalation") return { kind: "escalation", step: loc.step };
  if (loc.kind === "gate") {
    const gate = GATE_KEY_BY_STEP[loc.step];
    if (!gate) return { kind: "step", lane: loc.lane, step: loc.step };
    // The gate's status is authoritative from approvedGates: a furthest-along APPROVED gate (the
    // completed-phase locus) reads "approved"; a gate the playhead merely sits on is still "surfaced".
    return { kind: "gate", gate, status: v.approvedGates.has(gate) ? "approved" : "surfaced" };
  }
  return { kind: "step", lane: loc.lane, step: loc.step };
}

/** Build the deriver's `FoldView` from the full dashboard state — the ONE place the mapping lives, so
 *  the card graph and the lifecycle spine fold identically. */
export function foldViewOf(state: DashboardState): FoldView {
  return {
    focus: state.focus,
    liveStep: state.topology.laneCurrent?.step ?? null,
    reachedThisPass: new Set(state.topology.reachedThisPass),
    approvedGates: new Set((state.gates ?? []).filter((g) => g.status === "approved").map((g) => g.name)),
    atLive: state.atLive,
    parkedGateStep: state.topology.laneGate,
  };
}

/**
 * Assign every lane-step card its CardState. Pure, total: exactly ONE card is a `current-*` (the glow),
 * every other is `base`. This is the ONLY place card state is decided.
 */
export function deriveCardStates(v: FoldView): Map<string, CardState> {
  const loc = currentLocus(v);
  const glow: CardState =
    loc?.kind === "gate" ? "current-gate" : loc?.kind === "escalation" ? "current-escalation" : "current-step";

  const out = new Map<string, CardState>();
  for (const lane of LANE_IDS) {
    for (const s of WORKFLOW.lanes[lane].steps) {
      out.set(s.id, loc && s.id === loc.step ? glow : "base");
    }
  }
  return out;
}
