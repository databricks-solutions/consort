// FEIP (orchestrator-as-deterministic-driver), phase 1: the per-story DESIGN
// lane is a pure state machine, not an LLM judgment call. nextDesignAction maps
// the recorded state (breakdown done? each story's design progress + gate) to
// the single next action. It is exhaustively testable with no I/O, no model.
//
// The streaming invariant falls out for free: the function always advances the
// FIRST not-yet-gated story, so exactly one story is ever in design at a time,
// the spec-author is invoked per story, and batching is structurally impossible.

import { describe, it, expect } from "vitest";
import {
  nextDesignAction,
  nextTransition,
  pauseBeforeMilestone,
  actionLane,
  isHitlGateAction,
  type DesignDriveState,
  type DriveState,
  type StoryView,
  type WorkflowAction,
} from "../../consort/orchestrator/drive/orchestrator-drive";

/** A story fully through design + gate (so the loop skips it). */
function gated(): DesignDriveState["stories"][string] {
  return {
    gateApproved: true,
    gateSurfaced: false,
    design: { hasAcs: true, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, reflectionPassed: true, reflectionVerdictWritten: true },
  };
}
/** A blank story: nothing designed yet. */
function fresh(): DesignDriveState["stories"][string] {
  return {
    gateApproved: false,
    gateSurfaced: false,
    design: { hasAcs: false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, reflectionPassed: false, reflectionVerdictWritten: false },
  };
}

function state(over: Partial<DesignDriveState>): DesignDriveState {
  return { breakdownDone: true, storyOrder: ["S1", "S2", "S3"], stories: {}, ...over };
}

describe("nextDesignAction (per-story design lane state machine)", () => {
  it("breaks the feature down first when the breakdown is not done", () => {
    expect(nextDesignAction(state({ breakdownDone: false, stories: {} }))).toEqual({
      kind: "invoke-role",
      role: "spec-author",
      mode: "breakdown",
    });
  });

  it("drives the first story through spec -> architect -> dba -> test-strategist in order", () => {
    const s = { S1: fresh(), S2: fresh(), S3: fresh() };
    // needs ACs -> spec-author
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "spec-author", story: "S1",
    });
    // has ACs, needs architecture -> architect-reviewer
    s.S1.design.hasAcs = true;
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "architect-reviewer", story: "S1",
    });
    // has ACs + arch, needs the physical schema -> dba
    s.S1.design.architectAnnotated = true;
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "dba", story: "S1",
    });
    // has ACs + arch + db-design, needs tests -> test-strategist
    s.S1.design.dbaDesigned = true;
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "test-strategist", story: "S1",
    });
  });

  it("surfaces the gate once a story's design is complete, then approves it", () => {
    const s = { S1: fresh(), S2: fresh(), S3: fresh() };
    s.S1.design = { hasAcs: true, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, reflectionPassed: true, reflectionVerdictWritten: true };
    // fully designed, not surfaced -> surface
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "surface-gate", story: "S1" });
    // surfaced, not approved -> approve
    s.S1.gateSurfaced = true;
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "approve-gate", story: "S1" });
  });

  it("only advances to the next story after the current one is gate-approved (streaming invariant)", () => {
    const s = { S1: fresh(), S2: fresh(), S3: fresh() };
    // S1 not yet approved -> work S1, never S2, even though S2 is also fresh.
    expect(nextDesignAction(state({ stories: s }))).toMatchObject({ story: "S1" });
    // S1 approved -> now the first non-approved is S2.
    s.S1 = gated();
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "spec-author", story: "S2",
    });
  });

  it("never drafts a later story while an earlier one is still in design", () => {
    // Even if S2 somehow has ACs, the first non-approved story (S1) is driven.
    const s = { S1: fresh(), S2: { ...fresh(), design: { hasAcs: true, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, reflectionPassed: false, reflectionVerdictWritten: false } }, S3: fresh() };
    expect(nextDesignAction(state({ stories: s }))).toMatchObject({ story: "S1", role: "spec-author" });
  });

  it("reports design-complete when every story is gate-approved", () => {
    const s = { S1: gated(), S2: gated(), S3: gated() };
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "design-complete" });
  });
});

