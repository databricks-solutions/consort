// The `.lakebase/consort-config.json` FILE primitive – the low config layer that reads/writes the
// on-disk project settings and resolves the non-model half (build/plan/project) from file -> code
// default. It imports only config-layer modules (step-key types, agent-models, agent-log's AgentRole
// type) so ANY layer may depend on it downward: the settings RESOLVER (which layers model/effort on
// top, needing manifests + the turn-key map) AND the domain modules that only touch the file
// (intake reads project.uiTrack; project-consort-setup writes the default). Splitting the file half
// DOWN here is what makes the graph acyclic – a domain no longer reaches UP into the resolver.
//
// Model knobs mirror what `claude -p` exposes: model, effort (low|medium|high|xhigh|max|default),
// fallbackModel, maxBudgetUsd. Their RESOLUTION is the resolver's job (project-settings.ts); this
// module only carries the on-disk SHAPE + the settings that need no model/turn-key machinery.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AgentRole } from "../logging/agent-log.js";
import { ALL_AGENT_ROLES, type SpawnableAgentRole } from "./agent-models.js";
import type { TurnKey, EffortLevel } from "./step-key.js";

// AgentRole is referenced only to keep the type surface identical for re-exporters.
export type { AgentRole };

/** Project-relative path of the unified config (canonical name, Consort era). */
export const CONSORT_CONFIG_REL = join(".lakebase", "consort-config.json");
/** Legacy config filenames, newest-first, still READ (tri-read) so projects
 *  scaffolded before a rename keep working until they migrate. New writes use
 *  CONSORT_CONFIG_REL. `sftdd-config.json` was the prior canonical name;
 *  `tdd-config.json` the one before that. */
export const LEGACY_CONFIG_RELS = [
  join(".lakebase", "sftdd-config.json"),
  join(".lakebase", "tdd-config.json"),
] as const;
/** @deprecated use CONSORT_CONFIG_REL. Kept as aliases for callers not yet updated. */
export const SFTDD_CONFIG_REL = CONSORT_CONFIG_REL;
/** @deprecated use CONSORT_CONFIG_REL. */
export const TDD_CONFIG_REL = CONSORT_CONFIG_REL;
/** @deprecated the immediate-predecessor legacy read path (`sftdd-config.json`). */
export const LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];

/** Per-role settings as written on disk. `model` and `effort` are each either one
 *  value for the whole role, or a per-turn map (only navigator/driver have multiple
 *  turns). A per-turn `model` map is how the Driver's mechanical GREEN/REFACTOR runs
 *  on a cheaper/faster model than its RED (test authoring), the model-tiering lever. */
export interface RoleSettingsFile {
  model?: string | Partial<Record<TurnKey, string>>;
  fallbackModel?: string;
  maxBudgetUsd?: number;
  effort?: EffortLevel | Partial<Record<TurnKey, EffortLevel>>;
  /** A `--mcp-config` file path (an MCP server the role's turn loads under the base
   *  --strict-mcp-config). The ux-designer role defaults ON to the kit-shipped browser
   *  MCP; set this to override that path, or to wire an MCP for another role. */
  mcpConfig?: string;
}

export interface ConsortConfigFile {
  version: 1;
  roles?: Partial<Record<SpawnableAgentRole, RoleSettingsFile>>;
  build?: {
    loopGranularity?: "story" | "ac" | "hybrid-a";
    batchCap?: number;
    sessionScope?: "story" | "cycle";
    /** #3 batch-RED lever. A CONTRACT story is forced to the fine-grained `ac` loop by default
     *  (localization safety on the risky drop-column migration). Set true to let contract stories
     *  use the normal loopGranularity/batchCap batching too — fewer cycles, but bigger GREEN steps
     *  (A/B before adopting; the churn-vs-cycles trade is real). Default false = current safe behavior. */
    batchContractStories?: boolean;
    /** #5 parallel per-AC lanes lever. Off (default) = a contract story's ACs build serially
     *  (current behavior, byte-identical). On = the first AC runs serial (authors the contract
     *  migration), then the rest fan out CONCURRENTLY in isolated lanes (git worktree + COW Lakebase
     *  child off the experiment branch), merged back + sequential fallback on conflict. Attacks the
     *  serialized wall-clock the verify-trimming levers can't. A/B before adopting. */
    parallelAcLanes?: boolean;
    /** CEILING on in-flight AC lanes when parallelAcLanes is on (host-contention safety). The KIT sizes
     *  the worker pool to the number of planned lanes and only caps DOWN to this ceiling — the operator
     *  does not hand-crank it to match the lane count. Default 8. */
    parallelAcLaneCap?: number;
    /** Split a multi-kind AC into ONE LANE PER KIND (component / client / behavior / fitness) so each
     *  kind's authoring parallelizes. Default off => one lane per AC. */
    splitAcsByKind?: boolean;
  };
  plan?: { sizing?: boolean };
  project?: {
    uiTrack?: boolean;
    gates?: "interactive" | "proxy";
    deployTarget?: string;
    clientFramework?: "react" | "none";
    // The backend language of the scaffolded project. The build lane resolves the product dir
    // + source/test file extensions from this (python/java/kotlin -> app/ + .py; nodejs -> src/ +
    // .ts/.tsx/.js). create-project persists it; absent (legacy projects) resolves to "java".
    language?: "java" | "kotlin" | "python" | "nodejs";
  };
}

