// step-contract: the ONE step interface every role/step implements.
//
// A step is producers→consumers, inputs→outputs. This module defines the single
// contract that carries all three faces of a step together, so each step can be
// invoked and unit-tested in isolation:
//   - inputs(action)  : the INPUT contract  – what must exist on disk before it runs.
//   - outputs(action) : the OUTPUT expectation – what artifact it must produce.
//   - route(completed): the ROUTING proposal – where it proposes to go next on
//                       completion of its agent call.
//
// The orchestrator does NOT blindly follow the routing proposal: `validateAndBound`
// VALIDATES it against the pure allowed transition and BOUNDS re-routes/retries with the
// EXISTING limits (revise budget, ExpectationLedger retry, escalation) before honoring
// it, falling back to state-derivation when the proposal is off the allowed graph.
//
// This slice is the CONTRACT + a MOCK implementation + `validateAndBound`. No real role
// implements StepContract yet; `runDriver` consumes the routing face behind an optional
// seam so the default (no-contract) path is byte-identical to today. Real roles implement
// StepContract in a later slice; the input/output faces (inputs/outputs) are declared here
// so the per-step isolated runner + `--step` CLI can consume them next.

import type { DriveState, WorkflowAction } from "../workflow/workflow-vocabulary.js";
import type { TurnEventKind, TurnEventSpec } from "./turn-events.js";

/**
 * A step's INPUT contract, declared as LOGICAL descriptors – NOT filesystem paths. The
 * step is dumb + contained: it knows it needs "the PO's product overview", not WHERE that
 * lives. The ORCHESTRATOR (which owns .consort) reads the descriptor, resolves it to the
 * real artifact, and PROVIDES its contents to the step. `id` is the key the provided
 * contents are handed back under.
 */
export interface StepInputSpec {
  /** Stable logical id (e.g. "product-overview", "nfrs", "feature-request"). */
  id: string;
  /** Human description of what the step needs (for the orchestrator + diagnostics). */
  description: string;
  /** OPTIONAL input: a missing source is SKIPPED, not a turn failure – mirrors the manifest's
   *  `optional` and resolveInputs' skip. Must be carried here so ManifestStep.run's own
   *  `spec.id in inputs` re-check does not fail loud on an optional-absent input (e.g. review's
   *  `code` project-tree input, which resolveInputs legitimately omits on the live lane). */
  optional?: boolean;
}

/**
 * A step's PRE-CONDITION contract, declared as LOGICAL descriptors – the deterministic
 * CONTEXT a turn must be PRE-CONDITIONED with before dispatch (the pre-extracted design
 * rubric + module layout; the green-failure advisory). Distinct from `inputs`: an input's
 * CONTENTS are resolved + handed back under its id; a precondition names a PREPARER the
 * orchestrator runs to PROJECT a text block from on-disk `.consort` (never authored, cannot
 * drift), which the build-instructions phase appends to the prompt. The step is dumb + con-
 * tained: it declares "I need the context-pack", never HOW it is prepared (that is the
 * orchestrator's `PREPARE-PRECONDITIONS` phase + preparer registry). See
 * `consort/orchestrator/build/PRE-CONDITIONING-AS-CONTRACT.md`.
 */
export interface StepPrecondition {
  /** Stable id the prepared block is keyed under (e.g. "context-pack", "green-failure-advisory"). */
  id: string;
  /** Which preparer to run – the orchestrator maps this kind to a registered pure projection. */
  kind: "context-pack" | "green-failure-advisory" | string;
  /** Human description (diagnostics + the empty-preparer warning). */
  description: string;
  /** WHERE the prepared block sits relative to the step's base instruction prompt. The legacy
   *  inline injection was POSITIONED per turn – the design context-pack rides AFTER the directive
   *  ("append"), the green-failure advisory rides BEFORE the "ASSESS ..." directive ("prepend"). To
   *  keep the executor-assembled prompt BYTE-IDENTICAL to that inline assembly when a turn moves to
   *  the declared face, a precondition carries its position. Default "append" (the majority). */
  position?: "prepend" | "append";
  /** Preparer-specific knobs the registered preparer reads (e.g. context-pack's skipTestLoop). */
  options?: Record<string, unknown>;
}

