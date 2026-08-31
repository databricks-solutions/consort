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
import { colorForRole, font, radius } from "@/lib/theme";
import type { DashboardState } from "@/lib/types";

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
const STEP_H = 46;
const GAP = 30;
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
};

// The gate each lane's terminal gate step reflects. Lane gates are human-decided and never
// appear in laneSteps, so their status comes from state.gates.
const LANE_STEP_GATE: Record<string, string> = {
  "p-gate": "plan",
  "d-gate": "spec",
};

type StepState = "done" | "current" | "pending" | "gate-open" | "gate-approved";

export function LaneGraph({ state }: { state: DashboardState }) {
  const current = state.topology.laneCurrent;
  // The lane to expand by default: where the playhead is, else the furthest lane the run has
  // entered, so a paused or finished run still shows something substantive rather than Plan.
  const reached = LANE_IDS.filter((l) => (state.topology.laneSteps[l] ?? []).length > 0);
  // `laneCurrent.lane` is typed `string` (DashboardState is the wire format, and a replay
  // source in Phase 2 may not share this vocabulary), so validate rather than cast: an
  // unrecognised name used to match no panel and silently collapse all three lanes.
  const currentLane = LANE_IDS.find((l) => l === current?.lane) ?? null;
  const defaultOpen = currentLane ?? reached[reached.length - 1] ?? "plan";
  const [open, setOpen] = useState<LaneId | null>(null);
  // `open` is an explicit user choice; until they make one, follow the playhead. This means
  // the expanded lane tracks the run while it moves, but stops fighting the user once they
  // have clicked — a controlled-with-a-default pattern, not a stale copy of derived state.
  const expanded = open ?? defaultOpen;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {LANE_IDS.map((laneId) => {
        const lane = WORKFLOW.lanes[laneId];
        const done = new Set(state.topology.laneSteps[laneId] ?? []);
        const isExpanded = laneId === expanded;
        return (
          <LanePanel
            key={laneId}
            laneId={laneId}
            lane={lane}
            done={done}
            currentStep={currentLane === laneId ? current!.step : null}
            expanded={isExpanded}
            onToggle={() => setOpen(isExpanded ? null : laneId)}
            state={state}
          />
        );
      })}
    </div>
  );
}

function LanePanel({
  laneId,
  lane,
  done,
  currentStep,
  expanded,
  onToggle,
  state,
}: {
  laneId: LaneId;
  lane: Lane;
  done: Set<string>;
  currentStep: string | null;
  expanded: boolean;
  onToggle: () => void;
  state: DashboardState;
}) {
  // Gates are excluded from the ratio: they never light from events, so counting them would
  // cap every lane below 100% forever.
  const lightable = lane.steps.filter((s) => s.match !== null);
  const reached = lightable.filter((s) => done.has(s.id)).length;
  const active = currentStep !== null;

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
  const movedOn = nodes.after.some((n) => passed.has(n)) || (laneId === "build" && state.lane === "complete");
  const inOwnNode = state.topology.activeNode === nodes.own;
  const complete = !active && !inOwnNode && movedOn;

  const statusLabel = active
    ? "active"
    : complete
      ? "complete"
      : entered
        ? "in progress"
        : "not started";
  const statusColor = active ? "var(--status-accent-text)" : complete ? "var(--status-good-text)" : "var(--text-faint)";

  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: `1px solid ${active ? "var(--status-accent)" : "var(--border-default)"}`,
        borderRadius: radius.panel,
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          background: active ? "var(--status-accent-tint-soft)" : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <span style={{ fontSize: "0.6rem", color: "var(--text-faint)", width: 8 }}>{expanded ? "▾" : "▸"}</span>
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
          {laneId}
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
            something more specific than a fraction. */}
        <span style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
          {lane.steps.map((s) => (
            <span
              key={s.id}
              title={`${s.label} — ${s.sub}`}
              style={{
                width: 7,
                height: 7,
                borderRadius: s.gate ? 1 : "50%",
                background:
                  s.id === currentStep
                    ? "var(--status-accent)"
                    : done.has(s.id)
                      ? "var(--status-good)"
                      : s.gate
                        ? gateTintFor(s, state)
                        : "var(--border-strong)",
                transform: s.gate ? "rotate(45deg)" : undefined,
              }}
            />
          ))}
        </span>
      </button>

      {expanded ? (
        <div style={{ borderTop: `1px solid var(--border-default)`, padding: "4px 12px 10px" }}>
          <div style={{ fontSize: "0.66rem", color: "var(--text-faint)", margin: "6px 0 2px" }}>{lane.title}</div>
          <LaneSvg lane={lane} done={done} currentStep={currentStep} state={state} />
        </div>
      ) : null}
    </div>
  );
}

function gateTintFor(step: LaneStep, state: DashboardState): string {
  const gateName = LANE_STEP_GATE[step.id];
  if (!gateName) return "var(--border-strong)";
  const g = state.gates.find((x) => x.name === gateName);
  if (!g) return "var(--border-strong)";
  return g.status === "approved" ? "var(--status-good)" : "var(--status-gate)";
}

// --------------------------------------------------------------------------- the graph

