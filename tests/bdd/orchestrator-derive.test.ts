// deriveDriveState (phase 3a) tests: map persisted pipeline + context + an
// artifact probe to a DriveState, and confirm nextTransition over the derived
// state picks the right next action for realistic on-disk situations.

import { describe, it, expect } from "vitest";
import {
  deriveDriveState,
  driverPhaseForTdd,
  assertStoryOrderCoversPipeline,
  type StoryArtifactProbe,
  type DriveContext,
} from "../../consort/orchestrator/state/orchestrator-derive";
import { nextTransition } from "../../consort/orchestrator/drive/orchestrator-drive";
import type { StoryPipeline, StoryEntry } from "../../consort/pipeline/story-pipeline";

/** A probe driven by per-story boolean maps; absent story => all false. */
function fakeProbe(facts: Record<string, Partial<Record<keyof StoryArtifactProbe, boolean>>>): StoryArtifactProbe {
  const get = (s: string, k: keyof StoryArtifactProbe) => facts[s]?.[k] === true;
  return {
    hasAcs: (s) => get(s, "hasAcs"),
    architectAnnotated: (s) => get(s, "architectAnnotated"),
    architectProjectable: (s) => get(s, "architectProjectable"),
    dbaDesigned: (s) => get(s, "dbaDesigned"),
    testListReady: (s) => get(s, "testListReady"),
    reflectionPassed: (s) => get(s, "reflectionPassed"),
    reflectionVerdictWritten: (s) => get(s, "reflectionVerdictWritten"),
    testsWritten: (s) => get(s, "testsWritten"),
    codeWritten: (s) => get(s, "codeWritten"),
    storyDeployVerified: (s) => get(s, "storyDeployVerified"),
    // Deploy-verify self-heal: no contamination marker by default (routing tested
    // in the nextTransition suite via explicit build-flag overrides).
    deployVerifyAssessEligible: (s) => get(s, "deployVerifyAssessEligible" as keyof StoryArtifactProbe),
    deployVerifyRefactorPending: (s) => get(s, "deployVerifyRefactorPending" as keyof StoryArtifactProbe),
    refactorVerifyAssessEligible: (s) => get(s, "refactorVerifyAssessEligible" as keyof StoryArtifactProbe),
    refactorVerifyRefactorPending: (s) => get(s, "refactorVerifyRefactorPending" as keyof StoryArtifactProbe),
    // Per-AC REVIEW/REFACTOR: not exercised by these derive tests (default: none pending).
    reviewPendingAc: () => null,
    refactorPendingAc: () => null,
    // Story-level REVIEW/REFACTOR (the default granularity): driven from facts.
    reviewPending: (s) => get(s, "reviewPending" as keyof StoryArtifactProbe),
    refactorPending: (s) => get(s, "refactorPending" as keyof StoryArtifactProbe),
    assessGreenFailureAc: () => null,
    repairRegressionFixAc: () => null,
    greenSupersededFailureAc: () => null,
    specDefectAc: () => null,
    specDefectFromRole: () => "test-strategist",
    greenUnfixableAc: () => null,
    greenUnfixableDiagnosis: () => undefined,
    // No blocking escalation by default (raise-to-hil routing tested separately).
    pendingEscalation: () => null,
    // Stale-experiment guardrail: these derive tests don't exercise a design change,
    // so no experiment reads as stale (no fingerprint => never flagged).
    designFingerprint: () => undefined,
  };
}

function pipeline(stories: Record<string, StoryEntry>, opts: Partial<StoryPipeline> = {}): StoryPipeline {
  return {
    version: 1,
    feature_id: "F1",
    stories,
    build_queue: opts.build_queue ?? [],
    build_active: opts.build_active ?? null,
  };
}

const FEATURE: DriveContext = { phase: "feature", breakdownDone: true };

