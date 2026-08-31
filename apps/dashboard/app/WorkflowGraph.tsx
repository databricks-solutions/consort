"use client";

import { STEP_OUTPUTS, WORKFLOW, gateForNode, type WorkflowNode } from "@/lib/topology";
import { colorForRole, font, radius } from "@/lib/theme";
import type { DashboardState, GateInfo } from "@/lib/types";

// The Consort lifecycle graph (Figure 1), re-skinned from Kevin's dark SVG to the light
// theme. Layout is a single horizontal spine — intake → plan → design → build → deploy →
// promote → shipped — with gates as narrow diamonds between phases.
//
// Node lighting comes straight from lib/topology.ts:
//   passed  → a phase this run has reached (green)
//   active  → the phase the playhead is in (accent + glow, matching DesignLane's treatment)
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
  // Both folded server-side (see deriveTopology in lib/reducer.ts): the client only gets a
  // 40-event tail, but this needs the whole prefix.
  const passed = new Set(state.topology.passedNodes);
  const activeNode = state.topology.activeNode;
  // Whichever agent is working drives the active node's stroke color, as in Kevin's version.
  const activeRole = state.agents.find((a) => a.status === "working")?.role ?? null;
  const gateState = new Map(state.gates.map((g: GateInfo) => [g.name, g.status]));

  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: `1px solid var(--border-default)`,
        borderRadius: radius.card,
        padding: "14px 16px",
        overflowX: "auto",
      }}
    >
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
          <marker id="wf-arrow-done" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--status-good)" }} />
          </marker>
        </defs>

        {WORKFLOW.edges.map(([from, to]) => (
          <Edge
            key={`${from}->${to}`}
            from={from}
            to={to}
            done={passed.has(from) && (passed.has(to) || to === activeNode)}
          />
        ))}

        {PLACED.map(({ node, x, w }) => (
          <Node
            key={node.id}
            node={node}
            x={x}
            w={w}
            active={node.id === activeNode}
            passed={passed.has(node.id)}
            activeRole={activeRole}
            gateStatus={gateStatusFor(node, gateState)}
            // Only nodes that actually map to deliverables are clickable — clicking a node with
            // no STEP_OUTPUTS entry (shipped, promote gate) would open an empty panel.
            onSelect={onSelectNode && (STEP_OUTPUTS[node.id]?.length ?? 0) > 0 ? onSelectNode : undefined}
            selected={node.id === selectedNode}
          />
        ))}
      </svg>
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
function Edge({ from, to, done }: { from: string; to: string; done: boolean }) {
  const a = POS.get(from);
  const b = POS.get(to);
  if (!a || !b) return null;

  const stroke = done ? "var(--status-good)" : "var(--border-strong)";
  const marker = done ? "url(#wf-arrow-done)" : "url(#wf-arrow)";

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
      strokeWidth={done ? 2 : 1.5}
      markerEnd={marker}
    />
  );
}

function Node({
  node,
  x,
  w,
  active,
  passed,
  activeRole,
  gateStatus,
  onSelect,
  selected,
}: {
  node: WorkflowNode;
  x: number;
  w: number;
  active: boolean;
  passed: boolean;
  activeRole: string | null;
  gateStatus: string | null;
  onSelect?: (nodeId: string) => void;
  selected?: boolean;
}) {
  const isGate = node.type === "gate";

  // Active beats passed: the accent means "here, now", matching DesignLane's current phase.
  const stroke = active
    ? activeRole
      ? colorForRole(activeRole)
      : "var(--status-accent)"
    : gateStatus === "approved"
      ? "var(--status-good)"
      : gateStatus === "surfaced"
        ? "var(--status-gate)"
        : passed
          ? "var(--status-good)"
          : "var(--border-default)";

  const fill = active
    ? "var(--status-accent-tint)"
    : gateStatus === "approved"
      ? "var(--status-good-tint)"
      : gateStatus === "surfaced"
        ? "var(--status-gate-tint)"
        : passed
          ? "var(--status-good-tint)"
          : "var(--surface-inset)";

  const label = active ? "var(--status-accent-text)" : passed || gateStatus === "approved" ? "var(--status-good-text)" : "var(--text-faint)";

  const title = `${node.label}${isGate ? ` · gate${gateStatus ? `: ${gateStatus}` : ""}` : ""}${
    active ? " · active now" : passed ? " · reached" : " · not reached"
  }${node.roles.length ? ` · ${node.roles.join(", ")}` : ""}`;

  const clickable = !!onSelect;
  return (
    <g
      onClick={clickable ? () => onSelect!(node.id) : undefined}
      style={{
        cursor: clickable ? "pointer" : undefined,
        ...(active ? { animation: "softpulse 2s ease-in-out infinite", color: stroke } : {}),
      }}
    >
      <title>{clickable ? `${title} · click for step outputs` : title}</title>
      {/* Selection ring: a dashed accent outline, distinct from the active-now glow/pulse, so a
          node can read as "selected for its outputs" and "active now" at the same time. */}
      {selected ? (
        isGate ? (
          <polygon
            points={`${x + w / 2},${CENTER_Y - NODE_H / 2 - 5} ${x + w + 5},${CENTER_Y} ${x + w / 2},${CENTER_Y + NODE_H / 2 + 5} ${x - 5},${CENTER_Y}`}
            fill="none"
            style={{ stroke: "var(--status-accent)" }}
            strokeWidth={2}
            strokeDasharray="3 2"
          />
        ) : (
          <rect x={x - 4} y={PAD - 4} width={w + 8} height={NODE_H + 8} rx={10} fill="none" style={{ stroke: "var(--status-accent)" }} strokeWidth={2} strokeDasharray="3 2" />
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
