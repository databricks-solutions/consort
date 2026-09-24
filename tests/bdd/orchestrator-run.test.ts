// Orchestrator driver loop (phase 2) integration tests.
//
// Drives a whole feature through runDriver() with an in-memory fake whose
// perform() applies each action's effect exactly as the real effects would on
// disk. This proves the loop converges, the per-story pipeline STREAMS (build
// starts on story 1 before later stories finish designing), the single build
// lane stays serialized, and a non-advancing effect is caught as a stall.

import { describe, it, expect } from "vitest";
import {
  runDriver,
  driverBoundOptions,
  DriverStalledError,
  ProtocolViolationError,
  type DriveEffects,
} from "../../consort/orchestrator/drive/orchestrator-run";
import {
  pauseBeforeMilestone,
  type DriveState,
  type StoryView,
  type WorkflowAction,
} from "../../consort/orchestrator/drive/orchestrator-drive";

function freshStory(): StoryView {
  return {
    gateApproved: false,
    gateSurfaced: false,
    design: { hasAcs: false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, reflectionPassed: false, reflectionVerdictWritten: false },
    build: {
      experimentCut: false,
      testsWritten: false,
      codeWritten: false,
      awaitingAcceptance: false,
      deployVerified: false,
      accepted: false,
    },
  };
}

/** In-memory reference model: perform(action) mutates the state the same way
 *  the real disk-backed effects would, so the loop can drive it to done. */
function makeFakeWorld(storyIds: string[]) {
  const state: DriveState = {
    phase: "planning",
    planning: { proposed: false, estimated: false, requestsAuthored: false },
    breakdownDone: false,
    storyOrder: [],
    stories: {},
    buildActive: null,
    deploy: { deployed: false, gateApproved: false },
  };
  const log: WorkflowAction[] = [];

  const effects: DriveEffects = {
    async readState() {
      return state;
    },
    onAction(action) {
      log.push(action);
    },
    async perform(action) {
      switch (action.kind) {
        case "invoke-role": {
          if ("mode" in action) {
            if (action.role === "spec-author" && action.mode === "propose") {
              state.planning!.proposed = true;
            } else if (action.role === "architect-reviewer" && action.mode === "estimate") {
              state.planning!.estimated = true;
            } else if (action.role === "product-owner" && action.mode === "author-requests") {
              state.planning!.requestsAuthored = true;
            } else if (action.role === "spec-author" && action.mode === "breakdown") {
              state.breakdownDone = true;
              state.storyOrder = [...storyIds];
              for (const id of storyIds) state.stories[id] = freshStory();
            }
          } else if (action.role === "ux-designer") {
            state.designGuideReady = true;
          } else {
            const s = state.stories[action.story];
            if (action.role === "spec-author") s.design.hasAcs = true;
            else if (action.role === "architect-reviewer") s.design.architectAnnotated = true;
            else if (action.role === "dba") s.design.dbaDesigned = true;
            else if (action.role === "test-strategist") s.design.testListReady = true;
            else if (action.role === "navigator" && "buildMode" in action && action.buildMode === "reflect") {
              // Pre-build reflection: the clean-design happy path writes a passing
              // verdict in one turn (the real effect writes reflect-verdict.json).
              s.design.reflectionVerdictWritten = true;
              s.design.reflectionPassed = true;
            }
            else if (action.role === "navigator") s.build.testsWritten = true;
            else if (action.role === "driver") s.build.codeWritten = true;
          }
          break;
        }
        case "surface-gate":
          state.stories[action.story].gateSurfaced = true;
          break;
        case "approve-gate":
          state.stories[action.story].gateApproved = true;
          break;
        case "dispatch":
          state.buildActive = action.story;
          break;
        case "cut-experiment":
          state.stories[action.story].build.experimentCut = true;
          break;
        case "await-acceptance":
          // The story deploy (release-engineer) passed: present for acceptance
          // AND record the verified evidence (the teeth on accept).
          state.stories[action.story].build.awaitingAcceptance = true;
          state.stories[action.story].build.deployVerified = true;
          break;
        case "accept":
          state.stories[action.story].build.accepted = true;
          break;
        case "complete":
          state.buildActive = null;
          break;
        case "approve-plan-gate":
          state.planning!.gateApproved = true;
          break;
        case "planning-complete":
          state.phase = "feature";
          break;
        case "feature-complete":
          state.phase = "deploy";
          break;
        case "deploy":
          state.deploy!.deployed = true;
          break;
        case "approve-deploy-gate":
          state.deploy!.gateApproved = true;
          break;
        case "deploy-complete":
          // Local deploy done -> enter the promote phase (PR review + merge).
          state.phase = "promote";
          state.promote = { prReady: false, ciGreen: false, prApproved: false, merged: false };
          break;
        case "prepare-pr":
          state.promote!.prReady = true;
          break;
        case "wait-ci":
          state.promote!.ciGreen = true;
          break;
        case "approve-promote-gate":
          state.promote!.prApproved = true;
          break;
        case "merge":
          state.promote!.merged = true;
          break;
        case "done":
          // Terminal effect: mark the feature finished so a re-read settles.
          state.phase = "done";
          break;
      }
    },
  };

  return { state, log, effects };
}

