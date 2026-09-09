// Real DriveEffects (deterministic-driver phase 3b: the act half).
//
// Maps each WorkflowAction to the concrete commands that carry it out, behind a
// CommandRunner seam so the mapping (commandsForAction) is pure + hermetically
// testable while the execution is injected. The driver loop (runDriver) calls
// perform(action); perform asks commandsForAction for the command list and runs
// each through the runner. readState rebuilds a DriveState from disk via
// deriveDriveState + diskArtifactProbe + readDriveContext.
//
// Command kinds (the runner interprets each):
//   - "claude":    claude -p "<task>" --agent <role> --model <m> --strict-mcp-config
//   - "cli":       a kit CLI invocation (consort-pipeline / -experiment / etc.)
//   - "set-phase": write workflow-state.json `phase` (no CLI owns the coarse phase)
//
// The live runner (in the consort-drive CLI) spawns these; the migration
// create + head-collapse + per-story experiment effects all surface here, in
// code, plus deterministic per-action logging via the loop's onAction hook.

import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { nextTransition, type WorkflowAction, type DriveState } from "./orchestrator-drive.js";
import { manifestForAction, type StepManifestPostTurn } from "../steps/manifest.js";
import { performTurnViaExecutor, assertNotStrandedAgentTurn, isPlanningMode } from "./executor-dispatch.js";
import { assertRouteSatisfiable } from "../steps/assert-route-satisfiable.js";
import { formatAgentReport } from "../turns/agent-report-formatter.js";
import type { DriveEffects } from "./orchestrator-run.js";
import { deriveDriveState, effectiveLoopForStory } from "../state/orchestrator-derive.js";
import { diskArtifactProbe, readDriveContext } from "../state/orchestrator-probe.js";
import { readPipeline } from "../../pipeline/story-pipeline.js";
import {
  storyJson, designGuideJson, handbackFile, storyAcIds, architectureJson, readAcLayer,
  featureProposalsMd, featureSpecJson, featureTestListJson, acsDir, planningEstimatesJson, cycleDir,
} from "../../config/consort-paths.js";
import { kitRoot } from "../../config/kit-bin.js";
import type { TurnKey } from "./turn-key.js";
// turnKeyForAction now lives in the shared, dependency-light turn-key module (so the config
// resolver can derive the same key without a cycle). Re-exported here for the callers that have
// long imported it from orchestrator-effects (optimize.cli, tests).
export { turnKeyForAction } from "./turn-key.js";
import { turnKeyForAction } from "./turn-key.js";
import { designGuideConformance } from "../../session/response-formatter.js";
import { storyTestProgress, nextPendingBatch, DEFAULT_BATCH_CAP } from "../../pipeline/cycle-record.js";
import { readSupersededTests, readGreenFailure } from "../../smells/supersession.js";
import { readDeployVerifyAssessMarker, readDeployVerifyScope } from "../../smells/deploy-verify-assess.js";
import { readRefactorVerifyAssessMarker } from "../../smells/refactor-verify-assess.js";
import { readConventions } from "../../architecture/architecture-conventions.js";
// The build-turn CONTEXT PACK (rubric + layout + test locations) lives in the orchestrator
// family as the single source of truth – the lean per-role build chains inject the SAME pack.
import { contextRubric, buildContextPack } from "../build/build-context.js";
import { buildGreenFailureAdvisory, resolvePreparer } from "../build/preconditions.js";
import { sanitizeBranchName } from "@databricks-solutions/lakebase-scm-utils/util";

export type DriveCommand =
  // resumeKey: when set, the runner resumes this role's Claude session across
  // its invocations (warm context + prompt cache) instead of a cold respawn.
  // Keyed by role, scoped to one feature drive (the runner's lifetime).
  // `replay` carries the turn identity (sprint mode / story) so the runner can,
  // in fast-forward replay mode, copy this design turn's recorded artifact
  // instead of spawning the model. Ignored by the normal (live) runner.
  // `effort` (P6): the `claude -p --effort <level>` knob for THIS turn. Set on the
  // judgment turns (REVIEW) to run them fast (low reasoning effort), the headless
  // realization of "fast mode", since `claude -p` has no `--fast` flag. Omitted =>
  // the model's default effort.
  // `allowedTools`/`disallowedTools` (optimize harness Family-2 lever): when set,
  // restrict the agent's tool scope for THIS turn (--allowed-tools /
  // --disallowed-tools). Absent on every normal-drive command, so the spawn is
  // unchanged; the harness sets them per candidate to cap on-disk scanning.
  // `mcpConfig`: a `--mcp-config <file>` path loading an MCP server for THIS turn
  // (under the base `--strict-mcp-config`, ONLY that file's servers load). Set only
  // for the ux-designer role (a headless browser MCP so it can read named reference
  // sites' real fonts/colors/spacing); absent on every other command, so their spawn
  // is unchanged.
  | { kind: "claude"; role: string; model: string; task: string; resumeKey?: string; effort?: string; fallbackModel?: string; maxBudgetUsd?: number; allowedTools?: string[]; disallowedTools?: string[]; mcpConfig?: string; replay?: { mode?: string; buildMode?: string; story?: string } }
  | { kind: "cli"; bin: string; args: string[] }
  | { kind: "set-phase"; phase: string }
  // Deterministic sprint-backlog projection (the ONE writer): after the PO
  // commits its requests, project backlog.json from the on-disk feature-request
  // set + the Architect's estimates. Handled in-process by the runner (no CLI),
  // mirroring set-phase. See syncBacklog in consort-paths.
  | { kind: "sync-backlog"; sprint: string }
  // Post-turn artifact guard (FEIP-8006): after a design/planning role's claude
  // turn, assert the role actually wrote its expected artifact UNDER the project's
  // resolved consortDir (at least one of `anyOf` exists, a file or a non-empty dir),
  // BEFORE any deterministic effect consumes it. A subagent that resolved the
  // project root wrong (cwd / $HOME / a hallucinated path) writes outside the
  // project; without this the miss surfaces later as a cryptic, misattributed
  // downstream crash ("story not found"). The runner fails loud + attributed here.
  | { kind: "verify-artifact"; role: string; anyOf: string[]; label: string };

export interface CommandRunner {
  run(cmd: DriveCommand): Promise<void>;
}

export interface DriveEffectsConfig {
  projectDir: string;
  consortDir: string;
  featureId: string;
  runner: CommandRunner;
  /** Resolve a role's model (per-project override -> recommended -> inherit). */
  modelForRole(role: string): string;
  /** Unified config: resolve the model for a role+turn (model tiering). A per-turn
   *  `model` map entry (e.g. driver GREEN on haiku) wins for that turn; absent, the
   *  role's base model applies. When unset, the caller falls back to modelForRole. */
  modelForTurn?(role: string, turn?: TurnKey): string;
  /** Approver name for headless gate approvals (the Human Proxy). */
  approver?: string;
  /** Sprint name, threaded to the sprint plan gate in the planning phase. */
  sprintName?: string;
  /** OPTIONAL fresh-state reader for the executor's post-turn `state-derived` re-derive. A turn
   *  whose manifest routes `state-derived` has the executor re-derive the next action from disk
   *  (executor-dispatch phase 7). By default that uses readDriveStateFromDisk (the FEATURE probe),
   *  which is correct for a feature drive. But a PLANNING drive (drivePlanning) reads state through
   *  deriveSprintPlanningState – its DriveState carries phase:"planning", which nextTransition needs
   *  to route propose->estimate->author-requests. When this is set, the executor re-derives through
   *  it INSTEAD of the feature probe, so the executor's routing authority matches the drive's own
   *  readState (single source). Absent => the feature reader, byte-identical to before. */
  readFreshDriveState?(): import("./orchestrator-drive.js").DriveState;
  /** Recorded feature-requests are available (capture/replay via
   *  $LAKEBASE_CONSORT_SPRINT_REQUESTS). When true, the planning PROPOSE step is
   *  DETERMINISTIC (project feature-proposals.md from those requests via the
   *  Human Proxy) instead of spawning the Spec Author LLM, which as an LLM could
   *  write nothing then claim the file exists (the propose protocol-violation
   *  abort). Interactive users (no recorded requests) still get the live propose. */
  recordedRequests?: boolean;
  /** Force the PROPOSE step LIVE even when recordedRequests is set. The capture
   *  uses this to exercise the full plan lane: the Spec Author proposes live
   *  (reading product-overview.md + nfrs.md, so the candidate set is guided by
   *  the product's own framing), while the proxy-as-PO STILL commits the recorded
   *  feature-request at author-requests. Safe now that an empty live propose is
   *  caught + retried (improved handoff guard), which is the failure the
   *  deterministic path originally avoided. Set via $LAKEBASE_CONSORT_LIVE_PROPOSE. */
  livePropose?: boolean;
  /** Deploy target for the deploy action (e.g. "local"). */
  deployTarget?: string;
  /** Lakebase instance id (the Lakebase project id), threaded to the experiment
   *  branch ops. The experiment CLI requires it; resolved from SCM state. */
  instance?: string;
  /** The feature's git + Lakebase branch (the PARENT a per-story experiment is
   *  cut off, and merged back into). Resolved from SCM state at drive start. */
  featureBranch?: string;
  /** The feature's PARENT TIER (the branch the feature PR merges up into, e.g.
   *  staging). Resolved from SCM state at drive start. The feature wrap-up
   *  switches the working tree back to it as the last step, so the next feature
   *  forks from a clean parent (and a human/the smoke is not left on the merged,
   *  soon-deleted feature branch). */
  parentBranch?: string;
  /** UI track on (project.uiTrack in consort-config.json, the single source): the
   *  Spec Author must treat user-facing capabilities as E2E (browser/screen)
   *  stories, not API-only, when proposing + breaking down. */
  uiTrack?: boolean;
  /** P5: build-session scope for the Navigator/Driver. "story" (default) resumes
   *  their `claude -p` session across a story's cycles (warm context + prompt
   *  cache) and starts FRESH at each new story, so context growth is bounded to
   *  one story. "cycle" cold-spawns every RED/GREEN/REVIEW/REFACTOR (the prior
   *  behavior), the safety valve if a long story overflows the window. */
  buildSessionScope?: "cycle" | "story";
  /** P6: `--effort` level for the Navigator's REVIEW turn (judgment, not code
   *  authoring), so it runs fast. Default "low"; set "" / undefined-via-env to
   *  use the model default. Superseded by effortForTurn when that is provided
   *  (kept as the fallback so older callers / tests still resolve review effort). */
  reviewEffort?: string;
  /** Unified config: resolve `--effort` for ANY role+turn ("" / "default" => omit
   *  the flag). When set it governs every turn; absent, the review-only
   *  reviewEffort fallback applies. (consort-config.json, file -> env -> default.) */
  effortForTurn?(role: string, turn?: TurnKey): string;
  /** Unified config: a role's `--fallback-model` (auto-failover), or undefined. */
  fallbackModelForRole?(role: string): string | undefined;
  /** Unified config: a role's `--max-budget-usd` per-invocation cap, or undefined. */
  maxBudgetUsdForRole?(role: string): number | undefined;
  /** Unified config: a role's `--mcp-config` path (an MCP server that loads for that
   *  role's turn under the base --strict-mcp-config), or undefined. Set for ux-designer
   *  (a headless browser MCP to read named reference sites); undefined for every other
   *  role, so their spawn is unchanged. */
  mcpConfigForRole?(role: string): string | undefined;
  /** Build loop granularity. "story" (the DEFAULT) gives the Navigator + Driver
   *  story-scoped turns: one RED turn writes the WHOLE story's tests, one GREEN
   *  greens them, one REVIEW + one REFACTOR per story. "ac" writes + greens one
   *  test at a time (strict per-AC TDD, per-AC REVIEW/REFACTOR). "hybrid-a"
   *  batches RED+GREEN by layer (capped) but keeps the per-AC REVIEW. ac /
   *  hybrid-a are opt-in for a more granular run. */
  loopGranularity?: "ac" | "hybrid-a" | "story";
  /** P8b: max test-list items per layer-batch (hybrid-a). Default 3. */
  batchCap?: number;
  /** Optimize harness (Family-2 content/scope levers), all DEFAULT-OFF: a normal
   *  drive sets none, so every turn's prompt + spawn args are byte-identical to
   *  before. The per-handoff optimize harness sets them for ONE forked candidate
   *  turn to A/B-test what the agent SEES and CAN DO, then discards or keeps the
   *  turn on wall-clock + gate outcome.
   *
   *  taskSuffix: extra directive APPENDED to a role's task (after the terse
   *  suffix), the per-turn task-injection lever. Return "" for no-op. */
  taskSuffix?(role: string, turn?: TurnKey): string;
  /** contextPackSuffix: extra pre-extracted CONTEXT appended to a build turn's
   *  task, BEFORE the terse suffix, so it reads as context, not a trailing order.
   *  The inject-more/scan-less lever (module map, code snippets, exact refs).
   *  Return "" for no-op. */
  contextPackSuffix?(role: string, turn?: TurnKey): string;
  /** instructionsOverride: replace a turn's BASE task body verbatim (before the
   *  handback prefix + contextPackSuffix/taskSuffix appends still wrap it). Returns
   *  undefined to leave the normal roleTaskBody in place. Its purpose is REPLAY: an
   *  optimization experiment drives a turn from the corpus turn's recorded prompt.txt
   *  (the exact context the agent saw) as the SOURCE, with levers appended via
   *  contextPackSuffix – so the recorded context is held constant and the lever is the
   *  only perturbation. When set for a turn, the executor also SKIPS phase-2.5
   *  precondition preparation for that turn (the recorded prompt already carries the
   *  context), so a manifest-declared context-pack is not re-injected on top. */
  instructionsOverride?(action: Extract<WorkflowAction, { kind: "invoke-role" }>): string | undefined;
  /** allowedToolsForRole/disallowedToolsForRole: per-role tool-scope restriction
   *  (--allowed-tools / --disallowed-tools), the cap-what-the-agent-scans lever.
   *  Return undefined (or an empty list) to leave the tool scope unrestricted. */
  allowedToolsForRole?(role: string): string[] | undefined;
  disallowedToolsForRole?(role: string): string[] | undefined;
  /** OPT-IN (default off): route an action's command assembly through its step
   *  manifest (commandsFromManifest) when one matches, instead of the legacy
   *  per-role branch of commandsForAction. The two are golden-equivalent per
   *  migrated action (byte-identical DriveCommand[]), so this changes nothing
   *  observable – it is the migration switch that lets a legacy branch be retired
   *  once its manifest + golden test are proven. Unset => the legacy path runs. */
  useManifestSteps?: boolean;
  onAction?(action: WorkflowAction, iteration: number): void;
  /** OPTIONAL routing-decision observability hook, threaded to the loop's DriveEffects. Fires per
   *  iteration with the action + the DriveState that chose it (the routing "why"). Observational. */
  onRoutingDecision?(
    action: WorkflowAction,
    state: DriveState,
    iteration: number,
    source: "nextTransition" | "bounded" | "contract",
  ): void;
  /** OPTIONAL (RECORD lane): read + clear the just-completed live turn's transcript (prompt + final
   *  reasoning + tools) so the executor's ReplayRecorderWrapper persists it alongside the recorded
   *  delta. Supplied by the CLI (takeLastAgentTranscript) only when a RECORD_DIR capture is active;
   *  absent on a normal drive (the recorder then records the delta with no transcript). Typed loosely
   *  (returns the recorder's RecordedTranscript) to avoid a runtime edge onto the runner from here. */
  takeTranscript?(): { prompt: string; role?: string; model?: string; finalText: string; tools: string[] } | undefined;
}

