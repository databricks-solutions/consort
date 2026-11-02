import { describe, it, expect } from "vitest";
import { activeColorForFocus } from "./active-color";

// The active-highlight colour is a pure function of the ONE focus — the same key every surface reads.
describe("activeColorForFocus — the active colour follows who is in charge", () => {
  it("a working agent → that agent's role colour (which agent is working)", () => {
    // p-size is the architect-reviewer's sizing step.
    expect(activeColorForFocus({ kind: "step", lane: "plan", step: "p-size" })).toBe("var(--role-architect-reviewer)");
  });

  it("a parked gate → purple (WAITING)", () => {
    expect(activeColorForFocus({ kind: "gate", gate: "backlog", status: "surfaced" })).toBe("var(--status-gate)");
  });

  it("an escalation → red (RAISING)", () => {
    expect(activeColorForFocus({ kind: "escalation", step: "b-hil" })).toBe("var(--status-critical)");
  });

  it("idle → slate, the orchestrator in charge", () => {
    expect(activeColorForFocus({ kind: "idle" })).toBe("var(--role-orchestrator)");
  });
});
