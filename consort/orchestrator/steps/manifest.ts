// step-manifest: load + validate the per-step JSON manifests (the DATA face of a step)
// and index an action to its SINGLE manifest.
//
// A manifest is the data the orchestrator's standard (Template Method) execution reads to
// drive the fixed phases: the logical inputs it resolves + provides, the outputs (+ validator
// NAMES) it validates, the routing map, the agent levers, and any post-turn CLIs. Only the
// validator fn bodies (validator-registry.ts) and the agent spawn (ClaudeStepAgent) stay code.
//
// Validation reuses the shared Ajv loader (getValidator) – the SAME compilation truth every
// other artifact uses, no new Ajv instance. Resolving a validator NAME to its fn is the
// registry's job (resolveValidator); an unknown name is caught THERE, not here (the schema
// cannot know registry contents).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getValidator, formatSchemaErrors } from "../validators/schema-loader.js";
import type { WorkflowAction } from "../workflow/workflow-vocabulary.js";
import type { TurnEventKind } from "./turn-events.js";
// The SHIPPED manifests are imported as JSON modules so the bundler INLINES them into
// the build – no runtime fs read, no __dirname/dist path to keep in sync, no copy step.
// (resolveJsonModule is on.) External/scenario manifests are still loaded from a directory
// the caller passes explicitly (loadStepManifests(dir)).
import productOwnerIntakeManifest from "./manifests/product-owner-intake.json" with { type: "json" };
import productOwnerAuthorRequestsManifest from "./manifests/product-owner-author-requests.json" with { type: "json" };
import specAuthorBreakdownManifest from "./manifests/spec-author-breakdown.json" with { type: "json" };
import specAuthorProposeManifest from "./manifests/spec-author-propose.json" with { type: "json" };
import specAuthorStoryManifest from "./manifests/spec-author-story.json" with { type: "json" };
import architectEstimatorManifest from "./manifests/architect-estimator.json" with { type: "json" };
import architectReviewerManifest from "./manifests/architect-reviewer.json" with { type: "json" };
import dbaManifest from "./manifests/dba.json" with { type: "json" };
import testStrategistManifest from "./manifests/test-strategist.json" with { type: "json" };
import driverGreenManifest from "./manifests/driver-green.json" with { type: "json" };
import uxEstablishManifest from "./manifests/ux-establish.json" with { type: "json" };
import uxIaManifest from "./manifests/ux-ia.json" with { type: "json" };
// Build-turn manifests: every navigator/driver BUILD turn is now a declared step (config home
// for its agentOptions). Their record-phase cycle CLI is DYNAMIC (loop/--ac/--repair/collapsed
// buildMode verbs), so each declares a `@build-cycle` postTurn marker that commandsFromManifest
// delegates to buildCycleCommand – the ONE derivation the legacy commandsForAction also calls.
import navigatorRedManifest from "./manifests/navigator-red.json" with { type: "json" };
import navigatorReviewManifest from "./manifests/navigator-review.json" with { type: "json" };
import navigatorReflectManifest from "./manifests/navigator-reflect.json" with { type: "json" };
import navigatorReconcileManifest from "./manifests/navigator-reconcile.json" with { type: "json" };
import navigatorAssessManifest from "./manifests/navigator-assess.json" with { type: "json" };
import navigatorAssessDeployManifest from "./manifests/navigator-assess-deploy.json" with { type: "json" };
import navigatorAssessRefactorManifest from "./manifests/navigator-assess-refactor.json" with { type: "json" };
import driverRefactorManifest from "./manifests/driver-refactor.json" with { type: "json" };
import driverRefactorDeployManifest from "./manifests/driver-refactor-deploy.json" with { type: "json" };
import driverRefactorSupersededManifest from "./manifests/driver-refactor-superseded.json" with { type: "json" };
import driverRepairManifest from "./manifests/driver-repair.json" with { type: "json" };
import driverGreenSupersededManifest from "./manifests/driver-green-superseded.json" with { type: "json" };