/** Appended to the Spec Author's propose/breakdown tasks when the UI track is
 *  on, so the proposal + story breakdown account for user-facing E2E stories
 *  (the design lane's `layer: "E2E"` work), not just API surface. */
const UI_TRACK_PROPOSE = ` UI track is ON: this product has a user-facing UI (a design-brief.md is part of intake), so every user-facing capability must be deliverable end to end as an E2E story, a real browser/screen interaction a user performs, not merely an API. Frame each candidate as a user-facing increment and note which need an E2E (UI) story.`;
const UI_TRACK_BREAKDOWN = ` UI track is ON: decompose into stories that include the E2E (UI) story for each user-facing capability (a screen the user interacts with), not API-only stories.`;
/** The artifact root a directive hands a role agent: the ABSOLUTE resolved
 *  consortDir (FEIP-8006). It was previously the bare basename (`.consort`), a
 *  RELATIVE reference – but Claude Code's Write tool requires an ABSOLUTE path, so
 *  a relative directive forced each subagent to resolve the project root itself,
 *  and they resolved it inconsistently (cwd, $HOME, even a hallucinated
 *  `~/dev/lakebase-demo`), scattering artifacts outside the project. Handing the
 *  absolute root removes the guess: there is exactly one path, used verbatim.
 *  Directives are generated fresh per run and are NOT recorded into the shipped
 *  corpus (replay copies artifacts, never the directive), so an absolute,
 *  machine-specific path here has no portability cost. */
/** Single-quote a value for safe interpolation into an `sh -c` string (the only
 *  place the drive builds a shell command rather than passing an argv). Wraps in
 *  single quotes and escapes any embedded single quote the POSIX way ('\''), so a
 *  branch name can never break out of the quotes. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function artifactRoot(consortDir: string): string {
  return consortDir;
}

/** UI-track build directive naming the design guide under the resolved root. */
function uiTrackBuild(root: string): string {
  return ` UI track is ON: the UI must adhere to the project design guide at ${root}/design/design-guide.md (+ the design-guide.json tokens). Build to it.`;
}

// Appended to every role spawn: the artifacts ARE the deliverable; free-text
// response tokens are pure latency. Keep the model from narrating a plan,
// summarizing what it did, or printing tables/rationale to stdout (all of that
// is wasted output, the slowest part of each turn). Structured logging still
// goes through the consort-log CLI, not stdout prose.
const AGENT_TERSE_SUFFIX =
  ` Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation.` +
  ` Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that` +
  ` output is wasted latency. The files on disk are the deliverable, not your prose.`;

/**
 * The target story's stub (asA/iWantTo/soThat) as one inline sentence, to scope
 * the Spec Author's per-story draft prompt to exactly that story (an
 * agent can only batch stories it is handed; we hand it just this one). Returns
 * "" when the stub is absent/unreadable, the directive alone still scopes it.
 */
function storyStubScope(consortDir: string, featureId: string, storyId: string): string {
  try {
    const stub = JSON.parse(fs.readFileSync(storyJson(consortDir, featureId, storyId), "utf8")) as {
      asA?: string;
      iWantTo?: string;
      soThat?: string;
    };
    const parts = [
      stub.asA ? `As a ${stub.asA}` : "",
      stub.iWantTo ? `I want to ${stub.iWantTo}` : "",
      stub.soThat ? `so that ${stub.soThat}` : "",
    ].filter(Boolean);
    return parts.length ? ` The story: ${parts.join(", ")}.` : "";
  } catch {
    return "";
  }
}


/** Short task directive handed to a role subagent for an invoke-role action. */
/**
 * Pin the Navigator to the EXACT next-pending test, the same item the cycle
 * stamp (beginNextPendingCycle -> storyTestProgress.pending[0]) will record. The
 * Navigator must write THAT test, not pick its own: when the prompt only said
 * "write the next test", the model wandered (authored a later AC's test) while
 * the substrate stamped pending[0], so the recorded cycle test_id diverged from
 * the test actually written. Naming the test makes the agent obey the order.
 */
/** Mandatory TEST-STATE-OWNERSHIP canon – appended to EVERY RED authoring directive. The acceptance DB is a
 *  SHARED branch reused across the story's cycles and already holds rows PRIOR stories committed, so a test
 *  that assumes ambient state or asserts absolute whole-collection state (e.g. len(all) == 0) is flaky by
 *  design. This is the canon opus infers and a cheaper RED model otherwise drops (the S2 empty-state HIL:
 *  sonnet+low asserted a whole-store empty on a DB carrying S1's rows). Stated explicitly, the cheaper model
 *  obeys it (it already scoped the NON-empty test to per-run-unique keys when the test-list said so). */
const STATE_OWNERSHIP_CANON =
  " TEST STATE OWNERSHIP (mandatory): each test OWNS the state it asserts on – the acceptance DB is a shared" +
  " branch reused across the story's cycles and already holds rows other stories committed. For any COLLECTION" +
  " or AGGREGATE assertion (an empty list/table, \"returns all\", a count), NEVER assume ambient state and NEVER" +
  " assert absolute whole-table state (e.g. len(all) == 0): SCOPE to per-run-unique keys – assert only your own" +
  " seeded rows, or query a per-run-unique slice that is genuinely empty – or explicitly clear the aggregate you" +
  " claim empty. Also revert/roll back rows a test writes so it never leaks state into another test.";

function nextPendingTestDirective(
  consortDir: string,
  featureId: string,
  story: string,
  loop?: "ac" | "hybrid-a" | "story",
  cap?: number,
): string {
  return nextPendingTestDirectiveBody(consortDir, featureId, story, loop, cap) + STATE_OWNERSHIP_CANON;
}

function nextPendingTestDirectiveBody(
  consortDir: string,
  featureId: string,
  story: string,
  loop?: "ac" | "hybrid-a" | "story",
  cap?: number,
): string {
  // story (default): the Navigator writes EVERY pending test for the story (all
  // ACs) in ONE turn, matching the single whole-story batch RED cycle the
  // orchestration stamps (begin --loop story). Same single source
  // (nextPendingBatch) the begin reads, so written tests + stamped ids cannot drift.
  if ((loop ?? "story") === "story") {
    let batch: { id: string; ac_id: string; description: string }[] = [];
    try {
      batch = nextPendingBatch(consortDir, featureId, story, Number.MAX_SAFE_INTEGER);
    } catch {
      batch = [];
    }
    if (batch.length === 0) {
      return `Write the failing tests (RED) for story ${story}: every test-list item for the story that has no cycle yet.`;
    }
    const list = batch.map((b) => `${b.id} [ac ${b.ac_id}]: "${b.description}"`).join("; ");
    return (
      `Write the failing tests (RED) for the WHOLE story ${story} in this one turn, EXACTLY these ${batch.length} item(s)` +
      ` across all its ACs, in order: ${list}. Write ALL of them now and ONLY these; do NOT add or drop items, the` +
      ` orchestration stamps ONE whole-story batch RED cycle for exactly these ids, and any mismatch is a defect.`
    );
  }
  // P8b (hybrid-a): the Navigator writes the first pending LAYER's tests in ONE
  // turn (a layer-batch), matching the batch RED cycle the orchestration stamps
  // for those exact ids. Same single source (nextPendingBatch) the begin reads,
  // so the tests written and the stamped test_ids cannot drift.
  if (loop === "hybrid-a") {
    let batch: { id: string; ac_id: string; description: string }[] = [];
    try {
      batch = nextPendingBatch(consortDir, featureId, story, cap ?? DEFAULT_BATCH_CAP);
    } catch {
      batch = [];
    }
    if (batch.length === 0) {
      return `Write the next failing tests (RED) for story ${story}: the next un-cycled layer-batch in the test list.`;
    }
    const list = batch.map((b) => `${b.id} [ac ${b.ac_id}]: "${b.description}"`).join("; ");
    return (
      `Write the failing tests (RED) for story ${story}'s next layer-batch, EXACTLY these ${batch.length} item(s),` +
      ` in order: ${list}. Write ALL of them this turn and ONLY these (they share one layer/runner); do NOT skip ahead to` +
      ` another layer, do NOT add or drop items, the orchestration stamps ONE batch RED cycle for exactly these ids,` +
      ` and any mismatch is a defect.`
    );
  }
  let next: { id: string; ac_id: string; description: string } | undefined;
  try {
    next = storyTestProgress(consortDir, featureId, story).pending[0];
  } catch {
    next = undefined;
  }
  if (!next) {
    return `Write the next failing test (RED) for story ${story}: the next un-cycled item in the test list.`;
  }
  return (
    `Write EXACTLY ONE failing test (RED) for story ${story}: the next test in order, ${next.id} [ac ${next.ac_id}]: "${next.description}".` +
    ` Write ONLY this test. Do NOT skip ahead, do NOT combine tests, do NOT pick a different item, the orchestration stamps the RED cycle for ${next.id},` +
    ` and a mismatch between the test you write and ${next.id} is a defect.`
  );
}

/**
 * The permissive-refactor directive for the Driver's GREEN turn when the
 * Navigator has flagged PRIOR tests as superseded by the AC being greened. The
 * latest AC wins: the Driver may refactor ONLY the flagged tests (alongside the
 * code) so the honest-GREEN verify holds, and must leave every other test
 * untouched (an unflagged regression must stay failing and escalate). Empty when
 * no allowlist exists for the open AC, so a normal GREEN turn is unaffected.
 */
function supersededTestsDirective(consortDir: string, featureId: string, story: string): string {
  let acId: string | undefined;
  try {
    const prog = storyTestProgress(consortDir, featureId, story);
    acId = (prog.openRed[0] ?? prog.pending[0])?.ac_id;
  } catch {
    acId = undefined;
  }
  if (!acId) return "";
  const sup = readSupersededTests(consortDir, featureId, story, acId);
  if (!sup) return "";
  const list = sup.tests.map((t) => `  - ${t}`).join("\n");
  return (
    `\n\nSUPERSEDED TESTS: this AC (${acId}) supersedes behavior encoded in PRIOR tests the Navigator flagged` +
    ` (${sup.reason}). The latest AC wins. You MAY refactor ONLY these flagged tests to the new behavior` +
    ` (alongside the production code) so the honest-GREEN verify holds:\n${list}\n` +
    `Do NOT touch any other test; an UNflagged failing test is a genuine regression that must stay red and escalate.`
  );
}

/**
 * The Driver's REPAIR directive: the Navigator assessed the green-failure as a
 * driver-fixable regression and recorded a diagnosis + fix directive on the
 * green-failure marker. Inject both so the Driver fixes the ROOT CAUSE this turn
 * rather than re-running the same failing verify blind. Empty when the open AC
 * has no such marker.
 */
function regressionRepairDirective(consortDir: string, featureId: string, story: string): string {
  let acId: string | undefined;
  try {
    acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
  } catch {
    acId = undefined;
  }
  if (!acId) return "";
  const gf = readGreenFailure(consortDir, featureId, story, acId);
  if (!gf?.fixDirective) return "";
  return (
    `REPAIR a driver-fixable regression in AC ${acId} (story ${story}). The honest-GREEN verify against the` +
    ` running app FAILED and it was diagnosed (by the Navigator, or deterministically by a gate such as` +
    ` contract-clean) as a genuine regression in the code, NOT a superseded test:\n` +
    `  DIAGNOSIS: ${gf.diagnosis ?? gf.summary}\n` +
    `  FIX: ${gf.fixDirective}\n` +
    `Apply that fix to the PRODUCTION code. Do NOT edit prior tests to force this regression green, fix the code.` +
    ` (EXCEPTION: if a SUPERSEDED TESTS directive follows below, the Navigator flagged those specific prior tests as` +
    ` encoding obsolete behavior, refactor ONLY those alongside this fix – often the regression is collateral from a` +
    ` superseded test erroring on a shared session, so both must land in this one turn.) Keep the AC's own tests green.` +
    ` This is your ONE repair attempt: if the verify still fails after it, the orchestration escalates to a human with the diagnosis.`
  );
}

/**
 * Consume a pending hand-back note for this role's retry: read it, delete it
 * (consume-once), and return it as a prompt PREFIX. Empty when none is pending.
 * The orchestrator wrote it (via DriveEffects.onHandback) when the role's prior
 * turn failed its expectation contract, so the retry is informed, the role sees
 * exactly what it failed to return before it runs again.
 */
function consumeHandback(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  featureId: string,
  consortDir: string,
): string {
  const story = "story" in action ? action.story : undefined;
  const file = handbackFile(consortDir, featureId, action.role, story);
  if (!fs.existsSync(file)) return "";
  let note = "";
  try {
    note = fs.readFileSync(file, "utf8").trim();
    fs.rmSync(file, { force: true });
  } catch {
    return "";
  }
  return note ? `${note}\n\n` : "";
}

/** The role's task prompt, with any pending hand-back note prepended (the
 *  informed-retry feedback). */
interface BuildLoopOpts {
  loop?: "ac" | "hybrid-a" | "story";
  cap?: number;
}

function roleTask(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  featureId: string,
  uiTrack: boolean,
  consortDir: string,
  build?: BuildLoopOpts,
  /** Precondition kinds the BODY omits (A-full executor path); see roleTaskBody. The handback
   *  note still prepends FIRST (legacy order: handback + [omitted-inline pack] + directive), so a
   *  prepend precondition the executor re-adds lands AFTER the handback – identical to inline. */
  omit?: ReadonlySet<string>,
): string {
  return consumeHandback(action, featureId, consortDir) + roleTaskBody(action, featureId, uiTrack, consortDir, build, omit);
}

/**
 * The architect's establish-vs-inherit directive for the project's architecture
 * conventions (the canonical role -> module layout). When a prior feature already
 * established them, this feature MUST reuse the same layout (the spec gate hard-
 * blocks a divergence); otherwise this feature's layout becomes the project canon
 * (the orchestrator persists it deterministically). Empty when no conventions
 * exist (the first feature simply establishes them by building normally).
 */
