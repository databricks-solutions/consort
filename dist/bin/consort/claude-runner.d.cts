import { D as DriveState, W as WorkflowAction } from '../../workflow-vocabulary-6_0e61c0.cjs';
import { T as TurnKey } from '../../step-key-QKMQdPvM.cjs';

interface TurnUsage {
    /** The turn's context size: input tokens the model processed this turn. */
    inputTokens: number;
    /** Tokens the model generated this turn. */
    outputTokens: number;
    /** Prompt-cache tokens read (warm-resume reuse), if reported. */
    cacheReadTokens?: number;
    /** Prompt-cache tokens written this turn, if reported. */
    cacheCreationTokens?: number;
    /** Dollar cost of the turn, if reported. */
    costUsd?: number;
    /** Agent-side turn count the CLI reports on the result event (`num_turns`), if present. A
     *  one-shot design turn is ~a handful; a retry-heavy / thrashing turn is many – the signal
     *  that distinguishes "slow because big" from "slow because it looped". */
    numTurns?: number;
    /** The CLI-reported wall-clock for the whole turn (`duration_ms`), if present. The agent's
     *  own measure, distinct from the orchestrator's outer step timer. */
    durationMs?: number;
}

type DriveCommand = {
    kind: "claude";
    role: string;
    model: string;
    task: string;
    resumeKey?: string;
    effort?: string;
    fallbackModel?: string;
    maxBudgetUsd?: number;
    allowedTools?: string[];
    disallowedTools?: string[];
    mcpConfig?: string;
    replay?: {
        mode?: string;
        buildMode?: string;
        story?: string;
    };
} | {
    kind: "cli";
    bin: string;
    args: string[];
} | {
    kind: "set-phase";
    phase: string;
} | {
    kind: "sync-backlog";
    sprint: string;
} | {
    kind: "verify-artifact";
    role: string;
    anyOf: string[];
    label: string;
};
interface CommandRunner {
    run(cmd: DriveCommand): Promise<void>;
}
interface DriveEffectsConfig {
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
    readFreshDriveState?(): DriveState;
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
    instructionsOverride?(action: Extract<WorkflowAction, {
        kind: "invoke-role";
    }>): string | undefined;
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
    onRoutingDecision?(action: WorkflowAction, state: DriveState, iteration: number, source: "nextTransition" | "bounded" | "contract"): void;
    /** OPTIONAL (RECORD lane): read + clear the just-completed live turn's transcript (prompt + final
     *  reasoning + tools) so the executor's ReplayRecorderWrapper persists it alongside the recorded
     *  delta. Supplied by the CLI (takeLastAgentTranscript) only when a RECORD_DIR capture is active;
     *  absent on a normal drive (the recorder then records the delta with no transcript). Typed loosely
     *  (returns the recorder's RecordedTranscript) to avoid a runtime edge onto the runner from here. */
    takeTranscript?(): {
        prompt: string;
        role?: string;
        model?: string;
        finalText: string;
        tools: string[];
    } | undefined;
}

/** One liveness event. `tool`/`text` mirror the agent stream; heartbeat/start/end are ours. */
interface TurnProgress {
    kind: "tool" | "text" | "heartbeat" | "start" | "end";
    tool?: string;
    /** Clock time (ms) the event was emitted. */
    atMs: number;
}
/**
 * The monitor a caller supplies to observe + bound one agent turn. All fields optional:
 *  - onProgress: called once per stream line (liveness) + on start/end/heartbeat.
 *  - heartbeatMs: emit a "heartbeat" if no progress for this long (detects a stalled turn);
 *    re-arms after each beat + resets on any real progress.
 *  - inactivityTimeoutMs: SILENCE deadline; fires the caller's onTimeout after this long with
 *    NO progress, and RE-ARMS on every real event (so a turn that keeps streaming never trips,
 *    however long it runs – the wedge signature is silence, not duration). This is the primary
 *    guard against a stalled API stream (child alive, socket open, but no bytes ever arriving,
 *    so `close` never fires and the await hangs forever). Fires at most once.
 *  - timeoutMs: HARD deadline from start; fires onTimeout when reached regardless of activity.
 *    A backstop for a turn that streams forever without finishing. Fires at most once.
 *    When both are set, whichever elapses first wins (both routed to the same onTimeout).
 */