/**
 * A conformance validator EXPOSED TO THE AGENT as a callable it can invoke on its own draft
 * output before returning – so a fixable defect is caught IN-TURN instead of round-tripping
 * back to the agent with follow-up instructions. The `docstring` tells the agent what the
 * function checks + how to call it; the prompt adds any further instruction. `fn` is the
 * same deterministic in-code check the orchestrator also runs on the produced artifact.
 */
export interface ConformanceValidator {
  /** The output id this validator validates (matches a StepOutputSpec.id). */
  outputId: string;
  /** What the validator verifies + how to call it – handed to the agent verbatim. */
  docstring: string;
  /** The deterministic check (given the artifact's path in the workspace). */
  fn: OutputValidator;
}

/** The result of an in-code output conformance check – deterministic, no agent round-trip. */
export interface OutputValidationResult {
  ok: boolean;
  /** Specific, actionable violations when !ok (empty when ok). */
  violations: string[];
}

/**
 * An IN-CODE conformance validator for one produced output. Given the produced artifact's
 * absolute path (in the provided workspace), it deterministically validates the artifact
 * against the output's contract and returns pass/fail + specific violations. This is what
 * lets the orchestrator ACCEPT or REJECT an output without going back to the agent for a
 * follow-up – every expected output ships its validator.
 */
export type OutputValidator = (producedPath: string) => OutputValidationResult;

// ─── OUTPUT CHANNELS: contained vs uncontained file access ─────────────────────────────
//
// WHY THIS EXISTS. A step's outputs do not all belong in the same place. Some MUST be
// written into the real, shared, uncontained code tree (each build turn reads the prior
// turn's code, so the driver's `app/` and the navigator's `tests/` accumulate at the
// project root and get committed / migrated / deployed). Others are per-turn bookkeeping
// or per-feature design docs that the orchestrator wants to CONTAIN – place under a
// dedicated root it owns, so a turn can be sandboxed (a per-experiment worktree, a scratch
// dir) without polluting the shared tree. The channel model is the one rule that lets a
// manifest declare WHICH kind each output is, without the step (or the manifest author)
// hardcoding a directory. It is the seam between "the agent wrote a file called X" and
// "the file X lives HERE for this run".
//
// THE THREE CHANNELS:
//   product  – the application deliverable: app/ – tests/ – migrations. ALWAYS UNCONTAINED
//              (resolves to workspaceDir = the real code tree). It accumulates across build
//              turns and ships, so it can never be sandboxed away from the tree the next
//              turn reads. e.g. the driver's `code` (app/), the navigator's `tests`.
//   artifact – the .consort design documents the design roles author (feature-spec,
//              architecture, db-design, test-list, design-guide, acs, estimates,
//              proposals). Small + per-feature, so MAY be contained: resolves under
//              `artifactDir` when the orchestrator provisions one, else the workspace.
//   meta     – the orchestrator's bookkeeping ABOUT the turn (the reconciled agent-log,
//              a reflect verdict, an assess marker). CONTAINED: resolves under `metaDir`
//              when provisioned, else the workspace.
//
// HOW A MANIFEST USES IT (the rule for every step):
//   1. Set `channel` to the kind of output it is (omit only for a legacy single-root turn;
//      absent === product/workspaceDir, byte-identical to a pre-channel turn).
//   2. Keep `filename` CHANNEL-RELATIVE – the path WITHIN that channel's root
//      (e.g. "feature-spec.json", "features/<F>/feature-spec.json", "agent-log.jsonl",
//      "app", "tests"). NEVER prefix it with ".consort/" or the project root; the
//      orchestrator prepends the channel root. A leading ".consort/" double-encodes the
//      root once artifactDir/metaDir are provisioned (=> `.consort/.consort/...`).
//   3. The orchestrator resolves the placement: `resolveChannelRoot(channel, roots)` joins
//      the file under product→workspaceDir / artifact→artifactDir / meta→metaDir (each
//      falling back to workspaceDir when its contained root is not provisioned). A run that
//      provisions neither contained root is byte-identical to a single-root turn – which is
//      why an untagged / un-provisioned manifest keeps working.
//
// So a step stays dumb + contained: it declares "I produce the design-guide (artifact) and
// an agent-log (meta)"; the orchestrator decides those land under `.consort` for a normal
// run, or under a sandboxed artifact/meta root for a parallel-experiment run – the manifest
// never changes. See provisioning/channels.ts for the resolver + ChannelRoots.
//
/**
 * A step's OUTPUT declaration, also LOGICAL. The step produces "the feature breakdown
 * index" into its provided workspace; the ORCHESTRATOR maps that id to a .consort path,
 * runs the output's `check` (in-code conformance), and PERSISTS it on pass. The step
 * never resolves .consort or validates – the validator is code the orchestrator runs.
 */
