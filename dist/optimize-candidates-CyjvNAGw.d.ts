import { T as TurnKey, E as EffortLevel, B as BuildTurn } from './step-key-D8bNukll.js';

type AgentRole = "spec-author" | "ux-designer" | "architect-reviewer" | "dba" | "test-strategist" | "orchestrator" | "navigator" | "driver" | "product-owner" | "release-engineer";

/**
 * The SPAWNABLE role agents: the log roles that are real subagents with a
 * <role>.md def + a model. Two log roles are NOT spawnable and are excluded:
 * "orchestrator" (the deterministic driver emits orchestration events under it)
 * and "release-engineer" (the deploy + promote phases are deterministic - the
 * driver runs consort-deploy + lakebase-scm-merge - and log under this
 * label; there is no release-engineer agent). Both are code, with no .md + no
 * model, so they are excluded here.
 */
type SpawnableAgentRole = Exclude<AgentRole, "orchestrator" | "release-engineer">;

/** Per-role settings as written on disk. `model` and `effort` are each either one
 *  value for the whole role, or a per-turn map (only navigator/driver have multiple
 *  turns). A per-turn `model` map is how the Driver's mechanical GREEN/REFACTOR runs
 *  on a cheaper/faster model than its RED (test authoring), the model-tiering lever. */
interface RoleSettingsFile {
    model?: string | Partial<Record<TurnKey, string>>;
    fallbackModel?: string;
    maxBudgetUsd?: number;
    effort?: EffortLevel | Partial<Record<TurnKey, EffortLevel>>;
    /** A `--mcp-config` file path (an MCP server the role's turn loads under the base
     *  --strict-mcp-config). The ux-designer role defaults ON to the kit-shipped browser
     *  MCP; set this to override that path, or to wire an MCP for another role. */
    mcpConfig?: string;
}
interface ConsortConfigFile {
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
    plan?: {
        sizing?: boolean;
    };
    project?: {
        uiTrack?: boolean;
        gates?: "interactive" | "proxy";
        deployTarget?: string;
        clientFramework?: "react" | "none";
        language?: "java" | "kotlin" | "python" | "nodejs";
    };
}

/** A Family-2 content/scope variant: what the agent SEES + CAN DO for one turn.
 *  All fields optional; the harness feeds each into the P2a seams (agent overlay
 *  copied into .claude/agents/, suffixes via DriveEffectsConfig hooks, tool scope
 *  via allowed/disallowedToolsForRole). */
interface CandidateContent {
    /** Overlay a variant role definition for the forked turn (the big lever: the
     *  role's instructions + its skills:/tools: frontmatter + scan-scope wording). */
    agentOverlay?: {
        role: string;
        markdown: string;
    };
    /** Appended to the role's task AFTER the terse suffix (a trailing directive). */
    taskSuffix?: string;
    /** Extra pre-extracted context appended BEFORE the terse suffix (inject-more/scan-less). */
    contextPackSuffix?: string;
    /** Restrict the turn's tool scope (--allowed-tools). */
    allowedTools?: string[];
    /** Deny specific tools for the turn (--disallowed-tools). */
    disallowedTools?: string[];
}
/** One point in the sweep space. */
interface Candidate {
    /** Stable, unique, filesystem-safe id (also the experiments/ subdir name). */
    id: string;
    /** Config-file overrides deep-merged onto the base consort-config.json (Family 1). */
    configOverrides: DeepPartial<ConsortConfigFile>;
    /** Extra env for the forked turn (e.g. CONTEXT_FREE_FRACTION), Family 1 knobs
     *  that ride on env rather than the config file. */
    env?: Record<string, string>;
    /** Family-2 content/scope variant, if any. */
    content?: CandidateContent;
}
/** The sweep spec: each dimension is optional; the generator crosses whichever
 *  are present with the baseline. Model / effort maps are keyed by build turn so a
 *  sweep can target, e.g., just the driver's GREEN turn. */
interface SweepSpec {
    /** The role the model/effort maps target (defaults to "driver"). */
    role?: SpawnableAgentRole;
    /** Per-turn candidate models to try, e.g. { green: ["haiku", "sonnet"] }. */
    models?: Partial<Record<BuildTurn, string[]>>;
    /** Per-turn candidate efforts to try, e.g. { green: ["low", "medium"] }. */
    efforts?: Partial<Record<BuildTurn, EffortLevel[]>>;
    /** build.sessionScope values to try. */
    sessionScopes?: Array<"story" | "cycle">;
    /** CONTEXT_FREE_FRACTION values to try (ride on env). */
    contextFreeFractions?: number[];
    /** build.loopGranularity values to try. */
    loopGranularities?: Array<"story" | "ac" | "hybrid-a">;
    /** Family-2 content variants to try (each becomes its own candidate). */
    contentVariants?: CandidateContent[];
}
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type { Candidate as C, SweepSpec as S };
