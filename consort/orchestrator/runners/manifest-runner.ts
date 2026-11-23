// manifest-runner: the bridge from a step MANIFEST to the orchestrator (the StepExecutor /
// Template Method). It resolves the action to its manifest, builds the generic Step
// (manifest + injected agent + validator registry), assembles the orchestrator-owned seams the
// executor drives (resolve inputs from the shared workspace, provision it, source
// instructions, reconcile routing), and runs the fixed 7 phases – so a caller drives a
// manifest end to end without hand-wiring StepCtx/StepExecutorDeps every turn.
//
//   runManifestStep  – run ONE manifest through the executor, return its StepResult.
//   runManifestChain – follow each turn's routing to the next matching manifest until the
//                      chain leaves the manifest set (a terminal / off-graph action). This is
//                      the 2-turn stockflow demo: PO seed -> spec-author breakdown -> done.
//
// Routing authority: a standalone manifest set has no separate pure transition graph – the
// manifest routing IS the transition function. So the runner's validateAndBound `allowed`
// dep returns the step's own proposed next, i.e. the manifest's routing map is authoritative.
// (In the full orchestrator the pure nextTransition is the authority; here the manifests are.)

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { manifestForAction, type StepManifest } from "../steps/manifest.js";
import { Step } from "../steps/step.js";
import { schemaPath } from "../validators/schema-loader.js";
import { resolvePreparer } from "../build/preconditions.js";
import { buildAgent, type AgentBuildContext } from "../agents/agent-catalogue.js";
import { probeDriveState } from "../state/escalation-probe.js";
import { execute, type StepExecutorDeps, type StepCtx, type StepResult, type StepRecord } from "../turns/step-executor.js";
import { formatAgentReport } from "../turns/agent-report-formatter.js";
import type { StepAgent, StepInstructions } from "../agents/agent-types.js";
import type { DriveEffectsConfig } from "../drive/orchestrator-effects.js";
import type { WorkflowAction, DriveState } from "../workflow/workflow-vocabulary.js";
import type { RouteProposal, ValidateBoundDeps, StepPrecondition } from "../steps/step-contract.js";

/** What the caller provides so the runner can drive a manifest through the executor. */
export interface ManifestRunnerDeps {
  /** The single shared workspace every turn reads inputs from + writes outputs into (the
   *  design tree). One workspace across the chain is what lets turn N+1 consume turn N's
   *  outputs. */
  workspaceDir: string;
  /** The drive config (projectDir/consortDir/featureId + model/effort resolution). */
  cfg: DriveEffectsConfig;
  /** The ENV the agent catalogue needs to build a step's agent from manifest.agent – corpus
   *  root, kit dir (workspaceDir is filled from above). Supplied by the runner, NOT the
   *  manifest, so manifests stay portable. */
  agentContext?: Omit<AgentBuildContext, "workspaceDir">;
  /** OPTIONAL override: build the agent for a manifest imperatively instead of resolving
   *  manifest.agent via the catalogue. For tests/back-compat. When set it WINS; otherwise the
   *  runner requires manifest.agent and resolves it from the catalogue. */
  agentFor?(manifest: StepManifest): StepAgent;
  /** Optional: source the instruction bundle for a turn (default: a generic prompt naming
   *  the role + its declared outputs). The full orchestrator sources these from disk/interactive. */
  instructionsFor?(manifest: StepManifest, action: WorkflowAction, workspaceDir: string): StepInstructions;
  /** Optional: provision the workspace per turn (default: the shared workspaceDir, no
   *  output-path remap). A real agent that writes to a baked cwd-relative path (e.g. the
   *  spec-author's `.consort/features/<F>/`) overrides this to declare those outputPaths + set
   *  up the kit env. Returns the workspace + where each output id lands within it. */
  provisionWorkspace?(manifest: StepManifest, action: WorkflowAction): { workspaceDir: string; outputPaths?: Record<string, string> };
  /** Optional: format the agent-authored .agent-report.json into a conformant
   *  agent-log.jsonl before validate-outputs – so a SANDBOXED spawned agent (which cannot run
   *  the shared log subprocess) still satisfies the agent-log requirement. Default OFF; a
   *  step whose agent authors a report (a live claude turn) turns it on. When true, every turn
   *  materializes with the manifest's role. */
  formatAgentReports?: boolean;
  /** Optional: the drive state passed to route() (diagnostic scope only; default a stub). An
   *  explicit `state` here WINS over probeEscalation (tests inject an exact state). */
  state?: DriveState;
  /** Optional: derive route()'s DriveState.escalation from the workspace `.consort` on disk (via
   *  the legacy disk probe) instead of the { phase: "feature" } stub. Default OFF ,
   *  byte-identical to today. Turn ON so a real reflect-gate escalation planted in the
   *  workspace drives a revise-route / raise-to-hil through the manifest path (the full route
   *  space), matching what nextTransition would do. */
  probeEscalation?: boolean;
  /** Optional: turn-record sink (default no-op). */
  onRecord?: StepExecutorDeps["onRecord"];
  /** Optional: extra options merged into a precondition preparer's `options`, keyed by precondition
   *  KIND. Per-turn + parallel-safe (rides the in-memory deps, not env / a shared file), so a caller
   *  (the optimize sweep) can vary a preparer's projection per run – e.g. the test-analyst-roster
   *  preparer reads `analystOverrides` here to sweep per-analyst subagent levers. The manifest's own
   *  `pre.options` still apply; these are shallow-merged ON TOP. Absent => byte-identical to before. */
  preconditionOptions?: Record<string, Record<string, unknown>>;
}