export interface StepOutputSpec {
  /** Stable logical id (e.g. "feature-spec"). */
  id: string;
  /** Human description of the produced artifact. */
  description: string;
  /** The artifact's filename WITHIN the output's channel root (what the agent writes),
   *  CHANNEL-RELATIVE – never prefixed with ".consort/" or the project root (the
   *  orchestrator prepends the channel root; a leading ".consort/" double-encodes it). */
  filename: string;
  /** WHICH channel this output lands in (see the "OUTPUT CHANNELS" note above; absent =
   *  the primary workspace root, byte-identical to a single-root turn):
   *  `product` = the application deliverable (app/tests/migrations) resolved under the code
   *  tree (ALWAYS uncontained – it accumulates + ships); `artifact` = the .consort design
   *  documents, resolved under artifactDir when provisioned (else the workspace – MAY be
   *  contained); `meta` = orchestration bookkeeping resolved under the contained metaDir
   *  when provisioned. */
  channel?: "product" | "artifact" | "meta";
  /** OPTIONAL output: the turn LEGITIMATELY may not produce it. A self-heal turn writes its marker
   *  ONLY on one branch of its judgment – the assess turn writes a superseded/regression marker when
   *  it can localize the failure, but writes NO file when it judges a genuine regression it must
   *  ESCALATE to a human; a review turn may decide refactor:false with no artifact. For such an
   *  output: ABSENT is a clean PASS (not a violation, so the escalation/no-op route is preserved);
   *  PRESENT still runs `validate` and a nonconformant present output is a hard reject. A REQUIRED
   *  output (optional absent/false) that is absent stays a hard reject – the design-lane default. */
  optional?: boolean;
  /** In-code conformance validator for this output. The orchestrator runs it on the
   *  produced artifact; a failure is a hard reject with named violations, NOT an
   *  agent follow-up. Every expected output declares one. */
  validate: OutputValidator;
}

/**
 * A DETERMINISTIC pipeline hook the orchestrator runs AROUND the agent turn (never the
 * agent itself) – e.g. breakdown's `reset-breakdown` (before) / `sync-breakdown` (after).
 * Mirrors a manifest `postTurn` entry. This is a real thing a step DOES beyond
 * inputs/outputs/route, so the canonical model names it. Empty list = no hooks.
 */
export interface PostTurnHook {
  /** The bin token the orchestrator resolves (e.g. "PIPELINE_BIN"). */
  bin: string;
  /** Arguments passed to the resolved bin. */
  args: string[];
  /** Whether the hook runs BEFORE or AFTER the agent turn. */
  when: "before" | "after";
}

/**
 * The per-step AGENT SPAWN configuration – the model/effort/session levers that drive the
 * `claude -p` spawn for this step. Mirrors a manifest `agentOptions` block. Every step that
 * dispatches an agent carries one, so the canonical model names it (it is a thing the step
 * DECLARES, distinct from what it produces or where it routes). The optimize sweep patches
 * these levers per candidate; the resolver reads them here.
 */
export interface AgentOptions {
  /** Model tier for the spawn (e.g. "opus", "sonnet", "haiku"). */
  model?: string;
  /** Reasoning effort ("" / "low" / "medium" / "high" / "default"). */
  effort?: string;
  /** Session policy: "fresh" starts clean, "resume" continues a keyed session. */
  session?: "fresh" | "resume";
  /** Which scope the resume key derives from ("role" / "story" / "feature"). */
  resumeKeyFrom?: string;
}