describe("deriveDriveState: gate + acceptance mapping", () => {
  it("maps an approved gate to gateApproved + gateSurfaced", () => {
    const p = pipeline({
      S1: { status: "ready", gate: { status: "approved", history: [] } },
    });
    const s = deriveDriveState(p, fakeProbe({}), FEATURE).stories.S1;
    expect(s.gateApproved).toBe(true);
    expect(s.gateSurfaced).toBe(true);
  });

  it("an open (surfaced, not approved) gate is surfaced but not approved", () => {
    const p = pipeline({ S1: { status: "awaiting-gate", gate: { status: "open", history: [] } } });
    const s = deriveDriveState(p, fakeProbe({}), FEATURE).stories.S1;
    expect(s.gateSurfaced).toBe(true);
    expect(s.gateApproved).toBe(false);
  });

  it("a done story is accepted; an active experiment is cut, a discarded one is not", () => {
    const p = pipeline({
      S1: {
        status: "done",
        gate: { status: "approved", history: [] },
        experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "merged" },
        acceptance: { decision: "accepted", history: [] },
      },
      S2: {
        status: "designing",
        experiment: { slug: "e2", branch: "exp/s2", parent: "feat", n: 1, status: "discarded" },
      },
    });
    const st = deriveDriveState(p, fakeProbe({}), FEATURE);
    expect(st.stories.S1.build.accepted).toBe(true);
    expect(st.stories.S1.build.experimentCut).toBe(true);
    expect(st.stories.S2.build.experimentCut).toBe(false);
    // Finding 27: a discarded experiment marks the story for a re-cut re-fork
    // (--reset-stale-branch); a merged/active one does not.
    expect(st.stories.S2.build.experimentDiscarded).toBe(true);
    expect(st.stories.S1.build.experimentDiscarded).toBe(false);
  });
});

