// executor-dispatch: the DRIVE's executor-dispatch machinery (Stage 2, #578) – the seam that lets
// the LIVE runDriver loop route selected agent turns THROUGH the StepExecutor's Template Method
// instead of `effects.perform` -> commandsForAction -> runner. Extracted out of the 2000-line
// orchestrator-effects.ts into its own cohesive family module (the "every seam in a function-family
// module" migration metric), re-imported by buildDriveEffects.performViaExecutor.
//
// Dependency-injected (no runtime import of orchestrator-effects, so no import cycle): the caller
// supplies the command-derivation primitives it already owns in that module – buildCycleCommand
// (the ONE shared cycle-CLI derivation), readDriveStateFromDisk (fresh post-turn state), the bin
// tokens, and LOG_BIN. Everything else is this family's own (Step, the unified ClaudeStepAgent on
// its live-dispatch seam, execute) or the manifest registry.
//
// Two turn shapes flow through here today (each added to executorDispatched one at a time, each
// with its byte-identical golden):
//   - spec-author breakdown (DESIGN): single-shot, feature-scoped inputs, artifact-channel output,
//     pre-turn reset-breakdown + post-turn sync-breakdown.
//   - navigator RED (BUILD, LEAN – no cloud): story-scoped inputs, PRODUCT-channel output (the real
//     tests/ tree at the project root), post-turn `@build-cycle` (the RED cycle stamp).

import * as fs from "node:fs";
import { join, relative } from "node:path";
import {
  storyResolved,
  cycleDir,
  featureSpecJson,
  architectureJson,
  dbDesignJson,
  featureTestListJson,
  designGuideJson,
  acsDir,
  featureProposalsMd,
  planningEstimatesJson,
} from "../../config/consort-paths.js";
import { manifestForAction, type StepManifest } from "../steps/manifest.js";
import { execute, type StepExecutorDeps } from "../turns/step-executor.js";
import { Step } from "../steps/step.js";
import { buildAgent, type AgentSpec } from "../agents/agent-catalogue.js";
import { wrapWithRecorder } from "../agents/replay-recorder-wrapper.js";
import { isBuildTurn, lastSyncedBuildTurnIndex } from "../agents/mock-replay-agent.js";
import { assertReplayBuildVerdictMatch } from "../../logging/replay-build.js";
import { consortEnv } from "../../config/consort-env.js";
import { productDirForLanguage, projectLanguage } from "../../config/consort-config-file.js";
import type { WorkflowAction, DriveState } from "./orchestrator-drive.js";
import type { BoundedRoute, ValidateBoundDeps } from "../steps/step-contract.js";
// Types only (erased at compile) – so this module never imports orchestrator-effects at runtime.
import type { DriveCommand, DriveEffectsConfig } from "./orchestrator-effects.js";

/** The command-derivation primitives orchestrator-effects owns, injected so this family module
 *  reuses the SINGLE source of each (no second copy) without a runtime import cycle. */
export interface ExecutorDispatchDeps {
  /** The ONE shared cycle-CLI derivation (reflect-gate / begin / green / …), reused for the
   *  `@build-cycle` post-turn marker so the executor stamps the IDENTICAL cycle the legacy path did. */
  buildCycleCommand(action: Extract<WorkflowAction, { kind: "invoke-role" }>, cfg: DriveEffectsConfig): DriveCommand | undefined;
  /** The `claude` command ENVELOPE built around a GIVEN task body (handback + body + suffixes +
   *  levers), injected so the UNCONTAINED live dispatch seam wraps the EXECUTOR-ASSEMBLED prompt
   *  (base directive + declared preconditions re-injected in position) – the A-full switch that
   *  makes the formal precondition face the ONE injector on the live path while staying byte-
   *  identical to the legacy inline spawn. Injected (not imported) so this family module stays free
   *  of a runtime orchestrator-effects edge (the acyclic-DI discipline the whole module is built on). */
  buildClaudeCommandWithBody(action: Extract<WorkflowAction, { kind: "invoke-role" }>, cfg: DriveEffectsConfig, body: string): DriveCommand;
  /** The role's TASK BODY with the given precondition KINDS omitted (the executor re-injects the
   *  DECLARED ones via phase 2.5). The executor path uses this as the step's base instruction
   *  prompt; a turn that declares no preconditions gets the full inline body (omit=∅), byte-
   *  identical to legacy. */
  buildTaskBody(action: Extract<WorkflowAction, { kind: "invoke-role" }>, cfg: DriveEffectsConfig, omit?: ReadonlySet<string>): string;
  /** Resolve a precondition KIND to its preparer (the registry), so phase 2.5 projects the declared
   *  context block. Injected so this module has no static preparer-registry edge. */
  preparerFor(kind: string): (ctx: { consortDir: string; featureId: string; story: string; ac: string; projectDir?: string; options?: Record<string, unknown> }) => string;
  /** Re-read the drive state FRESH from disk (post-turn), for the state-derived route authority. */
  readDriveStateFromDisk(consortDir: string, featureId: string, projectDir: string, opts: { uiTrack?: boolean }): DriveState;
  /** Symbolic bin token -> resolved CLI bin (PIPELINE_BIN, CYCLE_BIN, …), the same map
   *  commandsFromManifest uses. */
  binTokens: Record<string, string>;
  /** The agent-log reconcile bin (materializes the meta agent-log before validate). */
  logBin: string;
}