/** A step's logical input – resolved from .consort by the orchestrator and provided by id. */
export interface StepManifestInput {
  id: string;
  /** .consort source locator, e.g. "feature:product-overview.md". */
  source: string;
  /** When true, a MISSING source is skipped (not handed back) instead of failing the turn – for an
   *  input that legitimately may be absent (e.g. design-guide.json on a no-frontend project).
   *  Default false: a missing required input fails loud. */
  optional?: boolean;
  description?: string;
}

/** A step's declared PRE-CONDITION – a preparer the orchestrator runs to project a context
 *  block into the prompt before dispatch (context-pack / green-failure-advisory). */
export interface StepManifestPrecondition {
  id: string;
  /** Preparer kind resolved from the preparer registry (context-pack | green-failure-advisory). */
  kind: string;
  description?: string;
  /** WHERE the prepared block sits relative to the base prompt: "prepend" (before the directive,
   *  e.g. the green-failure advisory) or "append" (after, e.g. the context-pack). Default "append". */
  position?: "prepend" | "append";
  /** Preparer-specific knobs, e.g. { skipTestLoop: true } for context-pack. */
  options?: Record<string, unknown>;
}

/** A step's produced output – validated by an in-code validator resolved from the registry. */
export interface StepManifestOutput {
  id: string;
  /** Filename within the provided workspace the agent writes. */
  filename: string;
  /** Registered OutputValidator name (validator-registry.ts). */
  validator: string;
  /** WHICH channel this output lands in (absent = the primary workspace root, byte-identical):
   *  `product` = the application deliverable (app/tests/migrations) that accumulates across
   *  build turns + ships; MUST be uncontained (the real code tree). `artifact` = the .consort
   *  design documents (feature-spec/architecture/test-list/design-guide); small + per-feature,
   *  so MAY be contained (resolved under artifactDir when provisioned, else the workspace).
   *  `meta` = orchestration bookkeeping (raw report / verdict / marker) whose conformance the
   *  orchestrator owns; contained (resolved under metaDir when provisioned, else the workspace). */
  channel?: "product" | "artifact" | "meta";
  /** OPTIONAL output: the turn LEGITIMATELY may not produce it (a self-heal turn writes its marker
   *  on one branch of its judgment + escalates on the other). Absent = a clean pass; present = still
   *  validated. Default (absent/false) = required (the design-lane norm). */
  optional?: boolean;
  description?: string;
}

/** Where one StepOutcome proposes to go. `next` may be a WorkflowAction or "state-derived". */
export interface StepManifestRouteTarget {
  next?: unknown;
  retry?: boolean;
  gate?: string;
  [k: string]: unknown;
}

/** The agent levers the executor builds AgentLevers from. */
export interface StepManifestAgentOptions {
  model?: string;
  effort?: "low" | "default" | "high";
  session: "fresh" | "resume";
  resumeKeyFrom?: "role" | "story" | "feature" | "none";
  toolScope?: { allowed?: string[]; disallowed?: string[] };
  fallbackModel?: string;
  maxBudgetUsd?: number;
}

/** One post-turn deterministic CLI (record/log phase). */
export interface StepManifestPostTurn {
  bin: string;
  args: string[];
  when?: "before" | "after";
}

/**
 * WHICH concrete StepAgent this step uses + that agent's config – DATA in the manifest, so
 * the choice of agent is not hardcoded in any script. `kind` names a catalogue entry
 * (claude | replay | mock); `config` is that kind's knobs (claude levers / replay seeds /
 * mock fixtures). The ENV a kind needs (corpus root, kit dir) is supplied by the runner as a
 * build context, NOT here.
 */
export interface StepManifestAgent {
  kind: string;
  config: Record<string, unknown>;
}

/**
 * The DATA face of one step. `match` is a STRICT SUBSET of a WorkflowAction: every field it
 * carries must equal the action's field for a match. The loader rejects an ambiguous overlap
 * (two manifests matching one action).
 */
