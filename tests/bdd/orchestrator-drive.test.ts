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
    design: { hasAcs: true, iaRefined: true, iaProjectable: false, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, iaConforms: true, reflectionPassed: true, reflectionVerdictWritten: true},
  };
}
/** A story fully DESIGNED + surfaced for its spec gate, but NOT yet approved (the point where the
 *  feature-complete reconcile runs, before approval). */
function surfaced(): DesignDriveState["stories"][string] {
  return {
    gateApproved: false,
    gateSurfaced: true,
    design: { hasAcs: true, iaRefined: true, iaProjectable: false, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, iaConforms: true, reflectionPassed: true, reflectionVerdictWritten: true },
  };
}
/** A blank story: nothing designed yet. */
function fresh(): DesignDriveState["stories"][string] {
  return {
    gateApproved: false,
    gateSurfaced: false,
    design: { hasAcs: false, iaRefined: false, iaProjectable: false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, iaConforms: true, reflectionPassed: false, reflectionVerdictWritten: false },
  };
}

/** A story past its ACs but not yet IA-refined — the per-story IA-refine entry point. */
function withAcs(over: Partial<DesignDriveState["stories"][string]["design"]> = {}): DesignDriveState["stories"][string] {
  return { gateApproved: false, gateSurfaced: false, design: { ...fresh().design, hasAcs: true, ...over } };
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

  it("surfaces the gate once a story's design is complete, then approves it (streaming: per-story)", () => {
    // The default (streaming full drive) approves each story as it finishes — surface then approve,
    // per story — so build/deploy/promote can stream. The /design-bound defer-until-reconcile flow is
    // covered by the #symmetry tests below (featureReconcile: true).
    const s = { S1: fresh(), S2: fresh(), S3: fresh() };
    s.S1.design = { hasAcs: true, iaRefined: true, iaProjectable: false, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, iaConforms: true, reflectionPassed: true, reflectionVerdictWritten: true};
    // fully designed, not surfaced -> surface
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "surface-gate", story: "S1" });
    // surfaced, not approved -> approve immediately (streaming, no feature-complete reconcile)
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
    const s = { S1: fresh(), S2: { ...fresh(), design: { hasAcs: true, iaRefined: true, iaProjectable: false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, iaConforms: true, reflectionPassed: false, reflectionVerdictWritten: false } }, S3: fresh() };
    expect(nextDesignAction(state({ stories: s }))).toMatchObject({ story: "S1", role: "spec-author" });
  });

  it("reports design-complete when every story is gate-approved (nothing left pending)", () => {
    const s = { S1: gated(), S2: gated(), S3: gated() };
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "design-complete" });
  });

  // #symmetry — the feature-complete reconcile is the /design bound's job (featureReconcile:true), NOT
  // the streaming full drive (which approves per story so build/deploy/promote can stream).
  it("#symmetry — /design: all stories SURFACED but not yet approved → reconcile runs BEFORE the gated approval", () => {
    const s = { S1: surfaced(), S2: surfaced(), S3: surfaced() };
    expect(nextDesignAction(state({ stories: s }), { featureReconcile: true })).toEqual({ kind: "invoke-role", role: "navigator", buildMode: "reconcile" });
  });

  it("#symmetry — /design: once reconcile has passed → NOW approve the surfaced gates (first pending)", () => {
    const s = { S1: surfaced(), S2: surfaced() };
    expect(nextDesignAction(state({ storyOrder: ["S1", "S2"], stories: s, reconcilePassed: true }), { featureReconcile: true })).toEqual({ kind: "approve-gate", story: "S1" });
  });

  it("#symmetry — streaming (no featureReconcile): a surfaced story approves IMMEDIATELY, no reconcile", () => {
    const s = { S1: surfaced(), S2: surfaced(), S3: surfaced() };
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "approve-gate", story: "S1" });
  });

  it("#symmetry — /design: a lone surfaced story has nothing to reconcile → approve it directly", () => {
    const s = { S1: surfaced() };
    expect(nextDesignAction(state({ storyOrder: ["S1"], stories: s }), { featureReconcile: true })).toEqual({ kind: "approve-gate", story: "S1" });
  });

  it("#symmetry — /design: a fully-approved feature never re-runs reconcile → design-complete", () => {
    const s = { S1: gated(), S2: gated() };
    expect(nextDesignAction(state({ storyOrder: ["S1", "S2"], stories: s }), { featureReconcile: true })).toEqual({ kind: "design-complete" });
  });

  // #dba-attribution — dbaDesigned is FEATURE-level, so a later story's architect extending the schema
  // flips it false for the whole feature. In /design (featureReconcile) S1 is surfaced-not-approved and
  // re-examined every derivation; the dba re-realization must NOT fire under surfaced S1 (which would
  // mis-attribute S2's schema work to S1) — it fires under S2, the story still in design, which owns it.
  it("#dba-attribution — a feature-level dbaDesigned flip fires the dba under the in-design story, not a surfaced sibling", () => {
    const s = {
      S1: surfaced(), // surfaced, not approved — but its feature-level dbaDesigned just flipped false
      S2: withAcs({ iaRefined: true, architectAnnotated: true, dbaDesigned: false }), // in design, needs the schema
    };
    s.S1.design.dbaDesigned = false; // the shared feature db-design no longer covers S2's extension
    expect(nextDesignAction(state({ storyOrder: ["S1", "S2"], stories: s }), { featureReconcile: true })).toEqual({
      kind: "invoke-role",
      role: "dba",
      story: "S2",
    });
  });

  it("#dba-attribution — a NON-surfaced story with a false dbaDesigned still gets its own dba (guard is scoped to surfaced)", () => {
    const s = { S1: withAcs({ iaRefined: true, architectAnnotated: true, dbaDesigned: false }) };
    expect(nextDesignAction(state({ storyOrder: ["S1"], stories: s }), { featureReconcile: true })).toEqual({
      kind: "invoke-role",
      role: "dba",
      story: "S1",
    });
  });
});