// --- Full workflow transition (planning + design + build + deploy) ----------

/** A story view fully through design + gate but not yet built. */
function gatedUnbuilt(): StoryView {
  return {
    gateApproved: true, gateSurfaced: true,
    design: { hasAcs: true, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, reflectionPassed: true, reflectionVerdictWritten: true },
    build: { experimentCut: false, testsWritten: false, codeWritten: false, awaitingAcceptance: false, deployVerified: false, accepted: false },
  };
}
function freshStory(): StoryView {
  return {
    gateApproved: false, gateSurfaced: false,
    design: { hasAcs: false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, reflectionPassed: false, reflectionVerdictWritten: false },
    build: { experimentCut: false, testsWritten: false, codeWritten: false, awaitingAcceptance: false, deployVerified: false, accepted: false },
  };
}
function builtAccepted(): StoryView {
  return {
    gateApproved: true, gateSurfaced: true,
    design: { hasAcs: true, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, reflectionPassed: true, reflectionVerdictWritten: true },
    build: { experimentCut: true, testsWritten: true, codeWritten: true, awaitingAcceptance: true, deployVerified: true, accepted: true },
  };
}
function ws(over: Partial<DriveState>): DriveState {
  return {
    phase: "feature", breakdownDone: true, storyOrder: ["S1"], stories: {},
    buildActive: null, ...over,
  };
}