interface TurnMonitor {
    /** Called with a fully-stamped event (the controller always supplies atMs). */
    onProgress?(p: TurnProgress): void;
    heartbeatMs?: number;
    inactivityTimeoutMs?: number;
    timeoutMs?: number;
}

interface ParsedArgs {
    feature?: string;
    sprint?: string;
    projectDir?: string;
    consortDir?: string;
    instance?: string;
    deployTarget?: string;
    approver?: string;
    dryRun?: boolean;
    maxSteps?: number;
    planOnly?: boolean;
    only?: string;
    pauseBefore?: string;
    gates?: string;
    noSizing?: boolean;
    help?: boolean;
}
/** A deterministic CLI effect (a kit SCM bin – wait-ci / merge / prepare-pr / deploy ,
 *  or any command the drive spawns) exited non-zero. Carries the bin + exit code so the
 *  drive's top-level catch can record a RESUMABLE escalation and emit a classified
 *  `RAISED TO HIL` halt line. Without a typed error the reject was a bare
 *  `new Error("<bin> exited N")` that fell through drive.cli's catch to an UNPREFIXED
 *  stderr line – `classifyDriveLine` returns null for it, so a session tailing
 *  `drive-live.log` (or a Monitor watching it) never surfaces the failure and the run
 *  looks like it is "still waiting on CI" when it has actually died. */
declare class CliEffectError extends Error {
    readonly bin: string;
    readonly code: number | null;
    /** The failing command's captured stdout+stderr tail, threaded into the escalation so a human
     *  sees the actual error without re-running the command. Undefined when nothing was captured. */
    readonly capturedOutput?: string | undefined;
    constructor(bin: string, code: number | null, 
    /** The failing command's captured stdout+stderr tail, threaded into the escalation so a human
     *  sees the actual error without re-running the command. Undefined when nothing was captured. */
    capturedOutput?: string | undefined);
}
declare function spawnCmd(bin: string, args: string[], cwd: string): Promise<void>;
/**
 * Spawn a `claude -p --output-format stream-json --verbose` turn, TEE the
 * human-readable assistant text to stderr (so the live console still shows the
 * agent working, not raw JSON), and return the turn's usage from the terminal
 * `result` event – the per-turn CONTEXT SIZE (input_tokens) + output + cache +
 * cost. stderr is inherited so claude's own errors surface. Usage parsing is
 * best-effort: a missing result event yields undefined (never breaks the turn).
 */
/** A claude turn that exited non-zero. `promptTooLong` flags the recoverable
 *  context-overflow case: the turn itself ballooned past the model window
 *  WITHIN the turn (many tool calls in one shot), the "Prompt is too long"
 *  failure the resume-time context guard cannot pre-empt. The runner retries
 *  this case on a FRESH session; any other non-zero exit is a hard failure. */
declare class ClaudeTurnError extends Error {
    readonly promptTooLong: boolean;
    /** The turn's output matched a transient API/network failure (connection
     *  dropped, overloaded, rate-limited, 5xx), so re-running it may succeed. */
    readonly transient: boolean;
    /** The turn was tree-killed by the inactivity monitor (stream went silent past
     *  the deadline – a stalled API stream that would otherwise hang forever). A
     *  stall IS a transient (retry on a fresh session), flagged distinctly so the
     *  retry log names it as a stall, not a wire blip. */
    readonly stalled: boolean;
    constructor(message: string, promptTooLong: boolean, 
    /** The turn's output matched a transient API/network failure (connection
     *  dropped, overloaded, rate-limited, 5xx), so re-running it may succeed. */
    transient?: boolean, 
    /** The turn was tree-killed by the inactivity monitor (stream went silent past
     *  the deadline – a stalled API stream that would otherwise hang forever). A
     *  stall IS a transient (retry on a fresh session), flagged distinctly so the
     *  retry log names it as a stall, not a wire blip. */
    stalled?: boolean);
}
/** A replay lane (LAKEBASE_CONSORT_REPLAY_DIR / _REPLAY_BUILD_DIR) was told to
 *  reproduce a turn the corpus has no artifact for. A replay is a RECORDING: it
 *  must never fall through to a live agent (that would let an agent "take over"
 *  a run meant to be deterministic, and silently mask a broken/incomplete
 *  corpus). So a miss is a hard, loud failure that names the missing artifact.
 *  Almost always the corpus is missing a file (e.g. a `.gitignore` glob dropped
 *  it) – put the artifact in the right place, do not run the model. */