function architectConventionsDirective(consortDir: string): string {
  const conventions = readConventions(consortDir);
  if (!conventions) {
    return ` This is the first feature: the layered layout you declare in architecture.json (the role -> module` +
      ` paths) becomes the PROJECT-WIDE convention every later feature inherits, so choose the canonical layout deliberately.`;
  }
  const layout = conventions.layers
    .map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`)
    .join(", ");
  return ` REUSE the established project architecture conventions (set by ${conventions.established_by}): ${layout}.` +
    ` Declare the SAME role -> module paths in architecture.json, do NOT remap or rename an established layer; a` +
    ` divergent layout hard-blocks the spec gate and mismatches the inherited code.`;
}

/**
 * FEIP-8038: anchor a story-scoped design directive to the ABSOLUTE artifact
 * root so the subagent writes there directly and never resolves (and malforms,
 * dirname-basename hyphen-joined) the project path itself. The propose/breakdown/
 * ux directives already interpolate the root; this covers the story-scoped roles.
 */
function designRootNote(root: string, featureId: string, s: string): string {
  return (
    ` Write every artifact under the ABSOLUTE artifact root ${root}` +
    ` (this feature: ${root}/features/${featureId}/; this story: ${root}/features/${featureId}/stories/${s}/);` +
    ` use that absolute path and never resolve or guess the project root yourself.`
  );
}

function roleTaskBody(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  featureId: string,
  uiTrack: boolean,
  consortDir: string,
  build?: BuildLoopOpts,
  /** Precondition KINDS whose inline projection this body OMITS – the executor path (A-full)
   *  declares those as `preconditions[]` and its PREPARE-PRECONDITIONS phase re-injects them in
   *  the SAME position, so the assembled prompt stays byte-identical while the ONE injector moves
   *  onto the formal face. Absent (the legacy path) => omit nothing (inline pack, byte-identical
   *  to before A-full). See consort/orchestrator/build/preconditions.ts for the kinds. */
  omit?: ReadonlySet<string>,
): string {
  // The artifact-root basename (.sftdd, or a legacy .tdd) every prompt path
  // below is built from, so what the agent is told to read/write matches the
  // dir the driver resolved. Never hardcode ".tdd/" in a prompt string.
  const root = artifactRoot(consortDir);
  if ("mode" in action) {
    switch (action.mode) {
      case "propose":
        // Be explicit that this WRITES the artifact at a concrete path (like the
        // estimate / ux-designer directives), and that it is authored FRESH: the
        // vaguer prior wording ("...for planning (feature-proposals.md)") let the
        // Spec Author treat the file as descriptive, invent candidates in its
        // reply, write nothing, then on a re-dispatch claim it "already exists"
        // (the handoff guard then aborts on the empty artifact).
        return `Propose the sprint's candidate features for planning. WRITE the proposal to ${root}/planning/feature-proposals.md – author it FRESH from ${root}/product-overview.md + ${root}/nfrs.md (do NOT assume one already exists), one candidate feature per section, so the Architect can size them and the Product Owner can commit the backlog.${uiTrack ? UI_TRACK_PROPOSE : ""}`;
      case "estimate":
        return `Estimate each proposed candidate feature with a t-shirt size (XS/S/M/L/XL) and write planning/estimates.json, so the Product Owner can commit a backlog that fits sprint capacity.`;
      case "estimate-committed":
        // Size the COMMITTED features by their real ids (F<n>-<slug> from the PO's
        // intake feature-requests), MERGING into planning/estimates.json alongside
        // any candidate (FP) estimates. This is what sync-backlog reads to stamp a
        // per-sprint size; the candidate FP ids never reconcile to the committed
        // ids, and a re-plan sprint reuses the standing proposals but commits a NEW
        // feature that still needs a size. Read each committed feature's
        // feature-request.md for scope.
        return (
          `Estimate the sprint's COMMITTED feature(s) with a t-shirt size (XS/S/M/L/XL). Read each committed ` +
          `feature's request at ${root}/features/<F>/feature-request.md, then ADD one entry per committed feature ` +
          `to ${root}/planning/estimates.json keyed by its REAL feature id (e.g. "F1-stock-visibility", not a "FP" ` +
          `candidate id), each {"feature_id":"<F>","size":"<XS|S|M|L|XL>","rationale":"<why>"}. KEEP every existing ` +
          `estimate already in the file (merge, do not overwrite the candidate sizes). This is the size sync-backlog ` +
          `stamps into the per-sprint backlog, so the committed backlog shows real sizing.`
        );
      case "intake": {
        // The metered Product Owner intake turn: DRAFT the project intake FROM the human's gathered
        // answers (the coordinating session ran the interview + wrote them to intake/answers.md), the
        // canon that defines each artifact's shape, and the StockFlow worked example. You draft FOR
        // the human, who approves; never invent intent – if answers.md is thin, fill only what it
        // supports and leave the rest for the human to expand at review.
        //
        // The StockFlow worked example lives in the kit (examples/first-project/stockflow-seed/intake/),
        // NOT in the project – for a normal project it is not staged locally, so a kit-RELATIVE hint
        // sends the headless agent hunting the filesystem (5+ `find` calls) and it never reads it.
        // Emit the ABSOLUTE kit path (resolved on the drive host; the agent reads it on the same host)
        // so the agent reads the exemplar directly; fall back to the relative hint only if it is absent.
        const seedIntakeDir = join(kitRoot(), "examples", "first-project", "stockflow-seed", "intake");
        const groundingClause = fs.existsSync(seedIntakeDir)
          ? `Ground the shape in the canon above and the StockFlow worked example at ${seedIntakeDir} ` +
            `(READ the files there to learn the format + level of detail; never copy it verbatim).`
          : `Ground the shape in the canon above (the StockFlow worked example under the kit's ` +
            `examples/first-project/stockflow-seed/intake/ is unavailable here – rely on the canon).`;
        return (
          `Author the project intake for the Product Owner, DRAFTING each artifact FRESH from the human's ` +
          `answers at ${root}/intake/answers.md (the interview responses; if absent or thin, draft only what ` +
          `the stated intent supports – never invent). WRITE:\n` +
          `  - ${root}/product-overview.md – who it's for, its purpose, how it grows, what to see after each ` +
          `sprint (H1 + body, no implementation detail).\n` +
          `  - ${root}/nfrs.md – apply @software-design-principles + @architectural-design-principles: walk architecture ` +
          `layering / performance / scalability / security / observability / operability / resilience; record each as a ` +
          `'## Required' item with a stable R<n> id, ` +
          `plus '## Preferences' and '## Out of bounds'.\n` +
          `  - ${root}/design/design-brief.md (UI track only) – apply @ui-ux-design-principles: 1-3 reference ` +
          `sites + what to take from each, brand / interaction / accessibility constraints, and a required ` +
          `'## References' section.\n` +
          `${groundingClause} The human reviews + approves these before the Spec Author proposes the sprint from them.`
        );
      }
      case "author-requests":
        // The metered Product Owner author-requests turn: author a feature-request.md per COMMITTED
        // feature (the folder ids the human selected at the backlog gate, recorded in requested.json)
        // from the intake (product-overview / nfrs) + the Spec Author's planning/feature-proposals.md.
        // Draft in the PO's voice; do NOT invent beyond the proposals + intake. SKIP any request that
        // already exists + conforms (a recorded seed copied at the gate) — that keeps a seed/replay run
        // byte-identical; only ABSENT (live) requests are authored.
        return (
          `Author the sprint's feature requests as the Product Owner. For EACH committed feature (the ` +
          `folder ids in ${root}/sprints/*/requested.json — the features the human selected at the backlog ` +
          `gate), WRITE ${root}/features/<F>/feature-request.md: a one-line ask (a '# ' heading) + the ` +
          `rationale + the user-facing outcome, drafted FROM ${root}/product-overview.md + ${root}/nfrs.md ` +
          `and the matching section of ${root}/planning/feature-proposals.md. Draft in the PO's voice; do ` +
          `NOT invent scope beyond what the proposals + intake support. SKIP any feature-request.md that ` +
          `already exists AND conforms (a recorded seed already placed at the gate) — do not re-author it. ` +
          `Author ONLY the absent ones.`
        );
      case "breakdown":
        // Be explicit that the breakdown deliverable is feature-spec.json (the
        // artifact the router + guard gate on), authored FRESH, plus the story
        // stubs – and name the ABSOLUTE root so the subagent never guesses the
        // project path. The vaguer prior wording ("break it into its stories")
        // let the Spec Author write only the stubs, then on a re-dispatch see them
        // present and claim the breakdown done, deadlocking the drive on the
        // absent feature-spec.json (same class as the propose fix above).
        return (
          `Break feature ${featureId} down into its stories. WRITE the breakdown to ${root}: ` +
          `first ${root}/features/${featureId}/feature-spec.json (id, name, status "draft", tdd_mode, ` +
          `and a NON-EMPTY stories[] array of the story ids), then a stub dir per story under ` +
          `${root}/features/${featureId}/stories/<S>/ (story.md + story.json, id + one-line scope; NO acceptance ` +
          `criteria here). ON EVERY STORY AFTER THE FIRST, its story.json MUST include ` +
          `"independence": { "distinct_from_prior": true, "rationale": "<the distinct behavior this story adds ` +
          `beyond the prior stories>" } – apply the story-independence test (could you build the earlier story ` +
          `fully and have this one still genuinely unbuilt?); if not, fold or re-scope it. A later story that ` +
          `omits independence hard-blocks its spec gate, so set it now. Then run the breakdown self-check ` +
          `(./scripts/lk consort-response-formatter --role spec-author --feature ${featureId}, NO --story) ` +
          `and fix anything it flags before returning. feature-spec.json is REQUIRED – a prose list of stories in ` +
          `your reply is NOT the breakdown, and do NOT claim it "already exists".${uiTrack ? UI_TRACK_BREAKDOWN : ""}`
        );
    }
  }
  // UX Designer (UI track): translate the design brief into the project style
  // guide. Project-level, no story scope, so handle it before reading a story.
  if (action.role === "ux-designer") {
    return (
      `Translate the HIL design brief (${root}/design/design-brief.md) into the project design system:` +
      ` write design-guide.md (visual + interaction standards), design-guide.json (the machine-checkable` +
      ` tokens + components), and ia.md (the information architecture: screens, navigation, flows). This is the` +
      ` project-level style guide the Navigator and Driver build the UI against; author it once from the brief +` +
      ` product-overview.md.` +
      // EXHAUSTIVE BRIEF COVERAGE (generic, not app-specific): the brief is the
      // contract. The design-guide must realize EVERY element the brief + product-
      // overview name – dropping any is an incomplete artifact. This is enforced,
      // not suggested, because a partial design-guide silently under-builds the UI.
      ` COVER THE BRIEF EXHAUSTIVELY – read design-brief.md + product-overview.md and enumerate, then realize,` +
      ` EVERY named element. In particular: (a) EVERY status/state variant the brief lists (e.g. each badge/pill` +
      ` state) – include ALL of them, not a representative subset; (b) EVERY asset the brief names (app icon,` +
      ` favicon/browser-tab icon, logos) as an explicit entry; (c) EVERY level of each scalar token the brief` +
      ` enumerates (if it says shadows sm/md/lg, define all three; likewise every spacing/radius/type step); and` +
      ` (d) a design-guide.json "components" block with an entry for EACH reusable UI component the brief describes` +
      ` (navbar, page, card, button, form field, table, status badge, empty state, toast, app icon, and any others` +
      ` the brief names), each with its class + notes. Before finishing, re-read the brief and confirm nothing it` +
      ` names is missing from the design-guide – a missing status state, asset, token level, or component is a defect.`
    );
  }
  const s = action.story;
  switch (action.role) {
    case "spec-author":
      // Scope the draft to ONE story, by handing it only this story's stub +
      // an explicit single-story directive. The design lane streams one story
      // at a time so the first story reaches its gate + build fast (the build
      // lane starts on it without waiting for the rest to be authored); drafting
      // siblings here delays that and is rejected at the per-story spec gate.
      return (
        `Draft the acceptance criteria for story ${s} and NOTHING else.${storyStubScope(consortDir, featureId, s)}` +
        ` Write ONE file per AC as acs/<AC>.json (+ optional acs/<AC>.md), and put NOTHING else in acs/` +
        ` (no test lists, no -tests.json / -test-list.json, no scratch files, the spec gate validates every` +
        ` acs/*.json against the AC schema and rejects non-AC files).` +
        ` The AC id MUST match AC<n>-<slug>: AC1-create-form, AC2-form-accepts-input, ... (an "AC" prefix + a` +
        ` number, then a kebab slug). A bare slug id like "create-form-displays" FAILS the schema and hard-blocks` +
        ` the spec gate. The file's "id" field MUST equal its basename (acs/AC1-foo.json has {"id":"AC1-foo"}).` +
        ` Write only under story ${s}'s acs/ directory. Do not create, draft, or modify acceptance criteria for any` +
        ` other story in this feature, each other story is drafted in its own separate step that you are not` +
        ` performing now, and you will be invoked again, once per story, for the rest. Authoring more than ${s} here` +
        ` delays ${s} reaching its spec gate and build, and is rejected at the gate.` +
        designRootNote(root, featureId, s)
      );
    case "architect-reviewer": {
      const arAcIds = storyAcIds(consortDir, featureId, s);
      const arAcScope = arAcIds.length ? ` Story ${s}'s ACs are: ${arAcIds.join(", ")}.` : "";
      return (
        `Annotate story ${s}'s acceptance criteria + nfrs.md coverage.${arAcScope}` +
        ` For EVERY one of this story's ACs, write a non-empty "architectural_notes" field into its acs/<AC>.json` +
        ` (the layer it lives in + how it realizes the design). This is your distinctive per-AC product; the design gate` +
        ` verifies every AC carries it and the spec-author's "layer" field does NOT count. architectural_notes are per-AC,` +
        ` so annotate this story's ACs even when the feature-level architecture.json already exists from an earlier story.` +
        ` In architecture.json, make an EXPLICIT service_backed call (required): set service_backed:true if the` +
        ` feature persists data (a DB table/migration) or carries business logic, and then you MUST declare boundary,` +
        ` service, and repository layers (plus a "models" PACKAGE app/models/, one module per domain object, NOT a flat` +
        ` app/models.py, when it persists entities); set false ONLY for a trivial static/read-through endpoint. An Infra-layer` +
        ` AC or a migration/schema/storage NFR while service_backed is false hard-blocks the gate.` +
        ` When service_backed:true you MUST also declare architecture.json persistence_invariants[]: the DB-level guarantees the` +
        ` schema enforces (each with id, type one of unique|foreign_key|cascade|not_null|check|transactional|migration_reversible,` +
        ` table, and a one-line brief), covering unique/composite keys, foreign keys + cascade rules, NOT NULL / CHECK constraints,` +
        ` any transactional-atomicity boundary, and migration reversibility. The test-strategist must cover each with a real-branch` +
        ` test; a service_backed feature with no persistence_invariants hard-blocks the gate.${architectConventionsDirective(consortDir)}` +
        designRootNote(root, featureId, s)
      );
    }
    case "dba": {
      const dbaAcIds = storyAcIds(consortDir, featureId, s);
      const dbaAcScope = dbaAcIds.length ? ` Story ${s}'s ACs are: ${dbaAcIds.join(", ")}.` : "";
      // Inject the architect's contract to realize (service_backed, the models
      // layer to mirror, and the persistence_invariants the design must physically
      // realize) so the DBA does not re-scan to re-derive it. Best-effort: omit
      // when architecture.json is not on disk yet (the spec gate still enforces).
      let contract = "";
      try {
        const arch = JSON.parse(fs.readFileSync(architectureJson(consortDir, featureId), "utf8")) as {
          service_backed?: boolean;
          persistence_invariants?: Array<{ id?: string; type?: string; table?: string; brief?: string }>;
          layers?: Array<{ role?: string; module?: string }>;
        };
        if (arch.service_backed === true) {
          const inv = (arch.persistence_invariants ?? []).filter((i) => i && typeof i.id === "string");
          const invList = inv.length
            ? ` Realize EVERY declared persistence_invariant and list its id in realizes_invariants[]: ${inv
                .map((i) => `${i.id}${i.type ? ` [${i.type}${i.table ? ` on ${i.table}` : ""}]` : ""}${i.brief ? ` (${i.brief})` : ""}`)
                .join("; ")}.`
            : "";
          const models = (arch.layers ?? []).find((l) => l.role === "models");
          const modelsNote = models?.module ? ` Mirror the architect's models package (${models.module}), one table per domain object.` : "";
          // A service does not always mean a database: no declared invariants =>
          // a non-persisting service, an empty/absent db-design.json is fine.
          const nonPersistingNote = inv.length
            ? ""
            : ` This service declares NO persistence_invariants (a non-persisting service – compute/proxy/aggregator); an empty or absent db-design.json is acceptable, do not invent tables.`;
          contract =
            ` This feature is service_backed.${modelsNote}${invList}${nonPersistingNote}`;
        } else if (arch.service_backed === false) {
          contract = ` This feature is not service_backed (a trivial static/read-through endpoint); an empty or absent db-design.json is acceptable.`;
        }
      } catch {
        /* no architecture.json yet -> omit; the spec gate still enforces it */
      }
      return (
        `Realize the physical database schema for story ${s} into ${root}/features/${featureId}/db-design.json` +
        ` (+ a short db-design.md narrative).${dbaAcScope}` +
        ` Read architecture.json (service_backed, layers, persistence_invariants) – the architect owns that logical contract;` +
        ` you produce the PHYSICAL realization and do NOT re-author the invariants.` +
        ` Declare tables[] (columns with explicit type/nullable/default, primary_key, unique_constraints, foreign_keys, checks, indexes)` +
        ` and this story's schema_changes[] (the per-story migration plan the build lane authors the Alembic migration from; keep an` +
        ` expand/contract column split or drop reversible). Populate realizes_invariants[] as a flat array of the architecture.json` +
        ` persistence_invariant id STRINGS (bare ids, not objects) – an uncovered invariant hard-blocks the spec gate.${contract}` +
        designRootNote(root, featureId, s)
      );
    }
    case "test-strategist": {
      // Pass the story's AC ids INLINE so the strategist does not re-scan the
      // acs/ dir to re-derive them (a slow, error-prone step that, on a small
      // model, was the design lane's worst outlier, a single test-list took
      // ~200s of haiku thrashing on the structured output). The ids are the
      // EXACT contract the response-formatter + the per-story test-list scoping
      // enforce, so stating them up front both speeds convergence and pins the
      // ac_id mapping. Absent ids (no acs/ on disk yet) fall back to the bare
      // directive, the role still reads them from disk as before.
      const acIds = storyAcIds(consortDir, featureId, s);
      const acScope = acIds.length
        ? ` The story's ACs are: ${acIds.join(", ")}. Map every test's ac_id to one of these EXACT ids` +
          ` (verbatim, never a bare slug or an invented id), and cover each AC at least once.`
        : "";
      // Author the FEATURE MASTER (append this story; keep other stories' items).
      // The orchestration generates the per-story + per-AC views FROM the master
      // (consort-test-list), so a per-story file the role writes is
      // regenerated, author the master, not the per-story file.
      // Persistence coverage: a service-backed feature declares persistence_invariants
      // (the DB-level guarantees the schema enforces); the test-list must cover EVERY
      // one with a real-branch test tagged invariant_id, or the design gate blocks.
      // These are `fitness` tests that verify the MIGRATION realized the invariant
      // against the branch + the repository honors it – NOT the ORM's generic CRUD.
      // Best-effort: omit when there is no architecture.json yet (the gate still
      // enforces at submit time).
      let dbScope = "";
      try {
        const arch = JSON.parse(fs.readFileSync(architectureJson(consortDir, featureId), "utf8")) as {
          service_backed?: boolean;
          persistence_invariants?: Array<{ id?: string; brief?: string }>;
        };
        if (arch.service_backed === true) {
          const inv = (arch.persistence_invariants ?? []).filter((i) => i && typeof i.id === "string");
          const list = inv.length
            ? ` The declared persistence invariants are: ${inv.map((i) => `${i.id}${i.brief ? ` (${i.brief})` : ""}`).join("; ")}.`
            : "";
          dbScope =
            ` This feature is service-backed. Cover EVERY architecture.json persistence_invariant with >=1 test that` +
            ` sets "invariant_id" to that invariant's id and exercises it DIRECTLY against the branch database (a real DB` +
            ` session, never a mock): verify the MIGRATION actually realized the guarantee (e.g. inserting a duplicate raises` +
            ` an IntegrityError, a NOT NULL/CHECK rejects a bad row, a down-then-up migration round-trips) and that the` +
            ` repository honors it. Do NOT write a test of the ORM's generic add/commit/query round-trip – that tests the` +
            ` library, not your schema.${list} The DBA's db-design.json (features/${featureId}/db-design.json) has the concrete` +
            ` table/column/constraint definitions realizing these invariants – read it for precise schema assertions.` +
            ` EVERY test that WRITES to the DB (a create/POST test, a content-type or validation test that sends a real body,` +
            ` a retrieve test that seeds a fixture) MUST own its state: use a per-run-UNIQUE key (a uuid-suffixed sku/location,` +
            ` e.g. f"SKU-{uuid.uuid4().hex[:8]}"), OR delete/upsert the fixed key before the write AND clean up after. A test` +
            ` that writes a FIXED key with no cleanup passes alone + on its own isolated build branch but COLLIDES in the` +
            ` full-suite deploy-verify against the shared feature-branch DB (a duplicate-key error surfacing as a non-JSON/500),` +
            ` halting the feature ship – the shared-state-write defect. Do NOT assume an empty table or an untouched fixed key.`;
        }
      } catch {
        /* no architecture.json yet -> omit; the test_list gate still enforces it */
      }
      return (
        `Produce story ${s}'s ordered tests and APPEND them to the feature master test list` +
        ` ${root}/features/${featureId}/test-list.json, keep every item already there for the other` +
        ` stories and add this story's. Do NOT author any test-list-per-story.json (the orchestration` +
        ` generates the per-story + per-AC views from the master).${acScope}${dbScope}`
      );
    }
    case "navigator":
      if (action.buildMode === "reflect") {
        // Pre-build reflection: an INDEPENDENT critique of the story's spec slice
        // + test-list BEFORE the build lane (the Navigator did NOT author either,
        // and runs on a different model than the Spec Author). Catch design-time
        // defects on the cheap artifacts, far cheaper than re-running build cycles.
        // The critic writes ONLY the verdict; the deterministic reflect-gate CLI
        // step turns a failed verdict into the routed smell (it does not decide
        // routing here). Scope is THIS story only (parallel-story isolation).
        return (
          `REFLECT on story ${s} BEFORE the build lane: independently critique its spec slice ` +
          `(${root}/features/${featureId}/stories/${s}/story.json + acs/*.json) and its test-list ` +
          `(${root}/features/${featureId}/stories/${s}/test-list-per-story.json) against the architecture ` +
          `(${root}/features/${featureId}/architecture.md/.json) + NFRs.` +
          contextRubric(consortDir, featureId, s, "") +
          ` Look ONLY for design-time defects that would waste a build cycle: (1) ACs that contradict ` +
          `each other; (2) an AC with no covering test, or a test that contradicts its AC; (3) an NFR with ` +
          `no fitness test; (4) a test asserting at a layer the architecture forbids; (5) an AC whose ` +
          `declared layer conflicts with the architecture; (6) an untestable/vacuous AC (no observable ` +
          `outcome); (7) a UI-styling test that asserts inline HTML style or raw CSS in the page SOURCE ` +
          `(e.g. a text-align/color/font check inside a style= attr) for a property the design-guide + ` +
          `design-adherence gate govern, instead of the rendered SEAM (the element carries the design-guide ` +
          `class / data-testid): such a test hard-codes the very inline style the design lane then refactors ` +
          `into a token-driven class, so it blocks that refactor (the ui-style-implementation-test smell).` +
          ` Do NOT critique implementation, style, or scope, only buildability + internal ` +
          `consistency of THIS story's artifacts.` +
          ` BE EXHAUSTIVE in this ONE pass: findings[] is multi-valued — run EVERY check against ` +
          `EVERY AC, test-list item, and NFR, and emit a SEPARATE finding for EACH distinct defect ` +
          `(decompose a LEGACY multi-part singular NFR fitness_function into its sub-guarantees and flag ` +
          `every uncovered clause — but an NFR that already declares the ATOMIC fitness_functions ARRAY ` +
          `is coverage-checked DETERMINISTICALLY by checkFitnessClauseCoverage at the test_list gate, so ` +
          `do NOT re-decompose it). Do NOT return one finding at a time: the reflect↔revise loop is bounded ` +
          `and escalates after a few laps, so a piecemeal reflect burns that budget on repeated ` +
          `revise→re-test→reflect laps and can hand the human a still-defective design.` +
          ` Write your verdict to ${root}/features/${featureId}/stories/${s}/reflect-verdict.json as ` +
          `{"version":1,"passed":<bool>,"findings":[{"owner":"spec-author"|"test-strategist","detail":"<the defect>"}]}. ` +
          `passed:true with findings:[] when the spec + test-list are consistent + buildable (the common ` +
          `case, do NOT invent defects). Attribute each finding to spec-author (an AC/spec defect) or ` +
          `test-strategist (a test-list/coverage defect). Write ONLY that file; the orchestrator routes any ` +
          `fix deterministically.`
        );
      }
      if (action.buildMode === "assess") {
        // The assess turn's DETERMINISTIC PRE-LOCALIZATION advisory – the verify's own
        // failure output (start-here), the contract-clean code refs, and the superseded-test
        // candidates – projected from green-failure.json by the ONE preparer in the
        // orchestrator family (consort/orchestrator/build/preconditions.ts), so the same
        // block also feeds the executor's PREPARE-PRECONDITIONS phase. Empty when no marker.
        const gfAssess = action.ac ? readGreenFailure(consortDir, featureId, s, action.ac) : undefined;
        // The green-failure advisory PREPENDS the ASSESS directive. On the executor path it is a
        // DECLARED prepend precondition (re-injected by phase 2.5 in the SAME position), so omit it
        // inline here; on the legacy path (omit absent) it stays inline. Byte-identical either way.
        const advisory = omit?.has("green-failure-advisory") ? "" : buildGreenFailureAdvisory(consortDir, featureId, s, action.ac ?? "");
        // When the deterministic gate ALREADY pre-localized the superseded set
        // (supersededTestRefs present), the set above is authoritative – it is a
        // grep of the migration's net-dropped symbol across the test tree. Telling
        // the agent to ALSO "scan COMPREHENSIVELY" then makes it re-read every
        // candidate to verify, and on a big contract/drop set (F6/S3: 56 lines / 8
        // files) it never converges – the assess spins for ~an hour without ever
        // writing a verdict. So when the advisory is present, be DECISIVE: flag
        // exactly the listed set in ONE call, do NOT re-read each. Keep the
        // open-ended comprehensive scan ONLY when there is no pre-localization.
        const hasSupersededAdvisory = !!gfAssess?.supersededTestRefs;
        const scanDirective = hasSupersededAdvisory
          ? `(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode, FLAG them so the` +
            ` Driver may permissively refactor ONLY those. The DETERMINISTIC gate has ALREADY pre-localized the` +
            ` COMPLETE superseded set (the SUPERSEDED-TEST CANDIDATES above – a grep of the migration's dropped` +
            ` symbol across every test, including FITNESS / architecture / migration reversibility tests). TRUST it:` +
            ` flag EXACTLY those file(s) in ONE flag-superseded call and do NOT re-read each candidate to re-verify` +
            ` (that re-verification never converges on a large drop set – it is the assess-spin failure). Only search` +
            ` beyond the list if you have concrete reason to believe it MISSED a failing test; otherwise flag the list as-is:\n`
          : `Inspect EVERY failing test (the COMPLETE set, not a sample) and decide per test:\n` +
            `(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode (the latest AC` +
            ` wins; e.g. a prior feature's test asserts an outcome this AC deliberately changes), FLAG them so the` +
            ` Driver may permissively refactor ONLY those. Scan COMPREHENSIVELY: when this AC drops, removes, or` +
            ` renames a column / field / table / endpoint, the superseded set is NOT only the tests that NAME it in a` +
            ` query/INSERT/assertion – it ALSO includes FITNESS / architecture / migration tests that assert a PROPERTY` +
            ` of the now-gone shape (migration reversibility like "after up() then down(), <col> is reconstructed",` +
            ` schema-shape checks like "<col> exists", invariants over the old column). Those are superseded too – a` +
            ` reversibility/fitness test for an obsoleted column encodes abandoned behavior. Miss one and the verify` +
            ` stays red and escalates, so list ALL of them in ONE flag-superseded call:\n`;
        return (
          advisory +
          `ASSESS a failed honest-GREEN verify for AC ${action.ac} in story ${s}. The Driver made the current` +
          ` test pass, but the full-suite verify against the running app FAILED, some OTHER test(s) now fail.\n` +
          scanDirective +
          `   ./scripts/lk consort-cycle flag-superseded --feature ${featureId} --story ${s} --ac ${action.ac}` +
          ` --reason "<new AC + what changed>" --test <path_or_nodeid> [--test ...] --tdd-dir ${consortDir}\n` +
          `   The flag-superseded command writes ${join(cycleDir(consortDir, featureId, s, action.ac ?? ""), "superseded-tests.json")}.` +
          ` If for any reason the command will not run, FALL BACK to writing THAT EXACT file directly with the Write` +
          ` tool: {"tests":["<path_or_nodeid>", ...],"reason":"<why superseded>"} – do NOT search the cache / scripts /` +
          ` logs for the mechanism or invent a different filename. The orchestration honors that file too.\n` +
          `(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior;` +
          ` the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human` +
          ` instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a` +
          ` bounded Driver repair turn):\n` +
          `   ./scripts/lk consort-cycle assess-regression --feature ${featureId} --story ${s} --ac ${action.ac}` +
          ` --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"]` +
          ` --tdd-dir ${consortDir}\n` +
          `   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing` +
          ` filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration` +
          ` then escalates carrying your diagnosis).\n` +
          `CRITICAL – recording the verdict is the ONLY output of this turn. The orchestration reads your verdict` +
          ` from ${join(cycleDir(consortDir, featureId, s, action.ac ?? ""), "regression-assessment.json")} (the` +
          ` assess-regression command writes it). Writing green-failure.json or just explaining the fix in prose is` +
          ` NOT the verdict – without that file a DRIVER-FIXABLE regression wrongly escalates to a human and the` +
          ` sprint halts. Run the ONE command above as a SINGLE line (do not split across lines, do not wrap in` +
          ` bash -c). If for any reason the command will not run, FALL BACK to writing the file directly with the` +
          ` Write tool: {"diagnosis":"<why>","fix":"<what to change>"} at that exact path – the orchestration` +
          ` honors that too.\n` +
          `Flag ONLY tests the new AC truly supersedes; never flag a test just to make a red go away. For a` +
          ` regression, always record a diagnosis (+ fix when driver-fixable) – never nothing.`
        );
      }
      if (action.buildMode === "assess-deploy") {
        // Story-level deploy-verify self-heal ASSESS: the full-feature deploy-verify
        // FAILED, and the deterministic classifier already proved these tests PASS
        // in ISOLATION – shared-state contamination (a prior test that does not own
        // its DB state, typically an absolute whole-table aggregate), not broken
        // software. Confirm the fragile set + prescribe HOW to scope each. The
        // scope set the Driver refactors is read from what you write here.
        const marker = readDeployVerifyAssessMarker(consortDir, featureId, s);
        const failing = marker?.failing_node_ids ?? [];
        return (
          `ASSESS a failed full-feature DEPLOY-VERIFY for story ${s}. The story's own tests are green, but the` +
          ` full-feature verify against the running app FAILED on the tests below. A deterministic classifier` +
          ` RE-RAN each in ISOLATION (a fresh clean DB) and they ALL PASSED alone – so this is shared-state` +
          ` CONTAMINATION, not broken software: a test that does not OWN its DB state (typically a WHOLE-TABLE` +
          ` AGGREGATE – a COUNT/SUM integrity probe – asserting an ABSOLUTE total that holds on the isolated` +
          ` per-cycle branch but breaks once other stories' rows share the table).\n` +
          `Failing tests:\n${failing.map((n) => `  ${n}`).join("\n")}\n\n` +
          `For EACH test, prescribe HOW to make it own its state: scope BOTH the seed AND the assertion to the` +
          ` test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA, NEVER an absolute` +
          ` whole-table total. Do NOT weaken the assertion's intent – keep the invariant, just scope it.\n` +
          `Write your scope directives to ${root}/features/${featureId}/stories/${s}/deploy-verify-scope.json as` +
          ` {"version":1,"story_id":"${s}","directives":[{"node_id":"<path::test>","directive":"<how to scope it>"}]}` +
          ` – one entry per test you confirm is contamination-fragile. If (rarely) you judge the classifier wrong` +
          ` and a failure is a GENUINE regression, OMIT it from directives (write no file, or an empty directives` +
          ` array); the orchestration then raises it to a human instead of scoping. Write ONLY that file.`
        );
      }
      if (action.buildMode === "assess-refactor") {
        // Story-level REFACTOR-verify self-heal ASSESS: the story's own tests are
        // green and the Navigator-requested refactor was applied, but the refactor
        // broke the full suite – typically a PRIOR story's test that asserts a
        // symbol THIS story's refactor legitimately retired. Confirm which broken
        // tests are genuinely SUPERSEDED (the current story's design supersedes
        // them) vs a real regression the refactor introduced.
        const marker = readRefactorVerifyAssessMarker(consortDir, featureId, s);
        return (
          `ASSESS a failed REFACTOR-verify for story ${s}. The story's own tests are green and the requested` +
          ` refactor was applied, but the full suite then FAILED:\n${marker?.summary ?? "(see the refactor verify output)"}\n` +
          (marker?.superseded_advisory
            ? `\nDeterministic supersession advisory (prior tests referencing a symbol the refactor removed):\n${marker.superseded_advisory}\n`
            : "") +
          `\nDecide, per failing test: is it a PRIOR test this story legitimately SUPERSEDES (it asserts old` +
          ` behavior/fields this story deliberately retired), or a GENUINE regression the refactor introduced?\n` +
          `Flag ONLY the genuinely superseded prior tests via` +
          ` \`./scripts/lk consort-cycle flag-superseded --feature ${featureId} --story ${s} --ac <ac> --test <path::test> [--test ...] --reason "<why superseded>"\`` +
          ` – the Driver will then permissively refactor ONLY those. That command writes superseded-tests.json in the` +
          ` <ac>'s cycle dir; if it will not run, FALL BACK to writing THAT file directly with the Write tool` +
          ` ({"tests":[...],"reason":"<why>"}) – do NOT search the cache / scripts / logs for the mechanism or invent a` +
          ` different filename. If instead the refactor broke CURRENT behavior` +
          ` (a real regression), flag NOTHING; the orchestration raises it to a human. Never flag a test just to` +
          ` make a red go away. Do NOT edit product code or tests in this turn.`
        );
      }
      if (action.buildMode === "review") {
        // story granularity (default): REVIEW the WHOLE story's implementation in
        // one turn; verdict at the story root (no AC).
        if ((build?.loop ?? "story") === "story") {
          return (
            `REVIEW the implementation of story ${s} now that ALL its tests are green, the whole story in one pass.` +
            ` Judge the story's diff against the context pack: layer boundaries, naming, cross-cutting concerns, the` +
            ` required NFRs, and (for UI) design-token + IA adherence.` +
            buildContextPack(consortDir, featureId, s, "", { skipTestLoop: true }) +
            ` Write ONE verdict for the whole story to` +
            ` ${root}/cycles/${featureId}/${s}/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}` +
            `, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests.`
          );
        }
        return (
          `REVIEW the implementation of AC ${action.ac} in story ${s} now that its tests are green.` +
          ` Judge the diff against the context pack: layer boundaries, naming, cross-cutting concerns, the required` +
          ` NFRs, and (for UI) design-token + IA adherence.` +
          buildContextPack(consortDir, featureId, s, action.ac ?? "", { skipTestLoop: true }) +
          ` Write your verdict to` +
          ` ${root}/cycles/${featureId}/${s}/${action.ac}/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}` +
          `, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests.`
        );
      }
      {
        // RED: inject the context pack (rubric + module layout) so the Navigator
        // authors tests against the slice + the known layout inline rather than
        // re-reading the design tree. redOnly: no test-location line (no code yet).
        return (
          `${nextPendingTestDirective(consortDir, featureId, s, build?.loop, build?.cap)}${uiTrack ? uiTrackBuild(root) : ""}` +
          buildContextPack(consortDir, featureId, s, action.ac ?? "", { skipTestLoop: true })
        );
      }
    case "driver":
      if (action.buildMode === "refactor-deploy") {
        // Story-level deploy-verify self-heal SCOPE: the Navigator confirmed a set
        // of contamination-fragile tests (they fail the full-feature verify but
        // pass in isolation) + prescribed how to scope each. Refactor EXACTLY those
        // tests to own their DB state, per the directives – do NOT touch product
        // code and do NOT weaken the invariant, just scope the seed + assertion to
        // the test's own rows (or a delta). The re-deploy re-runs the full verify.
        const scope = readDeployVerifyScope(consortDir, featureId, s);
        const directives = scope?.directives ?? [];
        return (
          `SCOPE the contamination-fragile tests the Navigator flagged for story ${s}. Each FAILED the` +
          ` full-feature deploy-verify but PASSES in isolation – it asserts an ABSOLUTE whole-table aggregate` +
          ` (or otherwise does not own its DB state), which breaks once other stories' rows share the table.` +
          ` Refactor EACH per its directive so it OWNS its state: scope BOTH the seed AND the assertion to the` +
          ` test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA – NEVER an absolute` +
          ` whole-table total. Keep the invariant; do NOT weaken it, and do NOT change product code.\n` +
          directives.map((d) => `  ${d.node_id}\n    -> ${d.directive}`).join("\n") +
          `\nEdit ONLY those test files. The orchestrator re-deploys + re-verifies after your turn.`
        );
      }
      if (action.buildMode === "refactor-superseded") {
        // Story-level REFACTOR-verify self-heal: the Navigator confirmed a set of
        // PRIOR tests this story's refactor legitimately superseded (they assert a
        // symbol/behavior the refactor retired). Permissively refactor ONLY those
        // flagged tests so they match the new reality (or remove the superseded
        // assertion), NEVER touch product code and NEVER weaken a CURRENT test.
        // The honest re-verify after this turn is the teeth.
        return (
          `The Navigator flagged prior tests that story ${s}'s refactor SUPERSEDED. Permissively refactor ONLY the` +
          ` flagged superseded tests below so they reflect the retired behavior (update or drop the superseded` +
          ` assertion); do NOT change product code and do NOT weaken any CURRENT (non-superseded) test.\n` +
          supersededTestsDirective(consortDir, featureId, s) +
          `\nEdit ONLY the flagged test files. The orchestrator re-verifies the full suite after your turn.`
        );
      }
      if (action.buildMode === "repair") {
        // A green-failure assess can produce a MIXED verdict: some prior tests
        // flagged SUPERSEDED + a genuine regression diagnosed in the rest. The
        // repair turn must then do BOTH – refactor the flagged superseded tests
        // AND apply the regression fix – in one turn, or the un-refactored
        // superseded tests keep erroring (and, on a shared session, cascade the
        // others into failure), so the honest-GREEN verify never holds and it
        // escalates. Append the supersede allowlist (empty when none was flagged).
        return regressionRepairDirective(consortDir, featureId, s) + supersededTestsDirective(consortDir, featureId, s);
      }
      if (action.buildMode === "refactor") {
        // The context pack APPENDS at the end of the refactor directive (a clean suffix), so on the
        // executor path it is a DECLARED append precondition (re-injected by phase 2.5); omit it
        // inline here when context-pack is omitted. Legacy path (omit absent) keeps it inline.
        const pack = (ac: string): string => (omit?.has("context-pack") ? "" : buildContextPack(consortDir, featureId, s, ac));
        // story granularity (default): REFACTOR the WHOLE story in one turn per
        // the story-level review (.tdd/cycles/<F>/<S>/review.json -> refactor_notes).
        if ((build?.loop ?? "story") === "story") {
          return (
            `REFACTOR story ${s} per the Navigator's review` +
            ` (${root}/cycles/${featureId}/${s}/review.json -> refactor_notes), guided by the architecture` +
            ` (${root}/features/${featureId}/architecture.md), the NFRs (${root}/nfrs.md), + design guide (${root}/design/design-guide.md).` +
            ` If review.json has no refactor_notes, this refactor was queued by a BLOCKING build-quality gate (a layering /` +
            ` design-adherence / import-coupling smell in ${root}/smells.json): run that gate to see the violation` +
            ` (e.g. \`consort-layering-clean --project-dir .\`) and fix exactly what it flags – typically extract the` +
            ` duplicated/misplaced code into one shared helper in its correct layer.` +
            ` Keep ALL the story's tests green and do not change what the outer-boundary tests check, refactor only.` +
            pack("")
          );
        }
        return (
          `REFACTOR AC ${action.ac} in story ${s} per the Navigator's review` +
          ` (${root}/cycles/${featureId}/${s}/${action.ac}/review.json -> refactor_notes), guided by the architecture` +
          ` (${root}/features/${featureId}/architecture.md), the NFRs (${root}/nfrs.md), + design guide (${root}/design/design-guide.md).` +
          ` If review.json has no refactor_notes, this refactor was queued by a BLOCKING build-quality gate (a layering /` +
          ` design-adherence / import-coupling smell in ${root}/smells.json): run that gate to see the violation` +
          ` (e.g. \`consort-layering-clean --project-dir .\`) and fix exactly what it flags – typically extract the` +
          ` duplicated/misplaced code into one shared helper in its correct layer.` +
          ` Keep ALL tests green and do not change what the outer-boundary tests check, refactor only.` +
          pack(action.ac ?? "")
        );
      }
      {
        // GREEN: inject the context pack (rubric + module layout + test
        // locations) so the Driver implements against the slice + known paths
        // inline instead of re-reading the design tree and re-discovering the
        // tests every GREEN (the 93-round-trip worst turn).
        return (
          ((build?.loop ?? "story") === "story"
            ? `Make ALL of story ${s}'s failing tests GREEN in one pass (simplest honest code); implement until every one of the story's tests passes, then run the story's tests once.`
            : build?.loop === "hybrid-a"
              ? `Make the failing tests for story ${s}'s current layer-batch ALL GREEN in one pass (simplest honest code); implement until every test in the open batch passes, then run that layer's runner once.`
              : `Make the failing test for story ${s} GREEN (simplest honest code).`) +
          (uiTrack ? uiTrackBuild(root) : "") +
          // ctx-test ON by default for GREEN: inject the failing RED test body so the Driver does not
          // Read/cat-discover it. Promoted from the driver-green tuning study (opus + medium effort +
          // ctx-test was the faster-while-holding winner; other context levers were latency-neutral/harmful
          // on opus, so ONLY failing-test is baked in). See consort/optimize/DRIVER-GREEN-LEVERS.md.
          buildContextPack(consortDir, featureId, s, action.ac ?? "", { failingTest: true }) +
          supersededTestsDirective(consortDir, featureId, s)
        );
      }
    default:
      return `Work story ${s}.`;
  }
}

