// The project SETTINGS RESOLVER: it layers the per-step model/effort resolution (which needs the
// shipped step-manifests + the action->turn-key map) ON TOP of the low config-file primitive
// (consort/config/consort-config-file.ts). Every project setting resolves sftdd-config.json -> code
// default, with no env or flag override at read time. Writers: create-project (create-time) and the
// drive's write-through override flags. The resolved result is what the driver runs with and what
// run-config.json snapshots. Run-mode knobs (record/replay/headless/debug) are not project settings;
// they stay explicit env inputs, read via consortEnv.
//
// The FILE half (shape, load/write, the build/plan/project resolution) lives DOWN in the config
// primitive so a domain module that only reads the file (intake, project-consort-setup) depends
// downward without reaching UP into this resolver. This module owns ONLY the model/effort layer,
// which is genuinely high (it consumes steps/manifest + drive/turn-key). The file symbols + turn-key
// types are RE-EXPORTED here so the many callers that have long imported them from this module keep
// working unchanged.
//
// Model knobs mirror what `claude -p` exposes: model, effort (low|medium|high|xhigh|max|default),
// fallbackModel, maxBudgetUsd.

import {
  loadConsortConfig,
  resolveProjectSettings,
  type ConsortConfigFile,
  type RoleSettingsFile,
} from "../../config/consort-config-file.js";
// Re-export the config-file primitive's surface so callers that import these from the resolver
// (their long-standing home) keep working unchanged. These are RE-EXPORTS, not definitions, so the
// single-home guard (which matches definition tokens) still sees one home – the primitive.
export {
  loadConsortConfig,
  writeConsortConfig,
  applyProjectOverrides,
  defaultConsortConfig,
  resolveProjectSettings,
  CONSORT_CONFIG_REL,
  LEGACY_CONFIG_RELS,
  SFTDD_CONFIG_REL,
  LEGACY_TDD_CONFIG_REL,
  TDD_CONFIG_REL,
} from "../../config/consort-config-file.js";
export type { ConsortConfigFile, RoleSettingsFile, ProjectFileSettings } from "../../config/consort-config-file.js";
import {
  ALL_AGENT_ROLES,
  RECOMMENDED_MODELS,
  readAgentConfig,
  type SpawnableAgentRole,
} from "../../config/agent-models.js";
// The per-step config directory (step-manifests/*.json agentOptions) is the SINGLE declared home
// for per-step model/effort. resolveConsortSettings reads it as the BASE per-step layer (below the
// project file + applied-winners overlay, above RECOMMENDED_MODELS) via agentOptionsForStep, which
// indexes the shipped manifests by the SAME (role, turnKey) the drive derives.
import { agentOptionsForStep } from "../steps/manifest.js";
import { turnKeyForAction, type TurnKey, type EffortLevel } from "../drive/turn-key.js";
// Re-export the turn-key types from their canonical (dependency-light) home so the many callers
// that have long imported them from sftdd-config keep working unchanged.
export type { TurnKey, EffortLevel, BuildTurn, DesignStep } from "../drive/turn-key.js";

/** The fully-resolved settings the driver runs with (file -> code default). */
export interface ResolvedSettings {
  /** A role's BASE model (the scalar it runs with when no per-turn override
   *  applies). Callers that know the turn should prefer `modelFor`. */
  models: Record<string, string>;
  fallbackModels: Record<string, string | undefined>;
  budgets: Record<string, number | undefined>;
  /** A role's explicit `--mcp-config` path from consort-config.json, or undefined.
   *  Only the operator OVERRIDE lives here; the ux-designer default-on browser MCP is
   *  applied above this (in the drive config wiring, which can resolve the kit dir). */
  mcpConfigs: Record<string, string | undefined>;
  /** Resolve the model to spawn a role's turn/step with: a per-key `model` map entry
   *  (e.g. driver GREEN on haiku, or spec-author BREAKDOWN on haiku) when present,
   *  else the role's base model. The model-tiering lever, applied per invocation
   *  step, not per role. */
  modelFor(role: string, turn?: TurnKey): string;
  /** Resolve a role's effort for a turn/step ("default" => omit --effort). */
  effortFor(role: string, turn?: TurnKey): EffortLevel;
  build: { loopGranularity: "story" | "ac" | "hybrid-a"; batchCap?: number; sessionScope: "story" | "cycle"; batchContractStories?: boolean; parallelAcLanes?: boolean; parallelAcLaneCap?: number; splitAcsByKind?: boolean };
  plan: { sizing: boolean };
  project: {
    uiTrack: boolean;
    gates: "interactive" | "proxy";
    deployTarget: string;
    clientFramework: "react" | "none";
  };
}

