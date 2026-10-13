"use client";

import { useState } from "react";
import { STEP_OUTPUTS, WORKFLOW, gateForNode, type WorkflowNode } from "@/lib/topology";
import { colorForRole, font, radius } from "@/lib/theme";
import { activeColorForFocus } from "./active-color";
import type { DashboardState, GateInfo } from "@/lib/types";

// The Consort lifecycle graph (Figure 1), rendered in the light theme. Layout is a single
// horizontal spine — intake → plan → design → build → deploy → promote → shipped — with gates
// as narrow diamonds between phases.
//
// Node lighting comes straight from lib/topology.ts:
//   passed  → a phase this run has reached (green)
//   active  → the phase the playhead is in (accent + glow, the active-highlight treatment)
//   dim     → not yet reached
// Gate nodes additionally show approved/surfaced from the run's gate state.
//
// Everything here derives from the folded state, so it works identically at the live edge
// and scrubbed back — the graph is timeline-only data, which does rewind honestly.

const NODE_W = 96;
const NODE_H = 40;
const GATE_W = 26;
const GAP = 26;
const PAD = 16;
const LABEL_H = 30; // room under the spine for role chips

interface Placed {
  node: WorkflowNode;
  x: number;
  w: number;
}

// Lay the spine out left to right, sizing gates narrower than phases.
function layout(): { placed: Placed[]; width: number; height: number } {
  let x = PAD;
  const placed: Placed[] = [];
  for (const node of WORKFLOW.nodes) {
    const w = node.type === "gate" ? GATE_W : NODE_W;
    placed.push({ node, x, w });
    x += w + GAP;
  }
  return { placed, width: x - GAP + PAD, height: PAD * 2 + NODE_H + LABEL_H };
}

const { placed: PLACED, width: SVG_W, height: SVG_H } = layout();
const POS = new Map(PLACED.map((p) => [p.node.id, p]));
const CENTER_Y = PAD + NODE_H / 2;