/** The invoke-role actions the live drive dispatches THROUGH the StepExecutor. Every action whose
 *  shipped manifest declares outputs (so the executor's validate + channel-placement phases have
 *  something to do) is dispatched here; the pure build turns with NO declared outputs
 *  (review/reflect/assess/refactor/repair/superseded/deploy – verified by @build-cycle records, not
 *  a static artifact) fall through to commandsForAction. The set:
 *   DESIGN LANE (artifact + meta channels, LEAN – no cloud):
 *     - spec-author breakdown | propose | per-story ACs
 *     - architect-reviewer (architecture) | architect estimate (planning/estimates)
 *     - dba (db-design) | test-strategist (test-list) | ux-designer (design-guide)
 *   BUILD LANE (product + meta channels):
 *     - navigator RED (LEAN – authors tests/) | driver GREEN (cloud-gated – honest-GREEN verify).
 *  All dispatch through the SAME role-agnostic performTurnViaExecutor; the only per-role knobs are
 *  this gate + outputPathsForAction's channel-relative path per output. */
export function executorDispatched(action: WorkflowAction): boolean {
  if (action.kind !== "invoke-role") return false;

  // ── DESIGN LANE ────────────────────────────────────────────────────────────────────────────
  if ("mode" in action) {
    // spec-author breakdown | propose; architect estimate (NOT estimate-committed – that re-syncs
    // the backlog via a separate legacy branch with no shipped manifest).
    if (action.role === "spec-author" && (action.mode === "breakdown" || action.mode === "propose")) return true;
    if (action.role === "architect-reviewer" && action.mode === "estimate") return true;
    // product-owner intake: the metered PO turn that DRAFTS the intake docs (product-overview / nfrs
    // / design-brief) from the human's gathered answers – tracked via turn.usage, model-configurable
    // via its manifest agentOptions + roles.product-owner. Planning mode (no reconcile).
    if (action.role === "product-owner" && action.mode === "intake") return true;
    // product-owner author-requests: the metered PO turn that AUTHORS a feature-request.md per
    // COMMITTED feature (from the intake + proposals), MIRRORING intake — tracked via turn.usage,
    // model-configurable via its manifest agentOptions + roles.product-owner. A recorded seed already
    // copied at the backlog gate is skipped (byte-identical replay: requestsAuthored is already true,
    // so the turn never fires); only ABSENT (live) requests are authored. Planning mode (no reconcile).
    if (action.role === "product-owner" && action.mode === "author-requests") return true;
    return false; // estimate-committed + any other mode: legacy path.
  }
  // The per-story / feature design turns carry NO mode and NO buildMode. Distinguish them from the
  // build turns (navigator/driver) by role.
  if (!("buildMode" in action)) {
    // spec-author per-story ACs + architect-reviewer per-story + test-strategist: story-scoped.
    if ((action.role === "spec-author" || action.role === "architect-reviewer" || action.role === "test-strategist") && "story" in action && !!action.story) {
      return true;
    }
    // dba is story-scoped in the per-story lane; ux-designer is feature-scoped (no story). Both have
    // a shipped manifest with an artifact output.
    if (action.role === "dba" && "story" in action && !!action.story) return true;
    if (action.role === "ux-designer") return true;
    // ── BUILD LANE ─────────────────────────────────────────────────────────────────────────────
    // navigator RED + driver GREEN: the plain story turn (no mode/buildMode, carries a story) ,
    // exactly what nextBuildAction emits for `!testsWritten` / `!codeWritten`. RED runs lean; GREEN's
    // post-turn @build-cycle honest-GREEN verify needs a live Lakebase branch (cloud-gated proof),
    // but the dispatch path is identical.
    if ((action.role === "navigator" || action.role === "driver") && "story" in action && !!action.story) {
      return true;
    }
    return false;
  }
  // ── BUILD SELF-HEAL LANE (turns carrying a buildMode) ────────────────────────────────────────
  if ("story" in action && !!action.story && "buildMode" in action) {
    // The navigator ASSESS turns (assess / assess-deploy / assess-refactor): judgment turns verified
    // by their @build-cycle record + state-derived route (NO static artifact output), the first
    // consumers of the optional-output + no-required-primary contract. assess also declares the
    // green-failure-advisory as a PREPEND precondition (re-injected by phase 2.5). All lean (no cloud).
    if (action.role === "navigator" && (action.buildMode === "assess" || action.buildMode === "assess-deploy" || action.buildMode === "assess-refactor")) {
      return true;
    }
    // The navigator REVIEW + driver REFACTOR/REPAIR self-heal turns: also verified by their
    // @build-cycle record (no static artifact). REFACTOR declares the context-pack APPEND
    // precondition (re-injected by phase 2.5); REVIEW's pack is interpolated mid-directive (stays
    // inline, byte-identical via omit=∅) and REPAIR carries no pack. REVIEW is lean; REFACTOR +
    // REPAIR edit code + their @build-cycle verify needs a live branch (cloud-gated).
    if (action.role === "navigator" && action.buildMode === "review") return true;
    if (action.role === "driver" && (action.buildMode === "refactor" || action.buildMode === "repair")) return true;
    // ── THE TAIL (Stage I): reflect + the deploy/superseded driver variants ────────────────────
    // navigator REFLECT (design-gate turn: contextRubric inline, no pack precondition) and the
    // driver DEPLOY/SUPERSEDED variants (they read their marker as a declared INPUT + interpolate
    // it inline, so no clean precondition to extract – the pack/marker stays inline, byte-identical
    // via omit=∅). All are no-output turns verified by their @build-cycle record + state-derived
    // route. reflect is lean; the driver variants edit tests/code so their verify is cloud-gated.
    if (action.role === "navigator" && action.buildMode === "reflect") return true;
    if (action.role === "driver" && (action.buildMode === "refactor-deploy" || action.buildMode === "refactor-superseded" || action.buildMode === "green-superseded")) return true;
  }
  return false;
}