/** One turn's outcome in a chain. */
export interface ManifestTurn {
  manifestId: string;
  action: WorkflowAction;
  result: StepResult;
  /** The turn's measured telemetry (outer wall-clock always; the agent's usage/finalText when
   *  it exposed one), captured from the executor's phase-6 record. Present for every turn; the
   *  live per-role tests survive + print it. `role` is the manifest's role (for the report). */
  telemetry?: { role: string; outerDurationMs?: number; agentResult?: StepRecord["agentResult"] };
}

/** Resolve a manifest input's `source` (e.g. "feature:features/{feature}/architecture.json") to a
 *  workspace file and read its CONTENTS. The source is `feature:<rel>` – consort-relative (the shared
 *  workspace IS the consort root here). `<rel>` may carry a `{feature}` / `{story}` placeholder ,
 *  expanded to the run's ids so a feature-scoped input names its REAL relative path instead of
 *  resolving flat to the root; a source with no placeholder (the literal-id integration fixtures) is
 *  unaffected. Fail loud (as { missing }) so phase 1 gates it. */
function resolveInputsFromWorkspace(
  manifest: StepManifest,
  workspaceDir: string,
  featureId: string,
  action: WorkflowAction,
): Record<string, string> | { missing: string } {
  const story = "story" in action && typeof action.story === "string" ? action.story : "";
  const expand = (rel: string): string => rel.replace(/\{feature\}/g, featureId).replace(/\{story\}/g, story);
  const out: Record<string, string> = {};
  for (const input of manifest.inputs) {
    // `schema:` – a kit JSON schema (one source of truth with the output validator), not a tree file.
    if (input.source.startsWith("schema:")) {
      const sp = schemaPath(input.source.slice("schema:".length));
      if (!existsSync(sp)) {
        if (input.optional) continue;
        return { missing: input.id };
      }
      out[input.id] = readFileSync(sp, "utf8");
      continue;
    }
    const file = expand(input.source.replace(/^feature:/, ""));
    const p = join(workspaceDir, file);
    if (!existsSync(p)) {
      // An OPTIONAL input that is absent is skipped (e.g. design-guide.json on a no-frontend
      // project); a required input still fails loud so phase 1 gates it.
      if (input.optional) continue;
      return { missing: input.id };
    }
    out[input.id] = readFileSync(p, "utf8");
  }
  return out;
}

/** A default instruction bundle when the caller supplies none – names the role + the files
 *  the manifest declares the step must produce. */
