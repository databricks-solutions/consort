// Orchestrator-as-deterministic-driver, phase 1: the per-story DESIGN lane as a
// pure state machine.
//
// The orchestrator's routing is deterministic: given the recorded state, the
// next action is a pure function of priors. nextDesignAction computes the single
// next DESIGN-lane action from a snapshot of the breakdown + each story's design
// progress + its gate. No I/O, no model: the effectful driver (a later phase)
// reads the state off disk, calls this to decide, performs the action, and
// records it (the phase/handoff log emitted as code, not prose-instructed model
// behavior, so observability can never be silently dropped).
//
// The streaming invariant the LLM kept violating (batching every story's ACs at
// once) is structural here: the function always advances the FIRST not-yet-gated
// story in breakdown order, so exactly one story is ever in design at a time and
// the spec-author is invoked per story. See
// docs/design/refactor/orchestrator-deterministic-driver.md.


// The workflow vocabulary (types + pure predicates) lives in the sibling workflow/ layer; this engine
// imports what it needs DOWN from there and RE-EXPORTS the whole vocabulary so the many existing
// importers of orchestrator-drive keep resolving every symbol unchanged.
import {
  type DesignDriveState, type DriveAction, type StoryBuild, type DriveState, type WorkflowAction,
  escalationPreempt,
} from "../workflow/workflow-vocabulary.js";
export * from "../workflow/workflow-vocabulary.js";

/**
 * UI track: the project design guide (the UX Designer's output) is a hard
 * prerequisite for building any UI. True when the UI track is on, the feature is
 * broken down (the UX Designer needs the spec), and the guide is not on disk
 * yet. Used BOTH in the design lane and (hoisted) in nextTransition before the
 * build lane dispatches, so a pre-gated story still waits for the guide.
 */
export function uxDesignerPending(s: {
  uiTrack?: boolean;
  breakdownDone: boolean;
  designGuideReady?: boolean;
}): boolean {
  return !!s.uiTrack && s.breakdownDone && !s.designGuideReady;
}

/**
 * Compute the next design-lane action from the recorded state. Pure.
 *
 * Order of precedence:
 *   1. Break the feature down if not done.
 *   2. UI track: author the project design guide (UX Designer) once.
 *   3. Otherwise advance the FIRST story (in breakdown order) whose gate is not
 *      yet approved, through: ACs -> architecture -> tests -> surface -> approve.
 *   4. When every story's gate is approved, the design lane is complete.
 */
export function nextDesignAction(state: DesignDriveState): DriveAction {
  if (!state.breakdownDone) {
    return { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
  }

  // UI track: the UX Designer translates the design brief into the project style
  // guide ONCE (design-guide.{md,json} + ia.md), after breakdown and before any
  // story is architected or built, so the Architect's E2E layers and the
  // Navigator/Driver's UI build against it. Idempotent: skipped once the guide
  // exists (project-level, reused across features).
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
  }

  for (const story of state.storyOrder) {
    const v = state.stories[story];
    // A story absent from the snapshot is treated as fresh (nothing designed).
    if (v?.gateApproved) continue; // done designing; move on
    const design = v?.design ?? {
      hasAcs: false,
      architectAnnotated: false,
      architectProjectable: false,
      dbaDesigned: false,
      testListReady: false,
      reflectionPassed: false,
      reflectionVerdictWritten: false,
    };

    if (!design.hasAcs) return { kind: "invoke-role", role: "spec-author", story };
    // Architect step: PROJECT the per-AC notes from the canon when the story maps
    // cleanly (no turn); otherwise dispatch the architect live – to author the
    // feature architecture.json on the first story, or clean a novel story + amend
    // the canon (the architect-canon-gap self-heal handles a mis-projection later).
    if (!design.architectAnnotated) {
      if (design.architectProjectable) return { kind: "project-architect-notes", story };
      return { kind: "invoke-role", role: "architect-reviewer", story };
    }
    // DBA step: once the architect has annotated the story, the DBA realizes the
    // physical schema (db-design.json) before the test list is built. The probe
    // satisfies this without a turn for a not-service_backed feature (nothing to
    // realize), so a trivial feature skips straight to the test strategist.
    if (!design.dbaDesigned) return { kind: "invoke-role", role: "dba", story };
    if (!design.testListReady) return { kind: "invoke-role", role: "test-strategist", story };
    // Pre-build reflection: the Navigator critiques the (now complete) spec +
    // test-list BEFORE the human spec gate + the build. On findings it flags a
    // spec-level smell that the escalation machinery routes back to the owning
    // author (bounded one revise, then HITL) BEFORE this returns again; here we
    // only advance once the critic has PASSED the story.
    if (!design.reflectionPassed) return { kind: "invoke-role", role: "navigator", story, buildMode: "reflect" };
    if (!v?.gateSurfaced) return { kind: "surface-gate", story };
    return { kind: "approve-gate", story };
  }

  return { kind: "design-complete" };
}