/**
 * The SANCTIONED deterministic, agent-LESS invoke-role actions – the ones that legitimately do NOT
 * go through the agent executor because no LLM runs for them:
 *   - architect-reviewer `estimate-committed` : re-runs the estimate then does a deterministic
 *     sync-backlog to stamp the committed F-keyed sizes (the distinguishing work is the sync).
 * (product-owner `author-requests` is NO LONGER here: it is now a METERED executor-dispatched PO
 * turn that authors each committed feature-request.md — see executorDispatched. The recorded-seed
 * COPY still runs deterministically at the backlog gate, so replay never fires the turn.)
 * These are handled deterministically by `commandsForAction` – NOT a defect, NOT an agent turn on a
 * legacy path. This allowlist is what lets `assertNotStrandedAgentTurn` tell an INTENTIONAL
 * deterministic action apart from a real agent turn that wrongly escaped the executor. The
 * transcript/replay-set recorder concerns do not apply (nothing spawns).
 *
 * NOTE (deprecation, #684): the goal is to fold these into a first-class deterministic-action path
 * (`extract deterministicCommandsForAction`), retiring the broad `commandsForAction` agent arm. Until
 * then they stay named here so the runtime guard has an explicit sanctioned set.
 */
export function deterministicAgentless(action: WorkflowAction): boolean {
  if (action.kind !== "invoke-role" || !("mode" in action)) return false;
  if (action.role === "architect-reviewer" && action.mode === "estimate-committed") return true;
  return false;
}

/**
 * The sprint-scoped PLANNING modes. They write no per-feature agent-log to reconcile and declare no
 * agent-log output, so reconcile/agent-log is SKIPPED for them (the executor's materializeOutputs +
 * the legacy commandsForAction path guard on the SAME predicate, keeping the two byte-parallel).
 * `intake` is a planning mode too: the Product Owner's project-level intake docs (product-overview /
 * nfrs / design-brief) are authored once at the .consort root, with no per-feature agent-log.
 * `author-requests` likewise: the PO authors the sprint's feature-request.md files (sprint-scoped,
 * no per-feature agent-log to reconcile), so it skips reconcile like the other planning turns. This
 * is the ONE definition; every site imports it (no drifting copies).
 */
export function isPlanningMode(action: WorkflowAction): boolean {
  return (
    action.kind === "invoke-role" &&
    "mode" in action &&
    (action.mode === "propose" ||
      action.mode === "estimate" ||
      action.mode === "estimate-committed" ||
      action.mode === "intake" ||
      action.mode === "author-requests")
  );
}

/**
 * HARD-STOP GUARD (#732): a live drive must never run an AGENT turn on the legacy (non-executor)
 * path. Every invoke-role action is EITHER executor-dispatched (an agent turn through the
 * StepExecutor) OR a sanctioned deterministic-agentless action (author-requests / estimate-committed,
 * no LLM). Anything else – an invoke-role action that is neither – is a real agent turn that escaped
 * the executor (a coverage gap, a bad env override forcing legacy, an un-migrated role): it would
 * silently run through commandsForAction with NONE of the executor's recording/validation/contract.
 * That is exactly the class of silent corruption this project is eliminating, so we THROW LOUD
 * rather than let it run. Non-invoke-role actions (gates, dispatch, cut-experiment, phase
 * transitions, set-phase) are deterministic drive actions and are never subject to this.
 */
export function assertNotStrandedAgentTurn(action: WorkflowAction): void {
  if (action.kind !== "invoke-role") return;
  if (executorDispatched(action) || deterministicAgentless(action)) return;
  throw new Error(
    `LEGACY AGENT-PATH GUARD: invoke-role action ${JSON.stringify(action)} is neither executor-` +
      `dispatched nor a sanctioned deterministic-agentless action (estimate-committed). A real agent ` +
      `turn must NEVER run on the legacy commandsForAction path – it would ` +
      `skip the executor's recording, output validation, and routing contract (silent corruption). ` +
      `Fix: add it to the executor allowlist (executorDispatched) with a shipped manifest, or – if it ` +
      `is genuinely agent-less – to deterministicAgentless. Do NOT run it on legacy. (Likely cause: a ` +
      `coverage gap, or LAKEBASE_CONSORT_USE_MANIFEST_STEPS forcing the legacy path.)`,
  );
}

/**
 * Expand a manifest's postTurn entries for a `when` phase into DriveCommands. Resolves the bin token
 * + the `--tdd` / {feature}/{story}/{tddDir} placeholders (the SAME substitution commandsFromManifest
 * uses) AND the `@build-cycle` marker (delegated to the shared buildCycleCommand, so a navigator/
 * driver build turn stamps the IDENTICAL cycle CLI the legacy path did). Without resolving the
 * marker, a RED turn would run no cycle stamp -> testsWritten never flips -> the loop re-proposes
 * RED and stalls (the fresh-state bug class).
 */
