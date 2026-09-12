"use client";

import type { DashboardState } from "@/lib/types";
import { font, radius } from "@/lib/theme";
import { LIFECYCLE_GATE_KEYS } from "@/lib/gates";

// The scrum-master / orchestrator coordination panel (the template's top `.lane` box): what the
// deterministic driver is doing right now — its current dispatch, the story it is driving, the run's
// turn/cost tally, and the lifecycle HIL gates for that story. Everything is derived from the folded
// state, so it works live and scrubbed alike.

// The HIL gates the run passes, in lifecycle order. test_list is a design SUB-gate, not one of the
// human decision points shown here.
// The lifecycle HIL gates, in order — derived from the ONE gate registry (lib/gates.ts). The
// backlog gate is lane-only (no lifecycle node), so it is absent here; the run parking at it still
// glows the card purple via the focus, it just has no bubble on this row.
const GATE_ORDER: readonly string[] = LIFECYCLE_GATE_KEYS;

// Each gate's status FOR THE CURRENT STORY, derived from the log so the bubbles reset when the story
// changes instead of showing every gate ever opened. `plan` is sprint-level (not story-scoped); the
// rest reset per story — a gate the current story hasn't reached yet is absent (→ "upcoming").
export function storyGateStatus(events: DashboardState["recentEvents"], story: string | null): Record<string, "approved" | "pending"> {
  // Raw signal from the log: a gate is "pending" once it surfaces, "approved" if an approval is
  // logged. Scoped to the current story (plan is sprint-level, so never story-filtered).
  const raw: Record<string, "approved" | "pending"> = {};
  for (const e of events) {
    if (e.event !== "gate.surfaced" && e.event !== "gate.approved") continue;
    const md = (e.metadata ?? {}) as Record<string, unknown>;
    const gate = typeof md.gate === "string" ? md.gate : null;
    if (!gate) continue;
    const evStory = typeof md.story === "string" ? md.story : typeof md.subject === "string" ? md.subject : null;
    if (gate !== "plan" && story && evStory && evStory !== story) continue;
    raw[gate] = e.event === "gate.approved" ? "approved" : raw[gate] === "approved" ? "approved" : "pending";
  }
  // INTERIM inference: the kit rarely logs `gate.approved` (see docs/design/kit-gaps-repair-plan.md),
  // so a gate that surfaced would read "pending" forever. But reaching a LATER-lifecycle gate proves
  // the earlier ones were approved — so mark a gate approved once ANY later gate has been reached.
  // The last-reached gate stays "pending" (the run is at it); gates never reached stay "upcoming".
  const out: Record<string, "approved" | "pending"> = {};
  GATE_ORDER.forEach((g, i) => {
    const laterReached = GATE_ORDER.slice(i + 1).some((gj) => raw[gj]);
    if (raw[g] === "approved" || laterReached) out[g] = "approved";
    else if (raw[g] === "pending") out[g] = "pending";
  });
  return out;
}

