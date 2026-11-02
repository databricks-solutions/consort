import { colorForRole } from "@/lib/theme";
import { WORKFLOW } from "@/lib/topology";
import type { Focus } from "@/lib/types";

// The ONE active-highlight colour, derived from the ONE `focus`. It reflects WHO is in charge, so
// every surface — the workflow node, the active lane panel, the active step — reads the same key and
// can never disagree about the active colour:
//   step       → the working agent's role colour (shows WHICH agent is working)
//   gate       → purple while WAITING on the decision ("surfaced"); slate once "approved" (the gate is
//                the locus of a completed phase — nothing is waiting, so it takes the done/at-rest colour)
//   escalation → red (a gate is RAISING)
//   idle       → slate (the deterministic orchestrator is in charge — dispatching, between turns)
//
// Step ids are unique across lanes, so a whole-workflow scan resolves the working step's role
// without needing the lane. A working step always owns a role; the accent fallback is only for a
// (never-current) roleless step, and slate is the orchestrator-in-charge default.
export function activeColorForFocus(focus: Focus): string {
  if (focus.kind === "escalation") return "var(--status-critical)";
  if (focus.kind === "gate") return focus.status === "surfaced" ? "var(--status-gate)" : "var(--role-orchestrator)";
  if (focus.kind === "step") {
    for (const lane of Object.values(WORKFLOW.lanes)) {
      const s = lane.steps.find((x) => x.id === focus.step);
      if (s) return s.role ? colorForRole(s.role) : "var(--status-accent)";
    }
    return "var(--role-orchestrator)";
  }
  return "var(--role-orchestrator)"; // idle → orchestrator slate
}