interface ResolveInputs {
  projectDir: string;
}

/**
 * Resolve the run settings: file -> code default, per setting. The file is the
 * SINGLE source of truth for project settings; there is no env override. Legacy
 * `.lakebase/agent-config.json` (models only) is honored as a fallback BELOW the
 * new file but ABOVE the built-in recommended, so existing projects keep their
 * model choices until they adopt sftdd-config.json.
 *
 * The build/plan/project half is resolved by the config-file primitive
 * (resolveProjectSettings); this composes the model/effort layer on top.
 */
export function resolveConsortSettings(inputs: ResolveInputs): ResolvedSettings {
  const file = loadConsortConfig(inputs.projectDir);
  const legacy = readAgentConfig(inputs.projectDir); // models only

  const models: Record<string, string> = {};
  const fallbackModels: Record<string, string | undefined> = {};
  const budgets: Record<string, number | undefined> = {};
  const mcpConfigs: Record<string, string | undefined> = {};
  for (const role of ALL_AGENT_ROLES) {
    const rc = file?.roles?.[role];
    const legacyEntry = legacy?.roles?.[role];
    // A per-turn `model` map has no single scalar; the base falls through to
    // legacy -> recommended -> inherit. Only a string `model` sets the base.
    const scalarModel = typeof rc?.model === "string" ? rc.model : undefined;
    models[role] =
      scalarModel ?? legacyEntry?.override ?? legacyEntry?.recommended ?? RECOMMENDED_MODELS[role] ?? "inherit";
    fallbackModels[role] = rc?.fallbackModel;
    budgets[role] = typeof rc?.maxBudgetUsd === "number" ? rc.maxBudgetUsd : undefined;
    mcpConfigs[role] = rc?.mcpConfig;
  }

  // The per-step config home: the levers DECLARED for (role, turn) across the shipped step-manifests
  // (agentOptions), indexed by the SAME turnKeyForAction the drive uses. This is the SINGLE source of
  // per-turn model/effort – below only what the PROJECT itself declares in its consort-config.json
  // (file scalar / file per-turn map, the override layer), above the per-role RECOMMENDED_MODELS base.
  // Only consulted when a turn key is present (an undefined key means "no distinct step" – use the role
  // scalar, never a manifest). Applied optimization winners are written HERE (optimize-apply's
  // applyWinnerToManifests), not to a separate overlay file – defaultConsortConfig no longer bakes any
  // per-turn model/effort, so there is exactly one place per turn.
  const manifestStep = (role: string, turn?: TurnKey): { model?: string; effort?: string } | undefined =>
    turn ? agentOptionsForStep(role, turn, turnKeyForAction) : undefined;

  const modelFor = (role: string, turn?: TurnKey): string => {
    const m = file?.roles?.[role as SpawnableAgentRole]?.model;
    // A per-key map wins for the turn/step it names (driver GREEN on haiku,
    // spec-author BREAKDOWN on haiku); a scalar (or an absent key in the map) falls
    // through to the manifest's per-step declaration, then the role's base model.
    if (m && typeof m !== "string" && turn && m[turn]) return m[turn] as string;
    if (typeof m === "string") return m; // file scalar applies to every turn
    const declared = manifestStep(role, turn)?.model;
    if (declared) return declared;
    return models[role] ?? "inherit";
  };

  const effortFor = (role: string, turn?: TurnKey): EffortLevel => {
    // The file is the single source when present: a scalar applies to all steps; a map is
    // per-step. Absent, the per-step config directory (step-manifest agentOptions) declares it;
    // absent there too, the model default (omit --effort). defaultEffort() is RETIRED – its three
    // former entries (navigator review, spec-author breakdown, test-strategist test-list) are now
    // DECLARED in their step-manifests, so the config directory is the single per-step home.
    const rc = file?.roles?.[role as SpawnableAgentRole];
    const e = rc?.effort;
    if (typeof e === "string") return e;
    if (e && turn && e[turn]) return e[turn] as EffortLevel;
    return (manifestStep(role, turn)?.effort as EffortLevel | undefined) ?? "default";
  };

  // The build/plan/project half resolves in the config-file primitive (file -> default).
  const { build, plan, project } = resolveProjectSettings(inputs.projectDir);

  return { models, modelFor, fallbackModels, budgets, mcpConfigs, effortFor, build, plan, project };
}