const firstIndex = (log: WorkflowAction[], pred: (a: WorkflowAction) => boolean): number =>
  log.findIndex(pred);

describe("runDriver: drives a whole feature to done", () => {
  it("planning -> per-story design+build -> deploy -> done, all stories accepted", async () => {
    const { state, effects } = makeFakeWorld(["S1", "S2", "S3"]);
    const result = await runDriver(effects);

    expect(state.phase).toBe("done");
    expect(state.planning).toEqual({ proposed: true, estimated: true, requestsAuthored: true, gateApproved: true });
    expect(state.deploy).toEqual({ deployed: true, gateApproved: true });
    for (const id of ["S1", "S2", "S3"]) {
      expect(state.stories[id].gateApproved, `${id} gate`).toBe(true);
      expect(state.stories[id].build.accepted, `${id} accepted`).toBe(true);
    }
    expect(state.buildActive).toBeNull();
    expect(result.iterations).toBeGreaterThan(0);
  });
});

describe("runDriver: the per-story pipeline streams", () => {
  it("starts building S1 before S3 finishes designing", async () => {
    const { log, effects } = makeFakeWorld(["S1", "S2", "S3"]);
    await runDriver(effects);

    // S1 enters the build lane (cut-experiment) ...
    const s1BuildStart = firstIndex(log, (a) => a.kind === "cut-experiment" && a.story === "S1");
    // ... before S3's gate is even approved (i.e. before S3 finishes designing).
    const s3DesignDone = firstIndex(log, (a) => a.kind === "approve-gate" && a.story === "S3");

    expect(s1BuildStart).toBeGreaterThanOrEqual(0);
    expect(s3DesignDone).toBeGreaterThanOrEqual(0);
    expect(s1BuildStart).toBeLessThan(s3DesignDone);
  });

  it("serializes the build lane: S1 completes before S2 is cut", async () => {
    const { log, effects } = makeFakeWorld(["S1", "S2"]);
    await runDriver(effects);

    const s1Complete = firstIndex(log, (a) => a.kind === "complete" && a.story === "S1");
    const s2Cut = firstIndex(log, (a) => a.kind === "cut-experiment" && a.story === "S2");
    expect(s1Complete).toBeGreaterThanOrEqual(0);
    expect(s2Cut).toBeGreaterThan(s1Complete);
  });
});

describe("runDriver: --pause-before (HITL gate, not a stop)", () => {
  it("awaits the human ONCE at the handoff, then resumes the SAME run to done", async () => {
    const { state, effects } = makeFakeWorld(["S1"]);
    const seen: WorkflowAction[] = [];
    const result = await runDriver(effects, {
      pauseBefore: pauseBeforeMilestone("release-engineer"),
      // The human's Y/n: resolve immediately (confirm), recording each prompt.
      confirmContinue: async (a) => {
        seen.push(a);
      },
    });

    // Paused exactly once, at the first await-acceptance (the RE handoff) ...
    expect(seen).toHaveLength(1);
    expect(seen[0].kind).toBe("await-acceptance");
    // ... and did NOT bail: the run continued through to done.
    expect(state.phase).toBe("done");
    expect(state.stories.S1.build.accepted).toBe(true);
    expect(result.stoppedAtBound).toBeUndefined();
    expect(result.escalated).toBeUndefined();
  });

  it("is a no-op when no confirmContinue is provided (pure-loop safety)", async () => {
    const { state, effects } = makeFakeWorld(["S1"]);
    const result = await runDriver(effects, { pauseBefore: pauseBeforeMilestone("navigator") });
    expect(state.phase).toBe("done");
    expect(result.iterations).toBeGreaterThan(0);
  });
});

describe("runDriver: maxSteps", () => {
  it("stops after maxSteps actions without reaching done", async () => {
    const { effects } = makeFakeWorld(["S1", "S2", "S3"]);
    const result = await runDriver(effects, { maxSteps: 3 });
    expect(result.stoppedAtMax).toBe(true);
    expect(result.iterations).toBe(3);
  });
});