/** The non-model half of the resolved settings (build/plan/project) – the portion that
 *  needs no per-step model/effort machinery, so it resolves purely from the file here. */
export interface ProjectFileSettings {
  build: { loopGranularity: "story" | "ac" | "hybrid-a"; batchCap?: number; sessionScope: "story" | "cycle"; batchContractStories: boolean; parallelAcLanes: boolean; parallelAcLaneCap: number };
  plan: { sizing: boolean };
  project: {
    uiTrack: boolean;
    gates: "interactive" | "proxy";
    deployTarget: string;
    clientFramework: "react" | "none";
    language: "java" | "kotlin" | "python" | "nodejs";
  };
}

/** Read `.lakebase/consort-config.json` (canonical), falling back through the
 *  legacy names (`sftdd-config.json`, then `tdd-config.json`) for projects
 *  scaffolded before a rename. Undefined when none exists / the first found is
 *  unparseable. */
export function loadConsortConfig(projectDir: string): ConsortConfigFile | undefined {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = join(projectDir, rel);
    if (!existsSync(f)) continue;
    try {
      return JSON.parse(readFileSync(f, "utf8")) as ConsortConfigFile;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Resolve the non-model project settings (build/plan/project) from the file -> code
 * default. The file is the SINGLE source of truth; there is no env override. The model/
 * effort layer is resolved ON TOP by resolveConsortSettings (project-settings.ts), which
 * needs the manifests + turn-key map; keeping this half here lets a domain that only reads
 * project.uiTrack (intake) depend DOWNWARD on the file primitive.
 */
export function resolveProjectSettings(projectDir: string): ProjectFileSettings {
  const file = loadConsortConfig(projectDir);
  const build = {
    loopGranularity: (file?.build?.loopGranularity ?? "story") as "story" | "ac" | "hybrid-a",
    batchCap: file?.build?.batchCap,
    sessionScope: (file?.build?.sessionScope ?? "story") as "story" | "cycle",
    batchContractStories: file?.build?.batchContractStories ?? false,
    parallelAcLanes: file?.build?.parallelAcLanes ?? false,
    parallelAcLaneCap: file?.build?.parallelAcLaneCap ?? 8,
    splitAcsByKind: file?.build?.splitAcsByKind ?? false,
  };
  const project = {
    uiTrack: file?.project?.uiTrack ?? true,
    // HITL-first: the declared project policy defaults to interactive (a human
    // approves each gate). Headless (proxy) is a deliberate opt-in, set in the
    // file or as a RUN-SCOPED --gates override (never persisted by a flag).
    gates: (file?.project?.gates ?? "interactive") as "interactive" | "proxy",
    deployTarget: file?.project?.deployTarget ?? "local",
    clientFramework: (file?.project?.clientFramework ?? "none") as "react" | "none",
    // Legacy projects (scaffolded before language was persisted) resolve to "python" – the
    // build lane's historical convention (app/ + .py + alembic), which is what the reference corpus
    // and pre-persistence projects actually are. A NEW scaffold persists its real language, so this
    // default only affects config-less/legacy trees.
    language: (file?.project?.language ?? "python") as "java" | "kotlin" | "python" | "nodejs",
  };
  const plan = { sizing: file?.plan?.sizing ?? true };
  return { build, plan, project };
}

/** The backend language of a project (with the java default legacy projects resolve to). */
export type ProjectLanguage = "java" | "kotlin" | "python" | "nodejs";

/** Product-code directory (project-root-relative) the build lane writes/validates PRODUCT code in:
 *  nodejs -> "src"; python/java/kotlin -> "app". This is the ONE place the app/-vs-src/ convention
 *  lives, so the driver's produced-path declaration and the semantic-gate readers agree by
 *  construction. */
export function productDirForLanguage(language: ProjectLanguage): string {
  return language === "nodejs" ? "src" : "app";
}

/** Source-file extensions the build-lane validators read PRODUCT code by, per language. */
export function productExtsForLanguage(language: ProjectLanguage): string[] {
  return language === "nodejs" ? [".ts", ".tsx", ".js", ".jsx"] : [".py"];
}

/** Test-file extensions the build-lane validators read TEST code by, per language. Non-node keeps
 *  the existing .py + react-client .ts/.tsx set; node adds .js/.jsx so a nodejs scaffold's tests
 *  are recognized. */
export function testExtsForLanguage(language: ProjectLanguage): string[] {
  return language === "nodejs" ? [".ts", ".tsx", ".js", ".jsx"] : [".py", ".ts", ".tsx"];
}

/** Convenience: resolve the project's language from its config (java default). */
export function projectLanguage(projectDir: string): ProjectLanguage {
  return resolveProjectSettings(projectDir).project.language;
}

/** A default config seeded from the recommended models (for scaffold / `--init`),
 *  with the navigator REVIEW effort pinned low (the P6 default made explicit). */
export function defaultConsortConfig(): ConsortConfigFile {
  // ONE per-turn config home: the step-manifest `agentOptions` (model/effort per turn), read by
  // resolveConsortSettings' manifest layer (manifestStep) and by the lean/replay harness directly.
  // defaultConsortConfig no longer bakes per-role/per-turn model or effort – doing so wrote a SECOND
  // copy into the scaffolded config file that SHADOWED the manifest, so a turn's model lived in two (or
  // three, with optimized-defaults.json) places and had to be kept in sync by hand. Now the scaffold
  // config carries only PROJECT settings (build/plan/project); every turn's model/effort comes from its
  // manifest, and a project overrides a turn by adding roles.<role>.model/effort to its own
  // consort-config.json (the file layer still wins over the manifest). The role base falls through to
  // RECOMMENDED_MODELS in the resolver. Applied optimization winners are written to the MANIFEST
  // agentOptions (optimize-apply), not here and not to an overlay file.
  const roles = {} as Record<SpawnableAgentRole, RoleSettingsFile>;
  for (const role of ALL_AGENT_ROLES) roles[role] = {};
  return {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story", batchContractStories: false, parallelAcLanes: false, parallelAcLaneCap: 8, splitAcsByKind: false },
    plan: { sizing: true },
    project: { uiTrack: true, gates: "interactive", deployTarget: "local", clientFramework: "none", language: "java" },
  };
}

/** Write a consort-config.json (scaffold/init). Does not overwrite unless force. */
export function writeConsortConfig(projectDir: string, config: ConsortConfigFile, opts?: { force?: boolean }): boolean {
  const f = join(projectDir, CONSORT_CONFIG_REL);
  if (existsSync(f) && !opts?.force) return false;
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

/**
 * Write-through for the drive's ad-hoc override flags (`--deploy-target`,
 * `--no-sizing`). These are WRITERS, not parallel readers: a flag persists its
 * value into consort-config.json so the file stays the single source of truth.
 * No-op when no override is given, so a plain run never mutates the file. Loads
 * the existing config (or the default when none) so unrelated fields are kept.
 *
 * `--gates` is intentionally NOT here: it is the HITL POLICY, and a run-scoped
 * flag must never rewrite the project's declared policy (that let one headless
 * `--gates proxy` invocation permanently flip an interactive project to proxy).
 * The drive resolves the effective gate mode as `--gates ?? project.gates` per
 * run and records it run-scoped in run-config.json; consort-config.json stays
 * authoritative and is only changed by editing the file.
 */
export function applyProjectOverrides(
  projectDir: string,
  over: { deployTarget?: string; sizing?: boolean },
): void {
  if (over.deployTarget === undefined && over.sizing === undefined) return;
  const cfg = loadConsortConfig(projectDir) ?? defaultConsortConfig();
  cfg.project = cfg.project ?? {};
  if (over.deployTarget !== undefined) cfg.project.deployTarget = over.deployTarget;
  cfg.plan = cfg.plan ?? {};
  if (over.sizing !== undefined) cfg.plan.sizing = over.sizing;
  writeConsortConfig(projectDir, cfg, { force: true });
}