const PIPELINE_BIN = "consort-pipeline";
const EXPERIMENT_BIN = "consort-experiment";
const CYCLE_BIN = "consort-cycle";
const HUMAN_PROXY_BIN = "consort-human-proxy";
const LOG_BIN = "consort-log";
const TEST_LIST_BIN = "consort-test-list";
const DEPLOY_BIN = "consort-deploy";
const GATE_CONFORMANCE_BIN = "consort-gate-conformance";
const CANON_NOTES_BIN = "consort-canon-notes";
// Promote phase, the SCM workflow CLIs (lakebase-scm-workflows). They read +
// advance the SCM ladder in .lakebase/workflow-state.json, so they take
// --project-dir (the project root), NOT --feature/--tdd-dir.
const SCM_PREPARE_PR_BIN = "lakebase-scm-prepare-pr";
const SCM_WAIT_CI_BIN = "lakebase-scm-wait-ci";
const SCM_MERGE_BIN = "lakebase-scm-merge";

// A story runs ONE experiment by default (N=1); these derive its slug + branch
// name. `cut` and `accept` (merge) BOTH compute them from here, so the branch
// cut and the branch merged back always agree. The experiment branch forks off
// (and merges into) the feature branch, which is cfg.featureBranch.
//
// The name is SANITIZED with the same helper the paired-branch substrate applies
// when it creates the branch (sanitizeBranchName: "/" -> "-", lowercase). Without
// this, cut created `experiment-s1-create-bug-exp1` (sanitized) but accept tried
// to `git merge experiment/S1-create-bug-exp1` (raw) and failed "not something we
// can merge". Sanitizing here is the single source of truth; it is idempotent on
// an already-sanitized name, so cut, accept, and replay all agree.
const EXPERIMENT_SLUG = "exp1";
const experimentBranchName = (storyId: string): string =>
  sanitizeBranchName(`experiment/${storyId}-${EXPERIMENT_SLUG}`);