function defaultInstructions(manifest: StepManifest): StepInstructions {
  const outs = manifest.outputs.map((o) => o.filename).join(", ") || "(no static artifact)";
  return {
    prompt: `Run the ${manifest.role} step "${manifest.id}". Produce: ${outs}. Read only the provided inputs.`,
    guidelines: manifest.outputs.map((o) => `${o.filename}: ${o.description ?? o.id}`),
  };
}

/** Build the StepCtx + StepExecutorDeps for one manifest turn against the shared workspace. */
function resolveAgent(manifest: StepManifest, deps: ManifestRunnerDeps): StepAgent {
  // An explicit agentFor override wins (tests/back-compat); otherwise the agent is DATA in
  // the manifest, resolved from the catalogue with the runner's env context.
  if (deps.agentFor) return deps.agentFor(manifest);
  if (!manifest.agent) {
    throw new Error(
      `manifest-runner: manifest "${manifest.id}" declares no \`agent\` and no agentFor override was provided – cannot build a StepAgent.`,
    );
  }
  return buildAgent(manifest.agent, { workspaceDir: deps.workspaceDir, ...(deps.agentContext ?? {}) });
}

/** Read the agent's captured final assistant text, when the agent exposes one (ClaudeStepAgent
 *  sets lastResult.finalText). Duck-typed so the runner stays agnostic to the agent kind. */
function agentFinalText(agent: StepAgent): string | undefined {
  const lr = (agent as { lastResult?: { finalText?: string } }).lastResult;
  return lr?.finalText;
}

/** Max sanctioned re-issues of the SAME step before a blocked outcome is a hard failure ,
 *  mirrors the ExpectationLedger's maxRetries=1. Bounds the blocked -> re-spawn loop so a
 *  step that keeps failing validation aborts fast instead of re-running forever. */
const MAX_STEP_RETRIES = 1;

/** A mutable holder the wiring populates from phase 6's record, so the run functions can attach
 *  the turn's telemetry to the ManifestTurn (execute() itself returns only the StepResult). */
interface TelemetryCapture {
  record?: StepRecord;
}

