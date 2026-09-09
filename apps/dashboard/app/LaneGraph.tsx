"use client";

import { useState } from "react";
import {
  LANE_IDS,
  WORKFLOW,
  type BackEdge,
  type Lane,
  type LaneId,
  type LaneStep,
} from "@/lib/topology";
import { GATE_KEY_BY_STEP, GATE_STEP_BY_KEY } from "@/lib/gates";
import { colorForRole, font, radius } from "@/lib/theme";
import { activeColorForFocus } from "./active-color";
import type { DashboardState, LaneStepMeta } from "@/lib/types";

// "3m", "45s" — how long the current open turn has been running. (Was in AgentBubble, now removed;
// this is its only consumer — the active step card's bottom-row duration.)
function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 >= 30 && m < 10 ? `${m}m${s % 60}s` : `${m}m`;
}

// The per-lane inter-agent sub-workflows (Kevin's Figure 2) — what happens *inside* each
// lifecycle node the top-level WorkflowGraph shows as one box.
//
// Layout: the lane the playhead is in renders as a full graph; the other two collapse to a
// one-line summary you can click to expand. Three full graphs would cost ~3x WorkflowGraph's
// vertical space for two lanes you are usually not looking at.
//
// Everything derives from the folded state (`topology.laneSteps` / `laneCurrent`), so this
// works identically live and scrubbed back. Two facts about that data shape this component:
//
//   1. Gate steps NEVER light from events (`match: null` — human-decided, out of band). So a
//      gate's state comes from the run's gate list, not from laneSteps. Rendering them off the
//      step data alone would draw every gate permanently pending.
//   2. 52% of playhead positions light no lane step at all (measured on the 421-event corpus),
//      so `laneCurrent` is frequently null. "Nothing lit" is the common case, not an error —
//      the lane still shows its reached steps, just with no pulsing one.

const STEP_W = 104;
const STEP_H = 68; // tall enough for the agent card: label + sub + model·effort·turns + duration
const GAP = 30;
// Body-text size for the step card's sub-title + the model·effort·turns metric + the duration
// (the card TITLE stays 9/bold above them). One knob so the card body reads at one size.
const STEP_BODY_FONT = 8.5;
const PAD = 14;
const BACK_LANE_H = 34; // vertical room under the row for back-edges

// Which lifecycle node each lane sits inside, and which node's arrival proves the lane is
// finished. The lane's own step predicates cannot answer either question: `b-perm` only lights
// on a supersession (so a clean run never reaches every build step), and no plan step matches
// `breakdown` (so a feature's planning can complete without lighting one). The lifecycle nodes
// are the honest signal, and this is the single place that mapping lives.
const LANE_NODE: Record<LaneId, { own: string; after: string[] }> = {
  plan: { own: "plan", after: ["design", "build"] },
  design: { own: "design", after: ["build", "deploy"] },
  build: { own: "build", after: ["deploy"] },
  // The combined deploy lane spans TWO lifecycle nodes (deploy + promote), so no single "after"
  // node proves it finished — and `promote` being reached must NOT read as complete while promote
  // is still running. Its only honest completion signal is the run itself ending, so `after` is
  // empty and completion falls to the `state.lane === "complete"` clause in `movedOn` (as build
  // already does). Until then it reads "active"/"in progress" whenever the playhead sits in either
  // the deploy or promote node.
  deploy: { own: "deploy", after: [] },
};

// The gate each lane's terminal gate step reflects. Lane gates are human-decided and never
// appear in laneSteps, so their status comes from state.gates.
// The deploy lane is a combined deploy+promote lane; these are its PROMOTE-section steps, so the
// header dot strip can group promote lights apart from the deploy lights (with a divider between).
const PROMOTE_STEP_IDS = new Set(["dp-pr", "dp-ci", "dp-promgate", "dp-merge", "dp-promote-hil"]);
// The plan lane's INTAKE section (the PO's overview/nfrs), split off from the sprint-PLANNING dots
// (propose → sizing → choose → breakdown → plan gate), mirroring the deploy/promote dot split.
const INTAKE_STEP_IDS = new Set(["p-intake", "p-intake-gate"]);

type StepState = "done" | "current" | "pending" | "gate-current" | "escalation-current";

export function LaneGraph({ state, onOpenRole }: { state: DashboardState; onOpenRole?: (role: string, stepId: string) => void }) {
  // The run's active step, from the ONE focus observation. Step ids are unique across lanes, so a
  // single value passed to every lane only matches (lights) in its owning lane. Gate/escalation/idle
  // focus means no step is running (currentStep null); a parked gate is read from state.focus.
  const currentStep = state.focus.kind === "step" ? state.focus.step : null;
  // ALL lanes stay expanded – no accordion – so clicking one never collapses the others. The
  // active lane is highlighted (LanePanel's accent border + header tint); the rest render quietly.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {LANE_IDS.map((laneId) => (
        <LanePanel
          key={laneId}
          laneId={laneId}
          lane={WORKFLOW.lanes[laneId]}
          done={new Set(state.topology.laneSteps[laneId] ?? [])}
          currentStep={currentStep}
          state={state}
          onOpenRole={onOpenRole}
        />
      ))}
    </div>
  );
}

