// workflow-vocabulary: the WORKFLOW domain vocabulary – the WorkflowAction / DriveState type family
// (the WHAT a run is made of) plus the PURE predicates over them (escalationPreempt, actionLane,
// isHitlGateAction, isHumanInputAction, pauseBeforeMilestone). No I/O, no model, no dependency on the
// drive engine: the lower orchestrator layers (steps/turns/runners/state/agents/scenarios/optimize) and
// the drive transition ENGINE all depend DOWN on this. The engine (nextTransition / nextDesignAction /
// nextBuildAction, in drive/orchestrator-drive.ts) imports its vocabulary from here.

/** The design-lane roles, in the order a story flows through them. */
export type DesignRole = "spec-author" | "architect-reviewer" | "dba" | "test-strategist";

/** What a story has produced so far in the design lane (derived from disk). */
export interface StoryDesign {
  /** The Spec Author has drafted this story's acceptance criteria. */
  hasAcs: boolean;
  /** The Architect Reviewer has annotated layers / NFR coverage on the ACs. */
  architectAnnotated: boolean;
  /** This story's per-AC architectural_notes can be PROJECTED deterministically
   *  from the project canon (no architect turn): the feature architecture.json
   *  already exists, the canon is established, and the story is not novel. When
   *  false the architect is dispatched (to author architecture.json on the first
   *  story, or clean a novel story + amend the canon). Only consulted while
   *  architectAnnotated is false. */
  architectProjectable: boolean;
  /** The DBA has produced db-design.json realizing this story's persistence
   *  invariants (the physical schema). Runs after the architect, before the test
   *  strategist. A not-service_backed feature has nothing to realize, so this is
   *  satisfied without a DBA turn (see the probe). */
  dbaDesigned: boolean;
  /** The Test Strategist has produced this story's ordered test list. */
  testListReady: boolean;
  /** The pre-build reflection critic (Navigator, reflect mode) has PASSED this
   *  story's spec + test-list. A missing/failed verdict is not passed: the lane
   *  runs (or re-runs) the critic, and a failed verdict drives the spec-level
   *  smell -> revise-route -> HITL machinery. */
  reflectionPassed: boolean;
  /** The reflect turn produced a readable verdict (pass OR fail). The turn's
   *  deliverable is the verdict file; this is the expectation the driver enforces
   *  so a reflect turn that writes nothing escalates instead of looping. */
  reflectionVerdictWritten: boolean;
}

/** A story's design + gate status, as the driver sees it. */
export interface DriveStoryView {
  /** The per-story spec gate has been approved (story is done designing). */
  gateApproved: boolean;
  /** The gate has been surfaced for review (awaiting approval) but not approved. */
  gateSurfaced: boolean;
  design: StoryDesign;
}

export interface DesignDriveState {
  /** The Spec Author has enumerated the feature's stories (stubs written). */
  breakdownDone: boolean;
  /** Story ids in breakdown order; the lane advances them in this order. */
  storyOrder: string[];
  stories: Record<string, DriveStoryView>;
  /** UI track on (a design brief is part of intake): the UX Designer must
   *  produce the project style guide before any UI is architected or built. */
  uiTrack?: boolean;
  /** The project design guide (design-guide.json) exists, the UX Designer has
   *  already translated the design brief. Project-level, authored once. */
  designGuideReady?: boolean;
}

/** The single next design-lane action. A later phase maps each to an effect. */
export type DriveAction =
  | { kind: "invoke-role"; role: "spec-author"; mode: "breakdown" }
  // The UX Designer (UI track only) translates the design brief into the project
  // style guide. Feature/project-level + once, so no story scope.
  | { kind: "invoke-role"; role: "ux-designer" }
  | { kind: "invoke-role"; role: DesignRole; story: string }
  // Pre-build reflection gate: the Navigator (reflect mode) critiques the story's
  // spec slice + test-list before the human spec gate. A design-lane use of the
  // build reviewer role; buildMode "reflect" distinguishes it from its build turns.
  | { kind: "invoke-role"; role: "navigator"; story: string; buildMode: "reflect" }
  // Deterministically project this story's per-AC architectural_notes from the
  // project canon (no architect turn): the common case when the story maps cleanly.
  | { kind: "project-architect-notes"; story: string }
  | { kind: "surface-gate"; story: string }
  | { kind: "approve-gate"; story: string }
  | { kind: "design-complete" };