function executorWiring(
  manifest: StepManifest,
  action: WorkflowAction,
  deps: ManifestRunnerDeps,
  retries: Map<string, number>,
): { step: Step; ctx: StepCtx; execDeps: StepExecutorDeps; captured: TelemetryCapture } {
  const agent = resolveAgent(manifest, deps);
  const step = new Step(manifest, agent);
  const captured: TelemetryCapture = {};

  // The manifest routing is the transition authority for a standalone runner: `allowed`
  // returns the step's OWN proposed next, so validateAndBound honors the manifest's route.
  const validateBoundDeps: ValidateBoundDeps = {
    allowed: (s: DriveState) => {
      const proposal: RouteProposal = step.route(action, { state: s, feature: deps.cfg.featureId });
      return proposal.proposedNext;
    },
    reviseBudgetAvailable: () => true,
    // Bound the blocked retry across the whole chain (retries persists per action signature):
    // one sanctioned re-issue, then THROW – no infinite re-spawn on a persistently-failing step.
    recordRetry: (completed: WorkflowAction) => {
      const key = JSON.stringify(completed);
      const n = (retries.get(key) ?? 0) + 1;
      if (n > MAX_STEP_RETRIES) {
        throw new Error(
          `manifest-runner: step ${key} emitted "blocked" past its retry budget (${MAX_STEP_RETRIES}) – aborting instead of re-spawning forever.`,
        );
      }
      retries.set(key, n);
      return { sanctioned: true };
    },
  };

  // ctx.state authority: an explicit deps.state wins (tests inject an exact one); else, when
  // probeEscalation is on, DERIVE it from the workspace .consort (real disk escalation -> the
  // revise/escalate route space); else the minimal { phase: "feature" } stub (byte-identical
  // to before this seam).
  const state: DriveState =
    deps.state ??
    (deps.probeEscalation
      ? probeDriveState(deps.cfg.consortDir, deps.cfg.featureId)
      : ({ phase: "feature" } as unknown as DriveState));

  const ctx: StepCtx = {
    action,
    cfg: deps.cfg,
    state,
    validateBoundDeps,
  };

  const execDeps: StepExecutorDeps = {
    resolveInputs: () => resolveInputsFromWorkspace(manifest, deps.workspaceDir, deps.cfg.featureId, action),
    provisionWorkspace: () => (deps.provisionWorkspace ? deps.provisionWorkspace(manifest, action) : { workspaceDir: deps.workspaceDir }),
    instructionsFor: () => (deps.instructionsFor ? deps.instructionsFor(manifest, action, deps.workspaceDir) : defaultInstructions(manifest)),
    // Phase 2.5: PREPARE-PRECONDITIONS. A step that DECLARES preconditions (manifest.preconditions)
    // has each projected here by the registry preparer – from the SHARED workspace's `.consort` +
    // the action's story/ac – and appended to the prompt by the executor. This is the SAME
    // projection the real drive's roleTaskBody uses (one source of truth), so a manifest-driven
    // build turn is pre-conditioned identically to a dispatched one. A step declaring none never
    // calls this.
    prepare: (kind: string, pre: StepPrecondition, a: WorkflowAction) => {
      const story = "story" in a && typeof a.story === "string" ? a.story : "";
      const ac = "ac" in a && typeof a.ac === "string" ? a.ac : "";
      // The manifest's static options + any per-turn caller options for this kind (the sweep's
      // analystOverrides), shallow-merged (caller wins). Undefined when neither is set => omit.
      const mergedOptions = { ...(pre.options ?? {}), ...(deps.preconditionOptions?.[kind] ?? {}) };
      return resolvePreparer(kind)({
        consortDir: deps.cfg.consortDir,
        featureId: deps.cfg.featureId,
        story,
        ac,
        // Thread the project root so a preparer can read project-level config (the test-analyst
        // roster preparer resolves project.uiTrack to gate the client analyst).
        ...(deps.cfg.projectDir ? { projectDir: deps.cfg.projectDir } : {}),
        ...(Object.keys(mergedOptions).length > 0 ? { options: mergedOptions } : {}),
      });
    },
    // When enabled, format the agent's report into a conformant agent-log.jsonl
    // (orchestrator-side) before validate-outputs – so a sandboxed agent that cannot run the
    // shared log subprocess still satisfies the agent-log requirement. The report travels as
    // the agent's FINAL MESSAGE (a ```agent-report block) – containment-proof, no file path
    // to misplace – with the .agent-report.json file as a fallback for agents that write one.
    // CRUCIAL: write the log at the SAME relative path validate-outputs will check – the
    // manifest's agent-log output filename, remapped by any provisionWorkspace outputPaths (a
    // real turn nests it under .consort/). Otherwise the formatter writes agent-log.jsonl at the
    // workspace root while validation looks under .consort/ and the turn wrongly blocks.
    ...(deps.formatAgentReports
      ? {
          materializeOutputs: (workspaceDir: string) => {
            const provisioned = deps.provisionWorkspace ? deps.provisionWorkspace(manifest, action) : { outputPaths: undefined as Record<string, string> | undefined };
            const logSpec = manifest.outputs.find((o) => o.id === "agent-log");
            const logFile = logSpec ? (provisioned.outputPaths?.[logSpec.id] ?? logSpec.filename) : undefined;
            // Pass the final text ONLY when it carries a ```agent-report block; otherwise omit it so
            // formatAgentReport falls back to the .agent-report.json FILE the agent wrote (Write, no Bash).
            // A model that logged via the file (or emitted the block anywhere but the final message) still
            // satisfies the agent-log output – the report block was the only channel before this.
            const ft = agentFinalText(agent);
            const reportText = ft && ft.includes("```agent-report") ? ft : undefined;
            formatAgentReport({ workspaceDir, role: manifest.role, ...(reportText !== undefined ? { reportText } : {}), ...(logFile ? { logFile } : {}) });
          },
        }
      : {}),
    // Capture the phase-6 record (telemetry: outer wall-clock + the agent's usage/finalText)
    // into the holder so the run functions can attach it to the turn, then forward to any
    // caller-supplied onRecord.
    onRecord: (record: StepRecord) => {
      captured.record = record;
      deps.onRecord?.(record);
    },
  };

  return { step, ctx, execDeps, captured };
}

