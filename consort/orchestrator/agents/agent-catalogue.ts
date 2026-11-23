// agent-catalogue: the catalogue of concrete StepAgent KINDS a user assembles into a step
// manifest BY NAME. A manifest declares `agent: { kind, config }`; the runner resolves the
// kind against this catalogue and builds the agent from `config` + a build CONTEXT.
//
// The split that keeps manifests portable:
//   - config  (in the manifest, DATA): the agent's own knobs – claude levers, replay seeds,
//              mock fixtures. Part of the step's definition; travels with it.
//   - context (from the runner, ENV): corpusRoot / kitDir / workspaceDir – per-run,
//              per-machine paths. NOT in the manifest.
//
// Catalogued kinds (each documented so a user can pick when authoring a manifest):
//   - claude : the REAL agent – spawns `claude -p --agent <role>` from the config levers.
//   - replay : emits RECORDED artifacts (copies configured seeds from the corpus) – the
//              offline/headless agent. No model, no cloud.
//   - mock   : a test double that writes configured fixture outputs – for unit tests.
//
// resolveAgentKind / buildAgent throw loud on an unknown kind (a manifest typo is a hard
// failure surfaced at build time, never a silent default).

import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ClaudeStepAgent, type AgentLevers, type LiveDispatchFn } from "./claude-step-agent.js";
import { CopilotStepAgent, type CopilotLevers } from "./copilot-step-agent.js";
import { spawnCopilotStreaming } from "./copilot-runner.js";
import { makeMockReplayAgent, makeStepReplayAgent, type RecordedSeed } from "./mock-replay-agent.js";
import type { StepAgent, AgentInvocation } from "./agent-types.js";

/**
 * The ENV a builder needs but the manifest must NOT carry (per-run / per-machine paths).
 * Supplied by the runner. A builder uses only what its kind needs (claude -> kitDir;
 * replay -> corpusRoot; mock -> nothing).
 */
export interface AgentBuildContext {
  /** The contained workspace the agent reads/writes within (also on the invocation). */
  workspaceDir: string;
  /** Root the `replay` kind resolves its recorded seed files under. */
  corpusRoot?: string;
  /** The recorded-BUILD corpus root (REPLAY_BUILD_DIR). When present, the step-aware `replay` kind
   *  SYNCS a navigator/driver build turn's cumulative snapshot from here (replayBuildTurn) instead of
   *  materializing a delta – the faithful per-turn build replay. Needs buildFeatureId + buildConsortDir. */
  buildCorpusRoot?: string;
  /** The feature id the build corpus is scoped to (recorded-build is feature-scoped). */
  buildFeatureId?: string;
  /** The project's `.consort` dir – where replayBuildTurn delivers review verdicts. */
  buildConsortDir?: string;
  /** The kit checkout the `claude` kind resolves bins/agent-defs from (LAKEBASE_KIT_DIR). */
  kitDir?: string;
  /** The UNCONTAINED production dispatch seam for the `claude` kind. When the runner supplies it
   *  (the LIVE drive), buildClaude constructs the ClaudeStepAgent on its live path – the turn
   *  dispatches through the production runner (execRunner: session/retry/replay/set-phase/
   *  sync-backlog) instead of the contained raw spawn. Absent (integration chains, per-role sweep,
   *  unit tests) => the contained raw-spawn path, byte-identical to before. This is what lets the
   *  live drive and the tests share ONE dispatch process resolved from `manifest.agent`. */
  liveDispatch?: LiveDispatchFn;
}

/** A manifest's agent declaration: WHICH kind + that kind's config (both DATA). */
export interface AgentSpec {
  kind: string;
  config: Record<string, unknown>;
}

/** One catalogue entry: a human description + the builder that turns (config, context) into
 *  a StepAgent. The description is what a user reads when assembling a manifest. */
export interface AgentCatalogueEntry {
  /** One-line summary of what this kind does + when to pick it. */
  description: string;
  /** A short summary of the config shape this kind expects (for docs/diagnostics). */
  configSummary: string;
  /** Build the concrete StepAgent from the manifest config + the runner's env context. */
  build(config: Record<string, unknown>, context: AgentBuildContext): StepAgent;
}

/** The `claude` kind's config = the AgentLevers (role required; the rest optional). */
function buildClaude(config: Record<string, unknown>, context: AgentBuildContext): StepAgent {
  const c = config as Partial<AgentLevers> & { role?: string };
  if (!c.role) throw new Error(`agent-catalogue: kind "claude" requires config.role.`);
  // Third arg is the live dispatch seam: present (LIVE drive) => the uncontained live path,
  // byte-identical to the inline `new ClaudeStepAgent({role}, undefined, liveDispatchSeam(...))`
  // the executor used to hardcode; absent => the contained raw-spawn path (unchanged for every
  // current caller, which passes no liveDispatch).
  return new ClaudeStepAgent(c as AgentLevers, undefined, context.liveDispatch);
}

/** The `copilot` kind's config = CopilotLevers (role required). PARITY with buildClaude: pass
 *  context.liveDispatch so a LIVE drive routes the turn through the SAME execRunner envelope
 *  (session/retry/monitor/transcript) as Claude — the envelope dispatches to the Copilot CLI via the
 *  command's executor:"copilot". The injected spawnCopilotStreaming is the CONTAINED fallback (tests
 *  inject their own; the live path uses liveDispatch). */
