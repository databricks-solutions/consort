// Orchestrator driver loop (deterministic-driver phase 2: effect seams).
//
// Phase 1 (orchestrator-drive.ts) is the pure brain: nextTransition(state) ->
// the single next WorkflowAction. This module is the body: a loop that reads
// state, asks the brain for the next action, and performs that action's side
// effect, until the action is `done`. The side effects live behind the
// DriveEffects interface so the loop is hermetically testable with an in-memory
// fake; the real effects (claude -p --agent, cut/merge experiment,
// createSchemaMigration, collapseMigrationHeads, deploy, structured log) are
// injected in phase 3.
//
// This is what makes the per-story pipeline actually STREAM: because one
// process holds both lanes, nextTransition dispatches story 1 to the build lane
// the moment its gate is approved, while the design lane keeps designing later
// stories. (Under the old split /design-then-/build `claude -p` invocations the
// streaming could not happen: two processes, no shared loop.)

import {
  nextTransition,
  nextDesignOnlyTransition,
  escalationPreempt,
  actionLane,
  type DriveState,
  type WorkflowAction,
} from "./orchestrator-drive.js";
import { ExpectationLedger, expectationFor, ProtocolViolationError, type Handoff } from "../../gates/orchestrator-expect.js";
import { validateAndBound, type StepContract, type RouteProposal } from "../steps/step-contract.js";
export { ProtocolViolationError, UnexpectedCallbackError } from "../../gates/orchestrator-expect.js";

export interface DriveEffects {
  /**
   * Read the current workflow state. Real impl: derive a DriveState from
   * pipeline.json + workflow-state on disk. Fake: return the in-memory model.
   */
  readState(): Promise<DriveState>;
  /**
   * Perform one action's side effect. MUST advance the state that readState
   * reflects, or the loop detects a stall. `done` is a terminal no-op.
   */
  perform(action: WorkflowAction): Promise<void>;
  /**
   * OPTIONAL executor-dispatch seam (Stage 2, #578): dispatch an AGENT turn THROUGH the
   * StepExecutor's 7-phase Template Method instead of `perform` + the separate routing seam.
   * Returns the BoundedRoute the executor's phase-7 validateAndBound produced (the loop consumes
   * it EXACTLY like a contract `pendingProposal`, so routing authority stays single) – or
   * `undefined` when this action is NOT executor-dispatched (no manifest / flag off), in which
   * case the loop falls through to `perform` unchanged. The impl receives the SAME `state` +
   * routerDeps the loop already holds, so nothing is threaded into `perform`. Default absent =>
   * the loop is byte-identical to the pre-Stage-2 path.
   */
  performViaExecutor?(
    action: WorkflowAction,
    state: DriveState,
    routerDeps: import("../steps/step-contract.js").ValidateBoundDeps,
  ): Promise<import("../steps/step-contract.js").BoundedRoute | undefined>;
  /** Optional deterministic logging hook (code-emitted, fires before perform). */
  onAction?(action: WorkflowAction, iteration: number): void;
  /**
   * OPTIONAL routing-decision observability hook: fires once per iteration with BOTH the derived
   * action AND the DriveState it was derived from, so a diagnostic recorder can capture the
   * state bag (reviewStoryPending / assessGreenAc / ...) that CHOSE the action – the "why" the
   * turn recorder does not persist (it logs only the action + file delta). Purely observational:
   * it never influences routing. `source` says how the action was resolved this iteration.
   * Default absent => byte-identical to before (no routing log emitted).
   */
  onRoutingDecision?(
    action: WorkflowAction,
    state: DriveState,
    iteration: number,
    source: "nextTransition" | "bounded" | "contract",
  ): void;
  /**
   * OPTIONAL pre-dispatch route-contract check: fires AFTER the action is resolved and BEFORE any
   * dispatch, so a route to a turn whose REQUIRED process event was not produced fails LOUD naming
   * the ROUTE (RouteContractError), not later with a bare "missing input" blaming the turn. The impl
   * (which owns consortDir/featureId) resolves the routed action's manifest, reads its requiresEvents,
   * and presence-checks each at its scope. A turn requiring no event is a no-op. Default absent =>
   * byte-identical to before (the executor's own input presence-check stays as defense-in-depth).
   */
  assertRouteSatisfiable?(action: WorkflowAction, state: DriveState): void;
  /**
   * OPTIONAL correspondence hook: fires when a HIL touchpoint action (author-requests, a gate) is
   * about to be performed, so the recorder captures the orchestrator<->HIL exchange (the question the
   * orchestrator asks + the proxy's answer/submission + outcome) as a run-level transcript. The impl
   * builds the request side + reads the proxy's logged response. Purely observational; default absent
   * => byte-identical to before (no correspondence recorded).
   */
  onCorrespondence?(action: WorkflowAction, state: DriveState, iteration: number): void;
  /**
   * Optional hand-back hook: fires when a role's prior handoff contract was
   * UNMET and a retry remains. The runner delivers `detail` (what the responder
   * failed to return) so the imminent re-dispatch of that role is informed – the
   * role reads the hand-back and fixes its output instead of blindly re-running.
   */
  onHandback?(handoff: import("../../gates/orchestrator-expect.js").Handoff, detail: string): void;
}