export function manifestPostTurnCommands(
  manifest: StepManifest,
  when: "before" | "after",
  action: WorkflowAction,
  cfg: DriveEffectsConfig,
  deps: ExecutorDispatchDeps,
): DriveCommand[] {
  const tdd = ["--feature", cfg.featureId, "--tdd-dir", cfg.consortDir];
  const resolveBin = (t: string): string => deps.binTokens[t] ?? t;
  const story = "story" in action && typeof action.story === "string" ? action.story : undefined;
  const expand = (args: string[]): string[] =>
    args.flatMap((a) =>
      a === "--tdd" ? tdd : a === "{feature}" ? [cfg.featureId] : a === "{tddDir}" ? [cfg.consortDir] : a === "{projectRoot}" ? [cfg.projectDir] : a === "{story}" ? (story ? [story] : []) : [a],
    );
  const out: DriveCommand[] = [];
  for (const p of manifest.postTurn ?? []) {
    if ((p.when ?? "after") !== when) continue;
    if (p.bin === "@build-cycle") {
      // The build turn's cycle CLI (RED stamp / assess / refactor-verify), args are DYNAMIC so they
      // can't be a static manifest arg array – delegate to the shared derivation.
      if (action.kind === "invoke-role") {
        const cycle = deps.buildCycleCommand(action, cfg);
        if (cycle) out.push(cycle);
      }
      continue;
    }
    if (p.bin === "@sync-backlog") {
      // The PO author-requests turn's post-turn projection: re-project backlog.json from the
      // just-authored feature-request.md files (the ONE writer). Enacted in-process by the runner
      // (a `sync-backlog` DriveCommand, not a spawned CLI), byte-parallel to the legacy path's
      // post-turn sync-backlog. Needs the sprint name; a turn with no sprint scope is a no-op.
      if (cfg.sprintName) out.push({ kind: "sync-backlog", sprint: cfg.sprintName });
      continue;
    }
    out.push({ kind: "cli", bin: resolveBin(p.bin), args: expand(p.args) });
  }
  return out;
}

/** The on-disk locations the executor validates a dispatched turn's outputs at – resolved in each
 *  output's channel root (product -> workspaceDir, meta/artifact -> a workspace-relative path). The
 *  same nested paths the legacy designArtifactExpectation + cycle/agent-log writers use.
 *
 *  Every ARTIFACT-channel path is derived from the SAME consort-paths.ts helper the legacy
 *  designArtifactExpectation uses, made CHANNEL-RELATIVE via `relative(consortDir, helper(...))`, so
 *  it is byte-identical to legacy AND slug-dir-safe (features/<F> and stories/<S> may be `<id>` or
 *  `<id>-<slug>` – the helper resolves the real dir; a hardcoded `features/<F>/...` would miss a slug
 *  dir a design role READS). The META agent-log is always bare `agent-log.jsonl` (reconcile writes
 *  it at <consortDir>/agent-log.jsonl). PRODUCT paths (tests/, app/) are project-root-relative. */
/** The set of precondition KINDS a manifest declares – the kinds the base task body OMITS inline
 *  (phase 2.5 re-injects them). Empty for a turn with no declared preconditions (byte-identical
 *  full-inline body). One source of truth: derived from the manifest, so adding a `preconditions[]`
 *  entry both omits its inline block AND re-injects it, keeping the assembled prompt byte-identical. */
export function declaredPreconditionKinds(manifest: StepManifest): ReadonlySet<string> {
  return new Set((manifest.preconditions ?? []).map((p) => p.kind));
}