function LanePanel({
  laneId,
  lane,
  done,
  currentStep,
  state,
  onOpenRole,
}: {
  laneId: LaneId;
  lane: Lane;
  done: Set<string>;
  currentStep: string | null;
  state: DashboardState;
  onOpenRole?: (role: string, stepId: string) => void;
}) {
  // Each lane card collapses to just its header (name · status · dot strip) on a header click.
  const [collapsed, setCollapsed] = useState(false);
  // HUMAN gates are excluded from the ratio — a HITL checkpoint is not a work step. Most have no
  // match (never light); the backlog gate DOES carry a match (it lights from the author-requests
  // events), so exclude human gates by (gate && role === null), which catches it too. The automated
  // VERIFY checkpoint (gate:true but role release-engineer) DOES real work and stays counted.
  const lightable = lane.steps.filter((s) => s.match !== null && !(s.gate && s.role === null));
  const reached = lightable.filter((s) => done.has(s.id)).length;
  // Active = this lane owns the focus. Either the running step is in THIS lane (step ids are unique
  // per lane), OR the run is PARKED at a gate whose lane step is in THIS lane — so the deploy/promote
  // lane lights (purple, via activeColorForFocus) while parked at the deploy gate, not just the gate
  // node's dot. A gate park has currentStep null, which is why the step check alone missed it.
  const gateStep = state.focus.kind === "gate" ? GATE_STEP_BY_KEY[state.focus.gate] : null;
  const active =
    (currentStep !== null && lane.steps.some((s) => s.id === currentStep)) ||
    (gateStep != null && lane.steps.some((s) => s.id === gateStep));
  // The active lane's highlight takes the CURRENT ACTOR's colour (the same one focus key every
  // surface reads): the working agent's role colour, not a fixed slate. A lane is only `active` when
  // a step is running in it, so this resolves to that agent's colour; slate stays the orchestrator-
  // in-charge / gate / escalation cases, which don't light a lane panel.
  const accent = activeColorForFocus(state.focus);

  // Lane status takes the LIFECYCLE as its sole authority. The lane's own lit-step count is
  // NOT evidence about completion in either direction, and both directions were shipped bugs:
  //
  //   - A lane can finish without lighting every step (`b-perm` only lights on a supersession)
  //     or even ANY step (no plan predicate matches `breakdown`, the sole plan phase attributed
  //     to a named feature). Judging by steps alone printed "0/3 steps · not started" directly
  //     beneath a green Plan node in the lifecycle graph.
  //   - Conversely, a later node being reached does NOT mean this lane is done with its own
  //     work — a back-edge can send the run around again.
  //
  // The tempting middle rule — "complete only once every step is lit" — was measured across
  // every prefix fold of both real logs and REFUTED: on the shipped end of the corpus the plan
  // lane sits at 1/3 (0/3 on the live log, where `p-req` never lights at all), so that rule
  // labels a shipped feature's planning "in progress". Lit-step counts cannot tell "finished,
  // some steps never applicable" apart from "still going" — only the lifecycle can.
  //
  // So mid-flight is "the lifecycle is still inside this lane's own node", which is exactly
  // what `activeNode` means. Measured over all 421-event corpus and 380-event live playheads,
  // this never once called a lane complete whose own node had not been passed.
  const passed = new Set(state.topology.passedNodes);
  const nodes = LANE_NODE[laneId];
  const entered = done.size > 0 || passed.has(nodes.own) || nodes.after.some((n) => passed.has(n));
  const movedOn =
    nodes.after.some((n) => passed.has(n)) ||
    // The combined deploy lane (and build behind it) has no single "after" lifecycle node, so it
    // used to fall back to `state.lane === "complete"`. But that lane value is FORCED to "complete"
    // by a feature pin / run-end regardless of the scrubber, so build+deploy wrongly stayed
    // "complete" when you moved (scrubber OR story click) to another story. Tie it to the SCRUBBER:
    // build/deploy are done only once the PLAYHEAD has actually passed promote/ship — the same
    // passed-node test laneFromPlayhead uses for "complete" — so moving to a story that has not
    // reached ship resets the lanes to their reached/total step count.
    ((laneId === "build" || laneId === "deploy") && (passed.has("promote") || passed.has("shipped")));
  const inOwnNode = state.topology.activeNode === nodes.own;
  const complete = !active && !inOwnNode && movedOn;

  const statusLabel = active
    ? "active"
    : complete
      ? "complete"
      : entered
        ? "in progress"
        : "not started";
  // Active lane highlight is NEUTRAL slate (the conductor's colour), not the accent orange that
  // collided with the navigator's role colour. The label uses the strong text (readable on the slate
  // tint); complete/not-started keep their own.
  const statusColor = active ? "var(--text-strong)" : complete ? "var(--status-good-text)" : "var(--text-faint)";

  return (
    <div
      style={{
        // Body carries a subtle tint (surface-panel); only the header band below is the more
        // distinct card surface.
        background: "var(--surface-panel)",
        border: `1px solid ${active ? accent : "var(--border-default)"}`,
        borderRadius: radius.panel,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand lane" : "Collapse lane"}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          // Consistent pane pattern: a distinct header band (card surface) over a flat page body,
          // turning to the in-progress accent when the lane is active.
          background: active ? `color-mix(in srgb, ${accent} 12%, transparent)` : "var(--surface-card)",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--text-strong)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            minWidth: 62,
          }}
        >
          {/* Combined lanes span two lifecycle nodes, so their heading names both: the ship lane
              is deploy / promote, and the plan lane opens with intake (the PO's overview/nfrs) then
              the sprint planning proper – intake / plan. */}
          {laneId === "deploy" ? "deploy / promote" : laneId === "plan" ? "intake / plan" : laneId}
        </span>
        {/* The ratio is suppressed once a lane is complete. "1/7 steps · complete" contradicts
            itself, and the ratio is the half that's misleading: steps that never light are
            invisible to it, so it under-reports a lane that genuinely finished. Keep it while
            the number is actionable (you're watching progress), drop it once it isn't. It
            stays reachable as the dot strip's tooltips. */}
        {complete ? null : (
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {reached}/{lightable.length} steps
          </span>
        )}
        <span style={{ fontSize: "0.68rem", color: statusColor, fontWeight: active ? 700 : 500 }}>
          · {statusLabel}
        </span>
        {/* Dot strip: the whole lane's shape at a glance, so a collapsed lane still says
            something more specific than a fraction. Each dot carries its step's ROLE-AGENT colour
            (a gate its gate colour, a roleless terminal a neutral); dim until its step is REACHED
            (done or current), then lit; the CURRENT step's dot FLASHES (a glow pulse in its colour).
            The combined deploy lane splits its dots into the deploy vs promote sections. */}
        <span style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: "auto" }}>
          {(() => {
            const dot = (s: LaneStep) => {
              // Active from the ONE focus: the running step, the gate the run is parked at, or the
              // escalation terminal it is parked on. focus is mutually exclusive (step XOR gate XOR
              // escalation XOR idle), so nothing double-flashes — no per-surface juggling.
              const gateKey = GATE_KEY_BY_STEP[s.id];
              const parkedGate = state.focus.kind === "gate" && !!gateKey && gateKey === state.focus.gate;
              const parkedEsc = state.focus.kind === "escalation" && s.escalation === true && state.focus.step === s.id;
              const active = s.id === currentStep || parkedGate || parkedEsc;
              const reached = done.has(s.id) || active;
              const dotColor = s.role
                ? colorForRole(s.role)
                : parkedEsc
                  ? "var(--status-critical)"
                  : s.gate
                    ? gateTintFor(s, state)
                    : "var(--border-strong)";
              return (
                <span
                  key={s.id}
                  title={`${s.label} — ${s.sub}`}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: s.gate ? 1 : "50%",
                    background: dotColor,
                    opacity: reached ? 1 : 0.28,
                    transform: s.gate ? "rotate(45deg)" : undefined,
                    // The active light FLASHES (opacity pulse — a box-shadow glow would be clipped
                    // by the card's overflow:hidden).
                    ...(active ? { animation: "lightflash 1.1s ease-in-out infinite" } : {}),
                  }}
                />
              );
            };
            // Raise-to-HIL steps are escalation terminals, not part of the lane's normal cast — no dot.
            const steps = lane.steps.filter((s) => !s.escalation);
            if (laneId === "deploy") {
              const deploySteps = steps.filter((s) => !PROMOTE_STEP_IDS.has(s.id));
              const promoteSteps = steps.filter((s) => PROMOTE_STEP_IDS.has(s.id));
              return (
                <>
                  {deploySteps.map(dot)}
                  <span aria-hidden title="deploy · promote" style={{ width: 1, height: 9, background: "var(--border-strong)", margin: "0 3px", flex: "none" }} />
                  {promoteSteps.map(dot)}
                </>
              );
            }
            // The plan lane opens with INTAKE (the PO's overview/nfrs) then sprint PLANNING; split the
            // dots the same way the deploy lane splits deploy vs promote.
            if (laneId === "plan") {
              const intakeSteps = steps.filter((s) => INTAKE_STEP_IDS.has(s.id));
              const planSteps = steps.filter((s) => !INTAKE_STEP_IDS.has(s.id));
              return (
                <>
                  {intakeSteps.map(dot)}
                  <span aria-hidden title="intake · plan" style={{ width: 1, height: 9, background: "var(--border-strong)", margin: "0 3px", flex: "none" }} />
                  {planSteps.map(dot)}
                </>
              );
            }
            return steps.map(dot);
          })()}
        </span>
        {/* Collapse affordance at the far right of the header band. */}
        <span aria-hidden style={{ fontSize: "0.7rem", color: "var(--text-faint)", marginLeft: 2, width: 10, textAlign: "center" }}>{collapsed ? "▸" : "▾"}</span>
      </div>

      {collapsed ? null : (
        <div style={{ borderTop: `1px solid var(--border-default)`, padding: "10px 12px" }}>
          <LaneSvg laneId={laneId} lane={lane} done={done} currentStep={currentStep} state={state} onOpenRole={onOpenRole} />
        </div>
      )}
    </div>
  );
}