/** Build a ManifestTurn's telemetry from the captured phase-6 record + the manifest role. */
function turnTelemetry(manifest: StepManifest, captured: TelemetryCapture): ManifestTurn["telemetry"] {
  const r = captured.record;
  if (!r) return undefined;
  return {
    role: manifest.role,
    ...(r.outerDurationMs !== undefined ? { outerDurationMs: r.outerDurationMs } : {}),
    ...(r.agentResult ? { agentResult: r.agentResult } : {}),
  };
}

/**
 * Run ONE manifest through the orchestrator (StepExecutor). Resolves the action to its
 * manifest (THROWS loud if none matches – the runner never silently no-ops), builds the
 * Step + the executor wiring, and runs the fixed 7 phases. Returns the StepResult
 * (bounded route + produced paths + violations).
 */
export async function runManifestStep(
  action: WorkflowAction,
  manifests: StepManifest[],
  deps: ManifestRunnerDeps,
): Promise<StepResult> {
  const manifest = manifestForAction(action, manifests);
  if (!manifest) {
    throw new Error(`manifest-runner: no step manifest matches action ${JSON.stringify(action)} – cannot run it.`);
  }
  const { step, ctx, execDeps } = executorWiring(manifest, action, deps, new Map());
  return execute(step, ctx, execDeps);
}

/** Run ONE manifest and return BOTH its StepResult and the turn's telemetry (the single-step
 *  analogue of a chain turn), for a caller that wants the per-step instrumentation directly. */
export async function runManifestTurn(
  action: WorkflowAction,
  manifests: StepManifest[],
  deps: ManifestRunnerDeps,
): Promise<ManifestTurn> {
  const manifest = manifestForAction(action, manifests);
  if (!manifest) {
    throw new Error(`manifest-runner: no step manifest matches action ${JSON.stringify(action)} – cannot run it.`);
  }
  const { step, ctx, execDeps, captured } = executorWiring(manifest, action, deps, new Map());
  const result = await execute(step, ctx, execDeps);
  return { manifestId: manifest.id, action, result, telemetry: turnTelemetry(manifest, captured) };
}

/** Options for a chain run. */
export interface RunChainOptions {
  /** Hard cap on turns so a mis-authored routing loop cannot spin forever (default 20). */
  maxTurns?: number;
}

/**
 * Follow a chain of manifests: run the action, take its bounded next action, and if a
 * manifest matches THAT action run it too – until the next action has no matching manifest
 * (a terminal / off-graph move like design-complete/done) or the maxTurns guard trips.
 * Returns every turn in order. All turns share the one workspace, so turn N+1 consumes
 * turn N's outputs – the whole point of the chain.
 */
export async function runManifestChain(
  start: WorkflowAction,
  manifests: StepManifest[],
  deps: ManifestRunnerDeps,
  options: RunChainOptions = {},
): Promise<ManifestTurn[]> {
  const maxTurns = options.maxTurns ?? 20;
  const turns: ManifestTurn[] = [];
  // Retry budget shared ACROSS the chain (per action signature), so a blocked step's
  // sanctioned re-issue is bounded – not reset each iteration. This is what stops a
  // persistently-failing step from re-spawning forever.
  const retries = new Map<string, number>();
  let action: WorkflowAction | undefined = start;

  while (action && turns.length < maxTurns) {
    const manifest = manifestForAction(action, manifests);
    if (!manifest) break; // the next action left the manifest set – terminal, stop cleanly.
    const { step, ctx, execDeps, captured } = executorWiring(manifest, action, deps, retries);
    const result = await execute(step, ctx, execDeps);
    turns.push({ manifestId: manifest.id, action, result, telemetry: turnTelemetry(manifest, captured) });
    action = result.bounded.action;
  }
  return turns;
}