/**
 * The concrete commands that carry out one action. Depends on the action +
 * config (and, for the Spec Author's per-story draft, reads that story's stub
 * from disk to scope the prompt; absent stub falls back to the directive alone).
 * Returns [] for the terminal `done` (after a final set-phase).
 * State transitions that no CLI owns (the coarse planning/feature/deploy phase)
 * are "set-phase" commands the runner applies to workflow-state.json.
 */
/**
 * The artifact a design/planning role MUST have written under the resolved
 * consortDir after its turn (FEIP-8006), for the post-turn out-of-root guard.
 * `anyOf` are ABSOLUTE paths; the guard passes if any exists (a file, or a
 * non-empty directory for the per-story ACs). Returns null for build roles
 * (navigator/driver, verified by the ledger's per-cycle contracts) and the
 * human-input author-requests step (no LLM artifact to verify here).
 */
function designArtifactExpectation(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  consortDir: string,
  featureId: string,
): { anyOf: string[]; label: string } | null {
  if ("mode" in action) {
    if (action.role === "spec-author" && action.mode === "propose") return { anyOf: [featureProposalsMd(consortDir)], label: "planning/feature-proposals.md" };
    if (action.role === "architect-reviewer" && (action.mode === "estimate" || action.mode === "estimate-committed")) return { anyOf: [planningEstimatesJson(consortDir)], label: "planning/estimates.json" };
    if (action.role === "spec-author" && action.mode === "breakdown") return { anyOf: [featureSpecJson(consortDir, featureId)], label: "feature-spec.json" };
    return null; // author-requests = human input, no role artifact
  }
  if (action.role === "ux-designer") return { anyOf: [designGuideJson(consortDir)], label: "design/design-guide.json" };
  const s = action.story;
  if (!s) return null;
  if (action.role === "spec-author") return { anyOf: [acsDir(consortDir, featureId, s)], label: `stories/${s}/acs/*.json` };
  if (action.role === "architect-reviewer") return { anyOf: [architectureJson(consortDir, featureId)], label: "architecture.json" };
  if (action.role === "test-strategist") return { anyOf: [featureTestListJson(consortDir, featureId)], label: "test-list.json" };
  return null; // navigator/driver build turns: not a design artifact
}

/**
 * Assemble the `claude` DriveCommand for an invoke-role action – the per-invocation agent
 * spawn (role/model/effort/session/tool-scope/task). Extracted verbatim from the invoke-role
 * branch of commandsForAction so BOTH the legacy branch and the manifest-driven
 * commandsFromManifest build the SAME command (one source of truth for the spawn; the full
 * suite + the golden-equivalence test guard the extraction). All cfg levers (modelForTurn,
 * effortForTurn, contextPackSuffix, taskSuffix, tool scope, resume scope) are honored exactly
 * as before – this is a pure move, not a behavior change.
 */