/** The next build-lane action for the story the lane is on. */
function nextBuildAction(story: string, b: StoryBuild): WorkflowAction {
  if (!b.experimentCut || b.experimentStale) {
    // A re-cut after a discarded experiment re-forks the polluted paired branch. A STALE
    // experiment (still active, but its design was re-authored under it – the withdraw-gate
    // + set-status hazard) is treated the same: re-fork clean off the feature branch so the
    // superseded design's code/tests cannot ride into the merge. Both re-cuts reset the
    // stale paired branch; a fresh first cut does not.
    return b.experimentDiscarded || b.experimentStale
      ? { kind: "cut-experiment", story, resetStaleBranch: true }
      : { kind: "cut-experiment", story };
  }
  // Per-AC RED -> GREEN -> REVIEW -> REFACTOR: each AC completes its full cycle
  // before the next AC's first test is written. The per-story BUILD list is
  // grouped by AC (scopeToStory), so once an AC's tests are all green its REVIEW
  // (Navigator, against architecture + design guide) and any REFACTOR (Driver)
  // fire HERE, ABOVE the test-writing/greening steps below. That ordering is the
  // whole point: were these checks below `testsWritten`, the Navigator would jump
  // to the next AC's RED test before the just-greened AC was reviewed/refactored,
  // batching all refactors to the end of the story. reviewAc/refactorAc are
  // per-AC (firstReviewPendingAc / firstRefactorPendingAc): each only fires for
  // an AC whose tests are ALL green, so a half-built AC is never reviewed.
  // Story granularity (default): the Navigator REVIEWs the WHOLE story in one
  // turn and the Driver REFACTORs it in one turn (no `ac`), instead of cycling
  // per AC. Placed, like the per-AC checks, ABOVE the RED/GREEN steps so a
  // green story is reviewed/refactored before the lane advances to acceptance.
  // Refactor-verify supersession self-heal (pre-empts the refactor-pending re-route
  // below: a failed refactor verify leaves refactored_at unstamped, so
  // refactorStoryPending stays true; these checks must run FIRST so the failure
  // routes to a bounded Navigator assess instead of blindly re-refactoring). A
  // refactor-verify break may be a PRIOR test this story legitimately supersedes;
  // the Navigator assesses (flag superseded -> Driver permissively refactors ONLY
  // those, OR veto -> genuine regression escalates), then ONE honest re-verify.
  if (b.refactorVerifyAssessEligible) return { kind: "invoke-role", role: "navigator", story, buildMode: "assess-refactor" };
  if (b.refactorVerifyRefactorPending) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor-superseded" };
  if ((b.loop ?? "story") === "story") {
    if (b.reviewStoryPending) return { kind: "invoke-role", role: "navigator", story, buildMode: "review" };
    if (b.refactorStoryPending) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor" };
  } else {
    if (b.reviewAc) return { kind: "invoke-role", role: "navigator", story, buildMode: "review", ac: b.reviewAc };
    if (b.refactorAc) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor", ac: b.refactorAc };
  }
  // Reactive supersession trigger: an open AC whose GREEN verify failed + has not
  // been assessed routes the Navigator to ASSESS the failure (flag prior tests
  // the AC supersedes -> the Driver then permissively greens them, OR confirm a
  // genuine regression -> escalate). Pre-empts the Driver's plain green re-attempt
  // below so the same failing verify is not blindly re-run.
  if (b.assessGreenAc) return { kind: "invoke-role", role: "navigator", story, buildMode: "assess", ac: b.assessGreenAc };
  // The Navigator assessed a driver-fixable regression + recorded a fix directive:
  // route a bounded Driver REPAIR turn (diagnosis + directive injected). One shot,
  // then the honest-GREEN backstop escalates with the diagnosis. Pre-empts the
  // Driver's plain green re-attempt below.
  if (b.repairRegressionAc) return { kind: "invoke-role", role: "driver", story, buildMode: "repair", ac: b.repairRegressionAc };
  // Pure-supersession re-GREEN: the Navigator ASSESSED the green-failure and flagged
  // prior tests this AC supersedes (superseded-tests.json), with NO genuine regression
  // to repair. The Driver permissively re-greens – the SAME honest GREEN as the plain
  // path below – but this turn is LABELED green-superseded so the recorder writes a
  // distinct dir the replay filter + corpus guard drop (per-turn verify is trusted at
  // replay, so this assess->re-green detour never re-dispatches). Runs AFTER repair so
  // a mixed verdict (supersession + regression) takes the repair path, which does both.
  if (b.greenSupersededAc) return { kind: "invoke-role", role: "driver", story, buildMode: "green-superseded" };
  // The Navigator assessed the failure as a SPEC-DEFECT: the failing TEST (or its NFR) is itself
  // wrong — unrealistic/unsatisfiable/FLAKY — not a code regression. The Driver cannot fix a test
  // that is wrong (it would just overwrite good code), and the test-list is frozen in-build, so this
  // must go BACK to the design lane. Surface a raise-to-hil recommending the proportionate go-back
  // (`consort-reopen-story --from <specDefectFromRole>`), NOT a Driver repair. Idempotent: the marker
  // persists, so this re-derives until the human reopens (which clears the green-failure).
  if (b.specDefectAc) {
    const scope = b.specDefectFromRole ?? "test-strategist";
    return {
      kind: "raise-to-hil",
      source: "spec-defect",
      reason:
        `The failing test/NFR for ${b.specDefectAc} is a SPEC-DEFECT (the test is wrong, not the code) — ` +
        `revise it in the design lane, do NOT repair the code. Recommended: reopen this story from the ` +
        `${scope} (consort-reopen-story --from ${scope}), re-author, and rebuild.`,
      story,
    };
  }
  // Test-list-driven RED/GREEN handoff for the current (un-reviewed) AC's tests:
  // !testsWritten -> Navigator writes the next pending RED; !codeWritten ->
  // Driver greens the open RED. With the AC-grouped list, "next pending" is
  // always in the current AC until it is green (then the checks above pre-empt).
  if (!b.testsWritten) return { kind: "invoke-role", role: "navigator", story };
  if (!b.codeWritten) return { kind: "invoke-role", role: "driver", story };
  if (!b.awaitingAcceptance) return { kind: "await-acceptance", story };
  // Deploy-verify self-heal: the deploy ran but verify FAILED as shared-state
  // CONTAMINATION (fails the full feature suite, passes in isolation – a prior
  // test that does not own its DB state, e.g. an absolute whole-table aggregate).
  // The deploy step suppressed the terminal escalation into a one-shot marker
  // instead. Route it BEFORE re-deploying so the same fragile test is not re-run
  // blindly: one story-level Navigator ASSESS-DEPLOY turn (confirm the fragile
  // set + write scope directives) -> one Driver SCOPE-DEPLOY turn (refactor those
  // tests to own their state) -> the re-deploy below re-verifies. The one-shot
  // bound lives in the marker + the deploy step: after the single assess+scope,
  // a still-failing re-deploy is NOT re-suppressed, so it writes the terminal
  // escalation and the escalation pre-empt halts to the HIL (no spin).
  if (b.deployVerifyAssessEligible) return { kind: "invoke-role", role: "navigator", story, buildMode: "assess-deploy" };
  if (b.deployVerifyRefactorPending) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor-deploy" };
  // Teeth: a story cannot be accepted (merged) until its deploy verified
  // (reachable + verify.passed). Re-deploy until it does; a story that never
  // verifies surfaces as a stall, not a silent merge of broken software.
  if (!b.deployVerified) return { kind: "await-acceptance", story };
  if (!b.accepted) return { kind: "accept", story };
  return { kind: "complete", story }; // built + accepted -> free the lane
}