export function WorkflowGraph({
  state,
  onSelectNode,
  selectedNode,
}: {
  state: DashboardState;
  // Clicking a node opens its step-output deliverables. Optional: omitted when the source has no
  // stepOutputs capability, in which case nodes render exactly as before (no pointer, no click).
  onSelectNode?: (nodeId: string) => void;
  selectedNode?: string | null;
}) {
  // Both folded server-side (see deriveTopology in lib/reducer.ts): the topology is authoritative
  // there and needs the whole prefix, so it is derived once rather than recomputed on the client.
  const passed = new Set(state.topology.passedNodes);
  const activeNode = state.topology.activeNode;
  // The active node's highlight is a NEUTRAL slate (the deterministic conductor's colour), NOT any
  // agent role colour , so "this lane is active" never collides with e.g. the navigator's orange.
  // The human states keep their own: a HIL issue/escalation is red, a parked gate is purple. Which
  // agents own a node is shown by its role DOTS, not the highlight. Reads the ONE focus observation
  // + blockers, so it never disagrees with the other surfaces.
  const focus = state.focus;
  // The active-highlight colour comes from the ONE shared helper: a working agent's role colour, a
  // gate's purple, an escalation's red, or slate when the orchestrator is in charge. Same key every
  // surface uses, so the workflow node, the lane panel, and the step never disagree.
  const activeColor = activeColorForFocus(focus);
  // The gate DIAMOND the run is parked at also highlights (not just the phase node beside it): find
  // the gate node whose gate name is the one the focus is awaiting, and treat it as active too, so it
  // glows in the gate colour (activeColor is the gate colour while focus.kind === "gate").
  const awaitedGateNode =
    focus.kind === "gate" ? WORKFLOW.nodes.find((n) => n.type === "gate" && gateForNode(n.id) === focus.gate)?.id ?? null : null;
  // ...and the PHASE node feeding that gate (the edge INTO it): the deploy gate gates the Release
  // Engineer's Deploy phase, so its node glows purple too — not only the gate diamond — so the agent
  // whose work is under review reads as parked, matching the lane panel + that role's bubble.
  const awaitedGatePhaseNode = awaitedGateNode
    ? WORKFLOW.edges.find(([, to]) => to === awaitedGateNode)?.[0] ?? null
    : null;
  const gateState = new Map(state.gates.map((g: GateInfo) => [g.name, g.status]));

  // The terminal "shipped" node maps to no phase, so the topology fold never lights it — it is the
  // merge's DESTINATION. The promote lane's MERGE sub-step IS the act of shipping, so:
  //   merging      → the active spine node advances Promote → Shipped, in the merge agent's colour
  //   shipped/done → Shipped stays lit STEADILY (no pulse) in the orchestrator's slate
  //   ship issue   → a promote-stage escalation turns Shipped red
  // All three colours already fall out of activeColorForFocus(focus) — merge step = release-engineer,
  // idle = orchestrator slate, escalation = red — so `activeColor` needs no special-casing here.
  const shipMerging = focus.kind === "step" && focus.step === "dp-merge";
  const shipIssue = focus.kind === "escalation" && activeNode === "promote";
  // Done = the run reached promote and nothing is running now (a clean, blocker-free idle). During
  // the merge focus is a step (not idle), so this stays false until the merge completes. But
  // `passed.has("promote")` is sprint-AGNOSTIC — it stays true for the whole run the moment ANY
  // sprint promotes — so once the `shipped → plan` loop carries the playhead into the next sprint,
  // an idle moment would relight Shipped while Plan is the active node (both hot at once). Gate on
  // the playhead NOT having looped back: Shipped is "done" only at the terminal end — activeNode
  // null (a trailing `workflow` phase.end ended the walk) or still on promote — never while a live
  // earlier phase (plan/intake/design/build/deploy) is active for the next sprint.
  const loopedBack = activeNode !== null && activeNode !== "promote" && activeNode !== "shipped";
  const shipDone = focus.kind === "idle" && passed.has("promote") && !loopedBack;
  const shipLit = shipMerging || shipIssue || shipDone;
  // Merging / a ship-stage escalation move the active node off Promote onto Shipped (Promote then
  // reads as reached); a done run keeps activeNode null and lights Shipped steadily instead.
  const spineActiveNode = shipMerging || shipIssue ? "shipped" : activeNode;

  // The current sprint's FEATURE + its current state, shown in the panel's header band — mirroring a
  // lane panel's "lane · status" heading. The active story (if any) is the sharpest state; otherwise
  // the phase. Kept in the header so the section reads like the lanes below it.
  const feature = state.features?.find((f) => f.active)?.id ?? state.feature ?? state.pinnedFeature;
  const activeStory = state.stories?.find((s) => s.active) ?? null;
  const stateLabel = activeStory ? `▸ ${activeStory.id}` : state.phase ?? "in progress";
  // Collapses to just the header (feature · state) on a header click, like the lane cards.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        // Body carries the subtle panel tint; the header band below is the distinct card surface —
        // the same tinted-header/clear-body pattern as the lane panels.
        background: "var(--surface-panel)",
        border: `1px solid var(--border-default)`,
        borderRadius: radius.panel,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand current sprint" : "Collapse current sprint"}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--surface-card)", borderBottom: `1px solid var(--border-default)`, cursor: "pointer" }}
      >
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-strong)", textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 62 }}>
          {feature ?? "sprint"}
        </span>
        <span style={{ fontSize: "0.7rem", fontWeight: activeStory ? 700 : 500, color: activeStory ? "var(--status-accent-text)" : "var(--text-muted)" }}>· {stateLabel}</span>
        <span aria-hidden style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-faint)", width: 10, textAlign: "center" }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {collapsed ? null : (
      <div style={{ padding: "14px 16px", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        style={{ display: "block", minWidth: 680, maxHeight: SVG_H + 20 }}
        role="img"
        aria-label="Consort lifecycle: intake through shipped"
      >
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--border-strong)" }} />
          </marker>
        </defs>

        {WORKFLOW.edges.map(([from, to]) => (
          <Edge key={`${from}->${to}`} from={from} to={to} />
        ))}

        {PLACED.map(({ node, x, w }) => {
          const isShipped = node.id === "shipped";
          const active = isShipped
            ? shipLit
            : node.id === spineActiveNode || node.id === awaitedGateNode || node.id === awaitedGatePhaseNode;
          return (
            <Node
              key={node.id}
              node={node}
              x={x}
              w={w}
              active={active}
              // A shipped-DONE node is lit but at rest (no pulse) — matching the orchestrator card
              // going quiet on completion; merging + a ship issue still pulse, as does any other
              // active node.
              pulse={isShipped ? shipMerging || shipIssue : active}
              passed={passed.has(node.id)}
              activeColor={activeColor}
              gateStatus={gateStatusFor(node, gateState)}
              // Clickable when the node maps to deliverables. Every lifecycle node now has a
              // STEP_OUTPUTS entry (gates open their gates.json decision record), so all nodes +
              // gates are clickable; the guard stays defensive should a future node have none.
              onSelect={onSelectNode && (STEP_OUTPUTS[node.id]?.length ?? 0) > 0 ? onSelectNode : undefined}
              selected={node.id === selectedNode}
            />
          );
        })}
      </svg>
      </div>
      )}
    </div>
  );
}