declare class ReplayCorpusMissError extends Error {
    constructor(message: string);
}
/** FEIP-8006: a role turn completed but its expected artifact never landed under
 *  the project's `.consort/`. The subagent almost always resolved the project root
 *  wrong and wrote outside it (e.g. `$HOME/<somewhere>`), so a downstream
 *  consuming effect would otherwise crash reading the absent file, with a cryptic,
 *  MISATTRIBUTED error that blames the wrong step. We fail loud + attributed at the
 *  producing role instead, naming the role, the artifact, and where we looked. */
declare class ArtifactOutOfRootError extends Error {
    readonly role: string;
    readonly label: string;
    readonly anyOf: string[];
    readonly consortDir: string;
    /** FEIP-8038: the known malformed-sibling root we also checked (+ tried to
     *  relocate from). Named so the human knows exactly where to look. */
    readonly checkedSibling?: string | undefined;
    constructor(role: string, label: string, anyOf: string[], consortDir: string, 
    /** FEIP-8038: the known malformed-sibling root we also checked (+ tried to
     *  relocate from). Named so the human knows exactly where to look. */
    checkedSibling?: string | undefined);
}
/** The prompt + final reasoning + tool list captured from ONE agent turn, for
 *  the recorder to persist (demo transcript). Not the raw stream (that includes
 *  every interstitial "let me check" delta); just the outcome-level trace. */
interface TurnTranscript {
    /** The task prompt the agent was dispatched with (`claude -p <task>`). */
    prompt: string;
    role?: string;
    model?: string;
    /** The turn's FINAL assistant text (the outcome/rationale). */
    finalText: string;
    /** Each tool action in order (name + a clipped target), as they streamed. */
    tools: string[];
}
declare function takeLastAgentTranscript(cwd?: string): TurnTranscript | undefined;
/** PEEK the last turn's transcript WITHOUT clearing it – for an intermediate consumer (the
 *  ClaudeStepAgent reads finalText for its lastResult) that must NOT rob the recorder wrapper's
 *  take() of the transcript. The take()-clears contract is a single-consumer design; when TWO
 *  consumers run per turn (the agent's lastResult + the record wrapper), the earlier one MUST peek,
 *  or the wrapper gets undefined and transcript.md is silently never written (the bug this fixes:
 *  every executor-dispatched agent turn lost its transcript to the double-consume race). The record
 *  wrapper remains the sole take()-clearer, at end of turn.
 *  Pass `cwd` to read the transcript for THAT worktree – the concurrency-safe path (see
 *  lastAgentTranscriptByCwd); omit it for the serial global. */
declare function peekLastAgentTranscript(cwd?: string): TurnTranscript | undefined;
/** Record a turn's transcript as both the global last AND the per-cwd entry. Exported so the crosstalk
 *  safety (peek-by-cwd returns THIS cwd's turn, never a concurrent sibling's) is unit-testable without
 *  spawning claude. Called by spawnClaudeStreaming on each turn's close. */
declare function recordAgentTranscript(cwd: string, tx: TurnTranscript): void;
/** PEEK the last turn's usage WITHOUT clearing it. Pass `cwd` for the concurrency-safe per-worktree read. */
declare function peekLastAgentUsage(cwd?: string): TurnUsage | undefined;
/** Record a turn's usage as both the global last AND the per-cwd entry (mirrors recordAgentTranscript). */
declare function recordAgentUsage(cwd: string, usage: TurnUsage): void;
/** Per-turn EXECUTION metadata for the telemetry decorator: the model + reasoning-effort the turn
 *  actually ran with, how many times it was retried (context-overflow + transient budgets combined),
 *  and the turn's usage (tokens). Distinct from TurnUsage (which is parsed from the CLI result event):
 *  model/effort/retryCount are runner-side knobs not present in that event. Recorded by the runner AFTER
 *  a turn's retry loop settles; TAKEn by the telemetry decorator (with-telemetry) when it builds the
 *  per-turn span. Best-effort observability, never load-bearing. */