describe("nextDesignAction: UX Designer (UI track)", () => {
  const stories = { S1: fresh(), S2: fresh(), S3: fresh() };
  it("emits ux-designer after breakdown when uiTrack is on and no design guide exists yet", () => {
    expect(nextDesignAction(state({ uiTrack: true, designGuideReady: false, stories })))
      .toEqual({ kind: "invoke-role", role: "ux-designer" });
  });
  it("skips ux-designer once the design guide exists, proceeds to the first story", () => {
    expect(nextDesignAction(state({ uiTrack: true, designGuideReady: true, stories })))
      .toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
  it("never emits ux-designer when uiTrack is off (API / CLI / Infra projects)", () => {
    expect(nextDesignAction(state({ uiTrack: false, designGuideReady: false, stories })))
      .toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
  it("runs the UX step only after breakdown, breakdown still comes first", () => {
    expect(nextDesignAction(state({ breakdownDone: false, uiTrack: true, designGuideReady: false, stories: {} })))
      .toEqual({ kind: "invoke-role", role: "spec-author", mode: "breakdown" });
  });
});

describe("nextTransition: UX Designer prerequisite (hoisted above build dispatch)", () => {
  it("a gate-approved story still WAITS for the design guide (UX wins over dispatch)", () => {
    // The reused-project / last-stage case: S1's spec gate is already approved
    // (would normally dispatch to build), but the project design guide does not
    // exist yet. The UX step must fire BEFORE the dispatch, so the UI is never
    // built against a guide that does not exist.
    const st = ws({ stories: { S1: gatedUnbuilt() }, uiTrack: true, designGuideReady: false });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "ux-designer" });
  });
  it("once the design guide exists, the gate-approved story dispatches to build", () => {
    const st = ws({ stories: { S1: gatedUnbuilt() }, uiTrack: true, designGuideReady: true });
    expect(nextTransition(st)).toEqual({ kind: "dispatch", story: "S1" });
  });
  it("no UX gating for non-UI projects: the gate-approved story dispatches", () => {
    const st = ws({ stories: { S1: gatedUnbuilt() }, uiTrack: false, designGuideReady: false });
    expect(nextTransition(st)).toEqual({ kind: "dispatch", story: "S1" });
  });
});

describe("nextTransition: planning lane – intake precondition", () => {
  // Intake FIRST: with product-overview.md/nfrs.md absent (a fresh interactive project) intakeReady
  // is false, so the drive surfaces the PO intake step BEFORE propose.
  it("intakeReady:false -> the PO intake step (before propose)", () => {
    expect(nextTransition(ws({ phase: "planning", planning: { intakeReady: false, proposed: false, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "product-owner", mode: "intake" });
  });
  // intakeReady:true (headless proxy deposited the seeds, or the PO just authored them) -> propose.
  it("intakeReady:true -> straight to spec-author propose", () => {
    expect(nextTransition(ws({ phase: "planning", planning: { intakeReady: true, proposed: false, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
  });
  // GUARDRAIL: intakeReady ABSENT (legacy/hermetic states) is treated as satisfied -> propose,
  // byte-identical to before the field existed. Intake fires ONLY on an explicit false.
  it("intakeReady absent -> propose (byte-identical; fires only on explicit false)", () => {
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: false, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
  });
});

describe("nextTransition: planning lane", () => {
  it("proposes, estimates, authors requests, sizes the COMMITTED features, approves the PLAN GATE, then completes", () => {
    const base = ws({ phase: "planning", planning: { proposed: false, estimated: false, requestsAuthored: false } });
    expect(nextTransition(base)).toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
    // Proposed -> the Architect t-shirt-sizes the CANDIDATES before the PO commits.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "architect-reviewer", mode: "estimate" });
    // Estimated -> the PO commits the backlog (authors the feature-requests).
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "product-owner", mode: "author-requests" });
    // Backlog committed but its COMMITTED features not yet sized -> the Architect
    // estimates the committed feature(s) by their real ids, so sync-backlog can
    // stamp per-sprint sizes (candidate FP ids never reconcile to committed ids).
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: true, committedEstimated: false } })))
      .toEqual({ kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" });
    // Committed features sized -> the sprint plan gate (HITL) before execution.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: true, committedEstimated: true } })))
      .toEqual({ kind: "approve-plan-gate" });
    // Gate approved -> planning complete (the human "passing" = approve as-is).
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: true, committedEstimated: true, gateApproved: true } })))
      .toEqual({ kind: "planning-complete" });
  });

  it("re-plan sprint (proposals+candidate-estimates already exist) STILL sizes its own committed feature", () => {
    // Sprint 2: feature-proposals.md + estimates.json (candidate FP sizes) persist
    // from sprint 1, so proposed+estimated are already true and those turns are
    // skipped. But the sprint's OWN committed feature (e.g. F6) is not yet sized,
    // so committedEstimated is false -> the committed-estimate turn still fires.
    // This is the fix for "sprint 2's committed feature has no size".
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: true, committedEstimated: false } })))
      .toEqual({ kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" });
  });

  it("--no-sizing (skipSizing) routes proposed -> author-requests, never estimating", () => {
    // With sizing skipped, the Architect estimate step is dropped entirely: a
    // proposed-but-unestimated sprint goes straight to the PO authoring requests.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: false, skipSizing: true } })))
      .toEqual({ kind: "invoke-role", role: "product-owner", mode: "author-requests" });
    // The rest of the planning sequence is unchanged.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: true, skipSizing: true } })))
      .toEqual({ kind: "approve-plan-gate" });
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: true, gateApproved: true, skipSizing: true } })))
      .toEqual({ kind: "planning-complete" });
    // skipSizing never suppresses the propose step.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: false, estimated: false, requestsAuthored: false, skipSizing: true } })))
      .toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
  });
});