// --- Full workflow transition (planning + design + build + deploy) ----------
//
// nextTransition composes the lane sub-machines into the whole feature
// lifecycle. The design lane (above) streams stories through their gates; the
// single build lane then takes each gate-approved story through its experiment
// build and acceptance; when every story is accepted the feature deploys. On a
// single sequential build lane the precedence is: finish/advance the active
// build, else dispatch a ready story, else advance the design lane, so a story
// flows design -> gate -> build -> accept before the next is designed.

/** What a story has produced in the build lane (its experiment build). */
export interface StoryBuild {
  /** The paired experiment branch was cut. */
  experimentCut: boolean;
  /** A PRIOR experiment for this story was discarded (revise / rebuild-story), so
   *  the upcoming cut is a RE-cut. The paired Lakebase branch of the same
   *  deterministic name may still carry the discarded build's schema, so the
   *  re-cut must re-fork it clean (--reset-stale-branch), mirroring the ci-pr
   *  --reset-stale-branch precedent (Finding 27). */
  experimentDiscarded?: boolean;
  /** The active experiment was cut for a design (test-list) that has since been
   *  re-authored under it – its stamped design fingerprint no longer matches the
   *  story's current design. Reusing it would merge the superseded design's
   *  code/tests, so nextBuildAction re-cuts a fresh experiment (reset-stale-branch)
   *  instead. The stale-experiment guardrail; see design-fingerprint.ts. */
  experimentStale?: boolean;
  /** The Navigator wrote the (failing) tests for the story. */
  testsWritten: boolean;
  /** The Driver made the tests pass. */
  codeWritten: boolean;
  /** Build-loop granularity for this story. "story" (default) drives one
   *  story-scoped REVIEW + REFACTOR turn (reviewStoryPending / refactorStoryPending);
   *  "ac" / "hybrid-a" drive the per-AC reviewAc / refactorAc cadence. */
  loop?: "ac" | "hybrid-a" | "story";
  /** An AC whose tests are all green but not yet REVIEWed by the Navigator
   *  (against architecture + design guide), or null. Drives the per-AC REVIEW. */
  reviewAc?: string | null;
  /** An AC the Navigator REVIEW asked to refactor, not yet refactored by the
   *  Driver, or null. Drives the per-AC REFACTOR. */
  refactorAc?: string | null;
  /** Story-level ("story" granularity): the whole story is green but not yet
   *  REVIEWed (drives one story-scoped Navigator REVIEW turn). */
  reviewStoryPending?: boolean;
  /** Story-level: the story was REVIEWed with a refactor pending, not yet
   *  refactored (drives one story-scoped Driver REFACTOR turn). */
  refactorStoryPending?: boolean;
  /** An AC whose GREEN verify FAILED and has not yet been assessed, or null.
   *  Drives the reactive Navigator ASSESS turn: flag prior tests the AC
   *  supersedes (-> Driver permissive green) or confirm a genuine regression
   *  (-> escalate). */
  assessGreenAc?: string | null;
  /** An AC whose green-failure the Navigator assessed as a DRIVER-FIXABLE genuine
   *  regression (it recorded a fix directive), with its one repair not yet
   *  consumed, or null. Drives a bounded Driver REPAIR turn (the diagnosis +
   *  directive injected) before the honest-GREEN backstop escalates. */
  repairRegressionAc?: string | null;
  /** An AC whose green-failure the Navigator assessed as a SUPERSESSION (it flagged
   *  prior tests this AC retires in superseded-tests.json), the permissive re-green
   *  not yet consumed, or null. Drives a Driver GREEN-SUPERSEDED turn: the same
   *  honest GREEN as a plain re-green, but LABELED so the recorder writes a distinct
   *  turn dir. That label is what lets replay-build.ts + the corpus-integrity guard
   *  DROP the turn – at replay per-turn verify is trusted, so the assess -> re-green
   *  detour never re-dispatches (symmetric to repair). An un-labeled re-green records
   *  bare and reads as a spurious extra `green` in the kept replay shape. */
  greenSupersededAc?: string | null;
  /** An AC whose green-failure the Navigator assessed as a SPEC-DEFECT: the failing TEST (or the
   *  NFR it realizes) is itself wrong — unrealistic, unsatisfiable, or FLAKY — not a code regression.
   *  Drives a raise-to-hil recommending the proportionate build->design go-back (`reopen-story --from
   *  <specDefectFromRole>`), NOT a Driver repair. The code cannot fix a test that is wrong. */
  specDefectAc?: string | null;
  /** The design role a spec-defect recommends re-authoring (the test-list owner by default). */
  specDefectFromRole?: string;
  /** The built story was deployed for the PO's acceptance review. */
  awaitingAcceptance: boolean;
  /** The story's deploy verified (reachable + verify.passed on its experiment
   *  branch). The teeth on acceptance: a story cannot be accepted/merged unless
   *  its deploy proved working software. */
  deployVerified: boolean;
  /** Deploy-verify self-heal: the failure was classified as shared-state
   *  contamination (fails full-suite, passes in isolation) + not yet assessed.
   *  Drives one story-level Navigator ASSESS-DEPLOY turn before re-deploying. */
  refactorVerifyAssessEligible?: boolean;
  refactorVerifyRefactorPending?: boolean;
  deployVerifyAssessEligible?: boolean;
  /** Deploy-verify self-heal: the Navigator assessed + chose a scope set the
   *  Driver has not yet refactored. Drives one Driver SCOPE-DEPLOY turn. */
  deployVerifyRefactorPending?: boolean;
  /** The PO accepted: experiment merged into the feature branch, story done. */
  accepted: boolean;
}