// --- Full workflow transition (planning + design + build + deploy) ----------

/** A story view fully through design + gate but not yet built. */
function gatedUnbuilt(): StoryView {
  return {
    gateApproved: true, gateSurfaced: true,
    design: { hasAcs: true, iaRefined: true, iaProjectable: false, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, iaConforms: true, reflectionPassed: true, reflectionVerdictWritten: true},
    build: { experimentCut: false, testsWritten: false, codeWritten: false, awaitingAcceptance: false, deployVerified: false, accepted: false },
  };
}
function freshStory(): StoryView {
  return {
    gateApproved: false, gateSurfaced: false,
    design: { hasAcs: false, iaRefined: false, iaProjectable: false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, iaConforms: true, reflectionPassed: false, reflectionVerdictWritten: false },
    build: { experimentCut: false, testsWritten: false, codeWritten: false, awaitingAcceptance: false, deployVerified: false, accepted: false },
  };
}
function builtAccepted(): StoryView {
  return {
    gateApproved: true, gateSurfaced: true,
    design: { hasAcs: true, iaRefined: true, iaProjectable: false, architectAnnotated: true, architectProjectable: false, dbaDesigned: true, testListReady: true, testListConforms: true, iaConforms: true, reflectionPassed: true, reflectionVerdictWritten: true},
    build: { experimentCut: true, testsWritten: true, codeWritten: true, awaitingAcceptance: true, deployVerified: true, accepted: true },
  };
}
function ws(over: Partial<DriveState>): DriveState {
  return {
    phase: "feature", breakdownDone: true, storyOrder: ["S1"], stories: {},
    buildActive: null, ...over,
  };
}