function gateTintFor(step: LaneStep, state: DashboardState): string {
  // A gate dot is purple ONLY while it is the gate the run is currently parked at (the ONE focus).
  // A passed or upcoming gate is neutral — purple never lingers on a gate the run has moved past.
  const key = GATE_KEY_BY_STEP[step.id];
  return key && state.focus.kind === "gate" && key === state.focus.gate ? "var(--status-gate)" : "var(--border-strong)";
}

// --------------------------------------------------------------------------- the graph

const ROW_GAP = 54; // vertical room between the build lane's two rows, for the connecting arrows + labels
const TOP_LANE = 24; // headroom ABOVE row 0 so a backward loop arc (REVIEW→RED) is not cropped

function LaneSvg({
  laneId,
  lane,
  done,
  currentStep,
  state,
  onOpenRole,
}: {
  laneId: LaneId;
  lane: Lane;
  done: Set<string>;
  currentStep: string | null;
  state: DashboardState;
  onOpenRole?: (role: string, stepId: string) => void;
}) {
  // The BUILD lane is a fixed 3-row grid (col = grid slot, so steps ALIGN across rows): row 0 is
  // the happy path, row 1 is ASSESS placed directly under VERIFY (col 2), row 2 is the fan-out
  // (repair/perm/hil) centred under assess. Every other lane is a single row in declared order.
  const pos = new Map<string, { x: number; y: number; row: number; col: number }>();
  // y is filled in AFTER we know how much top headroom this lane actually needs (see topLane below).
  const place = (id: string, row: number, col: number) =>
    pos.set(id, { x: PAD + col * (STEP_W + GAP), y: 0, row, col });
  let nRows: number;
  if (laneId === "build") {
    const grid: Record<string, [number, number]> = {
      "b-red": [0, 0], "b-green": [0, 1], "b-verify": [0, 2], "b-review": [0, 3], "b-refactor": [0, 4], "b-accept": [0, 5],
      "b-assess": [1, 2],
      "b-repair": [2, 1], "b-perm": [2, 2], "b-hil": [2, 3],
    };
    lane.steps.forEach((s) => place(s.id, ...(grid[s.id] ?? [0, 0])));
    nRows = 3;
  } else if (laneId === "deploy") {
    // The combined ship lane, also a 3-row grid. Row 0 is the happy path with a one-column GAP
    // (col 3) between the Deploy section (dp-deploy…dp-gate) and the Promote section (dp-pr…
    // dp-merge) — LaneGraph draws a divider + section labels there so the single lane reads as two
    // phases. dp-gate→dp-pr therefore skips the empty gap column (arc-below, handled by `edge`).
    // Row 1 is the deploy-verify self-heal: dp-assess under dp-verify, dp-refactor to its left, and
    // the raise-to-HIL terminal (dp-hil) to the RIGHT of dp-assess (so assess→HIL reads as a straight
    // same-row edge). Two rows total.
    const grid: Record<string, [number, number]> = {
      "dp-deploy": [0, 0], "dp-verify": [0, 1], "dp-gate": [0, 2],
      "dp-pr": [0, 4], "dp-ci": [0, 5], "dp-promgate": [0, 6], "dp-merge": [0, 7],
      "dp-refactor": [1, 0], "dp-assess": [1, 1], "dp-hil": [1, 2],
      "dp-promote-hil": [1, 5],
    };
    lane.steps.forEach((s) => place(s.id, ...(grid[s.id] ?? [0, 0])));
    nRows = 2;
  } else {
    // Every other lane: the main steps run along row 0 in declared order; a raise-to-HIL escalation
    // terminal DROPS to row 1, aligned to the COLUMN of the node that raises it (its backEdge
    // source), so it sits directly under that node (p-hil under author-requests, d-hil under the
    // Navigator reflect). A lane with no escalation stays a single row.
    const mainSteps = lane.steps.filter((s) => !s.escalation);
    const colOf = new Map<string, number>();
    mainSteps.forEach((s, c) => {
      place(s.id, 0, c);
      colOf.set(s.id, c);
    });
    const escalations = lane.steps.filter((s) => s.escalation);
    escalations.forEach((s) => {
      const raiser = lane.backEdges.find(([, to]) => to === s.id)?.[0];
      place(s.id, 1, raiser !== undefined ? (colOf.get(raiser) ?? 0) : 0);
    });
    nRows = escalations.length > 0 ? 2 : 1;
  }
  const maxCol = Math.max(0, ...[...pos.values()].map((p) => p.col));

  // Reserve top/bottom headroom ONLY for the arcs a lane actually draws, so a lane with no loops
  // (e.g. plan) doesn't carry dead space above and below its single row. An ABOVE arc is a same-row
  // backward loop on row 0 of a multi-row lane (build's next-cycle); a BELOW arc is any other
  // same-row backward loop, or a forward skip that has to arc under an intervening box.
  let hasAbove = false;
  let hasBelow = false;
  let belowLabeled = false; // a below arc that carries a text label needs extra room for it
  const considerArc = (from: string, to: string, label?: string) => {
    const p = pos.get(from);
    const q = pos.get(to);
    if (!p || !q || p.row !== q.row) return;
    if (q.col < p.col) {
      if (p.row === 0 && nRows > 1) hasAbove = true;
      else {
        hasBelow = true;
        if (label) belowLabeled = true;
      }
    } else if (q.col > p.col && [...pos.values()].some((v) => v.row === p.row && v.col > p.col && v.col < q.col)) {
      hasBelow = true;
      if (label) belowLabeled = true;
    }
  };
  lane.edges.forEach(([f, t]) => considerArc(f, t));
  lane.backEdges.forEach(([f, t, label]) => considerArc(f, t, label));
  const topLane = hasAbove ? TOP_LANE : 8;
  // A labeled below arc (design's "revise on findings") needs the full band; an unlabeled one
  // (deploy's assess→refactor) only needs room for the ~16px dip — so deploy doesn't carry the
  // label's dead space; a lane with no below arc reserves almost nothing.
  const backLaneH = hasBelow ? (belowLabeled ? BACK_LANE_H : 20) : 8;
  for (const p of pos.values()) p.y = PAD + topLane + p.row * (STEP_H + ROW_GAP);

  const width = PAD * 2 + (maxCol + 1) * STEP_W + maxCol * GAP;
  const height = PAD * 2 + topLane + nRows * STEP_H + (nRows - 1) * ROW_GAP + backLaneH;
  const cx = (id: string) => pos.get(id)!.x + STEP_W / 2;
  const cy = (id: string) => pos.get(id)!.y + STEP_H / 2;

  // Deploy lane only: a subtle vertical divider + "deploy" / "promote" section labels in the gap
  // column, so the one combined lane visibly reads as its two phases. Everything derives from the
  // placed boxes, so it tracks the layout automatically.
  const deploySep =
    laneId === "deploy" && pos.has("dp-gate") && pos.has("dp-pr")
      ? (() => {
          const gate = pos.get("dp-gate")!;
          const pr = pos.get("dp-pr")!;
          return {
            x: (gate.x + STEP_W + pr.x) / 2,
            top: PAD + topLane - 3,
            // Through the last row (self-heal / HIL), not just row 0, so the divider spans the lane.
            bottom: PAD + topLane + nRows * STEP_H + (nRows - 1) * ROW_GAP + 8,
            labelY: PAD + topLane - 9,
            deployMid: (pos.get("dp-deploy")!.x + gate.x + STEP_W) / 2,
            promoteMid: (pr.x + pos.get("dp-merge")!.x + STEP_W) / 2,
          };
        })()
      : null;

  // Route ONE edge from its two endpoint boxes: same-row forward = a straight line; same-row
  // backward (REVIEW→RED, the next dev loop) = an arc ABOVE the row so it never crosses the row
  // below; cross-row = an elbow that drops/rises between the two rows. Branch (failure-arm) edges
  // are amber + dashed and carry their label; happy-path edges go green once traversed.
  const edge = (
    from: string,
    to: string,
    o: { branch?: boolean; label?: string; enterSide?: "left" | "right"; dropFrac?: number; labelBelow?: boolean },
  ) => {
    const p = pos.get(from);
    const q = pos.get(to);
    if (!p || !q) return null;
    // Happy-path edges are all uniform grey (no traversed-vs-not distinction); only branch/failure
    // edges stand out in amber. Progress reads from the pulsing active step, not the edges.
    const sameRow = p.row === q.row;
    // The build dev-loop back-edge (REVIEW/refactor → RED, a same-row backward hop) reads GREEN so
    // its dashed line matches its "next cycle" label; branch/failure edges are amber; every other
    // happy-path edge is grey.
    const nextCycle = sameRow && q.col < p.col && !o.branch;
    // An edge whose TARGET is a raise-to-HIL escalation terminal is RED, not the amber of the
    // recoverable failure branches (assess -> repair/perm) , escalating to a human is not a self-heal.
    const toEscalation = lane.steps.find((s) => s.id === to)?.escalation === true;
    const stroke = o.branch
      ? toEscalation
        ? "var(--status-critical)"
        : "var(--status-warning)"
      : nextCycle
        ? "var(--status-good-text)"
        : "var(--border-strong)";
    const marker = o.branch
      ? toEscalation
        ? "url(#lg-arrow-escalation)"
        : "url(#lg-arrow-branch)"
      : nextCycle
        ? "url(#lg-arrow-cycle)"
        : "url(#lg-arrow)";
    let d: string;
    let lx = 0;
    let ly = 0;
    if (sameRow && q.col === p.col + 1) {
      // adjacent forward: straight line
      d = `M ${p.x + STEP_W} ${cy(from)} H ${q.x - 4}`;
      lx = (p.x + STEP_W + q.x) / 2;
      ly = cy(from) - 4;
    } else if (sameRow && q.col > p.col) {
      // Forward but skips column(s). If a BOX sits in between (assess→perm over repair) arc BELOW so
      // the line never crosses it (a phantom edge); if the skipped column is EMPTY (the deploy→promote
      // gap) draw a straight HORIZONTAL line across it, through the section divider.
      const intervening = [...pos.values()].some((v) => v.row === p.row && v.col > p.col && v.col < q.col);
      if (!intervening) {
        d = `M ${p.x + STEP_W} ${cy(from)} H ${q.x - 4}`;
        lx = (p.x + STEP_W + q.x) / 2;
        ly = cy(from) - 4;
      } else {
        const yy = p.y + STEP_H + 14;
        d = `M ${cx(from)} ${p.y + STEP_H} V ${yy} H ${cx(to)} V ${q.y + STEP_H}`;
        lx = (cx(from) + cx(to)) / 2;
        ly = yy + 9;
      }
    } else if (sameRow) {
      // Backward same-row loop. In a multi-row lane, row 0's loop (REVIEW→RED) arcs ABOVE, into the
      // TOP_LANE headroom (never crossing the row below); a single-row lane's loop (design's
      // navigator→spec-author revise) arcs BELOW, into the reserved BACK_LANE_H. Either way it stays
      // inside the viewBox – the crop was a backward arc routed to a negative y.
      const above = p.row === 0 && nRows > 1;
      const yy = above ? p.y - 16 : p.y + STEP_H + 16;
      d = `M ${cx(from)} ${above ? p.y : p.y + STEP_H} V ${yy} H ${cx(to)} V ${above ? q.y : q.y + STEP_H}`;
      lx = (cx(from) + cx(to)) / 2;
      ly = above ? yy - 3 : yy + 9;
    } else if (q.row > p.row && o.enterSide) {
      // Drop into the lower row, then run horizontally into the target's LEFT or RIGHT edge. The
      // promote fail lines converge on the promote-side raise-to-HIL from both sides – prepare-pr
      // enters the left edge, merge the right – so the two arrows don't stack on one face.
      const endX = o.enterSide === "right" ? q.x + STEP_W + 4 : q.x - 4;
      d = `M ${cx(from)} ${p.y + STEP_H} V ${cy(to)} H ${endX}`;
      lx = (cx(from) + endX) / 2;
      ly = cy(to) - 4;
    } else if (q.row > p.row) {
      const yy = (p.y + STEP_H + q.y) / 2; // drop into the lower row
      // The vertical drop leaves the box at `dropFrac` across its bottom edge (default centre). The
      // build fan-out spreads its drops — regression at 1/3, genuine at 2/3 — so the arrows have
      // room between them instead of stacking on one centre column.
      const dropX = p.x + STEP_W * (o.dropFrac ?? 0.5);
      d = `M ${dropX} ${p.y + STEP_H} V ${yy} H ${cx(to)} V ${q.y - 4}`;
      lx = (dropX + cx(to)) / 2;
      // Labels sit above the horizontal run by default; supersession's centred drop sits its label
      // BELOW so it clears the regression/genuine labels above the fan-out lines.
      ly = o.labelBelow ? yy + 11 : yy - 3;
    } else {
      const yy = (q.y + STEP_H + p.y) / 2; // rise into the upper row
      d = `M ${cx(from)} ${p.y} V ${yy} H ${cx(to)} V ${q.y + STEP_H + 4}`;
      lx = (cx(from) + cx(to)) / 2;
      ly = yy - 3;
    }
    const dashed = o.branch || (sameRow && q.col < p.col);
    // A happy-path same-row backward edge is the cycle loop (build's REVIEW→RED) – label it
    // "next cycle" so the green line reads as the next dev loop, not a re-verify. Branch labels
    // (verify fails / regression / re-verify) stay amber; the cycle-loop label is neutral.
    const labelText = o.label ?? (sameRow && q.col < p.col && !o.branch ? "next cycle" : undefined);
    // Branch labels (verify fails / regression / re-verify) are amber; the happy-path "next cycle"
    // label reads green to match its loop line – not muted.
    const labelFill = o.branch ? (toEscalation ? "var(--status-critical-text)" : "var(--status-warning-text)") : "var(--status-good-text)";
    return (
      <g key={`${from}->${to}`}>
        <path
          d={d}
          fill="none"
          style={{ stroke }}
          strokeWidth={1.4}
          strokeDasharray={dashed ? "4 3" : undefined}
          markerEnd={marker}
          opacity={o.branch ? 0.85 : 1}
        />
        {labelText ? (
          <text x={lx} y={ly} textAnchor="middle" style={{ fontSize: 7.5, fill: labelFill, fontFamily: font.sans }}>
            {labelText}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: "block", minWidth: Math.min(width, 720), maxHeight: height + 16 }}
        role="img"
        aria-label={lane.title}
      >
        <defs>
          <marker id="lg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--border-strong)" }} />
          </marker>
          <marker id="lg-arrow-branch" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--status-warning)" }} />
          </marker>
          <marker id="lg-arrow-escalation" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--status-critical)" }} />
          </marker>
          <marker id="lg-arrow-cycle" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--status-good-text)" }} />
          </marker>
        </defs>

        {deploySep ? (
          <g>
            <line
              x1={deploySep.x}
              y1={deploySep.top}
              x2={deploySep.x}
              y2={deploySep.bottom}
              style={{ stroke: "var(--border-strong)" }}
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={0.6}
            />
            {(["deploy", "promote"] as const).map((label) => (
              <text
                key={label}
                x={label === "deploy" ? deploySep.deployMid : deploySep.promoteMid}
                y={deploySep.labelY}
                textAnchor="middle"
                style={{
                  fontSize: 7.5,
                  fill: "var(--text-faint)",
                  fontFamily: font.sans,
                  textTransform: "uppercase",
                  letterSpacing: "0.09em",
                }}
              >
                {label}
              </text>
            ))}
          </g>
        ) : null}

        {lane.edges.map(([from, to]) => edge(from, to, {}))}
        {lane.backEdges.map((be) =>
          edge(be[0], be[1], {
            branch: true,
            label: be[2],
            // Promote fail lines converge on the promote-side raise-to-HIL: prepare-pr enters its
            // LEFT edge, merge its RIGHT edge; wait-ci (directly above) drops into the top.
            enterSide:
              be[1] === "dp-promote-hil"
                ? be[0] === "dp-merge"
                  ? "right"
                  : be[0] === "dp-pr"
                    ? "left"
                    : undefined
                : undefined,
            // Spread the build assess→ fan-out: regression drops at 1/3 across the box, genuine at
            // 2/3, so their down-lines (and arrows) sit apart from supersession's centred drop.
            dropFrac:
              be[0] === "b-assess" && be[1] === "b-repair"
                ? 1 / 3
                : be[0] === "b-assess" && be[1] === "b-hil"
                  ? 2 / 3
                  : undefined,
            // Supersession's centred drop sits its label BELOW the horizontal fan-out lines so it
            // doesn't collide with the regression/genuine labels above.
            labelBelow: be[0] === "b-assess" && be[1] === "b-perm",
          }),
        )}

        {lane.steps.map((s) => {
          // For the CURRENT step, surface the elapsed working time. Only the current step needs it,
          // so the lookup + Date.now() cost is paid once per lane.
          const agent = s.id === currentStep && s.role ? state.agents.find((a) => a.role === s.role) : undefined;
          const elapsed = agent?.turnStartTs ? fmtElapsed(Math.max(0, Date.now() - Date.parse(agent.turnStartTs))) : null;
          return (
            <StepBox
              key={s.id}
              step={s}
              x={pos.get(s.id)!.x}
              y={pos.get(s.id)!.y}
              state={stepState(s, done, currentStep, state)}
              meta={state.laneStepMeta?.[s.id] ?? null}
              elapsed={elapsed}
              onOpenRole={onOpenRole}
            />
          );
        })}
      </svg>
    </div>
  );
}