/** What a step reports about its own completion – the routing intent, not the action. */
export type StepOutcome =
  /** The step produced its artifact; proceed to the proposed next step. */
  | "produced"
  /** The step could not produce (missing input / unmet contract); wants to be retried. */
  | "blocked"
  /** The step found a spec-level defect that should route back to an owning author. */
  | "revise"
  /** The step hit something it cannot resolve; wants a human. */
  | "escalate";

/**
 * A step's emitted routing proposal. `proposedNext` is where the STEP thinks the
 * orchestrator should go – advisory. `reason` is required for anything but a clean
 * `produced` (it becomes the revise/escalate/handback message).
 */
export interface RouteProposal {
  outcome: StepOutcome;
  proposedNext: WorkflowAction;
  reason?: string;
}

/** Read-only view a step's routing sees: the state it produced + the feature scope. */
export interface StepRouteContext {
  state: DriveState;
  feature: string;
}

/**
 * The ONE contract EVERY role/step implements. Carries the step's three faces so it can
 * be invoked and unit-tested in isolation:
 *   - inputs(action):  the input contract (what must exist before it runs).
 *   - outputs(action): the output expectation (what it must produce; null when the step
 *                      produces no static artifact – e.g. a build turn verified by cycle
 *                      records, or a critic gate).
 *   - route(completed, ctx): the routing proposal emitted on completion.
 * The first implementation is `MockStepContract` (below); real roles implement this next.
 */
export interface StepContract {
  /** The logical inputs this step needs. The orchestrator resolves + provides them. */
  inputs(action: WorkflowAction): StepInputSpec[];
  /** The logical PRE-CONDITIONS this step needs prepared before dispatch. The orchestrator
   *  PREPARES each (via the preparer registry) in the PREPARE-PRECONDITIONS phase and appends
   *  the projected blocks to the step's instructions. Absent/empty = an affirmative "nothing". */
  preconditions(action: WorkflowAction): StepPrecondition[];
  /** The logical output(s) this step produces. The orchestrator maps + validates them. */
  outputs(action: WorkflowAction): StepOutputSpec[];
  /** The deterministic pipeline hooks the orchestrator runs AROUND the turn (not the agent).
   *  Empty list = an affirmative "no hooks". */
  postTurn(action: WorkflowAction): PostTurnHook[];
  /** The per-step agent-spawn levers (model/effort/session). The orchestrator reads these to
   *  configure the spawn; the optimize sweep patches them per candidate. */
  agentOptions(action: WorkflowAction): AgentOptions;
  /** The process EVENTS this step may RAISE on completion (green-failure / superseded-tests /
   *  regression-assessment / review-verdict). Declared as full specs so the coverage guard can
   *  confirm every REQUIRED event is raised somewhere. Empty = an affirmative "raises nothing". */
  raises(action: WorkflowAction): TurnEventSpec[];
  /** The process EVENTS a ROUTE to this step depends on – the markers a prior turn must have raised
   *  before this turn is dispatched. Declared as KINDS (scope resolves through TURN_EVENTS, one
   *  scope-truth); the pre-dispatch route-satisfiable check asserts each exists. Empty = "requires
   *  no event" (the plain RED/GREEN turns). This is the face that ties a route to its inputs. */
  requiresEvents(action: WorkflowAction): TurnEventKind[];
  route(completed: WorkflowAction, ctx: StepRouteContext): RouteProposal;
}

/**
 * The EXACT set of faces the canonical StepContract names, pinned to the interface at COMPILE
 * time: `satisfies Record<keyof StepContract, true>` fails tsc if a face is added to the
 * interface without being listed here, OR if a key here is not a real face. This is the single
 * source the runtime exactness guard reads – the allowlist can never silently drift from the
 * interface. To ADD a face: add it to StepContract AND here (that IS "update the canonical
 * model"). See `assertExactStepContract`.
 */
export const STEP_CONTRACT_MEMBERS = {
  inputs: true,
  preconditions: true,
  outputs: true,
  postTurn: true,
  agentOptions: true,
  raises: true,
  requiresEvents: true,
  route: true,
} satisfies Record<keyof StepContract, true>;