/** A story's full design + gate + build status, as the driver sees it. */
export interface StoryView extends DriveStoryView {
  build: StoryBuild;
}

/** The driver's coarse phase: sprint planning, the per-feature streaming, the
 *  per-feature deploy (local working-software check), the promote (PR review +
 *  merge of the feature up to its parent tier), or done. (The fine-grained TDD
 *  phases live in the pipeline state the lane sub-machines read.) */
export type DrivePhase = "planning" | "feature" | "deploy" | "promote" | "done";

export interface PlanningState {
  /** The project intake exists on disk (product-overview.md + nfrs.md), so the Spec Author has
   *  something to propose FROM. Headless the Human Proxy deposits the recorded seeds (this reads
   *  true); interactively a fresh project starts WITHOUT them (false) and the drive first surfaces
   *  the Product Owner intake step to help the human author them. Absent = treated as satisfied
   *  (legacy/hermetic states that predate the field), so intake fires ONLY on an explicit `false`
   *  and every existing run is byte-identical. */
  intakeReady?: boolean;
  /** The human (or, headless, the Human Proxy) APPROVED the drafted intake at the intake gate. The
   *  drive parks at the intake gate after the PO drafts product-overview/nfrs/design-brief, so the
   *  human can review / edit / request changes, and only advances to the Spec Author's propose once
   *  approved. Absent = treated as satisfied (legacy/hermetic states), so the gate fires ONLY on an
   *  explicit `false` (intake ready but not yet approved) and every existing run is byte-identical. */
  intakeApproved?: boolean;
  /** The Spec Author proposed the sprint's candidate feature breakdown. */
  proposed: boolean;
  /** The Architect t-shirt-sized the candidates (planning/estimates.json), so
   *  the Product Owner can commit against sprint capacity. */
  estimated: boolean;
  /** Policy: skip the Architect's estimation (t-shirt sizing) step entirely
   *  (`--no-sizing`). When set, the machine routes proposed -> author-requests
   *  with no estimate action, and the backlog is projected without sizes. A
   *  config decision threaded from the CLI, NOT derived from disk. */
  skipSizing?: boolean;
  /** The BACKLOG gate is approved: the human SELECTED which proposed features enter
   *  the sprint and committed them (`requested.json` written; sync-backlog projected
   *  backlog.json). This is the human's pick, distinct from `requestsAuthored` (the
   *  metered PO turn then AUTHORS each committed feature's feature-request.md). The
   *  drive parks at the backlog gate until committed. Absent = treated as satisfied
   *  (legacy/hermetic states that predate the field), so the gate fires ONLY on an
   *  explicit `false` and every existing run is byte-identical (same convention as
   *  `intakeApproved` / `committedEstimated`). The deriver always sets it explicitly. */
  backlogCommitted?: boolean;
  /** The metered Product Owner `author-requests` turn wrote a feature-request.md per
   *  COMMITTED feature (the folder ids in requested.json). A recorded seed that already
   *  exists + conforms is COPIED at the backlog gate (not re-authored), so a seed/replay
   *  run has this true without the turn firing; only ABSENT (live) requests are authored
   *  by the turn. */
  requestsAuthored: boolean;
  /** Every COMMITTED backlog feature has a t-shirt estimate under its own id
   *  (estimates.json), so sync-backlog can stamp a per-sprint size. Distinct from
   *  `estimated` (the CANDIDATE FP sizing): candidate ids never reconcile to the
   *  committed feature ids drawn from intake, and a re-plan sprint reuses the
   *  standing proposals+candidate-estimates but still commits a NEW feature that
   *  needs sizing. When false (and sizing is not skipped) the machine routes the
   *  Architect's `estimate-committed` turn after author-requests. Absent = treated
   *  as satisfied (legacy states / single-sprint runs that never set it). */
  committedEstimated?: boolean;
  /** The sprint PLAN gate has been approved (human live, or Human Proxy
   *  headless). The HITL checkpoint between planning and execution; a re-plan
   *  the human "passes on" simply re-approves the standing backlog. */
  gateApproved?: boolean;
}