describe("nextDesignAction: UX Designer establish (UI track, reached via the per-story IA refine)", () => {
  const stories = { S1: fresh(), S2: fresh(), S3: fresh() };
  it("does NOT establish right after breakdown — a fresh story goes to its ACs first", () => {
    // The establish is reached THROUGH the per-story IA refine (after a story's ACs),
    // never as a top-level step that preempts the design lane's breakdown -> ACs -> refine
    // order. A fresh story (no ACs) therefore routes to the spec-author, not the UX establish.
    expect(nextDesignAction(state({ uiTrack: true, designGuideReady: false, stories })))
      .toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
  it("establishes the design guide + ia.md skeleton when the FIRST story's IA refine finds none", () => {
    // S1 is past its ACs and reaches the IA-refine step with no project design guide yet:
    // it bounces up to the UX plan-role to establish, then drops back to refine next derivation.
    const s = { S1: withAcs(), S2: fresh() };
    expect(nextDesignAction(state({ uiTrack: true, designGuideReady: false, storyOrder: ["S1", "S2"], stories: s })))
      .toEqual({ kind: "invoke-role", role: "ux-designer", mode: "establish" });
  });
  it("skips establish once the design guide exists, proceeds to the first story's ACs", () => {
    expect(nextDesignAction(state({ uiTrack: true, designGuideReady: true, stories })))
      .toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
  it("never establishes when uiTrack is off (API / CLI / Infra projects)", () => {
    expect(nextDesignAction(state({ uiTrack: false, designGuideReady: false, stories })))
      .toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
  it("breakdown still comes first", () => {
    expect(nextDesignAction(state({ breakdownDone: false, uiTrack: true, designGuideReady: false, stories: {} })))
      .toEqual({ kind: "invoke-role", role: "spec-author", mode: "breakdown" });
  });
});

describe("nextDesignAction: UX IA refinement (per story, before the architect)", () => {
  // A story past its ACs but not yet IA-refined. designGuideReady:true so the per-story
  // IA branch refines (or projects) rather than bouncing up to establish the guide first.
  const acsOnly = (over: Partial<StoryView["design"]> = {}): DesignDriveState["stories"][string] => ({
    gateApproved: false,
    gateSurfaced: false,
    design: {
      hasAcs: true, iaRefined: false, iaProjectable: false, architectAnnotated: false, architectProjectable: false,
      dbaDesigned: false, testListReady: false, testListConforms: true, iaConforms: true, reflectionPassed: false, reflectionVerdictWritten: false,
      ...over,
    },
  });
  const ui = (stories: DesignDriveState["stories"]) => state({ uiTrack: true, designGuideReady: true, storyOrder: Object.keys(stories), stories });

  it("a UI-track story with ACs but no IA yet runs a LIVE ux ia turn — before the architect", () => {
    expect(nextDesignAction(ui({ S1: acsOnly() })))
      .toEqual({ kind: "invoke-role", role: "ux-designer", mode: "ia", story: "S1" });
  });
  it("PROJECTS IA coverage with no turn when the story's surfaces are already named (iaProjectable)", () => {
    expect(nextDesignAction(ui({ S1: acsOnly({ iaProjectable: true }) })))
      .toEqual({ kind: "project-ia-notes", story: "S1" });
  });
  it("skips IA refinement for a non-UI project (uiTrack off) — straight to the architect", () => {
    expect(nextDesignAction(state({ uiTrack: false, designGuideReady: false, storyOrder: ["S1"], stories: { S1: acsOnly() } })))
      .toEqual({ kind: "invoke-role", role: "architect-reviewer", story: "S1" });
  });
  it("once the IA is refined, proceeds to the architect (ux ia does not re-fire)", () => {
    expect(nextDesignAction(ui({ S1: acsOnly({ iaRefined: true }) })))
      .toEqual({ kind: "invoke-role", role: "architect-reviewer", story: "S1" });
  });
});

describe("nextTransition: UX Designer prerequisite (hoisted above build dispatch)", () => {
  it("a gate-approved story still WAITS for the design guide (UX wins over dispatch)", () => {
    // The reused-project / last-stage case: S1's spec gate is already approved
    // (would normally dispatch to build), but the project design guide does not
    // exist yet. The UX step must fire BEFORE the dispatch, so the UI is never
    // built against a guide that does not exist.
    const st = ws({ stories: { S1: gatedUnbuilt() }, uiTrack: true, designGuideReady: false });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "ux-designer", mode: "establish" });
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
  // The UX establish runs UNDER the intake gate: intake drafted + UI track + no guide yet -> establish,
  // BEFORE the intake gate is approved (so the human approves the design-guide + ia.md with the brief).
  it("establish fires under the intake gate (intakeReady + uiTrack + no guide)", () => {
    expect(nextTransition(ws({ phase: "planning", uiTrack: true, designGuideReady: false, planning: { intakeReady: true, intakeApproved: false, proposed: false, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "ux-designer", mode: "establish" });
  });
  it("once the guide exists, establish skips -> the intake gate parks for approval", () => {
    expect(nextTransition(ws({ phase: "planning", uiTrack: true, designGuideReady: true, planning: { intakeReady: true, intakeApproved: false, proposed: false, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "approve-intake-gate" });
  });
  it("no establish in planning for a non-UI project (uiTrack off)", () => {
    expect(nextTransition(ws({ phase: "planning", uiTrack: false, designGuideReady: false, planning: { intakeReady: true, intakeApproved: false, proposed: false, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "approve-intake-gate" });
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

  it("a per-AC LANE (isAcLane) does RED/GREEN then COMPLETEs — no per-lane review/refactor/deploy/accept", () => {
    // Fan-out lane: a coordinator-spawned sub-drive (CONSORT_AC_LANE) builds its scoped AC(s)
    // RED->GREEN and then EXITS so the coordinator can merge + fan out. Per-AC REVIEW/REFACTOR
    // and story-close deploy-verify/accept are deferred to the top-level drive on the MERGED
    // result — running them per lane deadlocks (the unscoped verify fails on sibling ACs built
    // in OTHER lanes, so the serial-first AC never closes and the fan-out never happens).
    const v = gatedUnbuilt();
    v.build.experimentCut = true;
    v.build.testsWritten = true;
    v.build.codeWritten = true;
    v.build.isAcLane = true;
    // A refactor the NON-lane path would run — the lane must NOT.
    v.build.reviewStoryPending = true;
    v.build.refactorStoryPending = true;
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    const act = nextTransition(st);
    expect(act).toEqual({ kind: "complete", story: "S1", laneExit: true });
    // laneExit marks the action "done" lane, so a `--only build` lane STOPS (no pipeline-complete)
    // instead of marking the whole STORY done (the hollow-fan-out bug).
    expect(actionLane(act)).toBe("done");
    // Same state WITHOUT the lane flag: the normal review/refactor/accept cadence runs.
    v.build.isAcLane = false;
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review" });
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