/**
 * The role's TASK BODY – roleTaskBody with the run's loop/cap + the given precondition KINDS
 * omitted. NO handback prefix, NO terse/context/optimize suffixes (those are the envelope's, added
 * by buildClaudeCommandWithBody). This is the seam A-full's executor path assembles as the step's
 * base instruction prompt: it omits the DECLARED preconditions (so phase 2.5 re-injects them in
 * position), while the legacy path calls it with omit=∅ (full inline pack). Pure + exported so the
 * prompt-parity golden can assert the executor-assembled prompt === the legacy inline task.
 */
export function buildTaskBody(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  cfg: DriveEffectsConfig,
  omit?: ReadonlySet<string>,
): string {
  // REPLAY override: when the cfg supplies a verbatim base body for this turn (an experiment driving
  // from the corpus turn's recorded prompt.txt), use it AS the body. The envelope (handback prefix +
  // contextPackSuffix/taskSuffix appends) still wraps it, so a lever's added context lands AFTER the
  // recorded context – recorded-as-source + appended-lever, never a regenerated substitute.
  const override = cfg.instructionsOverride?.(action);
  if (override !== undefined) return override;
  const storyLoop: "ac" | "hybrid-a" | "story" | undefined =
    "story" in action ? effectiveLoopForStory(cfg.loopGranularity ?? "story", action.story) : cfg.loopGranularity;
  return roleTaskBody(action, cfg.featureId, cfg.uiTrack ?? true, cfg.consortDir, { loop: storyLoop, cap: cfg.batchCap }, omit);
}

/**
 * The `claude` DriveCommand for an action, built around a GIVEN task body. The ENVELOPE
 * (byte-identical to the pre-A-full buildClaudeCommand): the model/effort/session/lever
 * resolution + the task = consumeHandback + body + contextPackSuffix + AGENT_TERSE_SUFFIX +
 * taskSuffix. The handback lives HERE (not in the body) so a prepend precondition the executor
 * re-adds to the body still lands AFTER the handback – the legacy order (handback + advisory +
 * directive). buildClaudeCommand composes this with buildTaskBody(action,cfg); the A-full live
 * seam composes it with the executor-assembled invocation.instructions.prompt.
 */
export function buildClaudeCommandWithBody(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  cfg: DriveEffectsConfig,
  body: string,
): DriveCommand {
  const f = cfg.featureId;
  const BUILD_ROLES = new Set(["navigator", "driver"]);
  const buildScope = cfg.buildSessionScope ?? "story";
  let resumeKey: string | undefined;
  if (BUILD_ROLES.has(action.role)) {
    if (buildScope === "story" && "story" in action && action.story) {
      resumeKey = `${action.role}:${action.story}`;
    } // else "cycle" -> undefined (cold per turn)
  } else {
    resumeKey = action.role;
  }
  // Per-role + per-STEP `--effort`/model (unified config). Derive the invocation
  // KEY from the action – a BUILD turn (navigator review|red, driver
  // refactor|green) OR a DESIGN step (spec-author breakdown|propose|acs,
  // architect estimate|architect, dba, test-list, ux-designer ux). This is the
  // "apply to the step, not the role" axis: effort/model are keyed on WHICH task
  // the role is doing this invocation. When `effortForTurn` is provided
  // (consort-config.json) it governs every step; absent, fall back to the
  // review-only `reviewEffort` (P6 default low on the navigator REVIEW).
  const turnKey = turnKeyForAction(action);
  const buildTurn = turnKey; // legacy name used below for contextPackSuffix
  const isReviewTurn = action.role === "navigator" && turnKey === "review";
  const effort = cfg.effortForTurn
    ? cfg.effortForTurn(action.role, turnKey)
    : isReviewTurn
      ? cfg.reviewEffort ?? "low"
      : "";
  const fallbackModel = cfg.fallbackModelForRole?.(action.role);
  const maxBudgetUsd = cfg.maxBudgetUsdForRole?.(action.role);
  const mcpConfig = cfg.mcpConfigForRole?.(action.role);
  return {
    kind: "claude",
    role: action.role,
    model: cfg.modelForTurn ? cfg.modelForTurn(action.role, buildTurn) : cfg.modelForRole(action.role),
    ...(resumeKey !== undefined ? { resumeKey } : {}),
    ...(effort && effort !== "default" ? { effort } : {}),
    ...(fallbackModel ? { fallbackModel } : {}),
    ...(typeof maxBudgetUsd === "number" ? { maxBudgetUsd } : {}),
    ...(mcpConfig ? { mcpConfig } : {}),
    // Optimize harness content/scope levers (all default-off): extra context
    // is injected BEFORE the terse suffix (reads as context), the task suffix
    // AFTER it (reads as a trailing directive), and the tool scope is carried
    // on the command for the runner to translate to spawn flags. When the cfg
    // sets none, this is byte-identical to `body + AGENT_TERSE_SUFFIX`.
    ...(((): { allowedTools?: string[]; disallowedTools?: string[] } => {
      const allowed = cfg.allowedToolsForRole?.(action.role);
      const disallowed = cfg.disallowedToolsForRole?.(action.role);
      return {
        ...(allowed && allowed.length ? { allowedTools: allowed } : {}),
        ...(disallowed && disallowed.length ? { disallowedTools: disallowed } : {}),
      };
    })()),
    // The ENVELOPE: the handback prefix (informed-retry feedback, consumed here so a
    // prepend precondition the executor re-adds to `body` still lands AFTER it – the legacy
    // order) + the given task body + the context/terse/task suffixes. On the legacy path
    // `body` is the full inline task (buildTaskBody with omit=∅); on the A-full executor path
    // `body` is the executor-assembled prompt (declared preconditions re-injected in position).
    task:
      consumeHandback(action, f, cfg.consortDir) +
      body +
      (cfg.contextPackSuffix?.(action.role, buildTurn) ?? "") +
      AGENT_TERSE_SUFFIX +
      (cfg.taskSuffix?.(action.role, buildTurn) ?? ""),
    replay: {
      mode: "mode" in action ? action.mode : undefined,
      // The build turn's mode (reflect / review / refactor / assess / repair),
      // distinct from the design-lane `mode` above. The replay path needs it to
      // recognise the reflect turn (whose recorded output is a .consort design
      // artifact the code-only build restore filters out).
      buildMode: "buildMode" in action ? action.buildMode : undefined,
      story: "story" in action ? action.story : undefined,
    },
  };
}

/**
 * The legacy `claude` command for an action: buildClaudeCommandWithBody around the FULL inline
 * task body (omit=∅, so every precondition's inline projection is present). Byte-identical to the
 * pre-A-full buildClaudeCommand – the extraction split the body (buildTaskBody) from the envelope
 * (buildClaudeCommandWithBody) without moving a byte. The A-full executor path calls
 * buildClaudeCommandWithBody directly with the executor-assembled prompt (declared preconditions
 * re-injected) instead of the full inline body.
 */
export function buildClaudeCommand(action: Extract<WorkflowAction, { kind: "invoke-role" }>, cfg: DriveEffectsConfig): DriveCommand {
  return buildClaudeCommandWithBody(action, cfg, buildTaskBody(action, cfg));
}

/**
 * The single post-turn CYCLE CLI a navigator/driver BUILD turn emits (the record/log phase's
 * role-specific effect), or undefined for a role/turn that emits none (every design role, and
 * the test-strategist/breakdown cases whose CLIs are handled separately). Extracted VERBATIM
 * from the navigator+driver if-else chains of commandsForAction so BOTH the legacy branch and
 * the manifest-driven commandsFromManifest derive the SAME cycle command from ONE place – the
 * cycle CLI's args are DYNAMIC (loop granularity, --ac, --repair, the collapsed buildMode
 * verbs), so they cannot live as a static manifest postTurn.args; a manifest declares a
 * `@build-cycle` marker and delegates HERE. Pure move, byte-identical (the full suite +
 * orchestrator-effects goldens guard it).
 */
function buildCycleCommand(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  cfg: DriveEffectsConfig,
): DriveCommand | undefined {
  const f = cfg.featureId;
  // Same storyLoop derivation commandsForAction computes for the cycle loop flags.
  const storyLoop: "ac" | "hybrid-a" | "story" | undefined =
    "story" in action ? effectiveLoopForStory(cfg.loopGranularity ?? "story", action.story) : cfg.loopGranularity;

  // Navigator build turns.
  if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "reflect") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["reflect-gate", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess") {
    const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
    return { kind: "cli", bin: CYCLE_BIN, args: ["assess-green", "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess-deploy") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["assess-deploy-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess-refactor") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["assess-refactor-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator") {
    const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
    const verb = "buildMode" in action && action.buildMode === "review" ? "review" : "begin";
    const loop = storyLoop ?? "story";
    const loopFlag =
      loop === "story"
        ? ["--loop", "story"]
        : verb === "begin" && loop === "hybrid-a"
          ? ["--loop", "hybrid-a", ...(cfg.batchCap ? ["--batch-cap", String(cfg.batchCap)] : [])]
          : [];
    return { kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.consortDir, ...loopFlag] };
  }
  // Driver build turns.
  if (!("mode" in action) && action.role === "driver" && "buildMode" in action && action.buildMode === "refactor-deploy") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["refactor-deploy-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "driver" && "buildMode" in action && action.buildMode === "refactor-superseded") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["refactor-superseded-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "driver") {
    const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
    const isRepair = "buildMode" in action && action.buildMode === "repair";
    const verb = "buildMode" in action && action.buildMode === "refactor" ? "refactor" : "green";
    const repairFlag = isRepair ? ["--repair"] : [];
    const loopFlag = verb === "refactor" && (storyLoop ?? "story") === "story" ? ["--loop", "story"] : [];
    return { kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.consortDir, ...repairFlag, ...loopFlag] };
  }
  return undefined;
}

/**
 * Assemble an action's DriveCommand[] FROM its step manifest – the manifest-driven half of
 * the Template Method's record/log phase. Returns undefined when no manifest matches the
 * action (the caller falls back to the legacy commandsForAction branch), so this is purely
 * additive: the default drive never sees it unless the opt-in cfg flag turns it on AND a
 * manifest exists. The assembled list is [before-postTurn CLIs, claude, verify-artifact,
 * after-postTurn CLIs, log-reconcile], mirroring the legacy branch's structural commands.
 * The golden-equivalence test asserts it deep-equals commandsForAction for the migrated
 * action; a legacy branch is only retired once its golden passes.
 */
/**
 * The ONE resolution the drive uses to turn an action into its command list: the manifest
 * (executor-aligned) view when useManifestSteps is on and a manifest matches, else the deterministic
 * commandsForAction list. perform, planNextAction (--dry-run / interactive preview), and the optimize
 * sweep ALL go through this, so the swept/previewed/performed command list is one and the same. This
 * is also the single seam J5 rewrites: when commandsForAction's agent arm is deleted, the fallback
 * becomes the deterministic-only helper and every caller follows without change.
 */
export function commandsForActionResolved(action: WorkflowAction, cfg: DriveEffectsConfig): DriveCommand[] {
  return (cfg.useManifestSteps ? commandsFromManifest(action, cfg) : undefined) ?? commandsForAction(action, cfg);
}

export function commandsFromManifest(action: WorkflowAction, cfg: DriveEffectsConfig): DriveCommand[] | undefined {
  if (action.kind !== "invoke-role") return undefined;
  const manifest = manifestForAction(action);
  if (!manifest) return undefined;

  const f = cfg.featureId;
  const tdd = ["--feature", f, "--tdd-dir", cfg.consortDir];

  // Map a manifest postTurn bin token to its resolved CLI bin. The manifest carries a
  // stable symbolic token (PIPELINE_BIN, CYCLE_BIN, ...) so the resolved bin name stays
  // one source of truth in code, not duplicated across every manifest.
  const BIN_TOKENS: Record<string, string> = {
    PIPELINE_BIN,
    CYCLE_BIN,
    HUMAN_PROXY_BIN,
    LOG_BIN,
    TEST_LIST_BIN,
  };
  const resolveBin = (token: string): string => BIN_TOKENS[token] ?? token;
  // Substitute the manifest arg placeholders with this run's concrete values. `--tdd`
  // expands to the standard [--feature F --tdd-dir D] pair (the common design-lane suffix);
  // {feature}/{story}/{tddDir} are single-token substitutions for build-turn CLIs that
  // interleave them (e.g. cycle `green --feature F --story S --tdd-dir D`). A {story} with
  // no story on the action drops out (build turns always carry one).
  const story = "story" in action && typeof action.story === "string" ? action.story : undefined;
  const expandArgs = (args: string[]): string[] =>
    args.flatMap((a) => {
      if (a === "--tdd") return tdd;
      if (a === "{feature}") return [f];
      if (a === "{tddDir}") return [cfg.consortDir];
      if (a === "{story}") return story ? [story] : [];
      return [a];
    });

  // A postTurn entry is either a STATIC CLI (bin token + fixed args, e.g. the design-lane
  // reset/sync-breakdown or test-list) OR the `@build-cycle` marker – the navigator/driver
  // build turn's cycle CLI, whose args are DYNAMIC (loop/--ac/--repair/collapsed buildMode
  // verbs) and cannot be a static args array. The marker delegates to buildCycleCommand, the
  // SAME derivation commandsForAction uses, so the two paths stay byte-identical.
  const CYCLE_MARKER = "@build-cycle";
  const toCmd = (p: StepManifestPostTurn): DriveCommand | undefined =>
    p.bin === CYCLE_MARKER
      ? buildCycleCommand(action, cfg)
      : { kind: "cli", bin: resolveBin(p.bin), args: expandArgs(p.args) };
  const before = (manifest.postTurn ?? [])
    .filter((p) => p.when === "before")
    .map(toCmd)
    .filter((c): c is DriveCommand => c !== undefined);
  const after = (manifest.postTurn ?? [])
    .filter((p) => p.when === "after")
    .map(toCmd)
    .filter((c): c is DriveCommand => c !== undefined);

  const cmds: DriveCommand[] = [...before, buildClaudeCommand(action, cfg)];

  // Post-turn out-of-root guard, from the manifest's declared outputs (same anyOf/label the
  // legacy designArtifactExpectation produces for this action).
  const expectArtifact = designArtifactExpectation(action, cfg.consortDir, f);
  if (expectArtifact) {
    cmds.push({ kind: "verify-artifact", role: action.role, anyOf: expectArtifact.anyOf, label: expectArtifact.label });
  }

  cmds.push(...after);

  // reconcile logs whatever landed (skipped for the sprint-scoped planning modes that
  // write no feature artifacts – none of which are manifest-driven yet).
  if (f && !isPlanningMode(action)) cmds.push({ kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] });

  return cmds;
}