export interface DeployState {
  /** The Release Engineer deployed the feature to the target. */
  deployed: boolean;
  /** The PO signed the deploy (working-software) gate. */
  gateApproved: boolean;
  /** Feature-ship deploy-verify self-heal: the feature-level deploy-verify failed
   *  on shared-state contamination (a feature-scope marker was written, not an
   *  escalation) + is not yet assessed. Routes ONE Navigator ASSESS-DEPLOY turn at
   *  feature scope before the deploy gate, mirroring the per-story self-heal. */
  verifyAssessEligible?: boolean;
  /** The Navigator assessed the feature-ship failure + chose a scope set the Driver
   *  has not yet refactored. Routes ONE Driver SCOPE-DEPLOY turn (feature scope). */
  verifyRefactorPending?: boolean;
  /** The feature deploy-evidence's verify verdict (issue #198): true = the feature
   *  verify passed, false = it FAILED (stale evidence an approve can never clear),
   *  undefined = no evidence yet. The deploy gate reads only gates.json, so the
   *  derivation must read the verdict itself to route a failed deploy anywhere but
   *  a doomed approve. */
  verifyPassed?: boolean;
  /** The ONE bounded re-verify after a failed deploy already ran (the
   *  deploy-reverify.json marker exists): a still-failing verdict now routes a
   *  terminal HIL instead of repeating an approve that cannot advance (the stall). */
  reverifyAttempted?: boolean;
}

/** The promote phase: take the accepted feature through its PR review (the
 *  lakebase-scm-workflows ladder) and MERGE it up into its parent tier (e.g.
 *  staging) in git + Lakebase, so the next sprint forks from a populated parent.
 *  A "release into a long-running branch" (the deterministic promote/merge). The
 *  SCM ladder (feature-claimed -> pr-ready -> ci-green -> merged) backs the first
 *  three; the `promote` HITL gate is the human's PR acceptance, BEFORE the merge. */
