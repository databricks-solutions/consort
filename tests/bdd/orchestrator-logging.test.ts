// The orchestrator (deterministic driver) emits its lifecycle log as CODE, not
// via a prose-instructed LLM. orchestratorLogEvents is the pure action->event(s)
// mapper; makeOnAction wires it to the ONE common logger (emitAgentLogEvent), so
// every run produces a correct, ts-stamped, schema-valid orchestrator trail
// regardless of which model (if any) a role is on. There is ONE logging
// function, role is a parameter, not one function per agent.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { orchestratorLogEvents, makeOnAction, parkedGateSurfacedEvent, gateAlreadySurfaced } from "../../consort/logging/orchestrator-logging";
import { renderEventMessage } from "../../consort/logging/agent-log-events";
import { readAgentLog, type AgentLogEvent } from "../../consort/logging/agent-log";
import { ALL_AGENT_ROLES } from "../../consort/config/agent-models";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

describe("orchestratorLogEvents: pure action -> canonical log events", () => {
  it("invoke-role emits an orchestrator handoff + a phase.start for the invoked role", () => {
    const action = { kind: "invoke-role", role: "spec-author", story: "S1-file-bug" } as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1-initial-domain" });
    // One orchestrator handoff naming the role it dispatched...
    const handoff = events.find((e) => e.event === "handoff");
    expect(handoff, "expected an orchestrator handoff").toBeTruthy();
    expect(handoff!.role).toBe("orchestrator");
    expect(handoff!.feature_id).toBe("F1-initial-domain");
    // The dispatched role is a SLOT (the message is rendered from it at emit).
    expect(handoff!.slots?.to_role).toBe("spec-author");
    // ...and a phase.start STAMPED WITH THE INVOKED ROLE (so the role's
    // lifecycle is recorded even if the role's own model never logs).
    const start = events.find((e) => e.event === "phase.start");
    expect(start, "expected a role phase.start").toBeTruthy();
    expect(start!.role).toBe("spec-author");
    expect(start!.feature_id).toBe("F1-initial-domain");
  });

  it("stamps model + effort on the role phase.start (right after role) from the context resolvers", () => {
    const ctx = {
      featureId: "F1",
      modelForRole: (role: string) => (role === "navigator" ? "sonnet" : "opus"),
      effortForTurn: (_role: string, turn?: string) => (turn === "review" ? "low" : ""),
    };
    // Build REVIEW turn: navigator, effort low + model sonnet.
    const review = orchestratorLogEvents(
      { kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" } as WorkflowAction,
      ctx,
    ).find((e) => e.event === "phase.start");
    expect(review?.role).toBe("navigator");
    expect(review?.model).toBe("sonnet");
    expect(review?.effort).toBe("low");
    // Design turn (spec-author): model opus, no effort (resolver returns "" => omitted).
    const design = orchestratorLogEvents(
      { kind: "invoke-role", role: "spec-author", story: "S1" } as WorkflowAction,
      ctx,
    ).find((e) => e.event === "phase.start");
    expect(design?.model).toBe("opus");
    expect(design?.effort).toBeUndefined();
    // No resolvers -> no model/effort fields (back-compat).
    const bare = orchestratorLogEvents(
      { kind: "invoke-role", role: "driver", story: "S1" } as WorkflowAction,
      { featureId: "F1" },
    ).find((e) => e.event === "phase.start");
    expect(bare?.model).toBeUndefined();
    expect(bare?.effort).toBeUndefined();
  });

  it("await-acceptance emits a deterministic release-engineer phase.start (deploy), NOT a handoff", () => {
    // Deploy is a deterministic phase the orchestrator runs itself (the deploy CLI
    // emits the deploy.* outcome), logged under the release-engineer label. It is
    // NOT an inter-agent handoff (there is no release-engineer agent), so it emits
    // a phase.start like the build-lane dispatch, never a handoff.
    const action = { kind: "await-acceptance", story: "S1-file-bug" } as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1" });
    expect(events.some((e) => e.event === "handoff"), "await-acceptance must NOT emit a handoff").toBe(false);
    const start = events.find((e) => e.event === "phase.start" && e.role === "release-engineer");
    expect(start, "expected a release-engineer phase.start").toBeTruthy();
    // The acceptance gate is still surfaced.
    expect(events.some((e) => e.event === "gate.surfaced")).toBe(true);
  });

  it("a gate-surfacing action emits an orchestrator gate.surfaced", () => {
    const action = { kind: "surface-gate", gate: "spec", story: "S1" } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1" });
    const surfaced = events.find((e) => e.event === "gate.surfaced");
    expect(surfaced).toBeTruthy();
    expect(surfaced!.role).toBe("orchestrator");
  });

  it("dispatch (build-lane entry) emits an orchestrator phase.start build, NOT a self-handoff", () => {
    // Opening the per-story build lane is a phase entry, not an inter-agent
    // handoff: the build lane is the orchestrator's own pipeline. A `handoff` here
    // would be the orchestrator handing off to itself (to_role "build-lane", not a
    // real agent). The first true handoff is the navigator dispatch that follows.
    const action = { kind: "dispatch", story: "S1-create-bug-form" } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1-file-bug" });
    expect(events.some((e) => e.event === "handoff"), "dispatch must NOT emit a handoff").toBe(false);
    const start = events.find((e) => e.event === "phase.start");
    expect(start, "expected an orchestrator phase.start").toBeTruthy();
    expect(start!.role).toBe("orchestrator");
    expect(start!.slots?.phase).toBe("build");
    expect(start!.slots?.story).toBe("S1-create-bug-form");
  });

  it("GUARD: every handoff to_role is a real spawnable agent role (never a lane / self-handoff)", () => {
    // A `handoff` denotes control crossing to a DIFFERENT agent. Its to_role must
    // be a spawnable role with a <role>.md def + a model, never a pipeline lane
    // ("build-lane") nor the orchestrator itself. This regresses the build-lane
    // self-handoff and any future lane sneaking into a handoff slot.
    const roles = new Set<string>(ALL_AGENT_ROLES);
    // One representative action per switch arm, covering every kind that runs.
    const actions: WorkflowAction[] = [
      ...ALL_AGENT_ROLES.map((role) => ({ kind: "invoke-role", role, story: "S1" }) as unknown as WorkflowAction),
      { kind: "surface-gate", gate: "spec", story: "S1" } as unknown as WorkflowAction,
      { kind: "await-acceptance", story: "S1" } as unknown as WorkflowAction,
      { kind: "approve-gate", story: "S1" } as unknown as WorkflowAction,
      { kind: "approve-plan-gate" } as unknown as WorkflowAction,
      { kind: "approve-deploy-gate" } as unknown as WorkflowAction,
      { kind: "accept", story: "S1" } as unknown as WorkflowAction,
      { kind: "cut-experiment", story: "S1" } as unknown as WorkflowAction,
      { kind: "dispatch", story: "S1" } as unknown as WorkflowAction,
      { kind: "deploy" } as unknown as WorkflowAction,
      { kind: "complete", story: "S1" } as unknown as WorkflowAction,
      { kind: "planning-complete" } as unknown as WorkflowAction,
      { kind: "design-complete" } as unknown as WorkflowAction,
      { kind: "feature-complete" } as unknown as WorkflowAction,
      { kind: "raise-to-hil", source: "navigator", reason: "x", story: "S1" } as unknown as WorkflowAction,
      { kind: "done" } as unknown as WorkflowAction,
    ];
    let handoffs = 0;
    for (const action of actions) {
      for (const e of orchestratorLogEvents(action, { featureId: "F1" })) {
        if (e.event !== "handoff") continue;
        handoffs += 1;
        const to = e.slots?.to_role as string | undefined;
        expect(roles.has(to ?? ""), `handoff to_role "${to}" must be a spawnable agent role`).toBe(true);
      }
    }
    // Sanity: the sample DID exercise real handoffs (invoke-role + await-acceptance).
    expect(handoffs).toBeGreaterThanOrEqual(ALL_AGENT_ROLES.length);
  });

  it("cut-experiment emits an orchestrator experiment.cut", () => {
    const action = { kind: "cut-experiment", story: "S1", slug: "arr" } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1" });
    expect(events.some((e) => e.role === "orchestrator" && e.event === "experiment.cut")).toBe(true);
  });

  it("done emits an orchestrator phase.end (workflow complete)", () => {
    const events = orchestratorLogEvents({ kind: "done" } as WorkflowAction, { featureId: "F1" });
    expect(events.some((e) => e.role === "orchestrator" && e.event === "phase.end")).toBe(true);
  });

  it("the promote phase emits a release-engineer phase.start + a promote gate.approved", () => {
    // deploy-complete marks entry into the promote phase (release engineer owns it).
    const entry = orchestratorLogEvents({ kind: "deploy-complete" } as WorkflowAction, { featureId: "F1" });
    expect(entry).toEqual([
      expect.objectContaining({ role: "release-engineer", event: "phase.start", slots: { phase: "promote" } }),
    ]);
    // The HITL promote gate (PR acceptance) logs gate.approved {gate: promote}.
    const gate = orchestratorLogEvents({ kind: "approve-promote-gate" } as WorkflowAction, { featureId: "F1" });
    expect(gate.some((e) => e.event === "gate.approved" && (e.slots as { gate?: string }).gate === "promote")).toBe(true);
    // The SCM steps still emit an in-vocabulary, distinct marker (no throw, timing-visible).
    for (const k of ["prepare-pr", "wait-ci", "merge"] as const) {
      const evs = orchestratorLogEvents({ kind: k } as WorkflowAction, { featureId: "F1" });
      expect(evs.length).toBeGreaterThan(0);
      expect(evs[0].event).toBeTruthy();
    }
  });

  it("the dispatched accept action logs experiment.accepted (the gate.approved that CLEARS acceptance is at the merge funnel)", () => {
    // This case fires only when the drive DISPATCHES a standalone accept action. The acceptance-gate
    // CLEAR (gate.approved) is NOT emitted here — the merge also resolves headless / via a direct CLI
    // where this never runs — it is emitted at mergeAndAcceptStory (acceptStory's sole caller), which
    // every path reaches. See experiment-merge.test for that.
    const evs = orchestratorLogEvents({ kind: "accept", story: "S1-file-bug" } as WorkflowAction, { featureId: "F1" });
    expect(evs.some((e) => e.event === "experiment.accepted")).toBe(true);
  });

  it("every emitted event has role/level/event AND renders from its template + slots (no missing slot)", () => {
    const action = { kind: "invoke-role", role: "driver", story: "S1" } as WorkflowAction;
    for (const e of orchestratorLogEvents(action, { featureId: "F1" })) {
      expect(e.role, "role required").toBeTruthy();
      expect(e.level, "level required").toBeTruthy();
      expect(e.event, "event required").toBeTruthy();
      // The message is rendered at emit; rendering must succeed (all required
      // slots supplied) for every event the orchestrator produces.
      const ctx = { role: e.role, ...(e.feature_id ? { feature_id: e.feature_id } : {}), ...(e.phase ? { phase: e.phase } : {}), ...(e.slots ?? {}) };
      expect(renderEventMessage(e.event, ctx).length, `event ${e.event} renders`).toBeGreaterThan(0);
    }
  });

  it("revise-route records WHO re-runs WHICH gate + the triggering source + the verdict (not a bare note)", () => {
    const action = {
      kind: "revise-route",
      story: "S1-file-stock",
      role: "architect-reviewer",
      gate: "architecture",
      source: "smell:reflect-architecture-defect",
      reason: "a NOT NULL column contradicts an AC that renders when the field is absent",
    } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1-stock-visibility" });
    const ev = events.find((e) => e.event === "reasoning");
    expect(ev, "revise-route emits a reasoning event").toBeTruthy();
    const note = String(ev!.slots?.note ?? "");
    // The driving detail is all present — no more invisible re-do.
    expect(note).toMatch(/architect-reviewer/);
    expect(note).toMatch(/architecture gate/);
    expect(note).toMatch(/reflect-architecture-defect/);
    expect(note).toMatch(/contradicts an AC/);
    expect(ev!.level).toBe("warn");
  });
});

describe("parkedGateSurfacedEvent: surfacing a HITL gate the drive parks at", () => {
  // A synthetic gate.surfaced/gate.approved log event for the idempotency guard.
  const gateEv = (event: "gate.surfaced" | "gate.approved", gate: string, story?: string): AgentLogEvent => ({
    timestamp: "2026-01-01T00:00:00.000Z",
    level: "info",
    role: "orchestrator",
    event,
    message: `${event} ${gate}`,
    metadata: { gate, ...(story ? { story } : {}) },
  });

  it("maps each parked approve-* action to a gate.surfaced with the right gate name", () => {
    expect(parkedGateSurfacedEvent({ kind: "approve-intake-gate" } as WorkflowAction)?.slots?.gate).toBe("intake");
    expect(parkedGateSurfacedEvent({ kind: "approve-plan-gate" } as WorkflowAction)?.slots?.gate).toBe("plan");
    expect(parkedGateSurfacedEvent({ kind: "approve-deploy-gate" } as WorkflowAction)?.slots?.gate).toBe("deploy");
    expect(parkedGateSurfacedEvent({ kind: "approve-promote-gate" } as WorkflowAction)?.slots?.gate).toBe("promote");
    // Story-scoped gates carry the story slot.
    const spec = parkedGateSurfacedEvent({ kind: "approve-gate", story: "S1" } as WorkflowAction);
    expect(spec?.slots?.gate).toBe("spec");
    expect(spec?.slots?.story).toBe("S1");
    const accept = parkedGateSurfacedEvent({ kind: "accept", story: "S2" } as WorkflowAction);
    expect(accept?.slots?.gate).toBe("acceptance");
    expect(accept?.slots?.story).toBe("S2");
    // Every surfacing is an orchestrator gate.surfaced (not gate.approved).
    expect(spec?.event).toBe("gate.surfaced");
    expect(spec?.role).toBe("orchestrator");
  });

  it("returns null for a non-gate action (nothing to surface)", () => {
    expect(parkedGateSurfacedEvent({ kind: "invoke-role", role: "driver", story: "S1" } as WorkflowAction)).toBeNull();
    expect(parkedGateSurfacedEvent({ kind: "cut-experiment", story: "S1" } as WorkflowAction)).toBeNull();
  });

  it("its slots render a valid gate.surfaced message (in-vocabulary + schema-valid)", () => {
    const ev = parkedGateSurfacedEvent({ kind: "approve-intake-gate" } as WorkflowAction)!;
    const ctx = { role: ev.role, ...(ev.feature_id ? { feature_id: ev.feature_id } : {}), ...(ev.slots ?? {}) };
    expect(renderEventMessage(ev.event, ctx).length).toBeGreaterThan(0);
  });

  it("gateAlreadySurfaced is true only when the gate's last event is a surface (not an approval / absent)", () => {
    const intake = { kind: "approve-intake-gate" } as WorkflowAction;
    // No gate events yet → not surfaced (a genuinely new park surfaces).
    expect(gateAlreadySurfaced([], intake)).toBe(false);
    // Surfaced, not yet approved → already surfaced (a re-run at the same park must NOT double-log).
    expect(gateAlreadySurfaced([gateEv("gate.surfaced", "intake")], intake)).toBe(true);
    // A prior cycle's approval is the last event → a new park surfaces again.
    expect(gateAlreadySurfaced([gateEv("gate.surfaced", "intake"), gateEv("gate.approved", "intake")], intake)).toBe(false);
    // A DIFFERENT gate's surface does not count as this gate's.
    expect(gateAlreadySurfaced([gateEv("gate.surfaced", "plan")], intake)).toBe(false);
  });

  it("story-scoped gates match on story (spec/acceptance are per-story)", () => {
    const specS3 = { kind: "approve-gate", story: "S3" } as WorkflowAction;
    // A surface for a DIFFERENT story is not S3's.
    expect(gateAlreadySurfaced([gateEv("gate.surfaced", "spec", "S1")], specS3)).toBe(false);
    // S3's own surface counts.
    expect(gateAlreadySurfaced([gateEv("gate.surfaced", "spec", "S3")], specS3)).toBe(true);
  });
});

describe("makeOnAction: code-emits through the ONE common logger", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "orch-log-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("appends valid, ts-stamped orchestrator events to .tdd/agent-log.jsonl", () => {
    const onAction = makeOnAction({ consortDir: tdd, featureId: "F1-initial-domain" });
    onAction({ kind: "invoke-role", role: "spec-author", story: "S1" } as WorkflowAction, 0);

    const events = readAgentLog({ consortDir: tdd });
    expect(events.length).toBeGreaterThanOrEqual(2); // handoff + phase.start
    // emitAgentLogEvent stamps a real UTC timestamp; this proves we go through
    // the logger (not a role writing its own line with a local clock).
    for (const e of events) {
      expect(e.timestamp, "logger stamps timestamp").toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect((e as unknown as Record<string, unknown>).ts, "no stray legacy 'ts' field").toBeUndefined();
    }
    expect(events.some((e) => e.role === "orchestrator")).toBe(true);
    expect(events.some((e) => e.role === "spec-author" && e.event === "phase.start")).toBe(true);
  });
});