describe("nextTransition: build lane (after a story is gated)", () => {
  it("dispatches a gate-approved story into the idle build lane", () => {
    expect(nextTransition(ws({ stories: { S1: gatedUnbuilt() }, buildActive: null })))
      .toEqual({ kind: "dispatch", story: "S1" });
  });

  it("drives the active build cut -> navigator -> driver -> await -> accept -> complete", () => {
    const v = gatedUnbuilt();
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "cut-experiment", story: "S1" });
    v.build.experimentCut = true;
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1" });
    v.build.testsWritten = true;
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "driver", story: "S1" });
    v.build.codeWritten = true;
    expect(nextTransition(st)).toEqual({ kind: "await-acceptance", story: "S1" });
    v.build.awaitingAcceptance = true;
    // Teeth: not yet deploy-verified -> re-deploy (await-acceptance), not accept.
    expect(nextTransition(st)).toEqual({ kind: "await-acceptance", story: "S1" });
    v.build.deployVerified = true;
    expect(nextTransition(st)).toEqual({ kind: "accept", story: "S1" });
    v.build.accepted = true;
    expect(nextTransition(st)).toEqual({ kind: "complete", story: "S1" });
  });

  it("re-cuts with resetStaleBranch when a prior experiment was discarded (Finding 27)", () => {
    // A revised / rebuilt story has a DISCARDED experiment (experimentCut false,
    // experimentDiscarded true): the re-cut must re-fork the polluted paired
    // branch clean rather than reuse it.
    const v = gatedUnbuilt();
    v.build.experimentDiscarded = true;
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "cut-experiment", story: "S1", resetStaleBranch: true });
  });

  it("opt-in 'ac' granularity: does a pending AC's REVIEW before writing the next AC's tests (per-AC RED-GREEN-REVIEW-REFACTOR)", () => {
    // AC1's tests are all green (reviewAc=AC1) but the story is not all-green yet
    // (AC2's tests are still pending -> testsWritten false). The lane must REVIEW
    // AC1 now, NOT jump to writing AC2's next RED test. This is the per-AC cycle
    // (opt-in loop="ac"): refactoring is not batched until every AC is green.
    const v = gatedUnbuilt();
    v.build.experimentCut = true;
    v.build.loop = "ac"; // opt into the per-AC cadence (default is "story")
    v.build.testsWritten = false; // AC2 still has a pending test
    v.build.codeWritten = false;
    v.build.reviewAc = "AC1"; // AC1's tests are all green, not yet reviewed
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" });
    // After REVIEW asks for a refactor, the Driver REFACTORs that AC before any
    // further test-writing, too.
    v.build.reviewAc = null;
    v.build.refactorAc = "AC1";
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "refactor", ac: "AC1" });
    // Only once AC1 is reviewed + refactored does the Navigator write AC2's tests.
    v.build.refactorAc = null;
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1" });
  });

  it("default 'story' granularity: one story-scoped REVIEW then REFACTOR (no ac), after the whole story is green", () => {
    // The whole story is green (testsWritten + codeWritten). Under the default
    // story granularity the Navigator REVIEWs the WHOLE story in one turn, then
    // the Driver REFACTORs it in one turn – both story-scoped, no `ac` field.
    const v = gatedUnbuilt();
    v.build.experimentCut = true;
    v.build.testsWritten = true;
    v.build.codeWritten = true;
    v.build.reviewStoryPending = true; // story green, not yet reviewed
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review" });
    // REVIEW asked for a refactor -> one story-scoped Driver REFACTOR turn.
    v.build.reviewStoryPending = false;
    v.build.refactorStoryPending = true;
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "refactor" });
    // Reviewed + refactored -> the story advances to acceptance.
    v.build.refactorStoryPending = false;
    expect(nextTransition(st)).toEqual({ kind: "await-acceptance", story: "S1" });
  });

  it("labels the post-assess re-GREEN as green-superseded (a filtered replay detour, not a bare green)", () => {
    // Reactive-green supersession: the honest-GREEN verify failed, the Navigator
    // ASSESSED it and flagged prior tests this AC supersedes (superseded-tests.json,
    // -> assessGreenAc now null, greenSupersededAc set). The Driver's re-GREEN turn
    // must carry buildMode "green-superseded" so it records as a distinct dir and
    // both replay-build.ts + the corpus-integrity guard drop it (per-turn verify is
    // trusted at replay, so this detour never re-dispatches) – exactly like repair.
    // Without the label it records bare (`005-driver`) and the kept shape reads
    // [red,green,green,review], the drift this fix closes.
    const v = gatedUnbuilt();
    v.build.experimentCut = true;
    v.build.testsWritten = true;
    v.build.codeWritten = false; // the failed green left the AC's code un-written
    v.build.greenSupersededAc = "AC1";
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "green-superseded" });
  });

  it("a genuine-regression REPAIR still wins over green-superseded (mixed verdict takes the labeled repair path)", () => {
    // If the assess flagged BOTH a supersession AND a driver-fixable regression,
    // the repair path (which also refactors the flagged superseded tests) must win,
    // so the ONE turn does both. green-superseded is only the pure-supersession case.
    const v = gatedUnbuilt();
    v.build.experimentCut = true;
    v.build.testsWritten = true;
    v.build.codeWritten = false;
    v.build.repairRegressionAc = "AC1";
    v.build.greenSupersededAc = "AC1";
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "repair", ac: "AC1" });
  });

  it("an un-assessed green failure still routes the Navigator ASSESS first (green-superseded only after the flag)", () => {
    const v = gatedUnbuilt();
    v.build.experimentCut = true;
    v.build.testsWritten = true;
    v.build.codeWritten = false;
    v.build.assessGreenAc = "AC1"; // not yet assessed
    v.build.greenSupersededAc = "AC1";
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "assess", ac: "AC1" });
  });

  it("builds a gated story before designing the next (per-story flow on a single lane)", () => {
    // S1 gated+unbuilt, S2 fresh, lane idle -> dispatch S1 (build precedes designing S2).
    const st = ws({ storyOrder: ["S1", "S2"], stories: { S1: gatedUnbuilt(), S2: freshStory() }, buildActive: null });
    expect(nextTransition(st)).toEqual({ kind: "dispatch", story: "S1" });
  });

  it("advances the design lane when the build lane is idle and nothing is ready to build", () => {
    // S1 fresh (not gated), nothing ready -> design lane works S1.
    const st = ws({ storyOrder: ["S1", "S2"], stories: { S1: freshStory(), S2: freshStory() }, buildActive: null });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
});