export interface PromoteState {
  /** prepare-pr done: the feature branch is pushed + a PR is open (scm pr-ready). */
  prReady: boolean;
  /** wait-ci done: the PR's regression gate is green (scm ci-green). */
  ciGreen: boolean;
  /** The HITL `promote` gate is approved: the human/PO accepted the PR. The
   *  approval comes AFTER ci-green and BEFORE the merge. */
  prApproved: boolean;
  /** merge done: the feature was merged (released) into the parent tier in git +
   *  Lakebase and the downstream migrate ran (scm merged). */
  merged: boolean;
}

/** A blocking problem an agent/step surfaced, derived from disk (escalation
 *  files + blocking smells). Structural copy of escalation.ts's Escalation so the
 *  pure state machine stays fs-free. While one is unresolved the driver routes to
 *  raise-to-hil before any other transition. */
export interface DriveEscalation {
  id: string;
  source: string;
  reason: string;
  story_id?: string;
  /** revise-routing: set by the probe when this is a SPEC-level smell
   *  whose one-revise-per-(smell,story) budget is not yet spent. When present,
   *  nextTransition routes to `revise-route` (send the owning author the verdict,
   *  re-gate, resume) instead of the terminal `raise-to-hil`. Absent => hard halt
   *  (build-level smell, an explicit escalation file, or the revise budget spent). */
  routable?: {
    story: string;
    owning_role: "spec-author" | "test-strategist" | "architect-reviewer";
    gate: "spec" | "test_list" | "architecture";
  };
}

export interface DriveState {
  phase: DrivePhase;
  planning?: PlanningState;
  breakdownDone: boolean;
  storyOrder: string[];
  stories: Record<string, StoryView>;
  /** The story the single build lane is on, or null when idle. */
  buildActive: string | null;
  deploy?: DeployState;
  /** The promote phase's progress (PR review + merge to parent). */
  promote?: PromoteState;
  /** UI track on (set from cfg.uiTrack at readState): gates the UX Designer step. */
  uiTrack?: boolean;
  /** The project design guide exists (design-guide.json on disk). */
  designGuideReady?: boolean;
  /** An unresolved blocking escalation (failed-green run, blocking smell, verify
   *  fail). When set, nextTransition pre-empts everything with raise-to-hil. */
  escalation?: DriveEscalation | null;
}