/**
 * OUTRIGHT FAIL a StepContract implementation that declares a member the canonical model does
 * NOT name. TypeScript's `implements` is a structural LOWER bound (an extra method is legal +
 * invisible to tsc), so exactness is not compiler-enforceable – this is the runtime backstop.
 * It walks the instance + its prototype for own members and rejects any not in
 * STEP_CONTRACT_MEMBERS. The rule this enforces: a StepContract impl keeps private helpers as
 * MODULE-LEVEL functions, not methods (matching the "step is dumb + contained" design), so the
 * only members on the class are the canonical faces. Call at registration + assert over every
 * impl in a guard test.
 */
export function assertExactStepContract(impl: StepContract, label: string): void {
  const allowed = new Set(Object.keys(STEP_CONTRACT_MEMBERS));
  const own = Object.getOwnPropertyNames(impl);
  const proto = Object.getPrototypeOf(impl) as object | null;
  const protoMembers = proto ? Object.getOwnPropertyNames(proto) : [];
  const members = new Set<string>([...own, ...protoMembers]);
  members.delete("constructor");
  const extras = [...members].filter((k) => !allowed.has(k));
  if (extras.length > 0) {
    throw new Error(
      `${label}: implements StepContract but declares member(s) the canonical model does not name: ` +
        `${extras.sort().join(", ")}. Either remove them (keep private helpers as module-level ` +
        `functions, not methods), OR add the face to StepContract + STEP_CONTRACT_MEMBERS ` +
        `(that is updating the canonical model). No step may do what the model does not name.`,
    );
  }
}

const signature = (a: WorkflowAction): string => JSON.stringify(a);

/**
 * The contract's first implementation: a scripted contract keyed by action signature.
 * Tests (and the mock-only wiring slice) drive exact inputs/outputs/proposals with no
 * cloud/model/roles. Missing input contract defaults to `{requires:[]}`; missing output
 * defaults to `null`; a missing routing proposal THROWS – the mock must be told every
 * step it is asked to route, so a missing case is a loud test failure, not a silent
 * default.
 */
export class MockStepContract implements StepContract {
  constructor(
    private readonly script: {
      inputs?: Record<string, StepInputSpec[]>;
      preconditions?: Record<string, StepPrecondition[]>;
      outputs?: Record<string, StepOutputSpec[]>;
      postTurn?: Record<string, PostTurnHook[]>;
      agentOptions?: Record<string, AgentOptions>;
      raises?: Record<string, TurnEventSpec[]>;
      requiresEvents?: Record<string, TurnEventKind[]>;
      route?: Record<string, RouteProposal>;
    },
  ) {}

  inputs(action: WorkflowAction): StepInputSpec[] {
    return this.script.inputs?.[signature(action)] ?? [];
  }

  preconditions(action: WorkflowAction): StepPrecondition[] {
    return this.script.preconditions?.[signature(action)] ?? [];
  }

  outputs(action: WorkflowAction): StepOutputSpec[] {
    return this.script.outputs?.[signature(action)] ?? [];
  }

  postTurn(action: WorkflowAction): PostTurnHook[] {
    return this.script.postTurn?.[signature(action)] ?? [];
  }

  agentOptions(action: WorkflowAction): AgentOptions {
    return this.script.agentOptions?.[signature(action)] ?? {};
  }

  raises(action: WorkflowAction): TurnEventSpec[] {
    return this.script.raises?.[signature(action)] ?? [];
  }

  requiresEvents(action: WorkflowAction): TurnEventKind[] {
    return this.script.requiresEvents?.[signature(action)] ?? [];
  }

  route(completed: WorkflowAction, _ctx: StepRouteContext): RouteProposal {
    const p = this.script.route?.[signature(completed)];
    if (!p) {
      throw new Error(`MockStepContract: no scripted proposal for completed action ${signature(completed)}`);
    }
    return p;
  }
}

/**
 * The bounds `validateAndBound` reuses – injected so the policy is unit-tested without
 * touching disk. In the real wiring these are backed by the existing machinery:
 *  - `allowed`: the pure `nextTransition(state)` (the allowlist + fallback).
 *  - `reviseBudgetAvailable`: the existing revise-budget check (priorReviseCount /
 *    REFLECT_REVISE_CAP) for the proposed revise-route.
 *  - `recordRetry`: the ExpectationLedger's one-retry bound; returns {sanctioned:true}
 *    for the allowed retry and THROWS (ProtocolViolationError) once exhausted.
 */