export class DriverStalledError extends Error {
  constructor(
    readonly action: WorkflowAction,
    readonly iteration: number,
  ) {
    super(
      `driver stalled at iteration ${iteration}: action ${JSON.stringify(action)} repeated ` +
        `without advancing state. The effect for this action did not change what readState() returns.`,
    );
    this.name = "DriverStalledError";
  }
}

export interface RunDriverResult {
  /** Number of actions performed (including the terminal `done`). */
  iterations: number;
  /** True if the loop stopped at maxSteps rather than reaching `done`. */
  stoppedAtMax?: boolean;
  /** True if the loop stopped at a phase bound (stopWhen) rather than `done`. */
  stoppedAtBound?: boolean;
  /** The action the bound stopped BEFORE performing (e.g. the HITL gate awaiting
   *  the human in interactive mode, or the first out-of-scope action). */
  stoppedAt?: WorkflowAction;
  /** True if the run halted because a blocking problem was raised to the HIL
   *  (surface + halt). The escalation is recorded under .tdd/escalations/. */
  escalated?: boolean;
  /** The raise-to-hil action that halted the run (its reason + source). */
  escalation?: WorkflowAction & { kind: "raise-to-hil" };
}

export interface RunDriverOptions {
  /** Stop after this many actions (for incremental/live testing + safety). */
  maxSteps?: number;
  /**
   * Transition function (default nextTransition). The `/design` Tier-2 bound
   * passes nextDesignOnlyTransition so it designs every story without building.
   */
  transition?: (state: DriveState) => WorkflowAction;
  /**
   * Phase bound for the Tier-2 commands: when the NEXT action satisfies this,
   * the loop stops BEFORE performing it (a clean bounded completion, not a
   * stall). `done` is always handled first, so a bounded run that legitimately
   * reaches `done` completes normally. See actionLane for the lane taxonomy.
   */
  stopWhen?: (action: WorkflowAction) => boolean;
  /**
   * A PAUSE gate (NOT a bail-out): the FIRST time the next action satisfies this,
   * the loop awaits `confirmContinue` (a human Y/n prompt) BEFORE performing it,
   * then carries on – the run never leaves the state machine. Distinct from
   * stopWhen, which exits. Backs `--pause-before` (run-to-navigator / -release).
   */
  pauseBefore?: (action: WorkflowAction) => boolean;
  /**
   * The human-in-the-loop wait the pause gate awaits. Resolves when the human
   * confirms (Y); a typical impl re-prompts on `n` and never rejects, so the
   * driver simply waits for the go-ahead. Required for `pauseBefore` to pause;
   * without it the gate is a no-op (the run proceeds, e.g. in pure unit tests).
   */
  confirmContinue?: (action: WorkflowAction) => Promise<void>;
  /**
   * Enforce the handoff EXPECTATION protocol (default true): every role handoff
   * records the non-null artifact its responder owes; the next state read must
   * discharge that contract or the run aborts with a ProtocolViolationError
   * naming the role + the missing artifact (instead of silently re-dispatching /
   * stalling). Set false only for unit tests that intentionally drive partial
   * states without a responder delivering.
   */
  enforceExpectations?: boolean;
  /**
   * OPTIONAL output-driven routing (the routing face of the StepContract). When set,
   * AFTER a step is performed the contract emits a RouteProposal (where the step thinks
   * the orchestrator should go); `validateAndBound` VALIDATES it against the pure
   * transition and BOUNDS re-routes/retries with the existing limits before the next
   * iteration acts on it. When ABSENT (the default + current behavior), routing is purely
   * state-derived via `transition(state)` – byte-identical to before this seam. Real
   * roles do not implement StepContract yet; this is consumed mock-first.
   */
  contract?: StepContract;
}

