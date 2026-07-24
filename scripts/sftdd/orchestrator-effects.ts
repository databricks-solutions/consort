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
//   - "cli":       a kit CLI invocation (lakebase-sftdd-pipeline / -experiment / etc.)
//   - "set-phase": write workflow-state.json `phase` (no CLI owns the coarse phase)
//
// The live runner (in the lakebase-sftdd-drive CLI) spawns these; the migration
// create + head-collapse + per-story experiment effects all surface here, in
// code, plus deterministic per-action logging via the loop's onAction hook.

import * as fs from "node:fs";
import { dirname } from "node:path";
import { nextTransition, type WorkflowAction } from "./orchestrator-drive.js";
import type { DriveEffects } from "./orchestrator-run.js";
import { deriveDriveState, effectiveLoopForStory } from "./orchestrator-derive.js";
import { diskArtifactProbe, readDriveContext } from "./orchestrator-probe.js";
import { readPipeline } from "./story-pipeline.js";
import {
  storyJson, designGuideJson, handbackFile, storyAcIds, architectureJson, readAcLayer,
  featureProposalsMd, featureSpecJson, featureTestListJson, acsDir, planningEstimatesJson,
} from "./sftdd-paths.js";
import { designGuideConformance } from "./response-formatter.js";
import { storyTestProgress, nextPendingBatch, DEFAULT_BATCH_CAP } from "./cycle-record.js";
import { readSupersededTests, readGreenFailure } from "./supersession.js";
import { readDeployVerifyAssessMarker, readDeployVerifyScope } from "./deploy-verify-assess.js";
import { readConventions } from "./architecture-conventions.js";
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
  | { kind: "claude"; role: string; model: string; task: string; resumeKey?: string; effort?: string; fallbackModel?: string; maxBudgetUsd?: number; replay?: { mode?: string; buildMode?: string; story?: string } }
  | { kind: "cli"; bin: string; args: string[] }
  | { kind: "set-phase"; phase: string }
  // Deterministic sprint-backlog projection (the ONE writer): after the PO
  // commits its requests, project backlog.json from the on-disk feature-request
  // set + the Architect's estimates. Handled in-process by the runner (no CLI),
  // mirroring set-phase. See syncBacklog in sftdd-paths.
  | { kind: "sync-backlog"; sprint: string }
  // Post-turn artifact guard (FEIP-8006): after a design/planning role's claude
  // turn, assert the role actually wrote its expected artifact UNDER the project's
  // resolved sftddDir (at least one of `anyOf` exists, a file or a non-empty dir),
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
  sftddDir: string;
  featureId: string;
  runner: CommandRunner;
  /** Resolve a role's model (per-project override -> recommended -> inherit). */
  modelForRole(role: string): string;
  /** Unified config: resolve the model for a role+turn (model tiering). A per-turn
   *  `model` map entry (e.g. driver GREEN on haiku) wins for that turn; absent, the
   *  role's base model applies. When unset, the caller falls back to modelForRole. */
  modelForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string;
  /** Approver name for headless gate approvals (the Human Proxy). */
  approver?: string;
  /** Sprint name, threaded to the sprint plan gate in the planning phase. */
  sprintName?: string;
  /** Recorded feature-requests are available (capture/replay via
   *  $LAKEBASE_SFTDD_SPRINT_REQUESTS). When true, the planning PROPOSE step is
   *  DETERMINISTIC (project feature-proposals.md from those requests via the
   *  Human Proxy) instead of spawning the Spec Author LLM, which as an LLM could
   *  write nothing then claim the file exists (the propose protocol-violation
   *  abort). Interactive users (no recorded requests) still get the live propose. */
  recordedRequests?: boolean;
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
  /** UI track on (project.uiTrack in sftdd-config.json, the single source): the
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
   *  reviewEffort fallback applies. (sftdd-config.json, file -> env -> default.) */
  effortForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string;
  /** Unified config: a role's `--fallback-model` (auto-failover), or undefined. */
  fallbackModelForRole?(role: string): string | undefined;
  /** Unified config: a role's `--max-budget-usd` per-invocation cap, or undefined. */
  maxBudgetUsdForRole?(role: string): number | undefined;
  /** Build loop granularity. "story" (the DEFAULT) gives the Navigator + Driver
   *  story-scoped turns: one RED turn writes the WHOLE story's tests, one GREEN
   *  greens them, one REVIEW + one REFACTOR per story. "ac" writes + greens one
   *  test at a time (strict per-AC TDD, per-AC REVIEW/REFACTOR). "hybrid-a"
   *  batches RED+GREEN by layer (capped) but keeps the per-AC REVIEW. ac /
   *  hybrid-a are opt-in for a more granular run. */
  loopGranularity?: "ac" | "hybrid-a" | "story";
  /** P8b: max test-list items per layer-batch (hybrid-a). Default 3. */
  batchCap?: number;
  onAction?(action: WorkflowAction, iteration: number): void;
}

/** Appended to the Spec Author's propose/breakdown tasks when the UI track is
 *  on, so the proposal + story breakdown account for user-facing E2E stories
 *  (the design lane's `layer: "E2E"` work), not just API surface. */
const UI_TRACK_PROPOSE = ` UI track is ON: this product has a user-facing UI (a design-brief.md is part of intake), so every user-facing capability must be deliverable end to end as an E2E story, a real browser/screen interaction a user performs, not merely an API. Frame each candidate as a user-facing increment and note which need an E2E (UI) story.`;
const UI_TRACK_BREAKDOWN = ` UI track is ON: decompose into stories that include the E2E (UI) story for each user-facing capability (a screen the user interacts with), not API-only stories.`;
/** The artifact root a directive hands a role agent: the ABSOLUTE resolved
 *  sftddDir (FEIP-8006). It was previously the bare basename (`.sftdd`), a
 *  RELATIVE reference , but Claude Code's Write tool requires an ABSOLUTE path, so
 *  a relative directive forced each subagent to resolve the project root itself,
 *  and they resolved it inconsistently (cwd, $HOME, even a hallucinated
 *  `~/dev/lakebase-demo`), scattering artifacts outside the project. Handing the
 *  absolute root removes the guess: there is exactly one path, used verbatim.
 *  Directives are generated fresh per run and are NOT recorded into the shipped
 *  corpus (replay copies artifacts, never the directive), so an absolute,
 *  machine-specific path here has no portability cost. */
function artifactRoot(sftddDir: string): string {
  return sftddDir;
}

/** UI-track build directive naming the design guide under the resolved root. */
function uiTrackBuild(root: string): string {
  return ` UI track is ON: the UI must adhere to the project design guide at ${root}/design/design-guide.md (+ the design-guide.json tokens). Build to it.`;
}