export interface StepManifest {
  id: string;
  role: string;
  match: Record<string, unknown>;
  inputs: StepManifestInput[];
  /** The pre-conditions the orchestrator PREPARES before dispatch (optional; absent = none). */
  preconditions?: StepManifestPrecondition[];
  outputs: StepManifestOutput[];
  routing: {
    produced: StepManifestRouteTarget;
    blocked?: StepManifestRouteTarget;
    revise?: StepManifestRouteTarget;
    escalate?: StepManifestRouteTarget;
  };
  agentOptions: StepManifestAgentOptions;
  postTurn?: StepManifestPostTurn[];
  /** The process EVENTS this step may RAISE on completion (event kinds; scope resolves through
   *  TURN_EVENTS). Optional; absent = raises nothing. Read by Step.raises. */
  raises?: TurnEventKind[];
  /** The process EVENTS a ROUTE to this step depends on (event kinds a prior turn must have raised
   *  before dispatch). Optional; absent = requires no event. Read by Step.requiresEvents + the
   *  pre-dispatch route-satisfiable check. */
  requiresEvents?: TurnEventKind[];
  /** WHICH agent this step uses (kind + config), resolved via the agent catalogue. Optional
   *  so legacy manifests (agent injected by the caller) still validate; the runner requires
   *  one OR an explicit agentFor override. */
  agent?: StepManifestAgent;
}

/** The result of a shape validation – shape mirrors OutputValidationResult for consistency. */
export interface ManifestValidateResult {
  ok: boolean;
  violations: string[];
}

const SCHEMA = "step-manifest.schema.json";

/** Validate a manifest object's SHAPE against step-manifest.schema.json. */
export function validateStepManifest(manifest: StepManifest): ManifestValidateResult {
  const validate = getValidator(SCHEMA);
  if (validate(manifest)) return { ok: true, violations: [] };
  return { ok: false, violations: formatSchemaErrors(validate) };
}

/**
 * The SHIPPED step manifests – inlined at build time via the JSON imports above. This is the
 * default manifest set the orchestrator resolves against; adding a shipped step = add a JSON
 * file under ./manifests/ AND an import line here. No runtime fs, no dist path.
 */
export const SHIPPED_MANIFESTS: StepManifest[] = [
  productOwnerIntakeManifest as StepManifest,
  productOwnerAuthorRequestsManifest as StepManifest,
  specAuthorBreakdownManifest as StepManifest,
  specAuthorProposeManifest as StepManifest,
  specAuthorStoryManifest as StepManifest,
  architectEstimatorManifest as StepManifest,
  architectReviewerManifest as StepManifest,
  dbaManifest as StepManifest,
  testStrategistManifest as StepManifest,
  driverGreenManifest as StepManifest,
  uxEstablishManifest as StepManifest,
  uxIaManifest as StepManifest,
  navigatorRedManifest as StepManifest,
  navigatorReviewManifest as StepManifest,
  navigatorReflectManifest as StepManifest,
  navigatorReconcileManifest as StepManifest,
  navigatorAssessManifest as StepManifest,
  navigatorAssessDeployManifest as StepManifest,
  navigatorAssessRefactorManifest as StepManifest,
  driverRefactorManifest as StepManifest,
  driverRefactorDeployManifest as StepManifest,
  driverRefactorSupersededManifest as StepManifest,
  driverRepairManifest as StepManifest,
  driverGreenSupersededManifest as StepManifest,
];

/** The story-scoped roles: a manifest whose match has no `mode`/`buildMode` needs a `story` on
 *  the reconstructed action for turnKeyForAction to resolve the per-story step (acs/architect/
 *  dba/test-list/green) rather than undefined. Mirrors the parity test's reconstruction. */
const STORY_SCOPED_ROLES = new Set(["dba", "test-strategist", "driver", "spec-author", "architect-reviewer"]);

/** Reconstruct a representative WorkflowAction from a manifest's `match`, so turnKeyForAction
 *  resolves the SAME TurnKey the drive derives for that step: drop the null sentinels (they mean
 *  "field ABSENT"), and add a story for the story-scoped roles that carry no mode/buildMode. */
export function actionFromManifestMatch(match: Record<string, unknown>, role: string): WorkflowAction {
  const a: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(match)) {
    if (v === null) continue; // sentinel: field must be absent
    a[k] = v;
  }
  const hasMode = "mode" in match && match.mode !== null;
  const hasBuildMode = "buildMode" in match && match.buildMode !== null;
  if (STORY_SCOPED_ROLES.has(role) && !hasMode && !hasBuildMode && !("story" in a)) {
    a.story = "S1-representative";
  }
  return a as unknown as WorkflowAction;
}