export type WorkflowAction =
  | DriveAction
  | { kind: "invoke-role"; role: "spec-author"; mode: "propose" }
  | { kind: "invoke-role"; role: "architect-reviewer"; mode: "estimate" }
  | { kind: "invoke-role"; role: "architect-reviewer"; mode: "estimate-committed" }
  | { kind: "invoke-role"; role: "product-owner"; mode: "intake" }
  | { kind: "invoke-role"; role: "product-owner"; mode: "author-requests" }
  | { kind: "approve-intake-gate" }
  | { kind: "approve-backlog-gate" }
  | { kind: "approve-plan-gate" }
  | { kind: "planning-complete" }
  | { kind: "dispatch"; story: string }
  | { kind: "cut-experiment"; story: string; resetStaleBranch?: boolean }
  | {
      kind: "invoke-role";
      role: "navigator" | "driver";
      story: string;
      buildMode?: "review" | "refactor" | "assess" | "repair" | "assess-deploy" | "refactor-deploy" | "assess-refactor" | "refactor-superseded" | "green-superseded";
      ac?: string;
    }
  // FEATURE-ship deploy-verify self-heal: the assess (navigator) / scope (driver)
  // turns at FEATURE scope (no story), routed from the deploy phase. A distinct
  // action kind so the build-lane invoke-role keeps its required `story` (its many
  // consumers rely on it) and this feature-scope path stays fully isolated.
  | { kind: "deploy-verify-heal"; role: "navigator" | "driver"; mode: "assess-deploy" | "refactor-deploy" }
  // Re-verify after a FAILED feature deploy (issue #198): the deploy-evidence
  // verdict is false and no approve can clear it, so the drive re-runs deploy+verify
  // ONCE (the effect writes the deploy-reverify marker that bounds the retry; a
  // repeat failure routes a terminal HIL, never a repeated approve).
  | { kind: "deploy-verify-reverify" }
  | { kind: "await-acceptance"; story: string }
  | { kind: "accept"; story: string }
  | { kind: "complete"; story: string }
  | { kind: "feature-complete" }
  | { kind: "deploy" }
  | { kind: "approve-deploy-gate" }
  // Promote phase (after the deploy gate): take the accepted feature through PR
  // review (prepare-pr -> wait-ci -> the HITL `promote` gate) and MERGE it up to
  // the parent tier. deploy-complete flips the coarse phase deploy -> promote.
  | { kind: "deploy-complete" }
  | { kind: "prepare-pr" }
  | { kind: "wait-ci" }
  | { kind: "approve-promote-gate" }
  | { kind: "merge" }
  | { kind: "raise-to-hil"; reason: string; source: string; story?: string }
  // a SPEC-level blocking smell the PO can send back to its owning
  // author and resume, instead of hard-halting. Routes the verdict (reason) to
  // the owning author at its gate, resets the story to designing, and the
  // standing design lane re-runs Gate 1->2->3 before the build resumes.
  | {
      kind: "revise-route";
      story: string;
      role: "spec-author" | "test-strategist" | "architect-reviewer";
      gate: "spec" | "test_list" | "architecture";
      reason: string;
      source: string;
    }
  | { kind: "done" };


/**
 * The single next action for the whole feature workflow. Pure.
 *
 * Precedence:
 *   planning:  propose -> estimate -> backlog gate -> author-requests ->
 *              estimate-committed -> plan gate -> planning-complete.
 *   feature:   advance the active build; else dispatch a ready (gate-approved,
 *              unbuilt) story into the idle lane; else advance the design lane;
 *              else (all accepted) feature-complete.
 *   deploy:    deploy -> approve-deploy-gate -> done.
 */
/**
 * The escalation pre-empt shared by BOTH the full transition and the --only
 * design bound: any unresolved blocking problem an agent surfaced (a failed
 * honest-GREEN run, a blocking bad-smell, a reflect defect, a deploy verify-fail)
 * routes to revise-route (a SPEC-level smell with revise budget left, recoverable:
 * send the verdict back to its owning author + re-gate + resume) or the terminal
 * raise-to-hil halt (everything else). Returns undefined when there is no
 * escalation, so the caller proceeds to its normal transition. Extracted so the
 * design-only path cannot silently omit it (the omission that let a reflect
 * defect re-loop the reflect turn until the stall guard fired). */
export function escalationPreempt(state: DriveState): WorkflowAction | undefined {
  if (!state.escalation) return undefined;
  const e = state.escalation;
  if (e.routable) {
    return {
      kind: "revise-route",
      story: e.routable.story,
      role: e.routable.owning_role,
      gate: e.routable.gate,
      reason: e.reason,
      source: e.source,
    };
  }
  return { kind: "raise-to-hil", reason: e.reason, source: e.source, ...(e.story_id ? { story: e.story_id } : {}) };
}


/**
 * A handoff the human can PAUSE a driver run just before (a HITL gate, not a
 * bail-out): "navigator" = the first build handoff (the Navigator kickoff, before
 * any code is written), "release-engineer" = the deploy/verify (the Release
 * Engineer takes the built + reviewed story and ships it). The driver blocks at
 * the gate, prompts the human [Y/n], and RESUMES the same run on Y, it never
 * leaves the state machine. Backs run-to-navigator / run-to-release-engineer and
 * the `--pause-before` flag.
 */
export type PauseMilestone = "navigator" | "release-engineer";