export function commandsForAction(action: WorkflowAction, cfg: DriveEffectsConfig): DriveCommand[] {
  const f = cfg.featureId;
  const tdd = ["--feature", f, "--tdd-dir", cfg.consortDir];
  const approver = cfg.approver ?? "human-proxy";
  const deployTarget = cfg.deployTarget ?? "local";

  switch (action.kind) {
    case "invoke-role": {
      // author-requests is now a METERED PO turn (the LLM authors a feature-request.md per
      // committed feature), so it FALLS THROUGH to buildClaudeCommand below like every other
      // agent turn — NOT an inline supply-requests CLI. The recorded-seed COPY runs at the
      // backlog gate (approve-backlog-gate), so a seed/replay run has requestsAuthored true and
      // never fires this turn; only ABSENT (live) requests are authored here. sync-backlog is
      // re-run POST-turn (below) so backlog.json reflects the just-authored requests.
      // DETERMINISTIC propose (capture/replay): when the sprint's feature-requests
      // are recorded, project feature-proposals.md from them via the Human Proxy
      // instead of spawning the Spec Author LLM. An LLM propose can write nothing
      // and then, on the re-dispatch, claim the file "already exists" – the handoff
      // guard then aborts on the empty artifact. Interactive users (no recorded
      // requests) still get the live LLM propose below.
      if (cfg.recordedRequests && !cfg.livePropose && "mode" in action && action.role === "spec-author" && action.mode === "propose") {
        return [
          {
            kind: "cli",
            bin: HUMAN_PROXY_BIN,
            args: ["supply-proposals", "--tdd-dir", cfg.consortDir, ...(cfg.uiTrack ? ["--ui"] : [])],
          },
        ];
      }
      // Navigator + Driver are the BUILD roles, invoked in a tight RED/GREEN/
      // REVIEW/REFACTOR loop per AC; the artifact on disk is their only inter-role
      // channel, so correctness never depends on a retained session, only speed.
      // P5 (`buildSessionScope`): resume their `claude -p` session PER STORY by
      // default (`story`), warm context + prompt cache across a story's cycles,
      // and a FRESH session at each new story so growth is bounded to one story
      // (the per-story spec gate keeps stories small). `cycle` is the safety valve
      // (cold-spawn every turn, the prior behavior) if a long story ever overflows
      // the window ("Prompt is too long", the live smoke's S2 death). Other roles
      // resume across the whole feature (keyed by role); they are invoked a handful
      // of times so accumulation is bounded.
      const claude = buildClaudeCommand(action, cfg);
      const cmds: DriveCommand[] = [claude];
      // Post-turn out-of-root guard (FEIP-8006): assert the role wrote its
      // artifact under the project's consortDir BEFORE any effect below consumes it,
      // so a stray write (agent resolved the project root wrong) fails loud +
      // attributed here instead of as a cryptic downstream crash. Harmless in
      // replay: replayDesignTurn already copied the artifact, so the guard passes.
      const expectArtifact = designArtifactExpectation(action, cfg.consortDir, f);
      if (expectArtifact) {
        cmds.push({ kind: "verify-artifact", role: action.role, anyOf: expectArtifact.anyOf, label: expectArtifact.label });
      }
      // Breakdown is atomic + self-cleaning (FEIP-8024). BEFORE the turn, reset any
      // INCOMPLETE breakdown (partial story stubs with no populated feature-spec.json)
      // so a re-dispatch regenerates from a clean slate instead of the agent seeing
      // stale stubs, reporting "already on disk", writing nothing, and deadlocking on
      // the missing-feature-spec.json guard forever. AFTER the turn, seed the pipeline
      // from the stories/ dirs it produced (breakdown writes files, not pipeline.json).
      if ("mode" in action && action.role === "spec-author" && action.mode === "breakdown") {
        cmds.unshift({ kind: "cli", bin: PIPELINE_BIN, args: ["reset-breakdown", ...tdd] });
        cmds.push({ kind: "cli", bin: PIPELINE_BIN, args: ["sync-breakdown", ...tdd] });
      }
      // After the Test Strategist orders a story's tests, deterministically
      // scope the feature master to that story and write the canonical per-story
      // list (storyTestListJson), the exact file + field the testListReady probe
      // reads. Code-emitting it (not relying on the role) is what keeps producer
      // + probe on the single source of truth, so the design lane cannot stall
      // waiting on a per-story list the role wrote under a different name/shape.
      if (!("mode" in action) && action.role === "test-strategist") {
        cmds.push({ kind: "cli", bin: TEST_LIST_BIN, args: [cfg.consortDir, f, action.story] });
      }
      // Cycle recording is an ORCHESTRATION concern, not the role's: the
      // Navigator/Driver are pure (write the failing test / write the code +
      // run the project's tests) and never touch git or the cycle artifacts.
      // After the Navigator writes the next test, stamp the RED cycle; after
      // the Driver makes it pass, record the run + stamp GREEN. Code-emitting
      // this (vs the agent hand-writing cycle-NNN.json) is what keeps the
      // probe's red_at/green_at reading in lockstep with what was produced ,
      // the drift that stalled the live smoke.
      // The navigator/driver BUILD turn's single cycle CLI (reflect-gate / assess-* /
      // begin|review / refactor-*-verify / green|refactor|repair), derived in ONE place
      // (buildCycleCommand) so the manifest-driven commandsFromManifest emits the identical
      // command. Returns undefined for a role/turn that has no cycle CLI here.
      const cycleCmd = buildCycleCommand(action, cfg);
      if (cycleCmd) cmds.push(cycleCmd);
      // Code-emit artifact.written for whatever the role just wrote: reconcile
      // After the Architect sizes the COMMITTED features, re-project the sprint
      // backlog so sync-backlog stamps the fresh F-keyed sizes into
      // sprints/<s>/backlog.json (the estimate ran AFTER author-requests wrote the
      // id-only backlog, so it must be re-synced now). This is what makes the
      // committed backlog carry per-sprint sizing, including on a re-plan sprint.
      if ("mode" in action && action.mode === "estimate-committed" && cfg.sprintName) {
        cmds.push({ kind: "sync-backlog", sprint: cfg.sprintName });
      }
      // After the metered PO author-requests turn writes each committed feature's
      // feature-request.md, re-project the sprint backlog (the ONE writer) so backlog.json
      // reflects exactly the requests just authored — the post-turn projection that replaces
      // the old inline supply-requests+sync-backlog pair (author-requests no longer intercepts).
      if ("mode" in action && action.mode === "author-requests" && cfg.sprintName) {
        cmds.push({ kind: "sync-backlog", sprint: cfg.sprintName });
      }
      // reads the artifacts on disk and logs any not already in the agent log,
      // so observability never depends on the role's model emitting it. Skipped
      // for the sprint-scoped planning modes (propose / estimate / estimate-committed),
      // which write no feature artifacts to reconcile. (author-requests returned earlier.)
      if (f && !isPlanningMode(action)) cmds.push({ kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] });
      return cmds;
    }

    case "deploy-verify-heal": {
      // FEATURE-ship deploy-verify self-heal (mirrors the per-story assess-deploy /
      // refactor-deploy, but at feature scope – no story). The feature-level verify
      // failed on shared-state contamination; the deploy wrote a feature-scope
      // marker (features/<F>/deploy-verify-assess.json). ASSESS (navigator) reads it
      // + prescribes scoping into features/<F>/deploy-verify-scope.json; the finalize
      // records the scope set (routes the driver SCOPE turn) or escalates (veto).
      // SCOPE (driver) refactors the flagged tests; the finalize marks it refactored
      // so the transition re-deploys + re-verifies (one-shot bound in the marker).
      const consortDir = cfg.consortDir;
      const featureId = f;
      const root = artifactRoot(consortDir);
      const marker = readDeployVerifyAssessMarker(consortDir, featureId);
      const claude: DriveCommand = {
        kind: "claude",
        role: action.role,
        model: cfg.modelForRole(action.role),
        ...(cfg.fallbackModelForRole?.(action.role) ? { fallbackModel: cfg.fallbackModelForRole(action.role)! } : {}),
        task:
          (action.mode === "assess-deploy"
            ? `ASSESS a failed full-feature DEPLOY-VERIFY for the FEATURE SHIP of ${featureId} (all stories are` +
              ` accepted; this is the merged-increment verify against the running app, no single story). A` +
              ` deterministic classifier RE-RAN each failing test in ISOLATION (a fresh clean DB) and they ALL` +
              ` PASSED alone – shared-state CONTAMINATION, not broken software: a test that does not OWN its DB` +
              ` state (it writes a fixed-key row with no cleanup, or asserts an absolute whole-table total) and so` +
              ` collides with sibling tests' rows on the shared feature-branch DB.\n` +
              `Failing tests:\n${(marker?.failing_node_ids ?? []).map((n) => `  ${n}`).join("\n")}\n\n` +
              `For EACH test, prescribe HOW to make it own its state: use a per-run-unique key (a uuid-suffixed` +
              ` sku/location), or delete/upsert the fixed key before the write AND clean up after, or scope a` +
              ` whole-table aggregate to the test's own rows / a delta – NEVER an absolute total. Keep the` +
              ` assertion's intent; just make it self-owning.\n` +
              `Write your scope directives to ${root}/features/${featureId}/deploy-verify-scope.json as` +
              ` {"version":1,"directives":[{"node_id":"<path::test>","directive":"<how to scope it>"}]} – one entry` +
              ` per test you confirm is contamination-fragile. If (rarely) you judge a failure a GENUINE regression,` +
              ` OMIT it (write no file, or an empty directives array); the orchestration then raises it to a human.` +
              ` Write ONLY that file.`
            : `SCOPE the contamination-fragile tests the Navigator flagged for the FEATURE SHIP of ${featureId}.` +
              ` Refactor EXACTLY these test files to own their DB state, per the directives – do NOT touch product` +
              ` code, do NOT weaken the assertions' intent:\n` +
              (readDeployVerifyScope(consortDir, featureId)?.directives ?? [])
                .map((d) => `  ${d.node_id}\n    -> ${d.directive}`)
                .join("\n") +
              `\nEdit ONLY those test files. The orchestrator re-deploys + re-verifies the whole feature after your turn.`) +
          AGENT_TERSE_SUFFIX,
        replay: { buildMode: action.mode },
      };
      const finalizeVerb = action.mode === "assess-deploy" ? "assess-deploy-verify" : "refactor-deploy-verify";
      return [
        claude,
        { kind: "cli", bin: CYCLE_BIN, args: [finalizeVerb, "--feature", f, "--tdd-dir", cfg.consortDir] },
        { kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] },
      ];
    }

    case "project-architect-notes":
      // Deterministic (no architect turn): write each AC's architectural_notes from
      // the project canon, then reconcile so the projected annotations are logged
      // as architect artifacts (observability parity with a live architect turn).
      return [
        { kind: "cli", bin: CANON_NOTES_BIN, args: ["--story", action.story, ...tdd] },
        { kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] },
      ];

    case "surface-gate":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["surface", "--story", action.story, ...tdd] }];

    case "approve-gate":
      // HITL: the Human Proxy approves in headless mode.
      return [
        { kind: "cli", bin: PIPELINE_BIN, args: ["approve-gate", "--story", action.story, "--approver", approver, ...tdd] },
      ];

    case "dispatch":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["dispatch", ...tdd] }];

    case "cut-experiment":
      // `cut` requires the full set: feature + story + slug + instance, plus the
      // experiment branch to create (--branch) and the feature branch it forks
      // off (--parent). Emit them all; an unset featureBranch/instance surfaces
      // as a validation failure (see validateExperimentArgs), not a silent skip.
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "cut",
            "--feature",
            f,
            "--story",
            action.story,
            "--slug",
            EXPERIMENT_SLUG,
            "--branch",
            experimentBranchName(action.story),
            "--parent",
            cfg.featureBranch ?? "",
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.consortDir,
            // A re-cut after a discarded experiment re-forks the stale paired branch
            // clean (Finding 27); a first cut omits it (nothing to reset).
            ...(action.resetStaleBranch ? ["--reset-stale-branch"] : []),
          ],
        },
      ];

    case "await-acceptance": {
      // The deploy gate runs DETERMINISTICALLY here: `consort-deploy --gate`
      // migrates the story's experiment branch to head (forward-only, so the
      // PO-review app is not served against an unmigrated schema – GREEN verify
      // only ever migrates a disposable child branch), starts the app on that
      // branch, polls that it serves NON-5xx, runs the project verify (by default
      // on a disposable child branch – isolated), and writes the STORY-scoped
      // deploy-evidence the acceptance gate reads. The CLI
      // is SYNCHRONOUS (execSync through the verify + evidence write) and soft-fails
      // (exit 0) on a real failure, recording honest evidence + an escalation that
      // the next readState routes to a raise-to-hil halt. We run it as a CLI effect
      // rather than via a spawned Release Engineer agent: the deploy IS the
      // deterministic substrate, not the model's word, and a live agent could
      // background the long (ephemeral-isolated) verify and end its turn before the
      // evidence was written – stalling await-acceptance. The logging layer still
      // narrates the RE deploy handoff (it keys off the action kind, not a spawn),
      // so the RE remains the visible deploy actor in the trail. (Teardown first so
      // a prior story's app frees the port.)
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "cli",
          bin: DEPLOY_BIN,
          args: [
            "--target", deployTarget, "--feature", f, "--story", action.story,
            "--lakebase-branch", experimentBranchName(action.story),
            "--project-dir", cfg.projectDir, "--tdd-dir", cfg.consortDir, "--gate",
          ],
        },
        { kind: "cli", bin: PIPELINE_BIN, args: ["await-acceptance", "--story", action.story, ...tdd] },
      ];
    }

    case "accept":
      // PO acceptance: `pipeline accept` PERFORMS the experiment git-merge into the
      // feature branch (+ migrations + teardown) AND records acceptance, one
      // idempotent command that lands the code (FEIP-8013). It resolves the merge
      // args (slug/branches) from the persisted experiment record; the orchestrator
      // supplies the instance + project-dir. This was two commands (`experiment
      // merge` + `pipeline accept`), which double-recorded acceptStory and, worse,
      // let an interactive human run only the state half and strand the code.
      // collapseMigrationHeads still runs at the later feature->tier merge.
      return [
        {
          kind: "cli",
          bin: PIPELINE_BIN,
          args: [
            "accept",
            "--story",
            action.story,
            "--approver",
            approver,
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            ...tdd,
          ],
        },
      ];

    case "complete":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["complete", ...tdd] }];

    case "approve-intake-gate":
      // HITL intake gate: AFTER the PO drafts the intake, BEFORE propose. Interactive, the drive
      // PARKS here (the human reviews/edits/approves via consort-approve-gate --gate intake);
      // headless, the Human Proxy performs this and approves (writes the marker + logs
      // gate.approved("intake")). Sprint-scoped, mirroring the plan gate's approve verb.
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "intake", "--approver", approver, "--tdd-dir", cfg.consortDir],
        },
      ];

    case "approve-backlog-gate":
      // HITL BACKLOG gate: the human SELECTS which sized proposals enter the sprint + commits
      // them. Headless the Human Proxy commits the recorded selection — `--gate backlog` supplies
      // the recorded feature-requests (COPIES each seed + writes requested.json membership) and
      // logs gate.approved("backlog"). Then sync-backlog projects backlog.json from the committed
      // set. A recorded seed is copied here (so the metered author-requests turn skips it, byte-
      // identical replay); an ABSENT request is left for that turn to author live.
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "backlog", "--approver", approver, "--tdd-dir", cfg.consortDir],
        },
        { kind: "sync-backlog", sprint: cfg.sprintName ?? "sprint" },
      ];

    case "approve-plan-gate":
      // HITL sprint plan gate: the Human Proxy approves it headless (teeth:
      // feature-proposals.md must exist + conform). Sprint-scoped, mirroring the
      // per-story spec gate's approve verb.
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "plan", "--approver", approver, "--tdd-dir", cfg.consortDir],
        },
      ];

    case "planning-complete":
      return [{ kind: "set-phase", phase: "discovery" }];

    case "feature-complete":
      // Feature-design-complete conformance gate (deterministic backstop): once
      // EVERY story is designed + gated, the WHOLE feature's artifacts must
      // conform – all Required NFRs covered, layers declared, and every declared
      // persistence_invariant + a fitness guard covered across the merged
      // test-list – before the feature deploys. The per-story reflect gate catches
      // per-story design defects; this catches feature-wide coverage a single
      // story cannot see (e.g. an invariant no story's test covers). It enforces
      // on the advance for ANY approver; a non-zero exit halts the drive.
      return [
        { kind: "cli", bin: GATE_CONFORMANCE_BIN, args: ["--feature", f, "--tdd-dir", cfg.consortDir] },
        { kind: "set-phase", phase: "deploy" },
      ];

    case "deploy":
      // Ship the merged feature, deterministically (same contract as the per-story
      // gate deploy above): the orchestration runs `consort-deploy --gate`
      // for the feature, which polls reachable, runs the feature verify, and writes
      // the FEATURE-scoped deploy-evidence the deploy gate reads. A failed/foreign
      // deploy is recorded as evidence + an escalation -> raise-to-hil, not an LLM
      // claiming success. (For remote targets, `consort-deploy` refuses
      // cleanly until they land; that refusal surfaces as the escalation.)
      // --lakebase-branch = the FEATURE branch (no --story): a failed verify can
      // then fork an ephemeral child off it to classify shared-state contamination
      // (the feature-ship self-heal) instead of hard-raising to HIL on a flaky test.
      // Teardown first.
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "cli",
          bin: DEPLOY_BIN,
          args: [
            "--target", deployTarget, "--feature", f,
            ...(cfg.featureBranch ? ["--lakebase-branch", cfg.featureBranch] : []),
            "--project-dir", cfg.projectDir, "--tdd-dir", cfg.consortDir, "--gate",
          ],
        },
      ];

    case "approve-deploy-gate":
      return [
        { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["--feature", f, "--gate", "deploy", "--approver", approver, "--tdd-dir", cfg.consortDir] },
      ];

    case "deploy-complete":
      // Local working-software check done -> enter the promote phase (PR review +
      // merge of the feature up to its parent tier).
      return [{ kind: "set-phase", phase: "promote" }];

    case "prepare-pr":
      // PR review step 1: push the feature branch + open the PR (SCM
      // feature-claimed -> pr-ready). The SCM CLIs operate on the SCM ladder in
      // .lakebase/workflow-state.json, so they take --project-dir, not the feature.
      //
      // --force skips prepare-pr's dirty-working-tree refusal. At promote the tree
      // is dirty with the PRODUCED .consort corpus (features/<F>/*, cycles/,
      // experiments/, pipeline.json, ...) that the build turns intentionally never
      // commit: verified across a full clean build, every per-story green/refactor
      // commit is CODE-ONLY, and that produced corpus is ephemeral run-state the
      // turn-recorder captures into the record dir (recorded-artifacts/), not branch
      // content. Promote CI (pr.yml / merge.yml) reads only code (migrations + pytest
      // + vitest), never .consort. So the PR must carry exactly what the build
      // committed (the code); forcing past the corpus dirty-tree is the on-behavior
      // fix, NOT a green-wash of uncommitted CODE (there is none – 0 code files dirty
      // at promote). Without it, the first feature to reach promote hard-halts on its
      // own capture artifacts.
      return [{ kind: "cli", bin: SCM_PREPARE_PR_BIN, args: ["--project-dir", cfg.projectDir, "--force"] }];

    case "wait-ci":
      // PR review step 2: wait for the PR's regression gate to go green (the
      // pr.yml ci-pr-branch check; SCM pr-ready -> ci-green).
      return [{ kind: "cli", bin: SCM_WAIT_CI_BIN, args: ["--project-dir", cfg.projectDir] }];

    case "approve-promote-gate": {
      // The HITL `promote` gate: the human/PO accepts promoting the feature to its
      // parent tier (the PR's base, e.g. staging). AFTER ci-green and BEFORE the
      // merge. The promote gate REQUIRES a non-empty promote_ref (what is being
      // promoted); the Human Proxy SKIPS the gate without one, so the orchestrator
      // must supply it, else the gate never approves and the driver loops on
      // approve-promote-gate forever (the promote-phase stall). The thing being
      // promoted is the feature's canonical branch (the merge then releases it into
      // the parent tier + runs the parent's migrations). Teeth remain the merge
      // precondition next (PR must exist + be ci-green).
      const promoteRef = cfg.featureBranch ?? f;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--feature", f, "--gate", "promote", "--approver", approver, "--tdd-dir", cfg.consortDir, "--promote-ref", promoteRef],
        },
      ];
    }

    case "merge":
      // The promotion: merge the PR (release the feature into the parent tier) and
      // WAIT for the downstream migrate workflow to apply the migrations to the
      // parent's Lakebase branch (SCM ci-green -> merged). We wait so the merge
      // is not "done" until staging has both the code (PR merge) and the schema
      // (parent merge.yml migrate run), but with --migrate-timeout-nonfatal: the
      // GitHub merge + local fast-forward have already landed by the time the
      // poll runs, so a slow/absent downstream-migrate run is a WARNING, not a
      // 30-minute hang that fails the whole drive (a migrate run that COMPLETES
      // with failure is still fatal). Budget shortened to 10 min for the same
      // reason, the drive reaches `done` and the migrate confirms async.
      return [
        {
          kind: "cli",
          bin: SCM_MERGE_BIN,
          args: [
            "--project-dir",
            cfg.projectDir,
            "--wait-migrate",
            "--migrate-timeout-nonfatal",
            "--migrate-timeout-sec",
            "600",
          ],
        },
      ];

    case "done":
      // Feature wrap-up: switch the working tree back to the PARENT TIER and
      // DELETE the merged feature branch as the last step, so the run does not end
      // on the just-merged (soon-deleted) feature branch and the next feature forks
      // from a clean parent. scm-merge already attempts BOTH on a clean merge, but
      // only conditionally: its local switch uses a plain `git checkout` that ABORTS
      // on the dirty per-run .consort/.lakebase metadata every drive leaves, so the
      // catch fires ("Local branch was NOT deleted"), HEAD stays on the feature
      // branch, and its `git branch -D` is skipped. This is the deterministic,
      // idempotent guarantee of the full end-state contract. Only when the parent is
      // known (SCM state present).
      return [
        // Force the checkout: at `done` the feature has merged and its code is
        // committed, but the per-run .tdd/.lakebase metadata (workflow-state.json,
        // selection-log.md) is dirty + tracked, so a plain `git checkout` aborts
        // ("local changes would be overwritten"). That churn is disposable here
        // (the feature is shipped), and landing on the parent is the whole point,
        // so -f discards it and switches. Mirrors the fork-guard ignoring the same
        // metadata. (scm-merge attempts this switch too but non-fatally; this is
        // the deterministic guarantee.)
        ...(cfg.parentBranch
          ? [
              { kind: "cli" as const, bin: "git", args: ["checkout", "-f", cfg.parentBranch] },
              // Delete the merged local feature branch so the process never leaves
              // us on (or able to fall back to) a branch that should have been
              // removed. Guarded to the feature branch, and only when it differs
              // from the parent we just landed on (never delete the tier we are on).
              // `-D` (force) because the branch merged via PR squash/merge-commit is
              // not a literal ancestor of the local parent tip, so `-d` would refuse
              // it as "not fully merged" even though it IS shipped. scm-merge already
              // removed the REMOTE + Lakebase branches; this completes the local side.
              // Best-effort via a shell guard: a missing/absent branch must not fail
              // the terminal step (idempotent on a resume where it is already gone).
              ...(cfg.featureBranch && cfg.featureBranch !== cfg.parentBranch
                ? [
                    {
                      kind: "cli" as const,
                      bin: "sh",
                      args: [
                        "-c",
                        `git branch -D ${shellQuote(cfg.featureBranch)} 2>/dev/null || true`,
                      ],
                    },
                  ]
                : []),
            ]
          : []),
        { kind: "set-phase", phase: "shipped" },
      ];

    case "revise-route": {
      // a SPEC-level smell the PO sends back to its owning author.
      // ONE in-process command does it atomically (no inter-command readState
      // window): record the PO's revise decision as gate events, reset the story
      // to `designing` (reviseStory: discard the experiment + reopen the gate +
      // free the lane), and resolve the smell (kind=revised, spending the
      // one-revise-per-(smell,story) budget). The standing design lane then
      // re-runs Gate 1->2->3 at the owning author and the build resumes.
      const smellName = action.source.startsWith("smell:")
        ? action.source.slice("smell:".length)
        : action.source;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: [
            "decide-escalation",
            "--feature",
            f,
            "--story",
            action.story,
            "--smell",
            smellName,
            "--routed-to",
            action.role,
            "--gate",
            action.gate,
            "--reason",
            action.reason,
            "--approver",
            approver,
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.consortDir,
          ],
        },
      ];
    }

    case "raise-to-hil":
      // Surface + halt: the escalation is already recorded under
      // .tdd/escalations/ (that is how it was detected). No CLI to run, the
      // onAction logging emits the loud "RAISED TO HIL" line + runDriver returns
      // escalated, and drive.cli exits non-zero. A no-op command list.
      return [];

    case "design-complete":
      // In the union (from the design sub-machine) but never emitted by
      // nextTransition, which rewrites it to feature-complete. No-op defensively.
      return [];
  }
}