describe("runDriver: stall detection", () => {
  it("throws DriverStalledError when an effect does not advance state", async () => {
    const state: DriveState = {
      phase: "planning",
      planning: { proposed: false, estimated: false, requestsAuthored: false },
      breakdownDone: false,
      storyOrder: [],
      stories: {},
      buildActive: null,
    };
    // perform() is a no-op: the first action (invoke spec-author propose) never
    // records, so the responder owes "feature proposals" and never delivers.
    const effects: DriveEffects = {
      async readState() {
        return state;
      },
      async perform() {
        /* intentionally does nothing */
      },
    };
    // With the expectation protocol ON (default), the unmet handoff aborts with a
    // PRECISE, attributed ProtocolViolationError (the spec-author returned null),
    // BEFORE the generic stall backstop.
    await expect(runDriver(effects)).rejects.toBeInstanceOf(ProtocolViolationError);
    await expect(runDriver(effects)).rejects.toThrow(/spec-author.*feature proposals/);

    // With the protocol OFF, the generic stall backstop still fires (an effect
    // that never advances state is caught even for non-handoff actions).
    await expect(runDriver(effects, { enforceExpectations: false })).rejects.toBeInstanceOf(DriverStalledError);
  });
});

describe("runDriver: Tier-2 phase bounds (driverBoundOptions)", () => {
  it("--plan-only runs planning to the approved plan gate, then stops (gate is the terminal)", async () => {
    const { state, log, effects } = makeFakeWorld(["S1", "S2"]);
    const result = await runDriver(effects, driverBoundOptions("plan"));
    expect(result.stoppedAtBound).toBe(true);
    expect(state.planning).toEqual({ proposed: true, estimated: true, requestsAuthored: true, gateApproved: true });
    // Stops AT planning-complete: not performed, so the phase stays planning and
    // no feature work (breakdown/build) happened.
    expect(state.phase).toBe("planning");
    expect(log.some((a) => a.kind === "planning-complete")).toBe(false);
    expect(log.some((a) => a.kind === "invoke-role" && "mode" in a && a.mode === "breakdown")).toBe(false);
    expect(log.some((a) => a.kind === "cut-experiment")).toBe(false);
  });

  it("--only design designs every story through its gate but builds none", async () => {
    const { state, log, effects } = makeFakeWorld(["S1", "S2"]);
    state.phase = "feature"; // design assumes planning done + feature claimed
    const result = await runDriver(effects, driverBoundOptions("design"));
    expect(result.stoppedAtBound).toBe(true);
    for (const id of ["S1", "S2"]) expect(state.stories[id].gateApproved, `${id} gated`).toBe(true);
    expect(log.some((a) => a.kind === "dispatch")).toBe(false); // never entered the build lane
    expect(log.some((a) => a.kind === "cut-experiment")).toBe(false);
  });

  it("--only build builds gate-approved stories then stops before deploy", async () => {
    const { state, log, effects } = makeFakeWorld(["S1", "S2"]);
    state.phase = "feature";
    state.breakdownDone = true;
    state.storyOrder = ["S1", "S2"];
    for (const id of ["S1", "S2"]) {
      const v = freshStory();
      v.design = { hasAcs: true, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, reflectionPassed: true, reflectionVerdictWritten: true };
      v.gateApproved = true;
      v.gateSurfaced = true;
      state.stories[id] = v;
    }
    const result = await runDriver(effects, driverBoundOptions("build"));
    expect(result.stoppedAtBound).toBe(true);
    for (const id of ["S1", "S2"]) expect(state.stories[id].build.accepted, `${id} accepted`).toBe(true);
    expect(log.some((a) => a.kind === "feature-complete")).toBe(false); // stopped before deploy
    expect(log.some((a) => a.kind === "deploy")).toBe(false);
  });

  it("--only build refuses (stops at iteration 0) when design is not done", async () => {
    const { log, effects } = makeFakeWorld(["S1"]);
    const state = await effects.readState();
    state.phase = "feature"; // breakdown not done, nothing designed
    const result = await runDriver(effects, driverBoundOptions("build"));
    expect(result.stoppedAtBound).toBe(true);
    expect(result.iterations).toBe(0);
    expect(log.length).toBe(0);
  });

  it("--only deploy ships the feature: local deploy THEN promote (PR + merge) to done", async () => {
    const { state, log, effects } = makeFakeWorld([]);
    state.phase = "deploy";
    const result = await runDriver(effects, driverBoundOptions("deploy"));
    expect(state.deploy).toEqual({ deployed: true, gateApproved: true });
    // Promote ran too: PR review + merge up to the parent tier.
    expect(state.promote).toEqual({ prReady: true, ciGreen: true, prApproved: true, merged: true });
    expect(log.some((a) => a.kind === "deploy")).toBe(true);
    expect(log.some((a) => a.kind === "prepare-pr")).toBe(true);
    expect(log.some((a) => a.kind === "merge")).toBe(true);
    expect(result.stoppedAtBound).toBeUndefined(); // completed at done, not a bound stop
  });
});