// Backstop against a runaway loop (an effect that advances but never converges).
// Far above any real feature: planning + ~6 steps/story + deploy stays well under.
const MAX_ITERATIONS = 10_000;

/** The Tier-2 phase the human bounded a driver run to (one of the slash commands). */
export type DriverBound = "plan" | "design" | "build" | "deploy";

/**
 * The transition + stopWhen for a Tier-2 bound. `plan` runs the planning
 * sub-machine; `design` runs the design lane to design-complete (all stories
 * designed, none built); `build` builds gate-approved stories then stops before
 * deploy; `deploy` ships the feature – the local deploy phase THEN the promote
 * phase (PR review + merge up to the parent tier), to done. A bound also GUARDS:
 * a `build` run whose design is not done, or a `deploy` run whose feature is not
 * built, stops immediately (its first action is out of lane) rather than doing
 * the upstream work.
 */
export function driverBoundOptions(bound: DriverBound): Pick<RunDriverOptions, "transition" | "stopWhen"> {
  switch (bound) {
    case "plan":
      // Stop AT planning-complete: the approved plan gate is the sprint-planning
      // terminal (there is no sprint-level phase to advance into). The plan is
      // approved + the backlog ready; /sprint or /design takes it from there.
      return { stopWhen: (a) => a.kind === "planning-complete" };
    case "design":
      return { transition: nextDesignOnlyTransition, stopWhen: (a) => a.kind === "design-complete" };
    case "build":
      return { stopWhen: (a) => actionLane(a) !== "build" };
    case "deploy":
      // Ship = deploy (local working-software) + promote (PR review + merge up to
      // the parent). Both lanes are in scope so /deploy carries the feature all
      // the way to merged/done, not just the local deploy.
      return { stopWhen: (a) => actionLane(a) !== "deploy" && actionLane(a) !== "promote" };
  }
}

/**
 * Drive a feature to completion: read state, compute the next action, perform
 * it, repeat until `done`. Throws DriverStalledError if an action repeats
 * without the state advancing (an effect that did not record its result), and a
 * plain Error if the iteration backstop is hit.
 */