describe("deriveDriveState + nextTransition: realistic on-disk situations", () => {
  it("planning: proposes the breakdown when nothing is recorded", () => {
    const ctx: DriveContext = { phase: "planning", breakdownDone: false, planning: { proposed: false, estimated: false, requestsAuthored: false } };
    const state = deriveDriveState(pipeline({}), fakeProbe({}), ctx);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
  });

  it("design lane: a story with ACs but no architecture advances to the architect", () => {
    const p = pipeline({ S1: { status: "designing" } });
    const state = deriveDriveState(p, fakeProbe({ S1: { hasAcs: true } }), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "architect-reviewer", story: "S1" });
  });

  it("design lane: a story with architecture but no db-design advances to the DBA", () => {
    const p = pipeline({ S1: { status: "designing" } });
    const state = deriveDriveState(p, fakeProbe({ S1: { hasAcs: true, architectAnnotated: true } }), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "dba", story: "S1" });
  });

  it("design lane: once the DBA produced db-design, the story advances to the test-strategist", () => {
    const p = pipeline({ S1: { status: "designing" } });
    const state = deriveDriveState(p, fakeProbe({ S1: { hasAcs: true, architectAnnotated: true, dbaDesigned: true } }), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "test-strategist", story: "S1" });
  });

  it("design lane: a story with a ready test-list but no reflection PASS runs the Navigator reflect turn (before the gate)", () => {
    const p = pipeline({ S1: { status: "designing" } });
    const state = deriveDriveState(
      p,
      fakeProbe({ S1: { hasAcs: true, architectAnnotated: true, dbaDesigned: true, testListReady: true } }),
      FEATURE,
    );
    // reflectionPassed is absent (false) -> the reflect turn runs, NOT surface-gate.
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "reflect" });
  });

  it("design lane: once reflection PASSES, the story advances to the spec gate", () => {
    const p = pipeline({ S1: { status: "designing" } });
    const state = deriveDriveState(
      p,
      fakeProbe({ S1: { hasAcs: true, architectAnnotated: true, dbaDesigned: true, testListReady: true, reflectionPassed: true } }),
      FEATURE,
    );
    expect(nextTransition(state)).toEqual({ kind: "surface-gate", story: "S1" });
  });

  it("per-story isolation: S2 pending reflection does not block S1 (S1 reflects first, in order)", () => {
    const p = pipeline({ S1: { status: "designing" }, S2: { status: "designing" } });
    // Both fully designed but neither reflected: the lane advances the FIRST
    // story's reflect independently; S2's pending reflection never blocks S1.
    const state = deriveDriveState(
      p,
      fakeProbe({
        S1: { hasAcs: true, architectAnnotated: true, dbaDesigned: true, testListReady: true },
        S2: { hasAcs: true, architectAnnotated: true, dbaDesigned: true, testListReady: true },
      }),
      FEATURE,
    );
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "reflect" });
    // S1 reflection passes -> S1 goes to its gate; S2 still independently pending.
    const state2 = deriveDriveState(
      p,
      fakeProbe({
        S1: { hasAcs: true, architectAnnotated: true, dbaDesigned: true, testListReady: true, reflectionPassed: true },
        S2: { hasAcs: true, architectAnnotated: true, dbaDesigned: true, testListReady: true },
      }),
      FEATURE,
    );
    expect(nextTransition(state2)).toEqual({ kind: "surface-gate", story: "S1" });
  });

  it("dispatches a gate-approved ready story when the build lane is idle", () => {
    const p = pipeline(
      { S1: { status: "ready", gate: { status: "approved", history: [] } } },
      { build_queue: ["S1"], build_active: null },
    );
    const state = deriveDriveState(p, fakeProbe({}), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "dispatch", story: "S1" });
  });

  it("build lane: experiment cut + RED tests written but no GREEN code -> invoke the driver", () => {
    const p = pipeline(
      {
        S1: {
          status: "building",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active" },
        },
      },
      { build_active: "S1" },
    );
    const state = deriveDriveState(p, fakeProbe({ S1: { testsWritten: true } }), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "driver", story: "S1" });
  });

  it("build lane: an active experiment whose design fingerprint DIVERGED is re-cut (reset-stale-branch), not reused", () => {
    // The stale-experiment guardrail (the withdraw-gate + set-status hazard): the story was
    // re-authored under a still-active experiment, so its stamped design fingerprint no longer
    // matches the current design. Reusing it would ride the superseded design's code/tests into
    // the merge; the drive must re-cut a fresh experiment off the feature branch instead.
    const p = pipeline(
      {
        S1: {
          status: "building",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active", design_fingerprint: "OLDdesign" },
        },
      },
      { build_active: "S1" },
    );
    const probe = { ...fakeProbe({ S1: { testsWritten: true } }), designFingerprint: () => "NEWdesign" };
    const state = deriveDriveState(p, probe, FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "cut-experiment", story: "S1", resetStaleBranch: true });
  });

  it("build lane: an active experiment whose design fingerprint MATCHES is reused, not re-cut", () => {
    const p = pipeline(
      {
        S1: {
          status: "building",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active", design_fingerprint: "SAMEdesign" },
        },
      },
      { build_active: "S1" },
    );
    const probe = { ...fakeProbe({ S1: { testsWritten: true } }), designFingerprint: () => "SAMEdesign" };
    const state = deriveDriveState(p, probe, FEATURE);
    // Reused: with RED tests written it proceeds to the Driver, never a cut-experiment.
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "driver", story: "S1" });
  });

  it("build lane: an experiment with NO stamped fingerprint (cut before the guardrail) is never flagged stale", () => {
    const p = pipeline(
      {
        S1: {
          status: "building",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active" }, // no design_fingerprint
        },
      },
      { build_active: "S1" },
    );
    // Even with a current fingerprint available, an unstamped experiment is reused (backward-compat).
    const probe = { ...fakeProbe({ S1: { testsWritten: true } }), designFingerprint: () => "whatever" };
    const state = deriveDriveState(p, probe, FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "driver", story: "S1" });
  });

  it("build lane: a Navigator-assessed driver-fixable regression routes a bounded Driver REPAIR turn", () => {
    const p = pipeline(
      {
        S1: {
          status: "building",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active" },
        },
      },
      { build_active: "S1" },
    );
    // The Navigator assessed the green-failure as driver-fixable (probe surfaces
    // the AC via repairRegressionFixAc); the orchestration routes the Driver to
    // REPAIR it (diagnosis injected by the effect), NOT a plain green re-attempt
    // and NOT an escalation.
    const probe = { ...fakeProbe({ S1: { testsWritten: true } }), repairRegressionFixAc: (s: string) => (s === "S1" ? "AC1" : null) };
    const state = deriveDriveState(p, probe, FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "repair", ac: "AC1" });
  });

  it("build lane: a Navigator-assessed SPEC-DEFECT routes a raise-to-hil recommending the design-lane reopen, NOT a Driver repair", () => {
    const p = pipeline(
      {
        S1: {
          status: "building",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active" },
        },
      },
      { build_active: "S1" },
    );
    // The failing test is wrong (unrealistic/flaky), not the code: the probe surfaces the AC via
    // specDefectAc + the recommended re-author role. The drive must NOT route a Driver repair; it
    // surfaces a raise-to-hil recommending the proportionate build->design go-back.
    const probe = {
      ...fakeProbe({ S1: { testsWritten: true } }),
      specDefectAc: (s: string) => (s === "S1" ? "AC1" : null),
      specDefectFromRole: () => "test-strategist",
    };
    const state = deriveDriveState(p, probe, FEATURE);
    const action = nextTransition(state);
    expect(action.kind).toBe("raise-to-hil");
    expect((action as { source: string }).source).toBe("spec-defect");
    expect((action as { reason: string }).reason).toMatch(/reopen-story --from test-strategist/);
  });

  it("deploy-verify contamination (eligible marker) routes the Navigator ASSESS-DEPLOY turn before re-deploying", () => {
    const p = pipeline(
      {
        S1: {
          status: "awaiting-acceptance",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active" },
        },
      },
      { build_active: "S1" },
    );
    // Built + deployed, but verify FAILED as contamination (deployVerified false,
    // eligible marker present). The self-heal pre-empts the re-deploy: assess FIRST.
    const probe = {
      ...fakeProbe({ S1: { testsWritten: true, codeWritten: true, storyDeployVerified: false } }),
      deployVerifyAssessEligible: (s: string) => s === "S1",
    };
    const state = deriveDriveState(p, probe, FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "assess-deploy" });
  });

  it("deploy-verify assessed with a scope set routes the Driver SCOPE-DEPLOY turn, then re-deploys", () => {
    const p = pipeline(
      {
        S1: {
          status: "awaiting-acceptance",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active" },
        },
      },
      { build_active: "S1" },
    );
    // The Navigator assessed + chose a scope set; the Driver has not yet refactored.
    const probe = {
      ...fakeProbe({ S1: { testsWritten: true, codeWritten: true, storyDeployVerified: false } }),
      deployVerifyRefactorPending: (s: string) => s === "S1",
    };
    const state = deriveDriveState(p, probe, FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "refactor-deploy" });

    // With no self-heal pending (assess spent + scoped, or no marker), a still-
    // unverified deploy falls through to the plain re-deploy (teeth), NOT a spin
    // in the self-heal – the one-shot bound + terminal escalation close that.
    const plain = deriveDriveState(
      p,
      fakeProbe({ S1: { testsWritten: true, codeWritten: true, storyDeployVerified: false } }),
      FEATURE,
    );
    expect(nextTransition(plain)).toEqual({ kind: "await-acceptance", story: "S1" });
  });

  it("breakdownDone is derived from the pipeline having stories (post sync-breakdown)", () => {
    // Stories seeded by sync-breakdown (status designing), ctx.breakdownDone
    // still false -> deriveDriveState flips it true so the lane advances S1
    // instead of re-issuing breakdown.
    const p = pipeline({ S1: { status: "designing" }, S2: { status: "designing" } });
    const ctxNoBreakdown: DriveContext = { phase: "feature", breakdownDone: false };
    const state = deriveDriveState(p, fakeProbe({}), ctxNoBreakdown);
    expect(state.breakdownDone).toBe(true);
    // first un-designed story advances to ACs, NOT another breakdown
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });

  it("all stories accepted + lane idle -> feature-complete", () => {
    const done: StoryEntry = {
      status: "done",
      gate: { status: "approved", history: [] },
      acceptance: { decision: "accepted", history: [] },
    };
    const p = pipeline({ S1: done, S2: done }, { build_active: null });
    const state = deriveDriveState(p, fakeProbe({}), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "feature-complete" });
  });
});

describe("driverPhaseForTdd", () => {
  it("maps the TDD workflow phase to the driver's coarse phase", () => {
    expect(driverPhaseForTdd("planning")).toBe("planning");
    expect(driverPhaseForTdd("deploy")).toBe("deploy");
    expect(driverPhaseForTdd("shipped")).toBe("done");
    // the per-feature streaming phases all collapse to "feature"
    for (const p of ["discovery", "design", "implementation", "review", "anything"]) {
      expect(driverPhaseForTdd(p)).toBe("feature");
    }
  });
});

describe("assertStoryOrderCoversPipeline", () => {
  it("passes when the order matches the pipeline stories", () => {
    const p = pipeline({ S1: { status: "designing" }, S2: { status: "designing" } });
    expect(() => assertStoryOrderCoversPipeline(p, ["S1", "S2"])).not.toThrow();
  });
  it("throws when a story is missing or extra", () => {
    const p = pipeline({ S1: { status: "designing" } });
    expect(() => assertStoryOrderCoversPipeline(p, ["S1", "S2"])).toThrow(/storyOrder mismatch/);
    expect(() => assertStoryOrderCoversPipeline(p, [])).toThrow(/missing \[S1\]/);
  });
});