export function outputPathsForAction(action: WorkflowAction, consortDir: string, featureId: string, projectDir?: string): Record<string, string> {
  if (action.kind !== "invoke-role") return {};
  const f = featureId;
  const story = "story" in action && typeof action.story === "string" ? action.story : undefined;
  // Channel-relative = the artifact's path within its channel's root (artifact/meta -> consortDir).
  const rel = (abs: string): string => relative(consortDir, abs);
  const META = { "agent-log": "agent-log.jsonl" }; // meta channel, always bare (reconcile places it).

  // ── DESIGN LANE (artifact channel -> under .consort) ─────────────────────────────────────────
  if ("mode" in action) {
    // spec-author breakdown: the feature-spec index.
    if (action.role === "spec-author" && action.mode === "breakdown") {
      return { "feature-spec": rel(featureSpecJson(consortDir, f)), ...META };
    }
    // spec-author propose: the sprint's planning proposals (no agent-log – planning mode skips reconcile).
    if (action.role === "spec-author" && action.mode === "propose") {
      return { "feature-proposals": rel(featureProposalsMd(consortDir)) };
    }
    // architect estimate: the planning estimates (planning mode – no reconcile/agent-log).
    if (action.role === "architect-reviewer" && action.mode === "estimate") {
      return { estimates: rel(planningEstimatesJson(consortDir)) };
    }
    // product-owner intake: the PO's project-level intake deliverables at the .consort root
    // (planning mode – no reconcile/agent-log, like propose/estimate). design-brief.md is UI-only,
    // declared OPTIONAL on the manifest so a backend-only project doesn't fail on its absence.
    if (action.role === "product-owner" && action.mode === "intake") {
      return { "product-overview": "product-overview.md", nfrs: "nfrs.md", "design-brief": "design/design-brief.md" };
    }
    return {};
  }
  if (!("buildMode" in action)) {
    // spec-author per-story ACs: the story's acs/ DIRECTORY (the legacy designArtifactExpectation's
    // anyOf is the DIR – the deliverable is "≥1 conformant AC", not a fixed filename).
    if (action.role === "spec-author" && story) {
      return { acs: rel(acsDir(consortDir, f, story)), ...META };
    }
    // architect-reviewer per-story: the feature architecture.
    if (action.role === "architect-reviewer" && story) {
      return { architecture: rel(architectureJson(consortDir, f)), ...META };
    }
    // dba per-story: the physical schema.
    if (action.role === "dba" && story) {
      return { "db-design": rel(dbDesignJson(consortDir, f)), ...META };
    }
    // test-strategist per-story: the feature master test-list.
    if (action.role === "test-strategist" && story) {
      return { "test-list": rel(featureTestListJson(consortDir, f)), ...META };
    }
    // ux-designer (feature-scoped, no story): the design system.
    if (action.role === "ux-designer") {
      return { "design-guide": rel(designGuideJson(consortDir)), ...META };
    }
    // ── BUILD LANE (product channel -> project root) ───────────────────────────────────────────
    // navigator RED: the PRODUCT tests/ tree at the project root + the meta agent-log.
    if (action.role === "navigator" && story) {
      return { tests: "tests", ...META };
    }
    // driver GREEN: the PRODUCT code at the project root. Language-aware: python/java/kotlin -> app/,
    // nodejs -> src/ (the ONE app/-vs-src/ owner is productDirForLanguage). When projectDir is not
    // supplied (legacy callers), it stays "app". The real correctness gate is the post-turn
    // @build-cycle honest-GREEN verify; this dir is the in-turn produced signal.
    if (action.role === "driver" && story) {
      const productSubdir = projectDir ? productDirForLanguage(projectLanguage(projectDir)) : "app";
      return { code: productSubdir, ...META };
    }
    return {};
  }
  // ── BUILD SELF-HEAL LANE (turns carrying a buildMode) ────────────────────────────────────────
  // navigator assess-deploy: the OPTIONAL scope marker (meta channel, story-scoped). Absent = the
  // Navigator's veto (escalate); present = the Driver's refactor-deploy directives. The other two
  // assess turns write via CLIs (flag-superseded / assess-regression), so declare no file output.
  if (action.role === "navigator" && story && "buildMode" in action && action.buildMode === "assess-deploy") {
    return { scope: rel(join(storyResolved(consortDir, f, story), "deploy-verify-scope.json")) };
  }
  return {};
}

/**
 * The UNCONTAINED live dispatch seam for the unified ClaudeStepAgent (Stage F2, #644): build the
 * EXACT legacy `buildClaudeCommand(action, cfg)` and dispatch it through the SAME `cfg.runner`
 * (execRunner) the legacy perform() used – byte-identical spawn (cwd=projectDir, prompt naming
 * .consort paths, session/replay/retry all execRunner's). This is what dissolves the old
 * LiveDriveStepAgent: one agent, its live path supplied by this seam. The agent reads the turn
 * transcript itself after this returns, so the seam is dispatch-only. Non-invoke-role actions
 * never reach here (executorDispatched gates them out), but we guard defensively for parity with
 * the old command() contract.
 */
export function liveDispatchSeam(cfg: DriveEffectsConfig, deps: ExecutorDispatchDeps): (invocation: { action: WorkflowAction; instructions?: { prompt: string } }) => Promise<void> {
  return async (invocation) => {
    const a = invocation.action;
    if (a.kind !== "invoke-role") {
      throw new Error(`live dispatch only handles invoke-role actions; got ${JSON.stringify(a)}`);
    }
    // The task body is the EXECUTOR-ASSEMBLED prompt (the base directive with the DECLARED
    // preconditions re-injected in position by phase 2.5) – NOT rebuilt here. buildClaudeCommandWithBody
    // wraps it in the envelope (handback + suffixes + levers). For an un-migrated turn (no
    // preconditions) the assembled prompt IS the full inline body, so this is byte-identical to legacy.
    const body = invocation.instructions?.prompt ?? deps.buildTaskBody(a, cfg);
    await cfg.runner.run(deps.buildClaudeCommandWithBody(a, cfg, body));
  };
}

/**
 * Assemble the executor-dispatch of an invoke-role turn: run it THROUGH the StepExecutor's Template
 * Method with the UNIFIED ClaudeStepAgent (its uncontained live path supplied by liveDispatchSeam),
 * and return the BoundedRoute execute()'s phase-7 produced. The pre/post-turn-effect + materialize
 * phases are wired to the manifest's own CLIs, so the executor runs the IDENTICAL side effects the
 * legacy commandsForAction bundled. Uncontained: the agent reads/writes the real project + `.consort`,
 * so resolveInputs presence-checks the declared inputs on the live tree (feature:/story: sources)
 * and the workspace IS the project. Returns undefined for an action not on the executor allowlist
 * (caller falls to perform).
 */