function buildCopilot(config: Record<string, unknown>, context: AgentBuildContext): StepAgent {
  const c = config as Partial<CopilotLevers> & { role?: string };
  if (!c.role) throw new Error(`agent-catalogue: kind "copilot" requires config.role.`);
  return new CopilotStepAgent(c as CopilotLevers, spawnCopilotStreaming, context.liveDispatch);
}

/** The `replay` kind emits RECORDED artifacts from the corpus (context.corpusRoot). TWO modes:
 *  - config.seeds present => the explicit seed-list agent (makeMockReplayAgent): the manifest
 *    author pre-specifies which corpus files to copy. Used by the seeded integration fixtures.
 *  - config.seeds absent => the STEP-AWARE agent (makeStepReplayAgent): seedless, it resolves the
 *    recorded turn matching the invocation's action from the corpus `turns/` timeline and
 *    materializes that turn's files/ delta. This is what lets a shipped `claude` manifest replay
 *    a whole corpus by swapping only the kind (no per-step seed authoring). */
function buildReplay(config: Record<string, unknown>, context: AgentBuildContext): StepAgent {
  const c = config as { role?: string; seeds?: RecordedSeed[] };
  if (!context.corpusRoot) {
    throw new Error(`agent-catalogue: kind "replay" requires context.corpusRoot (the runner supplies it).`);
  }
  if (Array.isArray(c.seeds) && c.seeds.length > 0) {
    return makeMockReplayAgent({ corpusRoot: context.corpusRoot, role: c.role, seeds: c.seeds });
  }
  // Build-lane snapshot sync (when the runner supplies the build corpus): a navigator/driver turn
  // SYNCS its cumulative recorded-build snapshot instead of a delta. Design turns keep the delta path.
  return makeStepReplayAgent({
    corpusRoot: context.corpusRoot,
    ...(context.buildCorpusRoot ? { buildCorpusRoot: context.buildCorpusRoot } : {}),
    ...(context.buildFeatureId ? { featureId: context.buildFeatureId } : {}),
    ...(context.buildConsortDir ? { consortDir: context.buildConsortDir } : {}),
  });
}

/** The `mock` kind's config = { outputs: { filename: contents } }; a test double writing
 *  those fixtures into the provided workspace (+ an authoring log line so log validators pass). */
function buildMock(config: Record<string, unknown>, _context: AgentBuildContext): StepAgent {
  const outputs = (config.outputs as Record<string, string> | undefined) ?? {};
  const role = (config.role as string | undefined) ?? "mock";
  return {
    async invoke(invocation: AgentInvocation): Promise<void> {
      for (const [filename, contents] of Object.entries(outputs)) {
        writeFileSync(join(invocation.workspaceDir, filename), contents);
      }
      const logPath = join(invocation.workspaceDir, "agent-log.jsonl");
      const prior = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      const event = { timestamp: new Date().toISOString(), level: "info", role, event: "artifact.written", message: `mock wrote ${Object.keys(outputs).join(", ") || "(nothing)"}` };
      writeFileSync(logPath, prior + JSON.stringify(event) + "\n");
    },
  };
}

/** The catalogue: kind -> entry. Add a kind here (code) and reference it by name from a
 *  manifest (data). This is the assemble-from surface a user picks from. */
export const AGENT_CATALOGUE: Record<string, AgentCatalogueEntry> = {
  claude: {
    description: "The REAL agent: spawns `claude -p --agent <role>` and lets the model produce the step's artifact. Pick for a live run.",
    configSummary: "{ role (required), model?, effort?, session?('fresh'|'resume'), resumeKey?, allowedTools?, disallowedTools?, fallbackModel?, maxBudgetUsd? }",
    build: buildClaude,
  },
  copilot: {
    description: "Spawns the GitHub Copilot CLI (`copilot -p …`, or `ug copilot`/`gh copilot --` per the runner's resolution) instead of `claude` to produce the step's artifact. Selected per run via the copilot executor override; contained spawn (cwd=workspace).",
    configSummary: "{ role (required), model?, allowedTools?, disallowedTools?, nativeAgent?, agentDir? }",
    build: buildCopilot,
  },
  replay: {
    description: "Emits RECORDED artifacts by copying configured seed files from the corpus (context.corpusRoot). Offline/headless – no model, no cloud.",
    configSummary: "{ role?, seeds: [{ outputId, from (corpus-relative), to (workspace-relative) }] }",
    build: buildReplay,
  },
  mock: {
    description: "A test double that writes configured fixture outputs into the workspace. For unit tests / hermetic runs.",
    configSummary: "{ role?, outputs: { <filename>: <contents> } }",
    build: buildMock,
  },
};

/** Resolve a kind to its catalogue entry. THROWS loud on an unknown kind. */
export function resolveAgentKind(kind: string): AgentCatalogueEntry {
  const entry = AGENT_CATALOGUE[kind];
  if (!entry) {
    const known = Object.keys(AGENT_CATALOGUE).sort().join(", ");
    throw new Error(`agent-catalogue: unknown agent kind "${kind}" (a manifest referenced a kind not in the catalogue). Known: ${known}.`);
  }
  return entry;
}

/** Build the concrete StepAgent for a manifest's agent spec + the runner's env context. */
export function buildAgent(spec: AgentSpec, context: AgentBuildContext): StepAgent {
  return resolveAgentKind(spec.kind).build(spec.config ?? {}, context);
}