export interface ValidateBoundDeps {
  allowed(state: DriveState): WorkflowAction;
  reviseBudgetAvailable(proposal: RouteProposal, state: DriveState): boolean;
  recordRetry(completed: WorkflowAction, state: DriveState, reason?: string): { sanctioned: boolean };
}

/** The single decision `validateAndBound` returns for the loop to act on. */
export interface BoundedRoute {
  /** The action the orchestrator will actually take this iteration. */
  action: WorkflowAction;
  /** True when this is a sanctioned re-issue of the same step (so it is NOT a stall). */
  sanctionedRetry: boolean;
  /** Set when the proposal was NOT honored as-is (mismatch fallback, budget conversion). */
  note?: string;
}

const raiseToHil = (reason: string, source: string, story?: string): WorkflowAction => ({
  kind: "raise-to-hil",
  reason,
  source,
  ...(story ? { story } : {}),
});

/**
 * The orchestrator's authority over a step's routing proposal: step PROPOSES,
 * orchestrator VALIDATES + BOUNDS. Never lets a step drive the machine off the allowed
 * graph.
 *   - produced: honor `proposedNext` iff it equals the pure allowed transition; else
 *     FALL BACK to the allowed action (recorded mismatch – the step cannot invent a move).
 *   - revise: honor the revise-route iff the revise budget has room; else convert to
 *     raise-to-hil (budget exhausted – a human decides).
 *   - blocked: a sanctioned retry of the same step while the retry ledger allows it;
 *     `recordRetry` throws (ProtocolViolationError) once exhausted.
 *   - escalate: straight to raise-to-hil.
 */
export function validateAndBound(
  proposal: RouteProposal,
  completed: WorkflowAction,
  state: DriveState,
  deps: ValidateBoundDeps,
): BoundedRoute {
  switch (proposal.outcome) {
    case "escalate":
      return {
        action: raiseToHil(proposal.reason ?? "step requested escalation", stepSource(completed), storyOf(completed)),
        sanctionedRetry: false,
      };

    case "revise": {
      if (proposal.proposedNext.kind !== "revise-route") {
        // A revise outcome must carry a revise-route; anything else is a malformed
        // proposal – fall back to the allowed transition rather than trust it.
        const allowed = deps.allowed(state);
        return { action: allowed, sanctionedRetry: false, note: "revise proposal was not a revise-route; fell back to allowed transition" };
      }
      if (deps.reviseBudgetAvailable(proposal, state)) {
        return { action: proposal.proposedNext, sanctionedRetry: false };
      }
      return {
        action: raiseToHil(
          proposal.reason ?? "revise budget exhausted",
          stepSource(completed),
          storyOf(proposal.proposedNext),
        ),
        sanctionedRetry: false,
        note: "revise budget exhausted; converted to raise-to-hil",
      };
    }

    case "blocked": {
      // The step wants to be retried. Defer to the retry ledger for the bound; it
      // throws once the retry budget is exhausted (ProtocolViolationError). A
      // sanctioned retry re-issues the SAME action and is flagged so the loop's stall
      // check skips it.
      const { sanctioned } = deps.recordRetry(completed, state, proposal.reason);
      return { action: completed, sanctionedRetry: sanctioned };
    }

    case "produced":
    default: {
      const allowed = deps.allowed(state);
      if (signature(proposal.proposedNext) === signature(allowed)) {
        return { action: proposal.proposedNext, sanctionedRetry: false };
      }
      return {
        action: allowed,
        sanctionedRetry: false,
        note: `proposal ${signature(proposal.proposedNext)} not the allowed transition; fell back to ${signature(allowed)}`,
      };
    }
  }
}

/** Best-effort source label for an escalation, from the completed action. */
function stepSource(completed: WorkflowAction): string {
  if (completed.kind === "invoke-role") return `step:${completed.role}`;
  return `step:${completed.kind}`;
}

/** Pull a story id off an action when it carries one (for escalation scoping). */
function storyOf(a: WorkflowAction): string | undefined {
  return "story" in a && typeof a.story === "string" ? a.story : undefined;
}