export async function runDriver(
  effects: DriveEffects,
  options: RunDriverOptions = {},
): Promise<RunDriverResult> {
  let previousSignature: string | undefined;
  let pausedAlready = false;
  const enforceExpectations = options.enforceExpectations !== false;
  const expectations = new ExpectationLedger();
  const transitionFn = options.transition ?? nextTransition;
  // Output-driven routing state (only used when options.contract is set): the proposal
  // the just-performed step emitted, consumed at the TOP of the next iteration through
  // validateAndBound. Undefined on the first pass + whenever we fell through to the
  // pure transition, so the default (no-contract) path never touches it.
  let pendingProposal: { proposal: RouteProposal; completed: WorkflowAction } | undefined;
  // Stage 2 (#578) executor-dispatch: an already-bounded route the StepExecutor produced last
  // iteration (its phase-7 validateAndBound). Consumed at the TOP exactly like pendingProposal,
  // but WITHOUT re-bounding (the executor already did). Undefined on the default path.
  let pendingBounded: { bounded: import("../steps/step-contract.js").BoundedRoute; completed: WorkflowAction } | undefined;
  // Retry bound for router-emitted "blocked" outcomes, mirroring ExpectationLedger's
  // maxRetries=1: one sanctioned re-issue per action signature, then a hard abort. Kept
  // here (not the ledger, which is driven by disk callbacks) because a router "blocked"
  // is an EMITTED signal, not a disk-derived unmet contract; same limit, same failure.
  const routerRetries = new Map<string, number>();
  const routerDeps = {
    allowed: (s: DriveState) => transitionFn(s),
    // Reuse the EXISTING revise budget: escalationPreempt returns a revise-route only
    // while the budget has room (priorReviseCount / REFLECT_REVISE_CAP), else raise-to-hil.
    reviseBudgetAvailable: (_p: RouteProposal, s: DriveState) => escalationPreempt(s)?.kind === "revise-route",
    recordRetry: (completed: WorkflowAction, _state: DriveState, reason?: string) => {
      const key = JSON.stringify(completed);
      const attempt = (routerRetries.get(key) ?? 0) + 1;
      if (attempt > 1) {
        // Budget exhausted. Surface a CLEAN HIL, not a bare abort: throw a ProtocolViolationError
        // (what this path's own contract promises — see step-contract.ts:433) so drive.cli records an
        // escalation (`protocol:<responder>`) and exits 3, instead of a plain Error that falls through
        // to a silent exit-1 with NO escalation record. The detail carries the step's last block reason
        // (the validator violations), so the operator sees WHY — e.g. the test-strategist authored the
        // list without the analyst fan-out — and how to resolve it, rather than an unexplained abort.
        const handoff: Handoff =
          expectationFor(completed) ??
          {
            signature: key,
            responder: (("role" in completed && typeof (completed as { role?: unknown }).role === "string"
              ? (completed as { role: string }).role
              : "orchestrator") as Handoff["responder"]),
            expected: "a conformant result",
            satisfiedBy: () => false,
          };
        throw new ProtocolViolationError(
          handoff,
          `it emitted "blocked" past its retry budget${reason ? ` (${reason})` : ""}`,
        );
      }
      routerRetries.set(key, attempt);
      return { sanctioned: true };
    },
  };
  for (let i = 0; ; i++) {
    if (options.maxSteps !== undefined && i >= options.maxSteps) {
      return { iterations: i, stoppedAtMax: true };
    }
    if (i >= MAX_ITERATIONS) {
      throw new Error(`driver exceeded ${MAX_ITERATIONS} iterations without reaching "done".`);
    }
    const state = await effects.readState();
    // Reconcile the outstanding handoff FIRST: the state just read is the
    // responder's "callback". If its contract is unmet, the responder gets ONE
    // informed retry – we hand back exactly what it failed to return and
    // re-dispatch it; a second failure throws ProtocolViolationError and the run
    // aborts (a precise, attributed failure, not a silent re-dispatch / stall).
    let retrying = false;
    if (enforceExpectations) {
      const rec = expectations.reconcile(state); // throws on exhausted retries
      if (rec.kind === "retry") {
        retrying = true;
        effects.onHandback?.(rec.handoff, rec.detail);
      }
    }
    // Routing: by default the pure transition derives the next action from state
    // (byte-identical to before this seam). When a router is wired AND the previous
    // step emitted a proposal, validateAndBound resolves the next action from that
    // proposal (validated against the same pure transition + bounded by the existing
    // revise/retry limits). `retrying` is OR'd with a sanctioned router retry so the
    // stall check treats a bounded re-issue as intentional.
    let action: WorkflowAction;
    if (pendingBounded) {
      // Stage 2: the executor ALREADY ran validateAndBound last iteration – consume its
      // BoundedRoute directly (no re-bound). Same shape as the pendingProposal branch below.
      action = pendingBounded.bounded.action;
      if (pendingBounded.bounded.sanctionedRetry) retrying = true;
      pendingBounded = undefined;
    } else if (options.contract && pendingProposal) {
      const bounded = validateAndBound(pendingProposal.proposal, pendingProposal.completed, state, routerDeps);
      action = bounded.action;
      if (bounded.sanctionedRetry) retrying = true;
      pendingProposal = undefined;
    } else {
      action = transitionFn(state);
    }

    // Routing-decision observability: emit the action + the state bag that chose it, BEFORE any
    // terminal/stall/perform handling, so every iteration's decision (including a terminal one) is
    // captured with its inputs. Purely observational – the value is already fixed above.
    effects.onRoutingDecision?.(
      action,
      state,
      i,
      pendingBounded !== undefined ? "bounded" : options.contract && pendingProposal !== undefined ? "contract" : "nextTransition",
    );

    if (action.kind === "done") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1 };
    }

    // Surface + halt: a blocking problem was raised to the HIL. Terminal, like
    // `done` (handled BEFORE the stall check so a still-unresolved escalation
    // does not look like a stall). The escalation is already recorded on disk;
    // perform() emits the loud halt log. A human resumes after resolving it.
    if (action.kind === "raise-to-hil") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1, escalated: true, escalation: action };
    }

    // A Tier-2 phase bound: stop cleanly before performing the out-of-scope
    // action (e.g. /design stops before the first build, /build before deploy).
    if (options.stopWhen?.(action)) {
      return { iterations: i, stoppedAtBound: true, stoppedAt: action };
    }

    // A PAUSE gate (NOT a stop): the FIRST time the next action reaches a chosen
    // handoff, block for the human's Y/n, then CONTINUE the same run. The driver
    // never leaves the state machine; it just waits for the go-ahead. Awaited
    // before the stall check + perform, so the human reviews the pristine state.
    if (!pausedAlready && options.pauseBefore?.(action) && options.confirmContinue) {
      pausedAlready = true;
      await options.confirmContinue(action);
    }

    const signature = JSON.stringify(action);
    // A sanctioned retry re-issues the SAME action by design (the responder's
    // contract is still outstanding), so skip the generic stall check this pass.
    if (!retrying && signature === previousSignature) {
      throw new DriverStalledError(action, i);
    }
    previousSignature = signature;

    // Record the handoff we are about to make: who must respond + the non-null
    // artifact they owe. The NEXT iteration's reconcile() discharges it (or
    // retries / aborts). On a retry the head is still outstanding – do NOT
    // re-push it. Non-role actions (gates, cut, deploy – the driver's own
    // substrate) return null here and add nothing to the queue.
    if (enforceExpectations && !retrying) {
      const handoff = expectationFor(action);
      if (handoff) expectations.push(handoff);
    }

    // Pre-dispatch route-contract check (route→event→consumer): assert the routed turn's REQUIRED
    // process events were produced BEFORE dispatch, so a mis-fired route fails loud naming the route
    // (RouteContractError) instead of the executor's later bare "missing input". No-op for a turn
    // that requires no event (plain RED/GREEN, every design turn) and when the hook is unwired.
    effects.assertRouteSatisfiable?.(action, state);

    effects.onAction?.(action, i);
    // Executor-dispatch seam (Stage 2, #578): when the effects wire performViaExecutor AND it
    // recognizes this agent action (manifest match + flag on), the turn runs THROUGH the
    // StepExecutor – which already ran phase-7 validateAndBound and hands back a BoundedRoute.
    // The loop consumes that directly next iteration (pendingBounded), so routing authority stays
    // single (no double-bound, no separate contract.route). When it returns undefined (not
    // executor-dispatched), fall through to perform + the contract routing seam – byte-identical.
    const bounded = await effects.performViaExecutor?.(action, state, routerDeps);
    if (bounded) {
      pendingBounded = { bounded, completed: action };
    } else {
      await effects.perform(action);
      // Correspondence: a HIL touchpoint (author-requests, a gate) just ran on the legacy perform
      // path – the proxy has now LOGGED its response (intake.supplied / gate.approved). Fire the
      // hook AFTER perform so it can pair the orchestrator's request with the proxy's fresh answer +
      // submission. No-op for non-HIL actions + when the hook is unwired.
      effects.onCorrespondence?.(action, state, i);
      // Output-driven routing: after the step ran, ask the contract where it proposes to
      // go next; the NEXT iteration's top consumes it via validateAndBound. No contract =>
      // no proposal => next iteration derives from state (the default path). The contract
      // reads the post-perform state so its proposal reflects what the step produced.
      if (options.contract) {
        const post = await effects.readState();
        pendingProposal = { proposal: options.contract.route(action, { state: post, feature: featureOf(post) }), completed: action };
      }
    }
  }
}

/** Best-effort feature id for the router context (diagnostic scope only). */
function featureOf(state: DriveState): string {
  return (state as { featureId?: string }).featureId ?? "";
}