export function OrchestratorLane({ state }: { state: DashboardState }) {
  // The orchestrator card shows the dispatch it is on now ("orchestrator START <phase>" + the story
  // it's driving), its status, and the lifecycle gate bubbles. The run tally (turns / stories / cost)
  // lives in the run-vitals card beside it, not here.
  const activity = state.orchestratorActivity;
  const story = activity?.story ?? state.stories.find((s) => s.active)?.id ?? null;
  // The card carries the orchestrator's SLATE identity (its role colour), and turns PURPLE only when
  // it's WAITING on a human (an open gate/escalation). It pulses while active or waiting and goes
  // quiet once the run completes. `softpulse` glows in `currentColor`, so `accent` (set as the card
  // colour below) is what tints the pulse; children set their own explicit colours.
  // Read the ONE focus observation instead of re-deriving from laneCurrent/gates/blockers: the run
  // is "waiting on you" when parked at a gate, "coordinating" when a step is actively running. (This
  // is the single source; the lane dots + step cards read the same focus.)
  const focus = state.focus;
  // All three states come from the ONE focus: an unresolved HIL escalation (focus "escalation" — a
  // role kicked a problem up, a failed verify that couldn't auto-heal) is the most urgent and turns
  // the card RED; a parked gate (focus "gate") turns it purple; a running step (focus "step") is
  // coordinating. focusOf already ranks escalation > step > gate, so reading focus.kind here needs no
  // separate blockers check — the same key that glows the gate node + flips the transport.
  const issue = focus.kind === "escalation";
  const waiting = focus.kind === "gate";
  const running = focus.kind === "step";
  // The gate bubbles: the five HIL gates in lifecycle order, scoped to (and resetting with) the
  // current story. When PARKED at a gate, scope to THAT gate's story — `activity.story` can lag onto
  // a later story that began designing while this one awaits its gate, which would hide the parked
  // story's own passed gates. Otherwise use the active step's story.
  const bubbleStory =
    focus.kind === "gate"
      ? (() => {
          for (let i = state.recentEvents.length - 1; i >= 0; i--) {
            const e = state.recentEvents[i];
            if (e.event !== "gate.surfaced") continue;
            const md = (e.metadata ?? {}) as Record<string, unknown>;
            if (md.gate === focus.gate) return typeof md.story === "string" ? md.story : story;
          }
          return story;
        })()
      : story;
  const gateStatus = storyGateStatus(state.recentEvents, bubbleStory);
  const flashing = issue || waiting || running;
  const accent = issue ? "var(--status-critical)" : waiting ? "var(--status-gate)" : "var(--role-orchestrator)";
  const status = issue ? "issue" : waiting ? "waiting on you" : running ? "coordinating" : "idle";
  return (
    <div
      style={{
        background: issue ? "var(--status-critical-tint-faint)" : waiting ? "var(--status-gate-tint-faint)" : "var(--surface-card)",
        // Longhands only (no `border` shorthand): the left edge is a 3px accent stripe while the
        // other three sides are 1px, and mixing shorthand with borderLeft warns on rerender.
        borderTop: `1px solid ${flashing ? accent : "var(--border-default)"}`,
        borderRight: `1px solid ${flashing ? accent : "var(--border-default)"}`,
        borderBottom: `1px solid ${flashing ? accent : "var(--border-default)"}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: radius.panel,
        padding: "10px 14px",
        // Fills its grid cell so it sits level with the run-vitals card beside it (the row supplies
        // the spacing below, not a margin here).
        height: "100%",
        boxSizing: "border-box",
        ...(flashing ? { color: accent, animation: "softpulse 2.2s ease-in-out infinite" } : {}),
      }}
    >
      <div style={{ fontSize: "0.95rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-strong)" }}>
        orchestrator
      </div>
      <div
        style={{
          fontSize: "0.9rem",
          fontWeight: 700,
          color: waiting ? "var(--status-gate-text)" : "var(--text-strong)",
          marginTop: 4,
        }}
      >
        {status}
      </div>
      {activity?.action ? (
        <div style={{ fontSize: "0.78rem", color: "var(--text-body)", marginTop: 3, fontFamily: font.mono }}>{activity.action}</div>
      ) : null}
      {story ? (
        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--status-accent-text)", marginTop: 2 }}>▸ {story}</div>
      ) : null}

      {/* On an ISSUE (unresolved HIL escalation) the card carries the blocker's actionable detail —
          its source, the reason, and which role resolves it — folded in here so the ONE issue surface
          shows WHY the run is blocked and WHO fixes it (this replaced a redundant bottom "Open issues"
          section). The top-ranked blocker matches this focus; any others are counted. */}
      {issue && state.blockers.length > 0
        ? (() => {
            const b = state.blockers[0];
            const reason = b.reason.length > 220 ? b.reason.slice(0, 220) + "…" : b.reason;
            return (
              <div style={{ marginTop: 6, fontSize: "0.72rem", color: "var(--status-critical-text)", lineHeight: 1.4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {b.source ? <span style={{ fontWeight: 700, textTransform: "uppercase" }}>{b.source}</span> : null}
                  {b.resolverRole ? (
                    <span style={{ color: "var(--text-muted)" }}>
                      → fix by <strong style={{ color: "var(--status-critical-text)", textTransform: "uppercase" }}>{b.resolverRole}</strong>
                    </span>
                  ) : null}
                  {state.blockers.length > 1 ? (
                    <span style={{ color: "var(--text-faint)", marginLeft: "auto" }}>+{state.blockers.length - 1} more</span>
                  ) : null}
                </div>
                <div style={{ marginTop: 3, color: "var(--text-body)" }}>{reason}</div>
              </div>
            );
          })()
        : null}

      {/* The five HIL gates in lifecycle order, scoped to the current story. A gate that has been
          reached is PURPLE — approved (done) and pending alike — with the one the run is parked at
          (focus) pulsing; still-to-come gates are dim grey. Purple, not green, marks a done human
          gate. Resets when the story changes because storyGateStatus only counts the current
          story's gate events. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {GATE_ORDER.map((g) => {
          const st = gateStatus[g];
          const isFocus = focus.kind === "gate" && focus.gate === g;
          const reached = st === "approved" || st === "pending" || isFocus;
          const border = reached ? "var(--status-gate)" : "var(--border-default)";
          const color = reached ? "var(--status-gate-text)" : "var(--text-faint)";
          return (
            <span
              key={g}
              title={`${g} gate — ${st ?? "not yet reached"}${g === "plan" ? " (sprint)" : ""}`}
              style={{
                fontSize: "0.64rem",
                padding: "2px 8px",
                borderRadius: radius.chip,
                border: `1px solid ${border}`,
                color,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                opacity: st || isFocus ? 1 : 0.5,
                ...(isFocus ? { animation: "lightflash 1.1s ease-in-out infinite" } : {}),
              }}
            >
              {g}
            </span>
          );
        })}
      </div>
    </div>
  );
}