function stepState(
  s: LaneStep,
  done: Set<string>,
  currentStep: string | null,
  state: DashboardState,
): StepState {
  if (s.id === currentStep) return "current";
  // The ONE gate the run is parked at pulses ("gate-current"); the escalation terminal the run is
  // parked on pulses red ("escalation-current"). Both read from the single focus. Every OTHER gate —
  // passed or upcoming — is neutral; purple/red is only ever the currently-parked one.
  const gateKey = GATE_KEY_BY_STEP[s.id];
  if (gateKey && state.focus.kind === "gate" && gateKey === state.focus.gate) return "gate-current";
  // Only the ONE HIL terminal the run is parked on flashes red — not every lane's raise-to-HIL box.
  if (s.escalation && state.focus.kind === "escalation" && state.focus.step === s.id) return "escalation-current";
  if (done.has(s.id)) return "done";
  // A gate that has been REACHED (approved, or its later sibling reached) reads as done, not pending,
  // so the label dims like any passed step (colour is neutral either way).
  if (s.gate) {
    const g = gateKey ? state.gates.find((x) => x.name === gateKey) : undefined;
    if (g) return "done";
  }
  return "pending";
}

// A fail/side path: arcs below the row, labelled, in warning amber so it never reads as the
// happy path. `depth` staggers concentric arcs so multiple back-edges don't overlap.
function BackEdgeArc({
  be,
  xs,
  midY,
  depth,
}: {
  be: BackEdge;
  xs: Map<string, number>;
  midY: number;
  depth: number;
}) {
  const [from, to, label] = be;
  const a = xs.get(from);
  const b = xs.get(to);
  if (a === undefined || b === undefined) return null;
  const y = midY + STEP_H / 2 + 16 + depth * 9;
  const ax = a + STEP_W / 2;
  const bx = b + STEP_W / 2;
  return (
    <g>
      <path
        d={`M ${ax} ${midY + STEP_H / 2} C ${ax} ${y}, ${bx} ${y}, ${bx} ${midY + STEP_H / 2}`}
        fill="none"
        style={{ stroke: "var(--status-warning)" }}
        strokeWidth={1.2}
        strokeDasharray="3 3"
        markerEnd="url(#lg-arrow-branch)"
        opacity={0.75}
      />
      <text
        x={(ax + bx) / 2}
        y={y - 1}
        textAnchor="middle"
        style={{ fontSize: 7.5, fill: "var(--status-warning-text)", fontFamily: font.sans }}
      >
        {label}
      </text>
    </g>
  );
}