interface TurnMeta {
    role?: string;
    /** The exact model id the turn ran on (e.g. an "opus"/"sonnet" family id); bucketed at the span. */
    model?: string;
    /** The reasoning-effort lever the turn ran with ("" / undefined when none was passed). */
    effort?: string;
    /** Combined retry count for the turn (context-overflow retries + transient retries). 0 = clean. */
    retryCount?: number;
    usage?: TurnUsage;
}
/** TAKE (read + clear) the last turn's meta. Mirrors takeLastAgentTranscript: the telemetry decorator is
 *  the SOLE per-turn consumer, so take-clears prevents a stale meta leaking onto the NEXT turn's span (a
 *  gate action between two role turns records no meta; without the clear it would inherit the prior
 *  turn's model/effort). Pass `cwd` for the concurrency-safe per-worktree read; omit for the serial drive. */
declare function takeLastTurnMeta(cwd?: string): TurnMeta | undefined;
/** PEEK the last turn's meta WITHOUT clearing (parity with peekLastAgentTranscript / peekLastAgentUsage). */
declare function peekLastTurnMeta(cwd?: string): TurnMeta | undefined;
/** Record a turn's meta as both the global last AND the per-cwd entry (mirrors recordAgentUsage). */
declare function recordTurnMeta(cwd: string, meta: TurnMeta): void;
/** Build the default per-turn monitor from the module timeout constants. A turn with
 *  neither an inactivity nor a heartbeat window returns undefined (a byte-identical
 *  no-op controller). Exposed as its own function so tests can assert the mapping and
 *  callers can override. */
declare function defaultTurnMonitor(sink: (p: TurnProgress) => void): TurnMonitor | undefined;
declare function spawnClaudeStreaming(args: string[], cwd: string, 
/** Override the per-turn liveness monitor (tests inject a fake-clock-driven one).
 *  Omitted => the default built from TURN_INACTIVITY_TIMEOUT_MS / TURN_HEARTBEAT_MS. */
monitorOverride?: TurnMonitor): Promise<TurnUsage | undefined>;
/**
 * The spawn flags for a claude command's optional tool-scope levers (the
 * optimize harness's Family-2 "restrict what the agent can scan/do" knob). A
 * pure function of the command so it is hermetically testable and has ONE
 * source of truth. Empty (both fields absent or empty) => `[]`, so a normal
 * drive command (which sets neither) spawns byte-identically to before.
 */
declare function claudeToolArgs(cmd: Extract<DriveCommand, {
    kind: "claude";
}>): string[];
/** Kit-shipped MCP config the ux-designer role uses by default: a headless browser
 *  server so the design turn can navigate the reference sites the brief names and read
 *  their real computed styles. Absolute (via kitRoot) so it resolves in a dev clone AND
 *  an installed package, independent of workspace provisioning. */
declare const UX_BROWSER_MCP_CONFIG = "skills/consort/config/ux-browser-mcp.json";
/** The default `--mcp-config` path for a role when consort-config.json sets no explicit
 *  override: the kit-shipped browser MCP for ux-designer, undefined for every other role
 *  (so no other spawn changes). ONE source of truth for the default, shared by the drive
 *  config wiring and its guard test. */
declare function defaultMcpConfigForRole(role: string): string | undefined;
/** The tools the ux-designer's browser turn needs PRE-APPROVED for headless auto-run.
 *  Paired with defaultMcpConfigForRole: the role that LOADS the browser MCP is the one
 *  whose MCP + web tools must be in `--allowed-tools`, or acceptEdits denies them with no
 *  human to grant. `mcp__playwright` (the browser server), `WebFetch` (read a named
 *  reference), `WebSearch` (find references when the brief names none) — the same three
 *  the ux-designer frontmatter grants. Empty for every other role (spawn unchanged). */
declare const UX_BROWSER_ALLOWED_TOOLS: readonly ["mcp__playwright", "WebFetch", "WebSearch"];
declare function browserAllowedToolsForRole(role: string | undefined): string[];
/** The command that installs the browser the ux-designer's MCP drives. `@playwright/mcp` does
 *  NOT auto-install a browser — without Chromium present the MCP starts but every navigate fails
 *  ("browser not installed"), so the ux-designer reports the browser unavailable and degrades to
 *  the brief. `@latest` keeps the installed browser aligned with `@playwright/mcp@latest` in
 *  ux-browser-mcp.json. Exported so the guard test pins it. */