/** A predicate matching the action JUST BEFORE the given handoff fires (the
 *  driver pauses for the human's Y/n the first time this matches). */
export function pauseBeforeMilestone(m: PauseMilestone): (action: WorkflowAction) => boolean {
  switch (m) {
    case "navigator":
      // The initial Navigator handoff writes the first failing test (tests not
      // yet written). The per-AC REVIEW/REFACTOR turns also invoke the navigator
      // but carry a buildMode, so exclude those, we pause at the build kickoff.
      return (a) => a.kind === "invoke-role" && a.role === "navigator" && a.buildMode === undefined;
    case "release-engineer":
      // The per-story deploy + verify (await-acceptance) and the feature-level
      // deploy both hand the working software to the Release Engineer.
      return (a) => a.kind === "await-acceptance" || a.kind === "deploy";
  }
}

/** The lane a WorkflowAction belongs to, for the driver's Tier-2 phase bounds.
 *  "coarse" is the feature->deploy boundary (feature-complete). */
export type ActionLane = "planning" | "design" | "build" | "deploy" | "promote" | "coarse" | "done";

export function actionLane(action: WorkflowAction): ActionLane {
  switch (action.kind) {
    case "invoke-role": {
      if ("mode" in action) {
        // propose / author-requests are sprint planning; breakdown is design.
        return action.mode === "breakdown" ? "design" : "planning";
      }
      return action.role === "navigator" || action.role === "driver" ? "build" : "design";
    }
    case "approve-intake-gate":
    case "approve-backlog-gate":
    case "approve-plan-gate":
    case "planning-complete":
      return "planning";
    case "project-architect-notes":
    case "surface-gate":
    case "approve-gate":
    case "design-complete":
      return "design";
    case "dispatch":
    case "cut-experiment":
    case "await-acceptance":
    case "accept":
    case "complete":
      return "build";
    case "feature-complete":
      return "coarse";
    case "deploy":
    case "approve-deploy-gate":
    case "deploy-verify-heal":
    case "deploy-verify-reverify":
      return "deploy";
    case "deploy-complete":
    case "prepare-pr":
    case "wait-ci":
    case "approve-promote-gate":
    case "merge":
      return "promote";
    case "raise-to-hil":
      // Terminal halt: surfaced to the HIL, the run stops here for a human.
      return "done";
    case "revise-route":
      // re-enter the design lane at the owning author (resume, not halt).
      return "design";
    case "done":
      return "done";
  }
}

/**
 * The HITL gate-approval actions: the decisions a HUMAN owns (live), or the
 * Human Proxy stands in for (headless). In interactive gate mode the driver
 * STOPS before these so the session can surface the gate and the human answers;
 * in proxy mode the driver performs them (the Proxy approves). The spec gate
 * (approve-gate), the sprint plan gate (approve-plan-gate), the deploy gate
 * (approve-deploy-gate), and the per-story PO acceptance (accept).
 */
export function isHitlGateAction(action: WorkflowAction): boolean {
  return (
    action.kind === "approve-gate" ||
    action.kind === "approve-intake-gate" ||
    action.kind === "approve-backlog-gate" ||
    action.kind === "approve-plan-gate" ||
    action.kind === "approve-deploy-gate" ||
    action.kind === "approve-promote-gate" ||
    action.kind === "accept"
  );
}

/**
 * Steps where the HUMAN provides an input the machine cannot synthesize (not an
 * approval of already-produced work). There are none today: the sprint's feature
 * SELECTION is now the BACKLOG GATE (a HITL gate — isHitlGateAction), where the
 * human picks which proposed features enter the sprint; the per-feature
 * feature-request.md is then authored by the metered `author-requests` PO turn
 * (an agent turn, not a human hand-off). Retained as the seam the driver's
 * pendingInput plumbing keys off, so a future genuine human-input step has one
 * place to declare itself; it matches nothing now.
 */
export function isHumanInputAction(_action: WorkflowAction): boolean {
  return false;
}