function gateStatusFor(node: WorkflowNode, gateState: Map<string, string>): string | null {
  if (node.type !== "gate") return null;
  const name = gateForNode(node.id);
  return name ? gateState.get(name) ?? null : null;
}

// `shipped → plan` closes the sprint loop, so it runs back under the spine rather than
// through every intervening node.
function Edge({ from, to }: { from: string; to: string }) {
  const a = POS.get(from);
  const b = POS.get(to);
  if (!a || !b) return null;

  // Uniform grey edges: progress reads from the pulsing ACTIVE node, not from coloured/"traversed"
  // edges — consistent with the lane graph (no green done-edges, e.g. build→deploy).
  const stroke = "var(--border-strong)";
  const marker = "url(#wf-arrow)";

  if (b.x < a.x) {
    const y = CENTER_Y + NODE_H / 2 + 14;
    const d = `M ${a.x + a.w / 2} ${CENTER_Y + NODE_H / 2} V ${y} H ${b.x + b.w / 2} V ${CENTER_Y + NODE_H / 2}`;
    return (
      <path
        d={d}
        fill="none"
        style={{ stroke }}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        markerEnd={marker}
        opacity={0.75}
      />
    );
  }

  return (
    <line
      x1={a.x + a.w}
      y1={CENTER_Y}
      x2={b.x - 4}
      y2={CENTER_Y}
      style={{ stroke }}
      strokeWidth={1.5}
      markerEnd={marker}
    />
  );
}