declare const UX_BROWSER_INSTALL_CMD: {
    readonly command: "npx";
    readonly args: readonly ["--yes", "playwright@latest", "install", "chromium"];
};
/** Ensure Playwright's Chromium is installed BEFORE the ux-designer's browser MCP launches. Run
 *  here (in the drive, ahead of the `claude -p` spawn) rather than inside the MCP command so the
 *  potentially slow first-time download happens OUTSIDE the MCP's own startup timeout — otherwise
 *  a cold Chromium fetch makes the server look like it failed to start. Idempotent (a no-op once
 *  installed), memoized to once per drive process, and never fatal: on failure the ux-designer
 *  still runs and degrades to the brief exactly as it does when the browser is unavailable. */
declare function ensureUxBrowserChromium(): void;
/**
 * The base `claude -p` spawn args for a role turn. Pure + exported so the flag set
 * is guardable. Headless essentials: -p (print), --agent/--model, --strict-mcp-config,
 * stream-json + --verbose (to capture turn.usage while teeing text).
 *
 * --setting-sources project is LOAD-BEARING: headless `claude -p` does NOT load a
 * directory's project settings (incl. its `.claude/agents/*.md` role definitions) by
 * default, so `--agent <role>` fails with "agent not found" unless project settings are
 * explicitly sourced. The kit's role agents live at `<projectDir>/.claude/agents/`
 * (laid down by the scaffolder's deployClaudeAgents, or into a throwaway workspace for a
 * lean live run); `--setting-sources project` is what makes `--agent spec-author` /
 * `--agent ux-designer` / ... resolve. (Verified: the child init event's `agents` list
 * includes the role only when this flag + the .claude/agents file are both present.)
 *
 * --permission-mode acceptEdits is LOAD-BEARING: a scaffolded project ships no
 * .claude/settings.json, so without an explicit mode a headless role agent DEFAULTS
 * TO PROMPTING – and there is no one to answer. A role agent must both WRITE its
 * artifact (feature-spec.json, story stubs, code) AND RUN kit CLIs (its self-check
 * `consort-response-formatter`, the cycle stamps); acceptEdits auto-accepts
 * both headlessly (verified: Write-tool AND Bash writes land with permission_denials
 * empty and is_error false).
 *
 * Why acceptEdits and NOT bypassPermissions: an enterprise managed-settings policy
 * (/Library/Application Support/ClaudeCode/managed-settings.json) sets
 * `permissions.disableBypassPermissionsMode: "disable"`. When that policy is present,
 * a spawned `claude -p --permission-mode bypassPermissions` is SILENTLY DOWNGRADED to
 * `default` (the child session's init event reports permissionMode "default"), which
 * then auto-DENIES every headless prompt – the exact opposite of what we want. So
 * bypassPermissions is not a stronger acceptEdits in this environment; it is broken.
 * acceptEdits is the strongest mode the policy honors, and it is sufficient. SCOPED to
 * the throwaway, isolated, scaffolded project the drive runs in – this spawns each
 * role agent autonomous within that project, not the operator's session.
 */
declare function claudeBaseArgs(cmd: Extract<DriveCommand, {
    kind: "claude";
}>): string[];
declare function execRunner(cfg: DriveEffectsConfig): CommandRunner;
/** Build a DriveEffectsConfig for a feature (or planning, featureId ""). */
declare function buildCfg(args: ParsedArgs, featureId: string): DriveEffectsConfig;

export { ArtifactOutOfRootError, ClaudeTurnError, CliEffectError, type ParsedArgs, ReplayCorpusMissError, type TurnMeta, type TurnTranscript, UX_BROWSER_ALLOWED_TOOLS, UX_BROWSER_INSTALL_CMD, UX_BROWSER_MCP_CONFIG, browserAllowedToolsForRole, buildCfg, claudeBaseArgs, claudeToolArgs, defaultMcpConfigForRole, defaultTurnMonitor, ensureUxBrowserChromium, execRunner, peekLastAgentTranscript, peekLastAgentUsage, peekLastTurnMeta, recordAgentTranscript, recordAgentUsage, recordTurnMeta, spawnClaudeStreaming, spawnCmd, takeLastAgentTranscript, takeLastTurnMeta };