describe("runDriver: output-driven routing seam (options.contract)", () => {
  // A StepContract whose routing always emits "produced" proposing the pure transition's
  // own next action, computed from the post-perform state. Honored proposals = the exact
  // same path as state-derivation, so the drive must converge to `done` identically. This
  // proves the contract seam is consumed AND that an aligned proposal changes nothing.
  // (inputs/outputs default to empty/null; only the routing face is exercised here.)
  const passthroughContract = (transition: (s: DriveState) => WorkflowAction): import("../../consort/orchestrator/steps/step-contract").StepContract => ({
    inputs: () => [],
    preconditions: () => [],
    postTurn: () => [],
    agentOptions: () => ({ session: "fresh" }),
    raises: () => [],
    requiresEvents: () => [],
    outputs: () => [],
    route(_completed, ctx) {
      return { outcome: "produced", proposedNext: transition(ctx.state) };
    },
  });

  it("drives a whole feature to done with a passthrough contract (proposals honored)", async () => {
    const withContract = makeFakeWorld(["S1", "S2"]);
    const { nextTransition } = await import("../../consort/orchestrator/drive/orchestrator-drive");
    const result = await runDriver(withContract.effects, { contract: passthroughContract(nextTransition) });
    expect(withContract.state.phase).toBe("done");
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.escalated).toBeUndefined();
  });

  it("no-contract path is byte-identical to the contract-with-aligned-proposals path", async () => {
    const { nextTransition } = await import("../../consort/orchestrator/drive/orchestrator-drive");
    // Same feature, driven twice: once with no contract (pure state-derivation), once
    // with a passthrough contract. The performed action logs must be identical.
    const plain = makeFakeWorld(["S1", "S2"]);
    const plainLog: WorkflowAction[] = [];
    plain.effects.onAction = (a) => plainLog.push(a);
    await runDriver(plain.effects);

    const routed = makeFakeWorld(["S1", "S2"]);
    const routedLog: WorkflowAction[] = [];
    routed.effects.onAction = (a) => routedLog.push(a);
    await runDriver(routed.effects, { contract: passthroughContract(nextTransition) });

    expect(routedLog).toEqual(plainLog);
  });

  it("falls back to state-derivation when the contract proposes an OFF-GRAPH action", async () => {
    // A contract that proposes a never-allowed action; validateAndBound (via the loop)
    // must NOT follow it off the allowed graph – it falls back to the pure transition
    // every step and still reaches done. (The bound cases are exhaustive in
    // step-contract.test.ts.)
    const offGraphContract: import("../../consort/orchestrator/steps/step-contract").StepContract = {
      inputs: () => [],
      preconditions: () => [],
      postTurn: () => [],
      agentOptions: () => ({ session: "fresh" }),
      raises: () => [],
      requiresEvents: () => [],
      outputs: () => [],
      route() {
        return { outcome: "produced", proposedNext: { kind: "merge" } }; // never allowed mid-design
      },
    };
    const { state, effects } = makeFakeWorld(["S1"]);
    const result = await runDriver(effects, { contract: offGraphContract });
    expect(state.phase).toBe("done"); // fell back to state-derivation every step
    expect(result.escalated).toBeUndefined();
  });
});

describe("runDriver: onRoutingDecision fires per iteration with the state that chose the action", () => {
  it("emits one routing decision per performed action, each carrying the action + a state snapshot", async () => {
    const { effects } = makeFakeWorld(["S1"]);
    const decisions: Array<{ action: WorkflowAction; iteration: number; source: string; hadState: boolean }> = [];
    effects.onRoutingDecision = (action, s, iteration, source) => {
      decisions.push({ action, iteration, source, hadState: s != null && typeof (s as { phase?: unknown }).phase === "string" });
    };
    const actions: WorkflowAction[] = [];
    const innerOnAction = effects.onAction;
    effects.onAction = (a, i) => { actions.push(a); innerOnAction?.(a, i); };

    await runDriver(effects);

    // A routing decision is emitted for EVERY iteration (including the terminal `done`), and each
    // carries the DriveState it was derived from (hadState) – the "why" the turn recorder omits.
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.every((d) => d.hadState)).toBe(true);
    expect(decisions.every((d) => d.source === "nextTransition")).toBe(true); // no contract wired
    // Iterations are monotonic from 0.
    expect(decisions.map((d) => d.iteration)).toEqual(decisions.map((_, i) => i));
    // Every action that was performed also produced a routing decision (same actions, same order).
    expect(decisions.map((d) => JSON.stringify(d.action))).toEqual(actions.map((a) => JSON.stringify(a)));
  });
});