function Node({
  node,
  x,
  w,
  active,
  pulse,
  passed,
  activeColor,
  gateStatus,
  onSelect,
  selected,
}: {
  node: WorkflowNode;
  x: number;
  w: number;
  active: boolean;
  // Whether the active node pulses. Defaults to `active` (an active node pulses); passed false for a
  // node that should read as lit-but-at-rest (a shipped/done terminal).
  pulse?: boolean;
  passed: boolean;
  activeColor: string;
  gateStatus: string | null;
  onSelect?: (nodeId: string) => void;
  selected?: boolean;
}) {
  const doPulse = pulse ?? active;
  const isGate = node.type === "gate";

  // ONLY the active node is highlighted (accent fill + the active colour's border + pulse), matching
  // the lanes' only-highlight-the-active-step treatment. `activeColor` reflects what is active (issue
  // red / gate purple / working role). A passed or upcoming gate is NEUTRAL — purple/red is only ever
  // the gate the run is currently parked at (the `active` awaitedGateNode); it never lingers on a
  // gate the run has moved past.
  const stroke = active ? activeColor : "var(--border-default)";

  // The active node's FILL is a light tint of the SAME active colour as its border (issue red /
  // gate colour / working role), via color-mix (as the lane steps do), so the node reads in the
  // active thing's colour , not a fixed accent tint that disagreed with the border.
  const fill = active ? `color-mix(in srgb, ${activeColor} 14%, transparent)` : "var(--surface-inset)";

  const label = active
    ? "var(--text-strong)" // standard black (light) / white (dark) per theme, legible on any active-colour tint
    : passed || gateStatus === "approved"
      ? "var(--text-muted)"
      : "var(--text-faint)";

  const title = `${node.label}${isGate ? ` · gate${gateStatus ? `: ${gateStatus}` : ""}` : ""}${
    active ? (node.id === "shipped" && !doPulse ? " · shipped" : " · active now") : passed ? " · reached" : " · not reached"
  }${node.roles.length ? ` · ${node.roles.join(", ")}` : ""}`;

  const clickable = !!onSelect;
  return (
    <g
      onClick={clickable ? () => onSelect!(node.id) : undefined}
      style={{
        cursor: clickable ? "pointer" : undefined,
        // `color: stroke` sets currentColor for the pulse glow; keep it whenever the node is lit so a
        // steady (non-pulsing) done terminal still carries its colour, and pulse only when doPulse.
        ...(active ? { color: stroke } : {}),
        ...(doPulse ? { animation: "softpulse 2s ease-in-out infinite" } : {}),
      }}
    >
      <title>{clickable ? `${title} · click for step outputs` : title}</title>
      {/* Selection ring: a dashed LIME outline (--status-selection, the shared selection accent),
          distinct from the active-now glow/pulse, so a node can read as "selected for its outputs"
          and "active now" at the same time. */}
      {selected ? (
        isGate ? (
          <polygon
            points={`${x + w / 2},${CENTER_Y - NODE_H / 2 - 5} ${x + w + 5},${CENTER_Y} ${x + w / 2},${CENTER_Y + NODE_H / 2 + 5} ${x - 5},${CENTER_Y}`}
            fill="none"
            style={{ stroke: "var(--status-selection)" }}
            strokeWidth={2}
            strokeDasharray="3 2"
          />
        ) : (
          <rect x={x - 4} y={PAD - 4} width={w + 8} height={NODE_H + 8} rx={10} fill="none" style={{ stroke: "var(--status-selection)" }} strokeWidth={2} strokeDasharray="3 2" />
        )
      ) : null}
      {isGate ? (
        // A diamond, so a human decision point never reads as just another phase.
        <polygon
          points={`${x + w / 2},${CENTER_Y - NODE_H / 2} ${x + w},${CENTER_Y} ${x + w / 2},${CENTER_Y + NODE_H / 2} ${x},${CENTER_Y}`}
          style={{ fill, stroke }}
          strokeWidth={active ? 3 : 2}
        />
      ) : (
        <rect
          x={x}
          y={PAD}
          width={w}
          height={NODE_H}
          rx={8}
          style={{ fill, stroke }}
          strokeWidth={active ? 3 : 1.5}
        />
      )}

      {!isGate ? (
        <text
          x={x + w / 2}
          y={CENTER_Y + 4}
          textAnchor="middle"
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            fill: label,
            fontFamily: font.sans,
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          {node.label.replace(/ lane$/, "")}
        </text>
      ) : null}

      {/* Gate labels sit below the diamond; there's no room inside it. */}
      {isGate ? (
        <text
          x={x + w / 2}
          y={CENTER_Y + NODE_H / 2 + 22}
          textAnchor="middle"
          style={{ fontSize: 8, fill: label, fontFamily: font.sans, letterSpacing: "0.02em" }}
        >
          gate
        </text>
      ) : null}

      {/* Role chips under each phase, tinted by role — the graph doubles as a legend. */}
      {!isGate && node.roles.length > 0 ? (
        <g>
          {node.roles.slice(0, 5).map((role, i) => (
            <circle
              key={role}
              cx={x + w / 2 - (Math.min(node.roles.length, 5) - 1) * 5 + i * 10}
              cy={CENTER_Y + NODE_H / 2 + 12}
              r={3.5}
              style={{ fill: colorForRole(role) }}
              opacity={active || passed ? 1 : 0.35}
            >
              <title>{role}</title>
            </circle>
          ))}
        </g>
      ) : null}
    </g>
  );
}