describe("nextTransition: deploy + done", () => {
  it("moves to deploy when every story is built + accepted", () => {
    expect(nextTransition(ws({ stories: { S1: builtAccepted() } }))).toEqual({ kind: "feature-complete" });
  });

  it("deploys, surfaces the deploy gate, then enters the promote phase", () => {
    expect(nextTransition(ws({ phase: "deploy", deploy: { deployed: false, gateApproved: false } })))
      .toEqual({ kind: "deploy" });
    expect(nextTransition(ws({ phase: "deploy", deploy: { deployed: true, gateApproved: false } })))
      .toEqual({ kind: "approve-deploy-gate" });
    // Deploy gate done -> promote (no longer terminal at done).
    expect(nextTransition(ws({ phase: "deploy", deploy: { deployed: true, gateApproved: true } })))
      .toEqual({ kind: "deploy-complete" });
  });

  it("feature-ship deploy-verify contamination routes the feature-scope ASSESS then SCOPE self-heal (not the gate, not HIL)", () => {
    // A feature-ship deploy whose verify failed on shared-state contamination: the
    // deploy wrote a feature-scope marker (no escalation). The deploy phase must
    // route the Navigator ASSESS-DEPLOY turn (feature scope, no story), then the
    // Driver SCOPE turn – mirroring the per-story self-heal – BEFORE surfacing the
    // deploy gate. Both actions carry no `story` (feature scope).
    expect(
      nextTransition(ws({ phase: "deploy", deploy: { deployed: true, gateApproved: false, verifyAssessEligible: true } })),
    ).toEqual({ kind: "deploy-verify-heal", role: "navigator", mode: "assess-deploy" });

    expect(
      nextTransition(ws({ phase: "deploy", deploy: { deployed: true, gateApproved: false, verifyRefactorPending: true } })),
    ).toEqual({ kind: "deploy-verify-heal", role: "driver", mode: "refactor-deploy" });
  });
});