export async function performTurnViaExecutor(
  action: WorkflowAction,
  state: DriveState,
  routerDeps: ValidateBoundDeps,
  cfg: DriveEffectsConfig,
  deps: ExecutorDispatchDeps,
): Promise<BoundedRoute | undefined> {
  if (!cfg.useManifestSteps || !executorDispatched(action)) return undefined;
  const manifest = manifestForAction(action);
  if (!manifest) return undefined;

  // Observable dispatch marker: this turn is committing to the StepExecutor path (manifest matched +
  // flag on), NOT the legacy commandsForAction spawn. One line per executor-dispatched turn, naming
  // the manifest + role[/mode] + lane (live/replay/record), so a run's log unambiguously shows WHICH
  // turns went through the executor – e.g. the sprint-planning turns (spec-author/propose,
  // architect-reviewer/estimate) prove the planning lane dispatches here, not through the old arm.
  {
    const mode = "mode" in action && typeof action.mode === "string" ? `/${action.mode}` : "";
    const role = "role" in action && typeof action.role === "string" ? action.role : action.kind;
    const lane = consortEnv("REPLAY_DIR")?.trim() ? "replay" : consortEnv("RECORD_DIR")?.trim() ? "record" : "live";
    process.stderr.write(`[executor] dispatch ${manifest.id} (${role}${mode}, ${lane})\n`);
  }

  // Resolve the step's agent from the MANIFEST (agent:{kind,config}) via the shared catalogue ,
  // the SAME seam the integration tests use (manifest-runner's buildAgent). The shipped manifests
  // declare kind "claude"; we supply the live dispatch seam in the build context so buildClaude
  // constructs the UNCONTAINED (live) ClaudeStepAgent – byte-identical to the former inline
  // `new ClaudeStepAgent({role}, undefined, liveDispatchSeam(cfg,deps))`. levers carry only the role
  // (the live seam builds the real command from cfg, not from these levers, so model/effort/session
  // are inert here – the runner resolves them).
  //
  // Stage G – REPLAY / RECORD lanes selected from ENV, via the SAME seam:
  //  * LAKEBASE_CONSORT_REPLAY_DIR set => swap the manifest's kind to "replay" (the step-aware
  //    corpus agent, corpusRoot from the env). No manifest edit – the modular point. The replay
  //    agent MATERIALIZES this turn's recorded slice, so the turn never reaches cfg.runner.run
  //    (the runner-level replay short-circuit is a no-op for executor-dispatched turns; it still
  //    governs any non-executor agent turn until commandsForAction is retired, #648).
  //  * LAKEBASE_CONSORT_RECORD_DIR set => WRAP whatever agent the manifest declared with the
  //    recorder decorator (writes this turn's delta into the corpus by step). Records a LIVE claude
  //    run, or – with REPLAY also set – re-records a replay (corpus migration).
  const replayDir = consortEnv("REPLAY_DIR")?.trim();
  const replayBuildDir = consortEnv("REPLAY_BUILD_DIR")?.trim();
  const recordDir = consortEnv("RECORD_DIR")?.trim();
  const spec: AgentSpec = replayDir ? { ...manifest.agent!, kind: "replay", config: {} } : manifest.agent!;
  let agent = buildAgent(spec, {
    workspaceDir: cfg.projectDir,
    liveDispatch: liveDispatchSeam(cfg, deps),
    ...(replayDir ? { corpusRoot: replayDir } : {}),
    // Build-lane replay: a navigator/driver turn SYNCS its cumulative recorded-build snapshot
    // (replayBuildTurn) instead of a delta, so the tree matches record-time + the live verify is honest.
    ...(replayDir && replayBuildDir
      ? { buildCorpusRoot: replayBuildDir, buildFeatureId: cfg.featureId, buildConsortDir: cfg.consortDir }
      : {}),
  });
  // Record the agent turn. Two fidelities on ONE path (a corpus can be replayed, a live build can be
  // seen): an explicit RECORD_DIR is a CAPTURE (snapshot content into that corpus, historically
  // accurate + replayable); otherwise – a plain LIVE build – record into `.consort` ITSELF as an
  // INDEX (transcript + the produced/deleted file list, NO content snapshot; clicked files read at
  // HEAD). During REPLAY we record nothing (the corpus is the input), UNLESS RECORD_DIR is also set
  // (corpus migration). This mirrors withTurnRecording's perform-path rule for the non-agent turns.
  // Gate the live index on the transcript seam: a real live DRIVE supplies cfg.takeTranscript
  // (claude-runner wires takeLastAgentTranscript unconditionally), whereas a hermetic executor
  // dispatch test supplies none – and must not start writing a `.consort/turns` corpus into its
  // temp project. Same discriminator assertTurnComplete already uses for a live capture.
  const liveIndex = !recordDir && !replayDir && cfg.takeTranscript !== undefined;
  const turnRecordDir = recordDir || (liveIndex ? cfg.consortDir : undefined);
  if (turnRecordDir) {
    agent = wrapWithRecorder(agent, {
      recordDir: turnRecordDir,
      ...(consortEnv("RECORD_BUILD_DIR")?.trim() ? { recordBuildDir: consortEnv("RECORD_BUILD_DIR")!.trim() } : {}),
      projectDir: cfg.projectDir,
      consortDir: cfg.consortDir,
      featureId: cfg.featureId,
      ...(cfg.takeTranscript ? { takeTranscript: cfg.takeTranscript } : {}),
      // The RESOLVED agent levers for the replay set's levers.json: the manifest's agent config IS
      // the AgentLevers the claude kind is built from (agent-catalogue buildClaude: config as
      // Partial<AgentLevers>), so this is the authoritative lever set (role/model/effort/toolScope),
      // captured with no duplication of the resolution. Merged with the manifest's agentOptions
      // (model/effort/session), the documented per-step lever home the optimize sweep varies.
      resolveLevers: () => ({ ...(manifest.agentOptions ?? {}), ...((manifest.agent?.config as Record<string, unknown>) ?? {}) }),
      ...(liveIndex ? { liveIndex: true } : {}),
    });
  }
  const step = new Step(manifest, agent);
  const f = cfg.featureId;
  const story = "story" in action && typeof action.story === "string" ? action.story : undefined;
  const ac = "ac" in action && typeof action.ac === "string" ? action.ac : undefined;

  // Resolve a manifest input `source` to its on-disk path on the LIVE tree. `feature:<rel>` is
  // rooted at <consortDir>; `story:<rel>` at the story's resolved dir (test-list-per-story.json,
  // acs/). A bare source (no prefix) is treated as feature-relative (back-compat). The `<rel>` may
  // carry a `{feature}` / `{story}` placeholder – expanded to the run's ids BEFORE the join, so a
  // feature-scoped input names its REAL relative path (features/{feature}/architecture.json) instead
  // of resolving flat to the consort root (where the artifact does not live). The story-dir resolver
  // (storyResolved) already handles the slug-named story dir; {feature} lets a feature-scoped file
  // resolve through featuresDir/<id> WITHOUT this module re-deriving the slug rule.
  const expandRel = (rel: string): string =>
    rel.replace(/\{feature\}/g, f).replace(/\{story\}/g, story ?? "");
  const inputPath = (source: string): string => {
    // `cycle:`/`ac:` – the per-cycle dir (cycleDir(f, s, ac)), where the build lane's process-event
    // markers live (green-failure.json / superseded-tests.json / regression-assessment.json). An AC and
    // its cycle share a dir; both prefixes read naturally at a call site and resolve identically. This
    // is the scope `story:` LACKED – declaring an input at cycle scope is what lets resolveInputs find a
    // marker the router already saw at AC scope (the green-failure scope-mismatch bug this closes).
    if (source.startsWith("cycle:") || source.startsWith("ac:")) {
      const rel = expandRel(source.slice(source.indexOf(":") + 1));
      if (!story || !ac) return join(cfg.consortDir, rel); // no story/ac on the action – resolve under consortDir (will miss + fail loud)
      return join(cycleDir(cfg.consortDir, f, story, ac), rel);
    }
    if (source.startsWith("story:")) {
      const rel = expandRel(source.slice("story:".length));
      if (!story) return join(cfg.consortDir, rel); // no story on the action – resolve under consortDir (will miss + fail loud)
      return join(storyResolved(cfg.consortDir, f, story), rel);
    }
    return join(cfg.consortDir, expandRel(source.replace(/^feature:/, "")));
  };

  const executorDeps: StepExecutorDeps = {
    // Uncontained: the agent reads the tree itself, but Step still gates on the presence of
    // each declared input, so presence-check them on the live tree. A FILE input's content is read
    // (some checkers want it); a DIRECTORY input (e.g. acs/) is presence-only (empty sentinel) ,
    // its content isn't injected, the agent reads the dir. Fail loud (return {missing}) if absent.
    resolveInputs: () => {
      const out: Record<string, string> = {};
      for (const input of manifest.inputs) {
        const p = inputPath(input.source);
        if (!fs.existsSync(p)) {
          // An OPTIONAL input that is absent is skipped (e.g. design-guide.json on a no-frontend
          // project) – not handed back, not a turn failure. A required input still fails loud – EXCEPT
          // under the REPLAY lane: the step-aware replay agent materializes this turn's recorded output
          // from the corpus and does NOT consume the declared inputs, so a missing input is not a turn
          // failure there (the recorded design-lane replay clean-syncs recorded-artifacts over .consort,
          // which legitimately lacks the PO intake docs a live turn would read). SATISFY it with an
          // empty sentinel (rather than skip) so BOTH input gates pass – this executor's presence-check
          // AND ManifestStep.run's own `spec.id in inputs` re-check, which a skip would still trip. The
          // LIVE presence-gate is unchanged when replayDir is unset.
          if (input.optional) continue;
          if (replayDir) { out[input.id] = ""; continue; }
          return { missing: input.id };
        }
        out[input.id] = fs.statSync(p).isDirectory() ? "" : fs.readFileSync(p, "utf8");
      }
      return out;
    },
    // The workspace IS the real project (the live seam's runner spawns in cfg.projectDir).
    // product-channel outputs (tests/, app/) land at the project root; artifact + meta channels
    // resolve under the real .consort (artifactDir = metaDir = cfg.consortDir), so the orchestrator
    // places the design docs + the reconciled agent-log there – the manifest filename stays bare.
    provisionWorkspace: () => ({ workspaceDir: cfg.projectDir, artifactDir: cfg.consortDir, metaDir: cfg.consortDir, outputPaths: outputPathsForAction(action, cfg.consortDir, f, cfg.projectDir) }),
    // The BASE instruction prompt = the role's task body with the manifest's DECLARED precondition
    // kinds OMITTED (phase 2.5 re-injects those in position via deps.prepare). A turn that declares
    // NO preconditions gets the full inline body (omit=∅) – byte-identical to the pre-A-full spawn.
    // A migrated turn (e.g. assess declaring green-failure-advisory) gets the body MINUS that inline
    // block; phase 2.5 prepends it back, so the assembled prompt matches the legacy inline order.
    instructionsFor: () =>
      action.kind === "invoke-role"
        ? { prompt: deps.buildTaskBody(action, cfg, declaredPreconditionKinds(manifest)) }
        : { prompt: "" },
    // Phase 2.5: PROJECT each declared precondition via the injected preparer registry. The block
    // is the SAME pure projection roleTaskBody used inline; phase 2.5 places it by the precondition's
    // `position` (prepend for the green-failure advisory, append for the context-pack).
    prepare: (kind, pre, _action) =>
      deps.preparerFor(kind)({ consortDir: cfg.consortDir, featureId: f, story: story ?? "", ac: ("ac" in action && typeof action.ac === "string" ? action.ac : ""), ...(cfg.projectDir ? { projectDir: cfg.projectDir } : {}), ...(pre.options ? { options: pre.options } : {}) }),
    // Phase 2.7: the manifest's `before` CLIs (e.g. breakdown's reset-breakdown), run through the runner.
    preTurnEffects: async () => {
      for (const cmd of manifestPostTurnCommands(manifest, "before", action, cfg, deps)) await cfg.runner.run(cmd);
    },
    // Phase 4.5: reconcile MATERIALIZES the agent-log (the legacy path's LOG_BIN --reconcile), so
    // validate-outputs sees the conformant agent-log.jsonl the agent never wrote itself. SKIPPED for
    // the sprint-scoped PLANNING modes (propose / estimate / estimate-committed) – they write no
    // feature agent-log to reconcile + declare no agent-log output, and the legacy path guards
    // reconcile with the SAME `!isPlanningMode` condition (commandsForAction / commandsFromManifest),
    // so skipping here keeps the executor byte-parallel to the legacy stream ([claude] only).
    materializeOutputs: async () => {
      if (isPlanningMode(action)) return;
      await cfg.runner.run({ kind: "cli", bin: deps.logBin, args: ["--reconcile", "--feature", f, "--tdd-dir", cfg.consortDir] });
    },
    // Phase 6.5: the manifest's `after` CLIs – gated on clean validation by the executor. For
    // breakdown that is sync-breakdown; for navigator RED it is the `@build-cycle` RED stamp (the
    // cycle `begin`), which flips testsWritten so the loop advances to the Driver.
    postTurnEffects: async () => {
      for (const cmd of manifestPostTurnCommands(manifest, "after", action, cfg, deps)) await cfg.runner.run(cmd);
    },
  };

  // A `state-derived` route (both breakdown's + RED's produced route) MUST see the state the turn
  // PRODUCED, not the pre-turn snapshot: execute()'s phase-7 validateAndBound runs AFTER the
  // post-turn CLI (sync-breakdown / the RED cycle stamp), so `allowed` re-reads fresh from disk
  // (the synced pipeline now shows breakdownDone / testsWritten). Using the stale pre-turn state
  // re-derives the just-performed turn and the loop stalls. The rest of routerDeps (revise budget,
  // retry ledger) is preserved.
  //
  // Which fresh reader: the DRIVE'S OWN (cfg.readFreshDriveState) when set, else the feature probe.
  // A feature drive has no readFreshDriveState => the feature probe (byte-identical to before). A
  // PLANNING drive (drivePlanning) sets it to deriveSprintPlanningState, whose DriveState carries
  // phase:"planning" – which nextTransition needs to route propose->estimate->author-requests. The
  // feature probe reports phase:"feature" (no planning block), so re-deriving a planning turn through
  // it wrongly yields `breakdown` (the J2 defect). Re-deriving through the drive's own reader keeps
  // the executor's routing authority IDENTICAL to the drive's readState – one source, both lanes.
  const readFresh = (): DriveState =>
    cfg.readFreshDriveState?.() ?? deps.readDriveStateFromDisk(cfg.consortDir, cfg.featureId, cfg.projectDir, { uiTrack: cfg.uiTrack });
  const freshRouterDeps: ValidateBoundDeps = {
    ...routerDeps,
    allowed: () => routerDeps.allowed(readFresh()),
  };
  const ctx = { action, cfg, state, validateBoundDeps: freshRouterDeps };
  const turnStart = Date.now();
  const result = await execute(step, ctx, executorDeps);

  // Per-turn completion line for the log narrator. The executor does NOT go through the legacy
  // claude-runner timing emit, so without this a finished agent turn never appears as
  // "[drive] <role> turn <N>s" in drive-live.log – and consort-watch's turn-done rule + its per-turn
  // IDE open (openRoleArtifacts) never fire for it. So the product-owner's intake docs (and every
  // other role's artifacts) are revealed in the editor when the turn completes, same as before the
  // executor became the sole agent path. Same format watch-classify.ts's turn-done regex expects.
  if (action.kind === "invoke-role") {
    const doneModel = (manifest.agentOptions?.model as string | undefined) ?? "live";
    process.stderr.write(`[drive] ${action.role} turn ${((Date.now() - turnStart) / 1000).toFixed(1)}s (${doneModel})\n`);
  }

  // Divergence guard (replay-only, build turns): the turn synced the recorded snapshot + the postTurn
  // @build-cycle verify has now run live. Because the tree is byte-identical to record-time, the live
  // verdict MUST match what the recording captured; a mismatch is a regression -> HARD-STOP (never
  // silently continue). Uses the SAME per-story ordinal the step-replay agent just advanced.
  if (replayDir && replayBuildDir && isBuildTurn(action)) {
    assertReplayBuildVerdictMatch({
      replayBuildDir,
      consortDir: cfg.consortDir,
      featureId: cfg.featureId,
      story: action.story,
      turnIndex: lastSyncedBuildTurnIndex(replayDir, action.story),
      role: action.role,
    });
  }
  return result.bounded;
}