function StepBox({
  step,
  x,
  y,
  state,
  meta,
  elapsed,
  onOpenRole,
}: {
  step: LaneStep;
  x: number;
  y: number;
  state: StepState;
  meta?: LaneStepMeta | null;
  elapsed?: string | null; // current step only: formatted time since the turn started
  onOpenRole?: (role: string, stepId: string) => void;
}) {
  const isGate = step.gate === true;

  // Colour comes from WHICH kind of thing is the current locus — the ONE focus decides it:
  //   active turn ("current")        → the agent's colour (or accent if roleless)
  //   parked gate ("gate-current")   → purple
  //   parked escalation ("escalation-current") → critical red
  //   everything else — a passed or upcoming gate, an inactive escalation terminal, a done step —
  //   is NEUTRAL. Purple/red never linger on a gate/terminal the run has moved past; only the
  //   currently-parked one lights. All three get the WHITE pulse + thick border (the `highlighted`).
  const active = state === "current"; // the current turn
  const gateWaiting = state === "gate-current"; // the parked human gate
  const escalationActive = state === "escalation-current"; // the escalation the run is parked on
  const highlighted = active || gateWaiting || escalationActive;
  const stroke = active
    ? step.role
      ? colorForRole(step.role)
      : "var(--status-accent)"
    : gateWaiting
      ? "var(--status-gate)"
      : escalationActive
        ? "var(--status-critical)"
        : "var(--border-default)";

  // A LIGHT tint in the locus's own colour. color-mix is required because colorForRole returns a
  // `var(--role-*)` and you cannot append an alpha to a var(). Sits on TOP of the opaque backing
  // rect, so the outside-only white glow is unaffected and nothing bleeds through the tint.
  const fill = active
    ? `color-mix(in srgb, ${step.role ? colorForRole(step.role) : "var(--status-accent)"} 7%, transparent)`
    : gateWaiting
      ? "color-mix(in srgb, var(--status-gate) 7%, transparent)"
      : escalationActive
        ? "color-mix(in srgb, var(--status-critical) 7%, transparent)"
        : "var(--surface-inset)";

  // The pulse glows WHITE, exactly like the bubble cards (their softpulse glows in currentColor,
  // which is --text-strong — white on the dark theme). The border, not the glow, carries the colour.
  const glowColor = "var(--text-strong)";

  // A role-bearing step opens that agent's turn drill-down — the SAME behavior as clicking its
  // Current-State bubble. Gate steps (b-accept / p-gate / d-gate / b-verify) and escalation
  // terminals (b-hil / p-hil / d-hil) carry no role and stay inert. Not gate-controlled: opening a
  // role panel is a safe fallback even with no recorded turn, exactly like the bubble.
  const clickable = step.role != null && !!onOpenRole;
  const open = clickable ? () => onOpenRole!(step.role!, step.id) : undefined;
  const title = `${step.label} — ${step.sub}${isGate ? " (human gate)" : ""}${
    step.branch ? " (branch: only on failure)" : ""
  } · ${state.replace("gate-", "gate ")}${clickable ? ` · open ${step.role}'s turn` : ""}`;

  // Per-step agent-card metric: "model · effort · turns" (or "model · turns" when there's no effort),
  // from the step's phase.start + the turns credited to it. Turns are 0 on a replay corpus, so they
  // drop out there. Cost is summarized in the run-vitals card, not per step. filter(Boolean) keeps the
  // separators tight — no buffered gap where a missing part would be.
  const turnsStr = meta && meta.turns > 0 ? `${meta.turns} turn${meta.turns === 1 ? "" : "s"}` : null;
  const modelLine =
    meta && (meta.model || meta.effort || turnsStr) ? [meta.model, meta.effort, turnsStr].filter(Boolean).join(" · ") : null;

  return (
    <g
      style={{
        ...(clickable ? { cursor: "pointer" } : {}),
      }}
      onClick={open}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open ${step.role}'s turn` : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open!();
              }
            }
          : undefined
      }
    >
      <title>{title}</title>
      {/* The pulse glows OUTSIDE the box only. The drop-shadow rides on this OPAQUE backing rect
          drawn BEHIND the real box (same geometry, filled with the panel's own colour), so its glow
          extends past the edges but is hidden behind the box itself — the interior never pulses, even
          when the box's own fill is a translucent tint (a parked gate's gate-tint). glowpulse animates
          an SVG-honoured drop-shadow in currentColor: the agent's colour, or gate-purple for a parked
          gate. This pulse is the ONLY cue for the active step. */}
      {highlighted ? (
        <rect
          x={x}
          y={y}
          width={STEP_W}
          height={STEP_H}
          rx={isGate ? 4 : 8}
          style={{ fill: "var(--surface-card)", animation: "glowpulse 2s ease-in-out infinite", color: glowColor }}
        />
      ) : null}
      <rect
        x={x}
        y={y}
        width={STEP_W}
        height={STEP_H}
        rx={isGate ? 4 : 8}
        style={{ fill, stroke }}
        strokeWidth={highlighted ? 2.5 : 1.4}
        strokeDasharray={step.branch ? "5 3" : undefined}
      />
      {/* Role bar: the agent's colour as a bar along the TOP edge, tying the card to its bubble.
          Clipped to the box so its top corners share the box's curvature (same rx) instead of
          overhanging the rounded corner. Full strength in EVERY state. Gates have no owner. */}
      {step.role ? (
        <>
          <clipPath id={`lg-clip-${step.id}`}>
            <rect x={x} y={y} width={STEP_W} height={STEP_H} rx={isGate ? 4 : 8} />
          </clipPath>
          <rect
            x={x}
            y={y}
            width={STEP_W}
            height={4}
            clipPath={`url(#lg-clip-${step.id})`}
            style={{ fill: colorForRole(step.role) }}
          />
        </>
      ) : null}
      <text
        x={x + STEP_W / 2}
        y={y + 15}
        textAnchor="middle"
        style={{
          fontSize: 9,
          fontWeight: 700,
          fill: "var(--text-strong)", // the card TITLE is always the strong text colour (white on dark)
          fontFamily: font.sans,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {step.label}
      </text>
      <text
        x={x + STEP_W / 2}
        y={y + 28}
        textAnchor="middle"
        style={{
          fontSize: STEP_BODY_FONT,
          // On the active turn / parked gate the non-white text takes the border colour (the agent's
          // colour for a turn, gate-purple for a parked gate).
          fill: highlighted ? stroke : state === "pending" ? "var(--text-faint)" : "var(--text-muted)",
          fontFamily: font.sans,
        }}
      >
        {truncate(step.sub, 22)}
      </text>
      {/* Agent card metric: "model · effort · turns" centered (from the step's phase.start + credited
          turns). Only for steps a turn has reached; a deterministic/not-yet-run step shows none. A
          divider rule sets the data half apart from the label. */}
      {modelLine || (active && elapsed) ? (
        <line x1={x + 8} y1={y + 36} x2={x + STEP_W - 8} y2={y + 36} style={{ stroke: "var(--border-default)" }} strokeWidth={0.5} />
      ) : null}
      {modelLine ? (
        <text
          x={x + STEP_W / 2}
          y={y + 49}
          textAnchor="middle"
          style={{ fontSize: STEP_BODY_FONT, fill: highlighted ? stroke : "var(--text-muted)", fontFamily: font.mono }}
        >
          {truncate(modelLine, 28)}
        </text>
      ) : null}
      {/* Elapsed working DURATION on the active step — moved to the BOTTOM row (turns took its old
          spot on the metric line above), centered, in the active colour. */}
      {active && elapsed ? (
        <text x={x + STEP_W / 2} y={y + 60} textAnchor="middle" style={{ fontSize: STEP_BODY_FONT, fill: stroke, fontFamily: font.mono }}>
          {elapsed}
        </text>
      ) : null}
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