export function nextTransition(state: DriveState): WorkflowAction {
  // Escalation pre-empts everything: it never false-greens past the problem or
  // silently stalls (the await-acceptance spin). Shared with the design-only bound.
  const preempt = escalationPreempt(state);
  if (preempt) return preempt;

  if (state.phase === "planning") {
    const p = state.planning ?? { proposed: false, estimated: false, requestsAuthored: false };
    // Intake FIRST: the Spec Author proposes FROM product-overview.md + nfrs.md, so intake must
    // exist before anything else. Headless the Human Proxy has already deposited the recorded seeds
    // (intakeReady true), so this is a no-op; a fresh interactive project has none (intakeReady
    // false) and the drive surfaces the PO intake step to help the human author them. Fires ONLY on
    // an EXPLICIT `false`: absent/undefined (legacy + hermetic states) is treated as satisfied, so
    // every existing run is byte-identical (same convention as `committedEstimated === false`).
    if (p.intakeReady === false) return { kind: "invoke-role", role: "product-owner", mode: "intake" };
    // Intake drafted but NOT yet approved: PARK at the intake gate so the human reviews / edits /
    // requests changes on product-overview/nfrs/design-brief BEFORE the Spec Author proposes from
    // them. Headless the Human Proxy approves it (intakeApproved true), so replay/CI never park.
    // Fires ONLY when intake is ready AND explicitly unapproved (absent/undefined = satisfied).
    if (p.intakeReady === true && p.intakeApproved === false) return { kind: "approve-intake-gate" };
    if (!p.proposed) return { kind: "invoke-role", role: "spec-author", mode: "propose" };
    // The Architect t-shirt-sizes the candidates before the PO commits, so the
    // PO can pick a backlog that fits sprint capacity (the team's estimation).
    // `--no-sizing` (p.skipSizing) drops this step: proposed -> author-requests
    // with no estimate action, for a backlog small enough not to need sizing.
    if (!p.skipSizing && !p.estimated) return { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" };
    // BACKLOG gate: the human picks WHICH sized proposals enter the sprint + commits
    // them (requested.json). PARK here until committed — headless the Human Proxy
    // commits the recorded selection (backlogCommitted true, so replay/CI never park);
    // interactively the drive stops and surfaces the backlog gate. Distinct from the
    // authoring turn below: this is the SELECTION, that is the drafting. Fires ONLY on an
    // EXPLICIT false: absent/undefined (legacy + hermetic literal states) is treated as
    // satisfied, so every existing run is byte-identical (same convention as intakeApproved).
    if (p.backlogCommitted === false) return { kind: "approve-backlog-gate" };
    // The metered Product Owner turn authors a feature-request.md per COMMITTED feature.
    // A recorded seed already copied at the gate makes requestsAuthored true (the turn
    // never fires — byte-identical replay); only ABSENT (live) requests are authored here.
    if (!p.requestsAuthored) return { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
    // After the PO commits, size the COMMITTED feature(s) by their real ids so
    // sync-backlog can stamp a per-sprint size (the candidate FP estimate above is
    // keyed to proposal ids that never reconcile to the intake-drawn committed
    // ids). Fires on EVERY sprint whose committed features are not yet sized ,
    // including a re-plan that reused the standing proposals+candidate-estimates.
    // `--no-sizing` (skipSizing) drops this too. `committedEstimated===false` only
    // (absent = legacy/single-sprint states that never set it, treated as done).
    if (!p.skipSizing && p.committedEstimated === false)
      return { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" };
    // The sprint plan gate is the HITL checkpoint between planning + execution.
    // It locks the backlog (human live / Human Proxy headless) before any
    // feature is driven; "pass on a re-plan" = re-approve the standing backlog.
    if (!p.gateApproved) return { kind: "approve-plan-gate" };
    return { kind: "planning-complete" };
  }

  if (state.phase === "deploy") {
    const d = state.deploy ?? { deployed: false, gateApproved: false };
    if (!d.deployed) return { kind: "deploy" };
    // Feature-ship deploy-verify self-heal (the F1-ship halt): a feature-level
    // verify that failed on shared-state contamination routes the SAME
    // assess -> scope -> re-deploy loop as a per-story deploy, but at FEATURE
    // scope (no story), BEFORE the deploy gate. The re-deploy clears the marker
    // on pass; a repeat failure (one-shot spent) falls through to the terminal HIL.
    if (d.verifyAssessEligible) return { kind: "deploy-verify-heal", role: "navigator", mode: "assess-deploy" };
    if (d.verifyRefactorPending) return { kind: "deploy-verify-heal", role: "driver", mode: "refactor-deploy" };
    if (!d.gateApproved) {
      // Re-verify-after-fix (issue #198): the deploy RAN but the evidence records
      // verify.passed=false – an approve can NEVER clear stale failed evidence (the
      // gate refuses it), so deriving approve again is the exact "repeated without
      // advancing" stall. Route ONE bounded re-verify (re-run deploy+verify, which
      // rewrites the evidence); a still-failing verdict after that retry is a
      // terminal HIL with the recovery, never another approve.
      if (d.verifyPassed === false) {
        if (d.reverifyAttempted) {
          return {
            kind: "raise-to-hil",
            source: "deploy-verify-failed",
            reason:
              `The feature deploy-verify still fails after a re-deploy + re-verify ` +
              `(deploy-evidence.json records verify.passed=false). This needs a human, not another approve: ` +
              `inspect the evidence's verify output, fix the cause, then re-run ` +
              `\`./scripts/lk consort-deploy --target local --feature <F>\` (kill any stale ` +
              `deploy server first: \`lsof -tiTCP:8000 | xargs kill\`) and approve the deploy gate.`,
          };
        }
        return { kind: "deploy-verify-reverify" };
      }
      return { kind: "approve-deploy-gate" };
    }
    // Deploy (local working-software check) done -> enter the promote phase.
    return { kind: "deploy-complete" };
  }

  if (state.phase === "promote") {
    // Take the accepted feature through PR review, then merge it up to the parent
    // tier. PR review (prepare-pr -> wait-ci) comes BEFORE the human's `promote`
    // gate, which comes BEFORE the merge (the actual promotion). The SCM CLIs
    // advance the SCM ladder (pr-ready -> ci-green -> merged); the merge releases
    // the feature into staging in git + Lakebase, so the next sprint forks from a
    // populated parent.
    const pr = state.promote ?? { prReady: false, ciGreen: false, prApproved: false, merged: false };
    if (!pr.prReady) return { kind: "prepare-pr" };
    if (!pr.ciGreen) return { kind: "wait-ci" };
    if (!pr.prApproved) return { kind: "approve-promote-gate" };
    if (!pr.merged) return { kind: "merge" };
    return { kind: "done" };
  }

  if (state.phase === "done") return { kind: "done" };

  // phase === "feature": stream design + build.
  // UI-track prerequisite: the project design guide must exist before ANY UI is
  // built. Run the UX Designer (once, after breakdown) BEFORE the build lane can
  // dispatch a story, so a story whose spec gate is already approved still waits
  // for the guide rather than building UI against a guide that does not exist.
  // Idempotent: skipped once design-guide.json is on disk.
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
  }
  // 1. Finish/advance the story the build lane is already on.
  if (state.buildActive) {
    return nextBuildAction(state.buildActive, state.stories[state.buildActive].build);
  }
  // 2. Lane idle: dispatch the first gate-approved, not-yet-accepted story.
  for (const story of state.storyOrder) {
    const v = state.stories[story];
    if (v?.gateApproved && !v.build.accepted) return { kind: "dispatch", story };
  }
  // 3. Otherwise advance the design lane (reusing the design sub-machine).
  const design = nextDesignAction(toDesignView(state));
  // 4. Design lane exhausted + nothing left to build => every story is accepted.
  if (design.kind === "design-complete") return { kind: "feature-complete" };
  return design;
}

/** Project a full DriveState down to the design sub-machine's view. */
function toDesignView(state: DriveState): DesignDriveState {
  return {
    breakdownDone: state.breakdownDone,
    storyOrder: state.storyOrder,
    uiTrack: state.uiTrack,
    designGuideReady: state.designGuideReady,
    stories: Object.fromEntries(
      Object.entries(state.stories).map(([id, v]) => [
        id,
        { gateApproved: v.gateApproved, gateSurfaced: v.gateSurfaced, design: v.design },
      ]),
    ),
  };
}

/**
 * The next DESIGN-LANE-ONLY action: design every story through its spec gate,
 * never dispatch a build. Backs the `/design` Tier-2 bound (`--only design`),
 * which must design ALL stories without building any, unlike nextTransition
 * which streams build the moment a story's gate is approved. Reaches
 * `design-complete` when every story is gate-approved.
 */
export function nextDesignOnlyTransition(state: DriveState): WorkflowAction {
  // Same escalation pre-empt as the full transition: a reflect defect (or any
  // spec-level smell) must route to revise-route / raise-to-hil, NOT re-loop the
  // flagging design turn. Without this the pure design sub-machine re-returns the
  // reflect turn on an unresolved defect until the stall guard fires.
  const preempt = escalationPreempt(state);
  if (preempt) return preempt;
  return nextDesignAction(toDesignView(state));
}
