// Sprint mode: the Tier-1 `/sprint` orchestrator.
//
// `consort-drive --sprint <name>` runs the whole sprint as one continuous
// flow: sprint planning (to the approved plan gate) -> read the backlog -> for
// each feature: claim its branch + drive it (design -> build -> deploy) to done.
// One process holds it all, so the per-story pipeline streams within each
// feature and control returns to the human only at the gates.
//
// runSprint is pure over a SprintEffects seam (hermetically testable); the real
// effects (drive planning via runDriver+the plan bound, claim via
// lakebase-scm-claim-feature-branch, drive each feature via runDriver) are wired
// in the consort-drive CLI. The sprint-level reads (backlog manifest,
// planning state) are the I/O helpers below, used to build those effects.

import type { DriveState, WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";
import { readSprintGates } from "../../consort/gates/sprint-gates.js";
import {
  featureProposalsMd,
  hasFeatureRequest,
  hasEstimates,
  readEstimates,
  readBacklog,
  readRequested,
  intakeReadyOnDisk,
  intakeApprovedOnDisk,
} from "../../consort/config/consort-paths.js";
import { resolveConsortSettings } from "../../consort/orchestrator/settings/project-settings.js";
import { designGuideConformance } from "../../consort/session/response-formatter.js";
import * as fs from "node:fs";
import { dirname } from "node:path";

// Sprint-backlog read/write + SprintBacklog live in consort-paths (single source of
// truth). Re-exported here for the existing public API (drive.cli, runSprint).
export {
  readBacklog as readSprintBacklog,
  writeBacklog as writeSprintBacklog,
  backlogFeatureIds,
  syncBacklog,
  type SprintBacklog,
  type BacklogFeature,
} from "../../consort/config/consort-paths.js";

// --- Sprint planning readState -----------------------------------------------

/**
 * Build the DriveState for the sprint PLANNING sub-machine from sprint-level
 * artifacts. proposed <- the Spec Author's feature-proposals.md exists;
 * estimated <- the Architect's planning/estimates.json has at least one
 * t-shirt size; requestsAuthored <- the backlog is non-empty AND every backlog
 * feature has a feature-request.md (the backlog is the deterministic sync-backlog
 * projection of the PO's committed requests); gateApproved <- the sprint plan
 * gate is approved. Phase is always "planning" (the plan bound stops at
 * planning-complete, so this static read never needs to reflect a later phase).
 * All paths/accessors come from consort-paths so a producer cannot write where this
 * consumer does not look.
 *
 * `opts.skipSizing` is a POLICY threaded from the CLI, not a disk fact: it tells
 * the machine to route proposed -> author-requests with no estimate step. Carried
 * on PlanningState so nextTransition stays pure. DEFAULTS TO FALSE: t-shirt-sizing
 * is ON by default (the Architect sizes the candidates); a caller opts OUT with
 * `--no-sizing` to skip the Architect estimate turn.
 */
export function deriveSprintPlanningState(
  consortDir: string,
  sprint: string,
  opts: { skipSizing?: boolean } = {},
): DriveState {
  const proposed = fs.existsSync(featureProposalsMd(consortDir));
  const estimated = hasEstimates(consortDir);
  const backlog = readBacklog(consortDir, sprint).features;
  // backlogCommitted <- the human SELECTED the sprint's features at the backlog gate:
  // requested.json declares the committed membership. A legacy/unscoped run (no
  // requested.json but a projected backlog on disk) also counts as committed, so an
  // existing run is byte-identical. This is the SELECTION (the gate), distinct from the
  // authoring below. When false (and nothing projected) the machine PARKS at the backlog gate.
  const requested = readRequested(consortDir, sprint);
  const backlogCommitted = (requested !== undefined && requested.length > 0) || backlog.length > 0;
  // requestsAuthored <- the backlog is non-empty AND every backlog feature has a
  // feature-request.md (the deterministic sync-backlog projection of the committed requests). This
  // is unchanged from before the split: backlog.json is the observable the metered author-requests
  // turn's post-turn sync-backlog projects. A live run whose requests are not yet drafted has a
  // committed selection (backlogCommitted true) but an empty backlog, so this stays false until the
  // turn authors them; a seed run copies the requests at the gate, so it is true without the turn.
  const requestsAuthored = backlog.length > 0 && backlog.every((f) => hasFeatureRequest(consortDir, f.id));
  // committedEstimated: every committed backlog feature has an estimate under its
  // OWN id (estimates.json keyed by the committed F-id, not the candidate FP id).
  // This is what the Architect's `estimate-committed` turn produces + sync-backlog
  // stamps. False (once requests are authored + sizing not skipped) routes that
  // turn; a re-plan sprint that reused the standing proposals still lands here for
  // its own newly-committed feature. Only meaningful once requestsAuthored.
  const estimatedIds = new Set(readEstimates(consortDir).map((e) => e.feature_id));
  const committedEstimated = backlog.length > 0 && backlog.every((f) => estimatedIds.has(f.id));
  let gateApproved = false;
  try {
    gateApproved = readSprintGates(sprint, { consortDir }).gates.plan.status === "approved";
  } catch {
    gateApproved = false;
  }
  // uiTrack + designGuideReady are REQUIRED by the planning-lane UX-establish route
  // (orchestrator-drive `:332`: intakeReady && uiTrack && !designGuideReady). Resolve BOTH here,
  // from this function's own consortDir, so neither the drive execution path (drive.cli) nor the
  // read-only snapshot (consort-next) can forget to thread them — the exact omission that made the
  // establish dead code (consort-next passed uiTrack only on the FEATURE path; the sprint/planning
  // path passed neither, so state.uiTrack was undefined and the establish never fired on UI projects).
  const uiTrack = resolveConsortSettings({ projectDir: dirname(consortDir) }).project.uiTrack;
  const designGuideReady = designGuideConformance(consortDir).ok;
  return {
    phase: "planning",
    uiTrack,
    designGuideReady,
    planning: { intakeReady: intakeReadyOnDisk(consortDir), intakeApproved: intakeApprovedOnDisk(consortDir), proposed, estimated, backlogCommitted, requestsAuthored, committedEstimated, gateApproved, skipSizing: opts.skipSizing ?? false },
    breakdownDone: false,
    storyOrder: [],
    stories: {},
    buildActive: null,
  };
}

// --- The sprint orchestrator (pure over the effect seam) ---------------------

/** A drive step's outcome: ran to its scope, or halted. Two halt kinds:
 *  `pendingGate` set => paused at a HITL gate awaiting the human (interactive,
 *  a clean pause); `escalated` set => a blocking problem was RAISED TO HIL
 *  (surface + halt, a failure). Either one means the step did not finish, and
 *  the sprint must stop rather than advance to the next feature/sprint (else a
 *  later claim hits `already-claimed-other` on the still-open feature). */
export interface DriveStepResult {
  pendingGate?: WorkflowAction;
  /** Paused awaiting HUMAN INPUT the machine cannot synthesize – the Product
   *  Owner's feature-request(s) at `author-requests`. Distinct from `pendingGate`
   *  (which is an APPROVAL of already-produced work): here NOTHING has been
   *  produced yet, so the step did not finish and the sprint must stop. In proxy
   *  mode the Human Proxy supplies the input, so this is never set. */
  pendingInput?: WorkflowAction;
  /** A blocking problem was raised to the HIL (deploy-verify failed, blocking
   *  smell, protocol violation). The feature is NOT done; halt the sprint. */
  escalated?: boolean;
  /** The raise-to-hil action that halted the step (its reason + source). */
  escalation?: WorkflowAction & { kind: "raise-to-hil" };
}

export interface SprintEffects {
  /** Drive sprint planning to the approved plan gate (the plan bound). In
   *  interactive mode it halts at the plan gate (pendingGate set). */
  drivePlanning(): Promise<DriveStepResult>;
  /** The sprint's feature ids, in execution order. */
  readBacklog(): Promise<string[]>;
  /** After planning (the plan gate is approved), commit the feature-requests the
   *  PO/proxy authored during planning and PUSH the entry tier to `origin`. A
   *  feature branch forks from `origin/<parent>` (paired-branch resolveForkPoint),
   *  so a request that only exists on the LOCAL entry tier would not be inherited
   *  by the fork and the Spec Author would refuse; this makes the just-authored
   *  requests reachable before any feature is claimed. Idempotent: a no-op when
   *  nothing changed / already pushed (e.g. the capture pre-seeded + pushed them).
   *  Optional: absent => the caller propagates request commits itself. */
  commitAndPushRequests?(): Promise<void>;
  /** Claim a feature's branch (idempotent; the SCM /design Step 0 the driver
   *  does not own). Re-claim on a resume is a no-op. */
  claimFeature(featureId: string): Promise<void>;
  /** Drive one feature design -> build -> deploy. In interactive mode it halts
   *  at the next HITL gate (pendingGate set); proxy mode drives it to done. */
  driveFeature(featureId: string): Promise<DriveStepResult>;
  /** Optional: a backlog feature already SHIPPED (its own workflow derives to
   *  `done`) must be SKIPPED, not re-claimed + re-driven (FEIP-8022). Without
   *  this the Tier-1 sprint re-enters a completed feature and re-surfaces its
   *  deploy gate. Absent => never skip (drive every backlog feature). */
  isFeatureShipped?(featureId: string): Promise<boolean>;
  /** Optional progress hook fired before each feature is claimed. */
  onFeature?(featureId: string, index: number): void;
  /** Optional hook fired when a feature is SKIPPED as already shipped. */
  onSkip?(featureId: string, index: number): void;
}

export interface RunSprintResult {
  /** Feature ids the sprint covers (the backlog). */
  features: string[];
  /** The HITL gate the run halted at (interactive mode), awaiting the human. */
  pendingGate?: WorkflowAction;
  /** The run halted awaiting HUMAN INPUT (the PO's feature-request(s) at
   *  `author-requests`) – nothing was produced yet, so the sprint did not run. */
  pendingInput?: WorkflowAction;
  /** Set when the run halted because a step RAISED TO HIL (a blocking failure,
   *  not a clean interactive pause). The caller exits non-zero. */
  escalated?: boolean;
  /** The raise-to-hil action that halted the run (its reason + source). */
  escalation?: WorkflowAction & { kind: "raise-to-hil" };
  /** The feature whose gate/escalation the run halted at, if any. */
  pendingFeature?: string;
  /** Backlog features SKIPPED as already shipped (FEIP-8022). */
  skipped?: string[];
}

/**
 * Whether `featureId` is provably shipped BECAUSE a LATER backlog feature currently
 * holds the single SCM claim. The SCM workflow-state (`.lakebase/workflow-state.json`)
 * tracks ONE feature claim at a time; a feature's claim is released only when it merges
 * (ships), so you cannot be claimed for a later feature until every earlier one released.
 * Therefore, when the claim is held by a feature that comes AFTER `featureId` in the
 * backlog, `featureId` was released == shipped.
 *
 * This closes the sprint-resume trap (the shared SCM state pollutes an earlier feature's
 * promote-phase derive): once F2 is claimed, deriving F1's own next-action reads F2's SCM
 * ladder and never returns `done`, so `isFeatureShipped(F1)` was false and the loop
 * re-claimed F1 – tripping `already at feature-claimed for F2`. Compared case-insensitively
 * on the feature id. Returns false for an absent/empty/self/earlier claim, or an id not in
 * the backlog (then the caller falls back to the own-workflow `done` derive).
 */
export function shippedBecauseLaterFeatureClaimed(
  featureId: string,
  claimedFeatureId: string | undefined,
  backlogIds: string[],
): boolean {
  const norm = (s: string): string => s.trim().toLowerCase();
  if (!claimedFeatureId || !featureId) return false;
  if (norm(claimedFeatureId) === norm(featureId)) return false; // this feature is the one in-flight
  const idx = backlogIds.findIndex((id) => norm(id) === norm(featureId));
  const claimedIdx = backlogIds.findIndex((id) => norm(id) === norm(claimedFeatureId));
  if (idx < 0 || claimedIdx < 0) return false;
  return claimedIdx > idx; // a LATER backlog feature holds the claim => this one was released (shipped)
}

/**
 * Whether `featureId` is provably shipped because the SCM claim is CLEARED (no feature
 * in-flight) yet this feature's stories are ALL done+accepted (`featurePhase === "complete"`).
 * The single SCM claim frees ONLY at merge, so a cleared claim proves every feature that was
 * driven released its claim (== deployed + promoted). A feature that reached "complete" (all
 * stories accepted) with the claim now clear therefore SHIPPED – you cannot have a
 * merged/claim-cleared feature that was not deployed, and mid-flight (accepted but not yet
 * deployed) the claim is still HELD.
 *
 * This is the companion to `shippedBecauseLaterFeatureClaimed` for the LAST feature (and thus
 * the whole sprint): once the FINAL feature ships and the claim clears, no later feature holds
 * the claim (that heuristic can't fire), and the feature's own promote-derive can no longer
 * confirm its merge (the merge record lived in the now-cleared claim state), so it derives back
 * to "needs deploy" and is NOT `done`. Without this, a sprint RE-RUN re-drives the shipped
 * feature and errors (exit 2) instead of reporting the sprint already complete (exit 0).
 * Conservative: fires ONLY when the claim is empty AND the phase is exactly "complete".
 */
export function shippedByClearedClaim(
  claimedFeatureId: string | undefined,
  featurePhase: string | null | undefined,
): boolean {
  const cleared = !claimedFeatureId || claimedFeatureId.trim().length === 0;
  return cleared && featurePhase === "complete";
}

/**
 * Run a sprint: plan (to the gate) -> for each backlog feature: claim + drive.
 * RESUMABLE: in interactive mode a step halts at a HITL gate (pendingGate); the
 * whole run returns so the session can surface it. The human approves and
 * re-invokes; planning + the already-done features are idempotent no-ops, and
 * the in-progress feature resumes past the now-approved gate. In proxy mode
 * (headless) no step yields a pendingGate, so the sprint runs end to end.
 */
export async function runSprint(effects: SprintEffects): Promise<RunSprintResult> {
  const planning = await effects.drivePlanning();
  if (planning.escalated) return { features: [], escalated: true, escalation: planning.escalation };
  if (planning.pendingGate) return { features: [], pendingGate: planning.pendingGate };
  // Paused for the PO to author feature-request(s): planning produced no backlog,
  // so DO NOT fall through to readBacklog + the (empty) feature loop and report a
  // complete sprint. Halt with pendingInput; the human authors the requests + re-runs.
  if (planning.pendingInput) return { features: [], pendingInput: planning.pendingInput };

  // Planning authored the feature-requests on the LOCAL entry tier. Push them to
  // origin BEFORE any feature is claimed, because a feature branch forks from
  // origin/<parent>; without this the fork inherits no feature-request and the
  // Spec Author refuses. Runs only once planning is approved (past the gate), so
  // an interactive halt above returns first and the push fires on the resume.
  await effects.commitAndPushRequests?.();

  const features = await effects.readBacklog();
  const skipped: string[] = [];
  for (let i = 0; i < features.length; i++) {
    const featureId = features[i];
    // A feature already shipped (its own workflow derives to done) is SKIPPED,
    // not re-claimed + re-driven (FEIP-8022): re-entering a completed feature
    // re-surfaces its deploy gate + (before the phase-scoping fix) leaked its
    // phase into the next feature. Checked BEFORE the claim so a done feature is
    // never re-claimed.
    if (await effects.isFeatureShipped?.(featureId)) {
      skipped.push(featureId);
      effects.onSkip?.(featureId, i);
      continue;
    }
    effects.onFeature?.(featureId, i);
    await effects.claimFeature(featureId);
    const driven = await effects.driveFeature(featureId);
    // A raise-to-HIL is a blocking halt: the feature is NOT done and its SCM
    // claim is still open, so advancing to the next feature/sprint would hit
    // `already-claimed-other`. Stop on the escalating feature (resumable after
    // the human resolves it), exactly like a pending gate.
    if (driven.escalated) {
      return { features, skipped, escalated: true, escalation: driven.escalation, pendingFeature: featureId };
    }
    if (driven.pendingGate) {
      return { features, skipped, pendingGate: driven.pendingGate, pendingFeature: featureId };
    }
    if (driven.pendingInput) {
      return { features, skipped, pendingInput: driven.pendingInput, pendingFeature: featureId };
    }
  }
  return { features, skipped };
}