/**
 * The per-step agent levers (model/effort) DECLARED for a (role, turnKey) across the shipped
 * manifests – the config-directory face resolveConsortSettings reads as its per-step BASE layer
 * (below the project consort-config.json + the applied-winners overlay, above RECOMMENDED_MODELS).
 * The (role, turnKey) index is derived from each manifest's `match` via the SAME turnKeyForAction
 * the drive uses (reconstructing a representative action from the match), so the manifest's
 * declared key is exactly the key the drive looks it up under.
 *
 * Several manifests collapse onto ONE key (the three assess* buildModes -> "assess", refactor*
 * -> "refactor"); they MUST declare identical {model,effort} for that key – a disagreement is a
 * manifest-authoring bug this THROWS on, since the resolver cannot pick between two truths.
 * Returns undefined when no shipped manifest declares that (role, turnKey) (the caller falls
 * through to RECOMMENDED_MODELS + the model-default effort).
 */
export function agentOptionsForStep(
  role: string,
  turnKey: string | undefined,
  keyForAction: (a: WorkflowAction) => string | undefined,
  manifests: StepManifest[] = SHIPPED_MANIFESTS,
): { model?: string; effort?: string } | undefined {
  let hit: { model?: string; effort?: string } | undefined;
  for (const m of manifests) {
    if (m.role !== role) continue;
    if (keyForAction(actionFromManifestMatch(m.match, m.role)) !== turnKey) continue;
    const cur = { model: m.agentOptions.model, effort: m.agentOptions.effort };
    if (hit && (hit.model !== cur.model || (hit.effort ?? "default") !== (cur.effort ?? "default"))) {
      throw new Error(
        `step-manifest: conflicting agentOptions for (${role}, ${turnKey}) – two manifests declare different model/effort for the same resolved step. Make them agree (collapsed buildModes share one lever set).`,
      );
    }
    hit = cur;
  }
  return hit;
}

/**
 * Load step manifests from a DIRECTORY – for EXTERNAL manifest sets (scenario/demo manifests
 * a caller keeps outside the shipped set, e.g. examples/.../step-manifests). The shipped
 * manifests are NOT loaded this way (they are inlined; see SHIPPED_MANIFESTS). Passing a dir
 * is required – there is no default. Missing dir -> empty (absence must not throw). Each file
 * is parsed but NOT shape-validated here – callers validate.
 */
export function loadStepManifests(dir: string): StepManifest[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as StepManifest);
}

/**
 * Strict subset-match: `match` matches `action` iff every field on `match` is deep-equal to
 * the same field on `action`. Extra action fields are ignored (the match is a subset). A
 * field absent from the action never matches a present match field.
 *
 * The `null` sentinel means "this field must be ABSENT (undefined) on the action" – the
 * minimal, precise way to select a PLAIN turn from a family that adds discriminating fields.
 * E.g. `{kind:"invoke-role", role:"driver", buildMode:null, ac:null}` matches the default
 * story-loop driver GREEN turn but NOT a refactor/repair (buildMode present) or per-AC
 * (ac present) green. Without it a coarse `{kind, role}` match would mis-route those.
 */
export function matchesAction(match: Record<string, unknown>, action: WorkflowAction): boolean {
  const act = action as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(match)) {
    if (v === null) {
      if (act[k] !== undefined) return false; // sentinel: the field must be absent
      continue;
    }
    if (!deepEqual(v, act[k])) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}

/**
 * The single manifest that matches an action, or undefined when none do. THROWS loud when
 * more than one matches (an ambiguous overlap is a manifest-authoring bug the orchestrator
 * must never silently resolve). Defaults to the shipped manifests when no list is passed.
 */
export function manifestForAction(
  action: WorkflowAction,
  manifests: StepManifest[] = SHIPPED_MANIFESTS,
): StepManifest | undefined {
  const hits = manifests.filter((m) => matchesAction(m.match, action));
  if (hits.length > 1) {
    const ids = hits.map((m) => m.id).join(", ");
    throw new Error(
      `step-manifest: ambiguous match – ${hits.length} manifests match action ${JSON.stringify(action)}: ${ids}. Each action must map to exactly one manifest; tighten a match.`,
    );
  }
  return hits[0];
}