/**
 * Compute the single next action + the commands that would carry it out,
 * without executing anything. Backs `consort-drive --dry-run` ("what will
 * the driver do next?") and is the testable core of that CLI path.
 */
export async function planNextAction(
  cfg: DriveEffectsConfig,
  transition: (state: import("./orchestrator-drive.js").DriveState) => WorkflowAction = nextTransition,
): Promise<{ action: WorkflowAction; commands: DriveCommand[] }> {
  const state = await buildDriveEffects(cfg).readState();
  const action = transition(state);
  // Resolve commands EXACTLY as perform does – the manifest (executor-aligned) view when
  // useManifestSteps is on and a manifest matches, else the deterministic list. --dry-run + the
  // interactive 'what's next' preview is a prompt constructor back to the human, so it must show
  // what the drive WILL do (not a stale shape). Identical today (manifests are golden-equivalent);
  // after J5 deletes commandsForAction's agent arm this resolves the agent turn via the manifest.
  const commands = commandsForActionResolved(action, cfg);
  return { action, commands };
}

/**
 * Read the feature's DriveState from disk (pipeline + artifact probe + context +
 * UI-track gating). The read-only half of buildDriveEffects.readState, extracted
 * so the strictly read-only consumers (consort-next, the drive's next.json
 * auto-emit) get the EXACT same state the drive acts on without constructing a
 * full DriveEffectsConfig or importing the drive CLI (FEIP-8017).
 */
export function readDriveStateFromDisk(
  consortDir: string,
  featureId: string,
  projectDir: string,
  opts: { uiTrack?: boolean } = {},
): import("./orchestrator-drive.js").DriveState {
  const pipeline = readPipeline(consortDir, featureId);
  // Thread the active build story so a smell-derived escalation with no story
  // scope still resolves to a story for revise-routing.
  const probe = diskArtifactProbe(consortDir, featureId, pipeline.build_active);
  const ctx = readDriveContext(consortDir, featureId, projectDir);
  const state = deriveDriveState(pipeline, probe, ctx);
  // UI track: gate the UX Designer step. uiTrack is config (env); the design
  // guide's existence is disk truth (project-level, authored once + reused).
  state.uiTrack = opts.uiTrack ?? true;
  // The guide is "ready" only when it EXISTS and CONFORMS to its schema, not
  // merely exists. Otherwise a non-conformant design-guide.json (the UX
  // Designer drifting on shape) sails through the design lane and only
  // surfaces at the final feature drain; gating on conformance keeps the UX
  // Designer pending until the guide is well-formed. Same check the role's
  // own response-formatter self-check runs, so gate + self-check agree.
  state.designGuideReady = designGuideConformance(consortDir).ok;
  return state;
}

/** The executor-dispatch machinery moved to its own family module (executor-dispatch.ts). Re-export
 *  the allowlist predicate (some tests/consumers reference it) and inject this module's command-
 *  derivation primitives (buildCycleCommand, readDriveStateFromDisk, the bin tokens) so the family
 *  module stays free of a runtime import back into orchestrator-effects. */
export { executorDispatched } from "./executor-dispatch.js";

/** The bin-token -> resolved-bin map the executor-dispatch post-turn expander shares with
 *  commandsFromManifest (one source of the resolved names). */
const POST_TURN_BIN_TOKENS: Record<string, string> = { PIPELINE_BIN, CYCLE_BIN, HUMAN_PROXY_BIN, LOG_BIN, TEST_LIST_BIN };

/** Build a DriveEffects bound to a project: readState from disk, perform via
 *  commandsForAction + the injected runner. */
export function buildDriveEffects(cfg: DriveEffectsConfig): DriveEffects {
  return {
    async readState() {
      return readDriveStateFromDisk(cfg.consortDir, cfg.featureId, cfg.projectDir, { uiTrack: cfg.uiTrack });
    },
    async perform(action) {
      // HARD-STOP GUARD (#732): reaching perform for an invoke-role action means the executor
      // DECLINED it (performViaExecutor returned undefined). A real AGENT turn must never run here
      // on the legacy commandsForAction path – it would skip the executor's recording + validation +
      // routing contract (silent corruption). Only the sanctioned deterministic-agentless actions
      // (author-requests / estimate-committed, no LLM) may proceed; anything else throws loud.
      assertNotStrandedAgentTurn(action);
      const cmds = commandsForActionResolved(action, cfg);
      for (const cmd of cmds) {
        await cfg.runner.run(cmd);
      }
    },
    // Stage 2 (#578) executor dispatch: for the small allowlist of migrated agent turns (currently
    // spec-author breakdown) under useManifestSteps, run the turn THROUGH the StepExecutor and hand
    // runDriver the BoundedRoute it produced. Returns undefined otherwise => the loop falls to perform.
    performViaExecutor(action, state, routerDeps) {
      return performTurnViaExecutor(action, state, routerDeps, cfg, {
        buildCycleCommand,
        buildClaudeCommandWithBody,
        buildTaskBody,
        preparerFor: resolvePreparer,
        readDriveStateFromDisk,
        binTokens: POST_TURN_BIN_TOKENS,
        logBin: LOG_BIN,
      });
    },
    // Pre-dispatch route-contract check (route→event→consumer): resolve the routed action's manifest
    // and assert its REQUIRED process events exist before dispatch, so a mis-fired route fails loud
    // naming the route (RouteContractError) instead of the executor's later bare "missing input". Only
    // active under useManifestSteps (same gate as the executor path); a non-agent action or a turn
    // requiring no event is a no-op. The manifest's requiresEvents is the single contract source.
    ...(cfg.useManifestSteps
      ? {
          assertRouteSatisfiable(action: WorkflowAction) {
            const manifest = manifestForAction(action);
            if (!manifest || !(manifest.requiresEvents?.length)) return;
            assertRouteSatisfiable(
              action,
              { requiresEvents: () => manifest.requiresEvents ?? [] },
              { consortDir: cfg.consortDir, featureId: cfg.featureId },
            );
          },
        }
      : {}),
    onAction: cfg.onAction,
    onRoutingDecision: cfg.onRoutingDecision,
    // Hand-back delivery: when a role's prior turn failed its expectation
    // contract, write the violation detail where THAT role's next prompt will
    // consume it (consumeHandback in roleTask), so the retry is informed.
    onHandback(handoff, detail) {
      const file = handbackFile(cfg.consortDir, cfg.featureId, handoff.responder, handoff.story);
      try {
        fs.mkdirSync(dirname(file), { recursive: true });
        fs.writeFileSync(file, `${detail}\n`, "utf8");
      } catch {
        /* best-effort: a failed hand-back just yields a blind retry, still bounded by the queue */
      }
    },
  };
}