describe("nextTransition: promote phase (PR review then merge to parent)", () => {
  const promoteAt = (over: Partial<{ prReady: boolean; ciGreen: boolean; prApproved: boolean; merged: boolean }>) =>
    nextTransition(ws({ phase: "promote", promote: { prReady: false, ciGreen: false, prApproved: false, merged: false, ...over } }));

  it("walks prepare-pr -> wait-ci -> approve-promote-gate -> merge -> done, in that order", () => {
    // Fresh into promote: PR review begins.
    expect(promoteAt({})).toEqual({ kind: "prepare-pr" });
    // PR open -> wait for CI.
    expect(promoteAt({ prReady: true })).toEqual({ kind: "wait-ci" });
    // CI green -> the HITL promote gate (PR acceptance), BEFORE the merge.
    expect(promoteAt({ prReady: true, ciGreen: true })).toEqual({ kind: "approve-promote-gate" });
    // PR accepted -> merge (the promotion to the parent tier).
    expect(promoteAt({ prReady: true, ciGreen: true, prApproved: true })).toEqual({ kind: "merge" });
    // Merged -> done (feature released to the parent; next sprint forks from it).
    expect(promoteAt({ prReady: true, ciGreen: true, prApproved: true, merged: true })).toEqual({ kind: "done" });
  });

  it("defaults a missing promote sub-state to the start of PR review", () => {
    expect(nextTransition(ws({ phase: "promote" }))).toEqual({ kind: "prepare-pr" });
  });

  it("the merge gate has teeth: it never merges before the PR is CI-green AND approved", () => {
    // Not ci-green yet -> never reaches merge even if (spuriously) prApproved.
    expect(promoteAt({ prReady: true, prApproved: true })).toEqual({ kind: "wait-ci" });
    // ci-green but not approved -> the gate, not the merge.
    expect(promoteAt({ prReady: true, ciGreen: true })).toEqual({ kind: "approve-promote-gate" });
  });
});

describe("promote actions: lane + HITL classification", () => {
  it("classifies the promote actions into the promote lane", () => {
    for (const k of ["deploy-complete", "prepare-pr", "wait-ci", "approve-promote-gate", "merge"] as const) {
      expect(actionLane({ kind: k } as WorkflowAction)).toBe("promote");
    }
  });
  it("the promote gate is a HITL gate action; the SCM steps are not", () => {
    expect(isHitlGateAction({ kind: "approve-promote-gate" })).toBe(true);
    expect(isHitlGateAction({ kind: "prepare-pr" })).toBe(false);
    expect(isHitlGateAction({ kind: "wait-ci" })).toBe(false);
    expect(isHitlGateAction({ kind: "merge" })).toBe(false);
  });
});

describe("pauseBeforeMilestone (run-to-navigator / run-to-release-engineer)", () => {
  const navKickoff: WorkflowAction = { kind: "invoke-role", role: "navigator", story: "S1" };
  const navReview: WorkflowAction = { kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" };
  const driverTurn: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1" };
  const awaitAccept: WorkflowAction = { kind: "await-acceptance", story: "S1" };
  const deploy: WorkflowAction = { kind: "deploy" };
  const cut: WorkflowAction = { kind: "cut-experiment", story: "S1" };

  it("navigator: matches the build kickoff, NOT the per-AC review/refactor or driver turns", () => {
    const at = pauseBeforeMilestone("navigator");
    expect(at(navKickoff)).toBe(true);
    expect(at(navReview)).toBe(false); // carries buildMode – a later handoff
    expect(at(driverTurn)).toBe(false);
    expect(at(cut)).toBe(false);
    expect(at(awaitAccept)).toBe(false);
  });

  it("release-engineer: matches the per-story deploy/verify and the feature deploy", () => {
    const at = pauseBeforeMilestone("release-engineer");
    expect(at(awaitAccept)).toBe(true);
    expect(at(deploy)).toBe(true);
    expect(at(navKickoff)).toBe(false);
    expect(at(cut)).toBe(false);
  });
});