// Appended to every role spawn: the artifacts ARE the deliverable; free-text
// response tokens are pure latency. Keep the model from narrating a plan,
// summarizing what it did, or printing tables/rationale to stdout (all of that
// is wasted output, the slowest part of each turn). Structured logging still
// goes through the lakebase-sftdd-log CLI, not stdout prose.
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
function storyStubScope(sftddDir: string, featureId: string, storyId: string): string {
  try {
    const stub = JSON.parse(fs.readFileSync(storyJson(sftddDir, featureId, storyId), "utf8")) as {
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

/**
 * A compact, pre-extracted design rubric the orchestrator computes ONCE from the
 * design artifacts and passes inline to a BUILD turn (RED / GREEN / REVIEW /
 * REFACTOR), so the Navigator + Driver do not reload `architecture.md` +
 * `nfrs.md` + `design-guide.md` IN FULL every turn (the same 3 files, re-read
 * on each RED/GREEN/REVIEW/REFACTOR across a story). Same data, pre-extracted:
 *   - the `layer`(s) the code must respect: the single AC's layer in ac-loop, or
 *     the UNION across the story's ACs at story scope (ac === ""),
 *   - the NFRs that apply to this story or feature-wide (id + brief), from
 *     architecture.json (the canonical NFR home), and
 *   - for UI (E2E) work, the design-token groups to check, from design-guide.json.
 * Best-effort: any unreadable / absent source is simply omitted (the prompt
 * still names the full files for when more detail than the rubric is needed).
 * Returns "" when nothing could be extracted (the prompt then degrades to naming
 * the full files, the prior behavior). This is the per-role context-compaction
 * lever: inject the slice, do not make each turn re-read the whole design tree.
 */
function contextRubric(sftddDir: string, featureId: string, story: string, ac: string): string {
  const parts: string[] = [];

  // Layer(s): the single AC in ac-loop; the union across the story's ACs at
  // story scope (so a story-level RED/GREEN/REVIEW/REFACTOR sees every boundary
  // its tests/code span, not just one).
  const layers = new Set<string>();
  const acIds = ac ? [ac] : storyAcIds(sftddDir, featureId, story);
  for (const id of acIds) {
    const l = readAcLayer(sftddDir, featureId, id);
    if (l) layers.add(l);
  }
  if (layers.size) parts.push(`layer${layers.size > 1 ? "s" : ""}=${[...layers].join(", ")}`);

  // NFRs scoped to this story or applied feature-wide (applies_to === featureId).
  try {
    const arch = JSON.parse(fs.readFileSync(architectureJson(sftddDir, featureId), "utf8")) as {
      nfrs?: Array<{ id?: string; brief?: string; applies_to?: string }>;
    };
    const nfrs = (arch.nfrs ?? []).filter(
      (n) => n && typeof n.id === "string" && (n.applies_to === story || n.applies_to === featureId),
    );
    if (nfrs.length) {
      parts.push(`required NFRs, ${nfrs.map((n) => `${n.id}${n.brief ? ` (${n.brief})` : ""}`).join("; ")}`);
    }
  } catch {
    /* no architecture.json -> omit; prompt still names nfrs.md */
  }

  // Design-token groups to check, only when UI (E2E) work is in scope, the
  // non-UI majority need NO design-guide read at all.
  if (layers.has("E2E")) {
    try {
      const dg = JSON.parse(fs.readFileSync(designGuideJson(sftddDir), "utf8")) as {
        tokens?: Record<string, unknown>;
      };
      const groups = Object.keys(dg.tokens ?? (dg as Record<string, unknown>));
      if (groups.length) parts.push(`design-token groups, ${groups.join(", ")}`);
    } catch {
      /* omit */
    }
  }

  return parts.length ? ` RUBRIC (pre-extracted; judge against THIS) :: ${parts.join(" | ")}.` : "";
}

/** The shared "prefer the pre-extracted rubric; open the full files only if you
 *  need more detail" note appended after a non-empty `contextRubric`. Uses the
 *  hyphenated `design-guide.md` filename only (never the phrase "design guide"),
 *  so a RED/GREEN turn's note does not read as the UI-track design-guide input
 *  flag. Returns "" when the rubric was empty (nothing pre-extracted to prefer). */
function rubricSourcesNote(rubric: string, featureId: string, root: string): string {
  if (!rubric) return "";
  return (
    ` The rubric above is pre-extracted from ${root}/features/${featureId}/architecture.md, ${root}/nfrs.md,` +
    ` and ${root}/design/design-guide.md, open those full files ONLY if you need more detail than it carries` +
    ` (do not re-read them by default).`
  );
}

/**
 * The build turn's CONTEXT PACK: rubric (layers + NFRs + UI tokens) PLUS the
 * established module layout and where the story's tests live. A heavy role
 * (Driver / Navigator) starts EVERY turn on a FRESH session (no warm context),
 * so anything it is not TOLD it must rediscover , and the recorded worst GREEN
 * turn spent 93 tool round-trips, ~37 of them just `find`/`grep`/`ls`/`Read`
 * relocating context already on disk. Injecting the layout + test locations
 * turns that discovery into zero round-trips. All of it is a deterministic
 * projection of the artifacts (conventions.json + the scaffold's fixed test
 * dirs), never authored, so it cannot drift. Best-effort: an absent piece is
 * simply omitted. `skipTestLoop` drops the test-location + iterate line for turns
 * that do not run the build test loop (RED has no code yet; REVIEW only judges).
 */
function buildContextPack(
  sftddDir: string,
  featureId: string,
  story: string,
  ac: string,
  opts: { skipTestLoop?: boolean } = {},
): string {
  const root = artifactRoot(sftddDir);
  const rubric = contextRubric(sftddDir, featureId, story, ac);
  const parts: string[] = [];
  if (rubric) parts.push(rubric + rubricSourcesNote(rubric, featureId, root));

  // Module layout: the established role -> path map, so the Driver PLACES code
  // (and the Navigator/Reviewer JUDGES placement) without probing the tree.
  const conventions = readConventions(sftddDir);
  if (conventions?.layers?.length) {
    const layout = conventions.layers
      .map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`)
      .join(" | ");
    parts.push(` LAYOUT (place/judge code at THESE paths, do not scan for them) :: ${layout}.`);
  }

  // Test locations: the scaffold fixes these dirs, so a build turn never needs
  // to `find`/`ls` for the story's tests. Behavior + fitness live in known dirs;
  // e2e is owned by the deploy gate, never re-run per cycle here.
  if (!opts.skipTestLoop) {
    parts.push(
      ` TESTS :: this story's tests are under tests/step_defs/ (behavior, one file per story) and` +
        ` tests/architecture/ (fitness: layering, persistence invariants, migration reversibility). Read those` +
        ` named paths directly; do NOT find/grep/ls to locate them. Iterate against the single failing test while` +
        ` fixing; the honest-GREEN verify is the authoritative full run.`,
    );
  }

  return parts.join("");
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
function nextPendingTestDirective(
  sftddDir: string,
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
      batch = nextPendingBatch(sftddDir, featureId, story, Number.MAX_SAFE_INTEGER);
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
      batch = nextPendingBatch(sftddDir, featureId, story, cap ?? DEFAULT_BATCH_CAP);
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
    next = storyTestProgress(sftddDir, featureId, story).pending[0];
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
function supersededTestsDirective(sftddDir: string, featureId: string, story: string): string {
  let acId: string | undefined;
  try {
    const prog = storyTestProgress(sftddDir, featureId, story);
    acId = (prog.openRed[0] ?? prog.pending[0])?.ac_id;
  } catch {
    acId = undefined;
  }
  if (!acId) return "";
  const sup = readSupersededTests(sftddDir, featureId, story, acId);
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
function regressionRepairDirective(sftddDir: string, featureId: string, story: string): string {
  let acId: string | undefined;
  try {
    acId = storyTestProgress(sftddDir, featureId, story).openRed[0]?.ac_id;
  } catch {
    acId = undefined;
  }
  if (!acId) return "";
  const gf = readGreenFailure(sftddDir, featureId, story, acId);
  if (!gf?.fixDirective) return "";
  return (
    `REPAIR a driver-fixable regression in AC ${acId} (story ${story}). The honest-GREEN verify against the` +
    ` running app FAILED and it was diagnosed (by the Navigator, or deterministically by a gate such as` +
    ` contract-clean) as a genuine regression in the code, NOT a superseded test:\n` +
    `  DIAGNOSIS: ${gf.diagnosis ?? gf.summary}\n` +
    `  FIX: ${gf.fixDirective}\n` +
    `Apply that fix to the PRODUCTION code. Do NOT edit prior tests to force this regression green, fix the code.` +
    ` (EXCEPTION: if a SUPERSEDED TESTS directive follows below, the Navigator flagged those specific prior tests as` +
    ` encoding obsolete behavior, refactor ONLY those alongside this fix , often the regression is collateral from a` +
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
  sftddDir: string,
): string {
  const story = "story" in action ? action.story : undefined;
  const file = handbackFile(sftddDir, featureId, action.role, story);
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
  sftddDir: string,
  build?: BuildLoopOpts,
): string {
  return consumeHandback(action, featureId, sftddDir) + roleTaskBody(action, featureId, uiTrack, sftddDir, build);
}

/**
 * The architect's establish-vs-inherit directive for the project's architecture
 * conventions (the canonical role -> module layout). When a prior feature already
 * established them, this feature MUST reuse the same layout (the spec gate hard-
 * blocks a divergence); otherwise this feature's layout becomes the project canon
 * (the orchestrator persists it deterministically). Empty when no conventions
 * exist (the first feature simply establishes them by building normally).
 */
function architectConventionsDirective(sftddDir: string): string {
  const conventions = readConventions(sftddDir);
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
  sftddDir: string,
  build?: BuildLoopOpts,
): string {
  // The artifact-root basename (.sftdd, or a legacy .tdd) every prompt path
  // below is built from, so what the agent is told to read/write matches the
  // dir the driver resolved. Never hardcode ".tdd/" in a prompt string.
  const root = artifactRoot(sftddDir);
  if ("mode" in action) {
    switch (action.mode) {
      case "propose":
        // Be explicit that this WRITES the artifact at a concrete path (like the
        // estimate / ux-designer directives), and that it is authored FRESH: the
        // vaguer prior wording ("...for planning (feature-proposals.md)") let the
        // Spec Author treat the file as descriptive, invent candidates in its
        // reply, write nothing, then on a re-dispatch claim it "already exists"
        // (the handoff guard then aborts on the empty artifact).
        return `Propose the sprint's candidate features for planning. WRITE the proposal to ${root}/planning/feature-proposals.md , author it FRESH from ${root}/product-overview.md + ${root}/nfrs.md (do NOT assume one already exists), one candidate feature per section, so the Architect can size them and the Product Owner can commit the backlog.${uiTrack ? UI_TRACK_PROPOSE : ""}`;
      case "estimate":
        return `Estimate each proposed candidate feature with a t-shirt size (XS/S/M/L/XL) and write planning/estimates.json, so the Product Owner can commit a backlog that fits sprint capacity.`;
      case "author-requests":
        // Unreachable: author-requests is a human-input step the Human Proxy
        // supplies (see commandsForAction); it never spawns a role agent.
        return `Provide the sprint's feature-requests.`;
      case "breakdown":
        // Be explicit that the breakdown deliverable is feature-spec.json (the
        // artifact the router + guard gate on), authored FRESH, plus the story
        // stubs , and name the ABSOLUTE root so the subagent never guesses the
        // project path. The vaguer prior wording ("break it into its stories")
        // let the Spec Author write only the stubs, then on a re-dispatch see them
        // present and claim the breakdown done, deadlocking the drive on the
        // absent feature-spec.json (same class as the propose fix above).
        return (
          `Break feature ${featureId} down into its stories. WRITE the breakdown to ${root}: ` +
          `first ${root}/features/${featureId}/feature-spec.json (id, name, status "draft", tdd_mode, ` +
          `and a NON-EMPTY stories[] array of the story ids), then a stub dir per story under ` +
          `${root}/features/${featureId}/stories/<S>/ (story.md + story.json, id + one-line scope; NO acceptance ` +
          `criteria here). feature-spec.json is REQUIRED , a prose list of stories in your reply is NOT the ` +
          `breakdown, and do NOT claim it "already exists".${uiTrack ? UI_TRACK_BREAKDOWN : ""}`
        );
    }
  }
  // UX Designer (UI track): translate the design brief into the project style
  // guide. Project-level, no story scope, so handle it before reading a story.
  if (action.role === "ux-designer") {
    return (
      `Translate the HIL design brief (${root}/design/design-brief.md) into the project design system:` +
      ` write design-guide.md (visual + interaction standards), design-guide.json (the machine-checkable` +
      ` tokens: typography, colors, spacing, radius, shadows, breakpoints), and ia.md (the information` +
      ` architecture: screens, navigation, flows). This is the project-level style guide the Navigator` +
      ` and Driver build the UI against; author it once from the brief + product-overview.md.`
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
        `Draft the acceptance criteria for story ${s} and NOTHING else.${storyStubScope(sftddDir, featureId, s)}` +
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
      const arAcIds = storyAcIds(sftddDir, featureId, s);
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
        ` test; a service_backed feature with no persistence_invariants hard-blocks the gate.${architectConventionsDirective(sftddDir)}` +
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
      const acIds = storyAcIds(sftddDir, featureId, s);
      const acScope = acIds.length
        ? ` The story's ACs are: ${acIds.join(", ")}. Map every test's ac_id to one of these EXACT ids` +
          ` (verbatim, never a bare slug or an invented id), and cover each AC at least once.`
        : "";
      // Author the FEATURE MASTER (append this story; keep other stories' items).
      // The orchestration generates the per-story + per-AC views FROM the master
      // (lakebase-sftdd-test-list), so a per-story file the role writes is
      // regenerated, author the master, not the per-story file.
      // Persistence coverage: a service-backed feature declares persistence_invariants
      // (the DB-level guarantees the schema enforces); the test-list must cover EVERY
      // one with a real-branch test tagged invariant_id, or the design gate blocks.
      // These are `fitness` tests that verify the MIGRATION realized the invariant
      // against the branch + the repository honors it , NOT the ORM's generic CRUD.
      // Best-effort: omit when there is no architecture.json yet (the gate still
      // enforces at submit time).
      let dbScope = "";
      try {
        const arch = JSON.parse(fs.readFileSync(architectureJson(sftddDir, featureId), "utf8")) as {
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
            ` repository honors it. Do NOT write a test of the ORM's generic add/commit/query round-trip , that tests the` +
            ` library, not your schema.${list}`;
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
          contextRubric(sftddDir, featureId, s, "") +
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
          ` Write your verdict to ${root}/features/${featureId}/stories/${s}/reflect-verdict.json as ` +
          `{"version":1,"passed":<bool>,"findings":[{"owner":"spec-author"|"test-strategist","detail":"<the defect>"}]}. ` +
          `passed:true with findings:[] when the spec + test-list are consistent + buildable (the common ` +
          `case, do NOT invent defects). Attribute each finding to spec-author (an AC/spec defect) or ` +
          `test-strategist (a test-list/coverage defect). Write ONLY that file; the orchestrator routes any ` +
          `fix deterministically.`
        );
      }
      if (action.buildMode === "assess") {
        // DETERMINISTIC contract-clean advisory (FEIP contract-completeness): when
        // the first GREEN-failure found production code still referencing a
        // migration-dropped column, the gate localized the exact file:line refs.
        // Inject them so the Navigator's regression fix covers them WITHOUT having
        // to re-localize (the live ceiling), while it still independently flags the
        // superseded prior tests below. Empty when no contract refs were found.
        const gfAssess = action.ac ? readGreenFailure(sftddDir, featureId, s, action.ac) : undefined;
        const contractAdvisory = gfAssess?.contractRefs
          ? `DETERMINISTIC contract-clean has ALREADY localized the production-code references to the migration-` +
            `dropped column(s) below , you do NOT need to re-find them. Record EXACTLY these as a driver-fixable` +
            ` regression via assess-regression --fix (path (b)), AND SEPARATELY flag any prior tests that assert the` +
            ` dropped column as superseded (path (a)) , a column drop needs BOTH the code fix and the test refactor` +
            ` in the same repair turn:\n${gfAssess.contractRefs}\n\n`
          : "";
        // The test-side counterpart: DETERMINISTIC pre-localization of the PRIOR
        // TESTS that reference the dropped symbol, so the Navigator flags EXACTLY
        // these as superseded (path (a)) instead of searching the test tree.
        const supersededAdvisory = gfAssess?.supersededTestRefs ? `${gfAssess.supersededTestRefs}\n\n` : "";
        return (
          contractAdvisory +
          supersededAdvisory +
          `ASSESS a failed honest-GREEN verify for AC ${action.ac} in story ${s}. The Driver made the current` +
          ` test pass, but the full-suite verify against the running app FAILED, some OTHER test(s) now fail.` +
          ` Inspect EVERY failing test (the COMPLETE set, not a sample) and decide per test:\n` +
          `(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode (the latest AC` +
          ` wins; e.g. a prior feature's test asserts an outcome this AC deliberately changes), FLAG them so the` +
          ` Driver may permissively refactor ONLY those. Scan COMPREHENSIVELY: when this AC drops, removes, or` +
          ` renames a column / field / table / endpoint, the superseded set is NOT only the tests that NAME it in a` +
          ` query/INSERT/assertion , it ALSO includes FITNESS / architecture / migration tests that assert a PROPERTY` +
          ` of the now-gone shape (migration reversibility like "after up() then down(), <col> is reconstructed",` +
          ` schema-shape checks like "<col> exists", invariants over the old column). Those are superseded too , a` +
          ` reversibility/fitness test for an obsoleted column encodes abandoned behavior. Miss one and the verify` +
          ` stays red and escalates, so list ALL of them in ONE flag-superseded call:\n` +
          `   lakebase-sftdd-cycle flag-superseded --feature ${featureId} --story ${s} --ac ${action.ac}` +
          ` --reason "<new AC + what changed>" --test <path_or_nodeid> [--test ...] --tdd-dir ${sftddDir}\n` +
          `(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior;` +
          ` the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human` +
          ` instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a` +
          ` bounded Driver repair turn):\n` +
          `   lakebase-sftdd-cycle assess-regression --feature ${featureId} --story ${s} --ac ${action.ac}` +
          ` --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"]` +
          ` --tdd-dir ${sftddDir}\n` +
          `   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing` +
          ` filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration` +
          ` then escalates carrying your diagnosis).\n` +
          `Flag ONLY tests the new AC truly supersedes; never flag a test just to make a red go away. For a` +
          ` regression, always write a diagnosis , never nothing.`
        );
      }
      if (action.buildMode === "assess-deploy") {
        // Story-level deploy-verify self-heal ASSESS: the full-feature deploy-verify
        // FAILED, and the deterministic classifier already proved these tests PASS
        // in ISOLATION , shared-state contamination (a prior test that does not own
        // its DB state, typically an absolute whole-table aggregate), not broken
        // software. Confirm the fragile set + prescribe HOW to scope each. The
        // scope set the Driver refactors is read from what you write here.
        const marker = readDeployVerifyAssessMarker(sftddDir, featureId, s);
        const failing = marker?.failing_node_ids ?? [];
        return (
          `ASSESS a failed full-feature DEPLOY-VERIFY for story ${s}. The story's own tests are green, but the` +
          ` full-feature verify against the running app FAILED on the tests below. A deterministic classifier` +
          ` RE-RAN each in ISOLATION (a fresh clean DB) and they ALL PASSED alone , so this is shared-state` +
          ` CONTAMINATION, not broken software: a test that does not OWN its DB state (typically a WHOLE-TABLE` +
          ` AGGREGATE , a COUNT/SUM integrity probe , asserting an ABSOLUTE total that holds on the isolated` +
          ` per-cycle branch but breaks once other stories' rows share the table).\n` +
          `Failing tests:\n${failing.map((n) => `  ${n}`).join("\n")}\n\n` +
          `For EACH test, prescribe HOW to make it own its state: scope BOTH the seed AND the assertion to the` +
          ` test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA, NEVER an absolute` +
          ` whole-table total. Do NOT weaken the assertion's intent , keep the invariant, just scope it.\n` +
          `Write your scope directives to ${root}/features/${featureId}/stories/${s}/deploy-verify-scope.json as` +
          ` {"version":1,"story_id":"${s}","directives":[{"node_id":"<path::test>","directive":"<how to scope it>"}]}` +
          ` , one entry per test you confirm is contamination-fragile. If (rarely) you judge the classifier wrong` +
          ` and a failure is a GENUINE regression, OMIT it from directives (write no file, or an empty directives` +
          ` array); the orchestration then raises it to a human instead of scoping. Write ONLY that file.`
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
            buildContextPack(sftddDir, featureId, s, "", { skipTestLoop: true }) +
            ` Write ONE verdict for the whole story to` +
            ` ${root}/cycles/${featureId}/${s}/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}` +
            `, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests.`
          );
        }
        return (
          `REVIEW the implementation of AC ${action.ac} in story ${s} now that its tests are green.` +
          ` Judge the diff against the context pack: layer boundaries, naming, cross-cutting concerns, the required` +
          ` NFRs, and (for UI) design-token + IA adherence.` +
          buildContextPack(sftddDir, featureId, s, action.ac ?? "", { skipTestLoop: true }) +
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
          `${nextPendingTestDirective(sftddDir, featureId, s, build?.loop, build?.cap)}${uiTrack ? uiTrackBuild(root) : ""}` +
          buildContextPack(sftddDir, featureId, s, action.ac ?? "", { skipTestLoop: true })
        );
      }
    case "driver":
      if (action.buildMode === "refactor-deploy") {
        // Story-level deploy-verify self-heal SCOPE: the Navigator confirmed a set
        // of contamination-fragile tests (they fail the full-feature verify but
        // pass in isolation) + prescribed how to scope each. Refactor EXACTLY those
        // tests to own their DB state, per the directives , do NOT touch product
        // code and do NOT weaken the invariant, just scope the seed + assertion to
        // the test's own rows (or a delta). The re-deploy re-runs the full verify.
        const scope = readDeployVerifyScope(sftddDir, featureId, s);
        const directives = scope?.directives ?? [];
        return (
          `SCOPE the contamination-fragile tests the Navigator flagged for story ${s}. Each FAILED the` +
          ` full-feature deploy-verify but PASSES in isolation , it asserts an ABSOLUTE whole-table aggregate` +
          ` (or otherwise does not own its DB state), which breaks once other stories' rows share the table.` +
          ` Refactor EACH per its directive so it OWNS its state: scope BOTH the seed AND the assertion to the` +
          ` test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA , NEVER an absolute` +
          ` whole-table total. Keep the invariant; do NOT weaken it, and do NOT change product code.\n` +
          directives.map((d) => `  ${d.node_id}\n    -> ${d.directive}`).join("\n") +
          `\nEdit ONLY those test files. The orchestrator re-deploys + re-verifies after your turn.`
        );
      }
      if (action.buildMode === "repair") {
        // A green-failure assess can produce a MIXED verdict: some prior tests
        // flagged SUPERSEDED + a genuine regression diagnosed in the rest. The
        // repair turn must then do BOTH , refactor the flagged superseded tests
        // AND apply the regression fix , in one turn, or the un-refactored
        // superseded tests keep erroring (and, on a shared session, cascade the
        // others into failure), so the honest-GREEN verify never holds and it
        // escalates. Append the supersede allowlist (empty when none was flagged).
        return regressionRepairDirective(sftddDir, featureId, s) + supersededTestsDirective(sftddDir, featureId, s);
      }
      if (action.buildMode === "refactor") {
        // story granularity (default): REFACTOR the WHOLE story in one turn per
        // the story-level review (.tdd/cycles/<F>/<S>/review.json -> refactor_notes).
        if ((build?.loop ?? "story") === "story") {
          return (
            `REFACTOR story ${s} per the Navigator's review` +
            ` (${root}/cycles/${featureId}/${s}/review.json -> refactor_notes), guided by the architecture` +
            ` (${root}/features/${featureId}/architecture.md), the NFRs (${root}/nfrs.md), + design guide (${root}/design/design-guide.md).` +
            ` If review.json has no refactor_notes, this refactor was queued by a BLOCKING build-quality gate (a layering /` +
            ` design-adherence / import-coupling smell in ${root}/smells.json): run that gate to see the violation` +
            ` (e.g. \`lakebase-sftdd-layering-clean --project-dir .\`) and fix exactly what it flags , typically extract the` +
            ` duplicated/misplaced code into one shared helper in its correct layer.` +
            ` Keep ALL the story's tests green and do not change what the outer-boundary tests check, refactor only.` +
            buildContextPack(sftddDir, featureId, s, "")
          );
        }
        return (
          `REFACTOR AC ${action.ac} in story ${s} per the Navigator's review` +
          ` (${root}/cycles/${featureId}/${s}/${action.ac}/review.json -> refactor_notes), guided by the architecture` +
          ` (${root}/features/${featureId}/architecture.md), the NFRs (${root}/nfrs.md), + design guide (${root}/design/design-guide.md).` +
          ` If review.json has no refactor_notes, this refactor was queued by a BLOCKING build-quality gate (a layering /` +
          ` design-adherence / import-coupling smell in ${root}/smells.json): run that gate to see the violation` +
          ` (e.g. \`lakebase-sftdd-layering-clean --project-dir .\`) and fix exactly what it flags , typically extract the` +
          ` duplicated/misplaced code into one shared helper in its correct layer.` +
          ` Keep ALL tests green and do not change what the outer-boundary tests check, refactor only.` +
          buildContextPack(sftddDir, featureId, s, action.ac ?? "")
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
          buildContextPack(sftddDir, featureId, s, action.ac ?? "") +
          supersededTestsDirective(sftddDir, featureId, s)
        );
      }
    default:
      return `Work story ${s}.`;
  }
}

const PIPELINE_BIN = "lakebase-sftdd-pipeline";
const EXPERIMENT_BIN = "lakebase-sftdd-experiment";
const CYCLE_BIN = "lakebase-sftdd-cycle";
const HUMAN_PROXY_BIN = "lakebase-sftdd-human-proxy";
const LOG_BIN = "lakebase-sftdd-log";
const TEST_LIST_BIN = "lakebase-sftdd-test-list";
const DEPLOY_BIN = "lakebase-sftdd-deploy";
const GATE_CONFORMANCE_BIN = "lakebase-sftdd-gate-conformance";
const CANON_NOTES_BIN = "lakebase-sftdd-canon-notes";
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
 * sftddDir after its turn (FEIP-8006), for the post-turn out-of-root guard.
 * `anyOf` are ABSOLUTE paths; the guard passes if any exists (a file, or a
 * non-empty directory for the per-story ACs). Returns null for build roles
 * (navigator/driver, verified by the ledger's per-cycle contracts) and the
 * human-input author-requests step (no LLM artifact to verify here).
 */
function designArtifactExpectation(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  sftddDir: string,
  featureId: string,
): { anyOf: string[]; label: string } | null {
  if ("mode" in action) {
    if (action.role === "spec-author" && action.mode === "propose") return { anyOf: [featureProposalsMd(sftddDir)], label: "planning/feature-proposals.md" };
    if (action.role === "architect-reviewer" && action.mode === "estimate") return { anyOf: [planningEstimatesJson(sftddDir)], label: "planning/estimates.json" };
    if (action.role === "spec-author" && action.mode === "breakdown") return { anyOf: [featureSpecJson(sftddDir, featureId)], label: "feature-spec.json" };
    return null; // author-requests = human input, no role artifact
  }
  if (action.role === "ux-designer") return { anyOf: [designGuideJson(sftddDir)], label: "design/design-guide.json" };
  const s = action.story;
  if (!s) return null;
  if (action.role === "spec-author") return { anyOf: [acsDir(sftddDir, featureId, s)], label: `stories/${s}/acs/*.json` };
  if (action.role === "architect-reviewer") return { anyOf: [architectureJson(sftddDir, featureId)], label: "architecture.json" };
  if (action.role === "test-strategist") return { anyOf: [featureTestListJson(sftddDir, featureId)], label: "test-list.json" };
  return null; // navigator/driver build turns: not a design artifact
}

export function commandsForAction(action: WorkflowAction, cfg: DriveEffectsConfig): DriveCommand[] {
  const f = cfg.featureId;
  const tdd = ["--feature", f, "--tdd-dir", cfg.sftddDir];
  const approver = cfg.approver ?? "human-proxy";
  const deployTarget = cfg.deployTarget ?? "local";

  switch (action.kind) {
    case "invoke-role": {
      // author-requests is a HUMAN-INPUT step, not an agent task: the state
      // machine asks for the PO's feature-request.md per committed feature. The
      // machine is identical for a human and the proxy, interactive, the driver
      // stops here and the human provides them (directly or via the agents);
      // headless, the Human Proxy supplies the recorded answers WHEN ASKED (and
      // logs each). Then sync-backlog (the one writer) projects backlog.json from
      // exactly what was supplied. No LLM is spawned to invent the requests.
      if ("mode" in action && action.role === "product-owner" && action.mode === "author-requests") {
        return [
          { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["supply-requests", "--tdd-dir", cfg.sftddDir, "--approver", approver, "--sprint", cfg.sprintName ?? "sprint"] },
          { kind: "sync-backlog", sprint: cfg.sprintName ?? "sprint" },
        ];
      }
      // DETERMINISTIC propose (capture/replay): when the sprint's feature-requests
      // are recorded, project feature-proposals.md from them via the Human Proxy
      // instead of spawning the Spec Author LLM. An LLM propose can write nothing
      // and then, on the re-dispatch, claim the file "already exists" , the handoff
      // guard then aborts on the empty artifact. Interactive users (no recorded
      // requests) still get the live LLM propose below.
      if (cfg.recordedRequests && "mode" in action && action.role === "spec-author" && action.mode === "propose") {
        return [
          {
            kind: "cli",
            bin: HUMAN_PROXY_BIN,
            args: ["supply-proposals", "--tdd-dir", cfg.sftddDir, ...(cfg.uiTrack ? ["--ui"] : [])],
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
      // Per-role + per-turn `--effort` (unified config). Derive the build turn from
      // the action: navigator review|red, driver refactor|green; design roles have
      // no turn (scalar effort). When `effortForTurn` is provided (sftdd-config.json)
      // it governs EVERY turn; absent, fall back to the review-only `reviewEffort`
      // (P6 default low on the navigator REVIEW, model-default elsewhere).
      const buildTurn: "red" | "green" | "review" | "refactor" | undefined =
        "buildMode" in action && action.buildMode === "reflect"
          ? // reflect is a DESIGN-lane critique, not a build turn: no per-turn
            // effort/model override (it runs on the navigator's base model, the
            // different-model critic), so it maps to no build turn.
            undefined
          : "buildMode" in action && action.buildMode === "review"
            ? "review"
            : "buildMode" in action && (action.buildMode === "refactor" || action.buildMode === "refactor-deploy")
              ? "refactor"
              : action.role === "navigator"
                ? "red"
                : action.role === "driver"
                  ? "green"
                  : undefined;
      const isReviewTurn = action.role === "navigator" && buildTurn === "review";
      const effort = cfg.effortForTurn
        ? cfg.effortForTurn(action.role, buildTurn)
        : isReviewTurn
          ? cfg.reviewEffort ?? "low"
          : "";
      const fallbackModel = cfg.fallbackModelForRole?.(action.role);
      const maxBudgetUsd = cfg.maxBudgetUsdForRole?.(action.role);
      // Per-story granularity: a contract/cleanup story (drop column / remove
      // endpoint / rename) auto-drops to the finest `ac` loop, since its lockstep
      // DB+code change is too heavy for one story-level GREEN turn. This must reach
      // the PROMPT (the RED/GREEN/REFACTOR task text) AND the cycle CLI loop flag,
      // not only the routing in deriveDriveState; otherwise the driver is told to
      // "make ALL of the story GREEN in one pass" while the substrate stamps per-AC.
      const storyLoop: "ac" | "hybrid-a" | "story" | undefined =
        "story" in action ? effectiveLoopForStory(cfg.loopGranularity ?? "story", action.story) : cfg.loopGranularity;
      const claude: DriveCommand = {
        kind: "claude",
        role: action.role,
        model: cfg.modelForTurn ? cfg.modelForTurn(action.role, buildTurn) : cfg.modelForRole(action.role),
        ...(resumeKey !== undefined ? { resumeKey } : {}),
        ...(effort && effort !== "default" ? { effort } : {}),
        ...(fallbackModel ? { fallbackModel } : {}),
        ...(typeof maxBudgetUsd === "number" ? { maxBudgetUsd } : {}),
        task:
          roleTask(action, f, cfg.uiTrack ?? false, cfg.sftddDir, {
            loop: storyLoop,
            cap: cfg.batchCap,
          }) + AGENT_TERSE_SUFFIX,
        replay: {
          mode: "mode" in action ? action.mode : undefined,
          // The build turn's mode (reflect / review / refactor / assess / repair),
          // distinct from the design-lane `mode` above. The replay path needs it to
          // recognise the reflect turn (whose recorded output is a .sftdd design
          // artifact the code-only build restore filters out).
          buildMode: "buildMode" in action ? action.buildMode : undefined,
          story: "story" in action ? action.story : undefined,
        },
      };
      const cmds: DriveCommand[] = [claude];
      // Post-turn out-of-root guard (FEIP-8006): assert the role wrote its
      // artifact under the project's sftddDir BEFORE any effect below consumes it,
      // so a stray write (agent resolved the project root wrong) fails loud +
      // attributed here instead of as a cryptic downstream crash. Harmless in
      // replay: replayDesignTurn already copied the artifact, so the guard passes.
      const expectArtifact = designArtifactExpectation(action, cfg.sftddDir, f);
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
        cmds.push({ kind: "cli", bin: TEST_LIST_BIN, args: [cfg.sftddDir, f, action.story] });
      }
      // Cycle recording is an ORCHESTRATION concern, not the role's: the
      // Navigator/Driver are pure (write the failing test / write the code +
      // run the project's tests) and never touch git or the cycle artifacts.
      // After the Navigator writes the next test, stamp the RED cycle; after
      // the Driver makes it pass, record the run + stamp GREEN. Code-emitting
      // this (vs the agent hand-writing cycle-NNN.json) is what keeps the
      // probe's red_at/green_at reading in lockstep with what was produced ,
      // the drift that stalled the live smoke.
      if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "reflect") {
        // After the Navigator's reflect turn writes its verdict, the DETERMINISTIC
        // reflect gate reads it and, on a failed verdict, flags the spec-level
        // blocking smell for the owning author (scoped to the story). The existing
        // revise-route/escalation machinery then routes + bounds + escalates. A
        // passed verdict flags nothing and the design lane advances to the gate.
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: ["reflect-gate", "--feature", f, "--story", action.story, "--tdd-dir", cfg.sftddDir] });
      } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess") {
        // After the Navigator assesses a failed GREEN verify, finalize it: mark
        // the green-failure assessed + (if the Navigator did NOT flag-supersede)
        // record the genuine-regression escalation. Whether a flag was made is
        // read from disk (superseded-tests.json), so the verdict is the role's.
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: ["assess-green", "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.sftddDir] });
      } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess-deploy") {
        // After the Navigator's story-level deploy-verify ASSESS turn, finalize it:
        // read its scope directives (deploy-verify-scope.json) and either record the
        // contamination-fragile scope set on the marker (routes the Driver SCOPE
        // turn) or , when it wrote none (its veto) , mark the one shot spent + write
        // the terminal deploy-verify escalation (raise-to-hil). The verdict is the
        // role's (read from disk); the finalize is deterministic.
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: ["assess-deploy-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.sftddDir] });
      } else if (!("mode" in action) && action.role === "navigator") {
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        const verb = "buildMode" in action && action.buildMode === "review" ? "review" : "begin";
        // Pass the loop granularity so the substrate scopes the turn:
        //  - story (default): `begin` writes ONE batch RED for the whole story;
        //    `review` reviews the WHOLE story (story-level review.json, no --ac).
        //  - hybrid-a: `begin` writes a capped layer-batch; review stays per-AC.
        //  - ac: one RED per test; review per-AC.
        const loop = storyLoop ?? "story";
        const loopFlag =
          loop === "story"
            ? ["--loop", "story"]
            : verb === "begin" && loop === "hybrid-a"
              ? ["--loop", "hybrid-a", ...(cfg.batchCap ? ["--batch-cap", String(cfg.batchCap)] : [])]
              : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.sftddDir, ...loopFlag] });
      }
      if (!("mode" in action) && action.role === "driver" && "buildMode" in action && action.buildMode === "refactor-deploy") {
        // The Driver's story-level deploy-verify SCOPE turn edited ONLY the flagged
        // tests (no open cycle, no product code, no test/green stamp). Finalize by
        // marking the scope done so the marker is no longer refactor-pending; the
        // transition then falls through to the one re-deploy + re-verify (which
        // clears the marker on pass, or writes the terminal escalation on a repeat
        // failure , the one-shot bound). Emitted INSTEAD of a green/refactor cycle.
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: ["refactor-deploy-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.sftddDir] });
      } else if (!("mode" in action) && action.role === "driver") {
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        const isRepair = "buildMode" in action && action.buildMode === "repair";
        const verb = "buildMode" in action && action.buildMode === "refactor" ? "refactor" : "green";
        // A repair turn re-verifies via GREEN, but with --repair so the substrate
        // consumes the one repair attempt (a still-failing verify then escalates
        // with the Navigator's diagnosis instead of routing another repair).
        const repairFlag = isRepair ? ["--repair"] : [];
        // story granularity: a REFACTOR turn refactors the WHOLE story
        // (refactorStory, no --ac). GREEN/repair are unaffected by --loop.
        const loopFlag = verb === "refactor" && (storyLoop ?? "story") === "story" ? ["--loop", "story"] : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.sftddDir, ...repairFlag, ...loopFlag] });
      }
      // Code-emit artifact.written for whatever the role just wrote: reconcile
      // reads the artifacts on disk and logs any not already in the agent log,
      // so observability never depends on the role's model emitting it. Skipped
      // for the sprint-scoped planning modes (propose / estimate), which write no
      // feature artifacts to reconcile. (author-requests returned earlier.)
      const isPlanningMode = "mode" in action && (action.mode === "propose" || action.mode === "estimate");
      if (f && !isPlanningMode) cmds.push({ kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] });
      return cmds;
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
            cfg.sftddDir,
            // A re-cut after a discarded experiment re-forks the stale paired branch
            // clean (Finding 27); a first cut omits it (nothing to reset).
            ...(action.resetStaleBranch ? ["--reset-stale-branch"] : []),
          ],
        },
      ];

    case "await-acceptance": {
      // The deploy gate runs DETERMINISTICALLY here: `lakebase-sftdd-deploy --gate`
      // starts the app on the story's experiment branch, polls reachable, runs the
      // project verify (by default on a disposable child branch , isolated), and
      // writes the STORY-scoped deploy-evidence the acceptance gate reads. The CLI
      // is SYNCHRONOUS (execSync through the verify + evidence write) and soft-fails
      // (exit 0) on a real failure, recording honest evidence + an escalation that
      // the next readState routes to a raise-to-hil halt. We run it as a CLI effect
      // rather than via a spawned Release Engineer agent: the deploy IS the
      // deterministic substrate, not the model's word, and a live agent could
      // background the long (ephemeral-isolated) verify and end its turn before the
      // evidence was written , stalling await-acceptance. The logging layer still
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
            "--project-dir", cfg.projectDir, "--tdd-dir", cfg.sftddDir, "--gate",
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

    case "approve-plan-gate":
      // HITL sprint plan gate: the Human Proxy approves it headless (teeth:
      // feature-proposals.md must exist + conform). Sprint-scoped, mirroring the
      // per-story spec gate's approve verb.
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "plan", "--approver", approver, "--tdd-dir", cfg.sftddDir],
        },
      ];

    case "planning-complete":
      return [{ kind: "set-phase", phase: "discovery" }];

    case "feature-complete":
      // Feature-design-complete conformance gate (deterministic backstop): once
      // EVERY story is designed + gated, the WHOLE feature's artifacts must
      // conform , all Required NFRs covered, layers declared, and every declared
      // persistence_invariant + a fitness guard covered across the merged
      // test-list , before the feature deploys. The per-story reflect gate catches
      // per-story design defects; this catches feature-wide coverage a single
      // story cannot see (e.g. an invariant no story's test covers). It enforces
      // on the advance for ANY approver; a non-zero exit halts the drive.
      return [
        { kind: "cli", bin: GATE_CONFORMANCE_BIN, args: ["--feature", f, "--tdd-dir", cfg.sftddDir] },
        { kind: "set-phase", phase: "deploy" },
      ];

    case "deploy":
      // Ship the merged feature, deterministically (same contract as the per-story
      // gate deploy above): the orchestration runs `lakebase-sftdd-deploy --gate`
      // for the feature (ambient feature-branch DB; no --story/--lakebase-branch),
      // which polls reachable, runs the feature verify, and writes the FEATURE-
      // scoped deploy-evidence the deploy gate reads. A failed/foreign deploy is
      // recorded as evidence + an escalation -> raise-to-hil, not an LLM claiming
      // success. (For remote targets, `lakebase-sftdd-deploy` refuses cleanly until
      // they land; that refusal surfaces as the escalation.) Teardown first.
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "cli",
          bin: DEPLOY_BIN,
          args: ["--target", deployTarget, "--feature", f, "--project-dir", cfg.projectDir, "--tdd-dir", cfg.sftddDir, "--gate"],
        },
      ];

    case "approve-deploy-gate":
      return [
        { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["--feature", f, "--gate", "deploy", "--approver", approver, "--tdd-dir", cfg.sftddDir] },
      ];

    case "deploy-complete":
      // Local working-software check done -> enter the promote phase (PR review +
      // merge of the feature up to its parent tier).
      return [{ kind: "set-phase", phase: "promote" }];

    case "prepare-pr":
      // PR review step 1: push the feature branch + open the PR (SCM
      // feature-claimed -> pr-ready). The SCM CLIs operate on the SCM ladder in
      // .lakebase/workflow-state.json, so they take --project-dir, not the feature.
      return [{ kind: "cli", bin: SCM_PREPARE_PR_BIN, args: ["--project-dir", cfg.projectDir] }];

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
          args: ["--feature", f, "--gate", "promote", "--approver", approver, "--tdd-dir", cfg.sftddDir, "--promote-ref", promoteRef],
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
      // Feature wrap-up: switch the working tree back to the PARENT TIER as the
      // last step, so the run does not end on the just-merged (soon-deleted)
      // feature branch and the next feature forks from a clean parent. scm-merge
      // already attempts this on a clean merge, but only conditionally + it can be
      // skipped when the merge step warns/errors; this is the deterministic,
      // idempotent guarantee (a checkout to the branch you are already on is a
      // no-op). Only when the parent is known (SCM state present).
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
          ? [{ kind: "cli" as const, bin: "git", args: ["checkout", "-f", cfg.parentBranch] }]
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
            cfg.sftddDir,
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
 * without executing anything. Backs `lakebase-sftdd-drive --dry-run` ("what will
 * the driver do next?") and is the testable core of that CLI path.
 */
export async function planNextAction(
  cfg: DriveEffectsConfig,
  transition: (state: import("./orchestrator-drive.js").DriveState) => WorkflowAction = nextTransition,
): Promise<{ action: WorkflowAction; commands: DriveCommand[] }> {
  const state = await buildDriveEffects(cfg).readState();
  const action = transition(state);
  return { action, commands: commandsForAction(action, cfg) };
}

/**
 * Read the feature's DriveState from disk (pipeline + artifact probe + context +
 * UI-track gating). The read-only half of buildDriveEffects.readState, extracted
 * so the strictly read-only consumers (lakebase-sftdd-next, the drive's next.json
 * auto-emit) get the EXACT same state the drive acts on without constructing a
 * full DriveEffectsConfig or importing the drive CLI (FEIP-8017).
 */
export function readDriveStateFromDisk(
  sftddDir: string,
  featureId: string,
  projectDir: string,
  opts: { uiTrack?: boolean } = {},
): import("./orchestrator-drive.js").DriveState {
  const pipeline = readPipeline(sftddDir, featureId);
  // Thread the active build story so a smell-derived escalation with no story
  // scope still resolves to a story for revise-routing.
  const probe = diskArtifactProbe(sftddDir, featureId, pipeline.build_active);
  const ctx = readDriveContext(sftddDir, featureId, projectDir);
  const state = deriveDriveState(pipeline, probe, ctx);
  // UI track: gate the UX Designer step. uiTrack is config (env); the design
  // guide's existence is disk truth (project-level, authored once + reused).
  state.uiTrack = opts.uiTrack ?? false;
  // The guide is "ready" only when it EXISTS and CONFORMS to its schema, not
  // merely exists. Otherwise a non-conformant design-guide.json (the UX
  // Designer drifting on shape) sails through the design lane and only
  // surfaces at the final feature drain; gating on conformance keeps the UX
  // Designer pending until the guide is well-formed. Same check the role's
  // own response-formatter self-check runs, so gate + self-check agree.
  state.designGuideReady = designGuideConformance(sftddDir).ok;
  return state;
}

/** Build a DriveEffects bound to a project: readState from disk, perform via
 *  commandsForAction + the injected runner. */
export function buildDriveEffects(cfg: DriveEffectsConfig): DriveEffects {
  return {
    async readState() {
      return readDriveStateFromDisk(cfg.sftddDir, cfg.featureId, cfg.projectDir, { uiTrack: cfg.uiTrack });
    },
    async perform(action) {
      for (const cmd of commandsForAction(action, cfg)) {
        await cfg.runner.run(cmd);
      }
    },
    onAction: cfg.onAction,
    // Hand-back delivery: when a role's prior turn failed its expectation
    // contract, write the violation detail where THAT role's next prompt will
    // consume it (consumeHandback in roleTask), so the retry is informed.
    onHandback(handoff, detail) {
      const file = handbackFile(cfg.sftddDir, cfg.featureId, handoff.responder, handoff.story);
      try {
        fs.mkdirSync(dirname(file), { recursive: true });
        fs.writeFileSync(file, `${detail}\n`, "utf8");
      } catch {
        /* best-effort: a failed hand-back just yields a blind retry, still bounded by the queue */
      }
    },
  };
}