function LaneSvg({
  lane,
  done,
  currentStep,
  state,
}: {
  lane: Lane;
  done: Set<string>;
  currentStep: string | null;
  state: DashboardState;
}) {
  // One row, left to right, in declared order. Back-edges arc underneath.
  const xs = new Map<string, number>();
  lane.steps.forEach((s, i) => xs.set(s.id, PAD + i * (STEP_W + GAP)));
  const width = PAD * 2 + lane.steps.length * STEP_W + (lane.steps.length - 1) * GAP;
  const hasBack = lane.backEdges.length > 0;
  const height = PAD * 2 + STEP_H + (hasBack ? BACK_LANE_H + lane.backEdges.length * 9 : 0);
  const rowY = PAD;
  const midY = rowY + STEP_H / 2;

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
          <marker id="lg-arrow-done" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--status-good)" }} />
          </marker>
          <marker id="lg-arrow-branch" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--status-warning)" }} />
          </marker>
        </defs>

        {lane.edges.map(([from, to]) => {
          const a = xs.get(from);
          const b = xs.get(to);
          if (a === undefined || b === undefined) return null;
          const isDone = done.has(from) && (done.has(to) || to === currentStep);
          // A backward happy-path edge (build's review → red closes the cycle) arcs under.
          if (b < a) {
            const y = midY + STEP_H / 2 + 12;
            return (
              <path
                key={`${from}->${to}`}
                d={`M ${a + STEP_W / 2} ${midY + STEP_H / 2} V ${y} H ${b + STEP_W / 2} V ${midY + STEP_H / 2}`}
                fill="none"
                style={{ stroke: isDone ? "var(--status-good)" : "var(--border-strong)" }}
                strokeWidth={1.4}
                strokeDasharray="4 3"
                markerEnd={isDone ? "url(#lg-arrow-done)" : "url(#lg-arrow)"}
                opacity={0.8}
              />
            );
          }
          return (
            <line
              key={`${from}->${to}`}
              x1={a + STEP_W}
              y1={midY}
              x2={b - 4}
              y2={midY}
              style={{ stroke: isDone ? "var(--status-good)" : "var(--border-strong)" }}
              strokeWidth={isDone ? 2 : 1.4}
              markerEnd={isDone ? "url(#lg-arrow-done)" : "url(#lg-arrow)"}
            />
          );
        })}

        {lane.backEdges.map((be, i) => (
          <BackEdgeArc key={be.join("->")} be={be} xs={xs} midY={midY} depth={i} />
        ))}

        {lane.steps.map((s) => (
          <StepBox
            key={s.id}
            step={s}
            x={xs.get(s.id)!}
            y={rowY}
            state={stepState(s, done, currentStep, state)}
          />
        ))}
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
  if (done.has(s.id)) return "done";
  // Gates never light from events; take their state from the run's gate list so a cleared
  // gate reads as cleared instead of pending forever.
  if (s.gate && s.match === null) {
    const gateName = LANE_STEP_GATE[s.id];
    const g = gateName ? state.gates.find((x) => x.name === gateName) : undefined;
    if (g?.status === "approved") return "gate-approved";
    if (g) return "gate-open";
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

function StepBox({ step, x, y, state }: { step: LaneStep; x: number; y: number; state: StepState }) {
  const isGate = step.gate === true;

  const stroke =
    state === "current"
      ? step.role
        ? colorForRole(step.role)
        : "var(--status-accent)"
      : state === "done" || state === "gate-approved"
        ? "var(--status-good)"
        : state === "gate-open"
          ? "var(--status-gate)"
          : step.branch
            ? "var(--status-warning-soft)"
            : "var(--border-default)";

  const fill =
    state === "current"
      ? "var(--status-accent-tint)"
      : state === "done" || state === "gate-approved"
        ? "var(--status-good-tint)"
        : state === "gate-open"
          ? "var(--status-gate-tint)"
          : "var(--surface-inset)";

  const labelColor =
    state === "current"
      ? "var(--status-accent-text)"
      : state === "done" || state === "gate-approved"
        ? "var(--status-good-text)"
        : "var(--text-faint)";

  const title = `${step.label} — ${step.sub}${isGate ? " (human gate)" : ""}${
    step.branch ? " (branch: only on failure)" : ""
  } · ${state.replace("gate-", "gate ")}`;

  return (
    <g style={state === "current" ? { animation: "softpulse 2s ease-in-out infinite" } : undefined}>
      <title>{title}</title>
      <rect
        x={x}
        y={y}
        width={STEP_W}
        height={STEP_H}
        rx={isGate ? 4 : 8}
        style={{ fill, stroke }}
        strokeWidth={state === "current" ? 2.5 : 1.4}
        strokeDasharray={step.branch ? "5 3" : undefined}
      />
      {/* Role stripe: ties a step to its agent bubble by colour. Gates have no owner. */}
      {step.role ? (
        <rect x={x} y={y} width={3.5} height={STEP_H} rx={1.5} style={{ fill: colorForRole(step.role) }} opacity={state === "pending" ? 0.4 : 1} />
      ) : null}
      <text
        x={x + STEP_W / 2}
        y={y + 18}
        textAnchor="middle"
        style={{
          fontSize: 9,
          fontWeight: 700,
          fill: labelColor,
          fontFamily: font.sans,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {step.label}
      </text>
      <text
        x={x + STEP_W / 2}
        y={y + 32}
        textAnchor="middle"
        style={{ fontSize: 7.5, fill: state === "pending" ? "var(--text-faint)" : "var(--text-muted)", fontFamily: font.sans }}
      >
        {truncate(step.sub, 22)}
      </text>
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
