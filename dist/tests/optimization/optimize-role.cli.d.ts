#!/usr/bin/env node
import { W as WorkflowAction } from '../../workflow-vocabulary-BcVQ-ETk.js';

/** One role chain's definition (the DATA that drives both the live test + the sweep). */
interface RoleChain {
    /** Human name for the test title / report. */
    name: string;
    /** The chain dir under tests/integration/manifests/; its manifest ids are <dir>-seed/-live. */
    dir: string;
    /** The artifact the live role writes (workspace-relative = the manifest output filename). */
    outputFile: string;
    /** The live-turn prompt handed to the real agent. */
    prompt: string;
    /** OPTIONAL quality-gate reference override – the RECORDED PER-TURN OUTPUT this isolated turn is
     *  judged against, resolved relative to the CAMP root (consort/evaluation/reference-assets/stockflow).
     *  When the accreted `outputFile` (the whole-feature artifact merged across every story/turn) is a
     *  WIDER scope than what the isolated turn was given the inputs to produce, judge against the EXACT
     *  output the corresponding recorded turn wrote (extracted verbatim under recorded-turns/<NNNN>-<role>),
     *  NOT a hand-carved slice (see feedback_judge_against_recorded_turn_output + the camp README).
     *  Absent => score against `outputFile` under recorded-artifacts (the produced artifact IS the whole
     *  recorded one, e.g. the F1 architecture is authored in one turn so it equals the accreted form). */
    referenceFile?: string;
    /** Where `referenceFile` is resolved from: "camp" (default – the extracted recorded-turns/ output)
     *  or "intake" (legacy, the seed corpus). Only "camp" is used now; the field documents intent. */
    referenceRoot?: "camp" | "intake";
}

/** One build-role chain's definition. `assertKind` tells the live test/sweep which output shape to
 *  expect: "red" = a tests/ tree (functional coverage judge), "assess" = a discriminator marker in
 *  the AC cycle dir (alignment judge), "review"/"reflect" = verdict files (verdict-alignment judge).
 *  `outputKind` is the build-output kind for the functional reference (navigator=tests).
 *  `extraSnapshotRoots` names the workspace-root dirs (tests/) the navigator writes, so
 *  producedArtifacts preserves them past teardown. */
interface BuildRoleChain {
    name: string;
    dir: string;
    start: WorkflowAction;
    assertKind: "red" | "assess" | "review" | "reflect";
    /** The primary output path the live role writes (workspace-relative). For RED = "tests"; for
     *  ASSESS = the AC cycle dir; for REVIEW/REFLECT = the verdict file path. Matches the manifest's
     *  first output filename. */
    outputFile: string;
    /** Workspace-root dirs to also snapshot (the code the navigator writes lives outside .consort). */
    extraSnapshotRoots: string[];
    prompt: string;
    /** Optional: for REVIEW/REFLECT chains, the workspace-relative path where the verdict lands
     *  (the producedArtifacts key that holds the recorded reference verdict). REVIEW =>
     *  `.consort/cycles/<F>/<S>/review-verdict.json`; REFLECT =>
     *  `features/<F>/stories/<S>/reflect-verdict.json`. Omitted for RED/ASSESS (no verdict). */
    verdictFile?: string;
}

/** The candidate's lever patch on the live role's AgentLevers. All optional; absent = the role's
 *  default (baseline). tool-scope patches restrict what the turn may call. */
interface RoleLeverPatch {
    model?: string;
    effort?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    /** Session lever: "resume" warms the turn from a prior same-key session (the real drive's
     *  per-story build warmth). Only meaningful on a MULTI-TURN substrate that ran a prior turn to
     *  resume – the single-turn chain cannot measure it (see `roleCandidates` multiTurn gate). */
    session?: "fresh" | "resume";
    /** TEST-STRATEGIST ONLY: per-analyst subagent lever overrides (behavior/fitness/client), keyed by
     *  analyst kind. The test-strategist is a SUPERVISOR – its own model/effort is not the interesting
     *  lever; what matters is the per-analyst subagent levers it fans out to. This patch does NOT touch
     *  the supervisor's AgentLevers; it is projected into the injected test-analyst roster (see
     *  renderTestAnalystRoster overrides), so the supervisor spawns each analyst Task with the swept
     *  model/effort/tool_scope. Absent on every non-test-strategist candidate. */
    analystOverrides?: Record<string, {
        model?: string;
        effort?: "low" | "default" | "high";
        toolScope?: string[];
    }>;
    /** DRIVER-GREEN enforcement (E1): install a per-candidate PreToolUse hook that DENIES a no-arg
     *  full-suite invocation (`run-tests.sh` / `make test` / `npm test`) while allowing a targeted
     *  `pytest <path>` / `run-tests.sh <path>`. A hook (not a deny-glob) because the no-arg-vs-path
     *  distinction is argument-level, which deny-globs match unreliably. See DRIVER-GREEN-LEVERS.md. */
    guardSuite?: boolean;
    /** DRIVER-GREEN enforcement (E2): deny directory-SCANNING commands (ls/find/grep/rg) via the SAME
     *  PreToolUse hook as guardSuite. A hook (not `permissions.deny` globs) because globs match only the
     *  command PREFIX – they miss `cd <dir> && ls` and piped `… | grep`, which the driver actually uses
     *  (proven in the first sweep: deny-scan was inert). The hook splits the command on &&/||/;/| and
     *  checks each segment's verb, so a scan anywhere in a compound/pipeline is caught. */
    guardScan?: boolean;
    /** DEPRECATED raw `permissions.deny` globs (prefix-only; miss `cd && ls`). Kept for callers that
     *  want literal deny rules, but driverGreenCandidates uses guardScan (hook-based) instead. */
    denyBash?: string[];
    /** DRIVER-GREEN context (C1/C2): the pre-computed context sections to enable in `buildContextPack`
     *  (`"db-state"` = inject `alembic current`/`heads` once; `"failing-test"` = inject the failing RED
     *  test body). Applied by setting the `LAKEBASE_CONSORT_CTX_*` env the drive inherits. */
    ctxPack?: ("db-state" | "failing-test" | "scope-note" | "migration")[];
    /** ENVIRONMENT/replay levers. Like model/effort above, each DEFAULTS to the RECORDED corpus run-config
     *  value (the sweep replays that recording) and a candidate OVERRIDEs it to test a perturbation. Absent
     *  => use the recorded value. (The corpus is the single source for ALL turn settings – models, effort,
     *  and these env knobs alike; levers are the only deviation.) */
    uiTrack?: boolean;
    loopGranularity?: "story" | "ac" | "hybrid-a";
    deployTarget?: "local" | "workspace";
    buildSessionScope?: "cycle" | "story";
    batchCap?: number;
}

/** The levers in effect for a role's turn (what a sweep varies). Mirrors the manifest
 *  agentOptions + the DriveEffectsConfig scope levers, so a record states exactly what produced
 *  its numbers. All optional – a default-lever run simply omits the ones it did not set. */
interface RoleLevers {
    model?: string;
    effort?: string;
    session?: "fresh" | "resume";
    resumeKeyFrom?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    /** Free-form note for any non-standard lever a sweep applied (taskSuffix/contextPack/etc.). */
    note?: string;
}
/** The agent-reported usage for the turn (from the stream-json result event via TurnUsage).
 *  Absent when the agent reported none (a mock/replay turn, or a stream with no result event). */
interface RoleAgentUsage {
    /** Agent-side turn count (`num_turns`) – the retry/loop signal. */
    numTurns?: number;
    /** The CLI-reported wall-clock (`duration_ms`), distinct from the outer step timer. */
    durationMs?: number;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    /** Tool calls the turn made (transcript tool count) – the "how much did it DO" signal. */
    toolCalls?: number;
}
/** The agent's captured trace for the turn (prompt it was dispatched with, its final assistant
 *  text, and the ordered tool actions) – the same triple the legacy turn-recorder persisted. */
interface RoleTranscript {
    prompt: string;
    finalText: string;
    tools: string[];
}
/** One isolated role turn's full instrumentation record – the thing that SURVIVES the run. */
interface RoleTelemetry {
    /** The design/plan role whose turn this measures. */
    role: string;
    /** The chain dir the turn ran in (its manifest ids are <chain>-seed / <chain>-live). */
    chain: string;
    /** The model the turn ran on (also in levers.model; hoisted for the summary line). */
    model?: string;
    /** The levers in effect (what a sweep varies to try to beat this baseline). */
    levers: RoleLevers;
    /** The ORCHESTRATOR's outer wall-clock for the whole step (spawn + validate), ms. This is
     *  the number the vitest per-test timer reports; it always exists. */
    outerDurationMs: number;
    /** The agent's self-reported usage (tokens/cost/num_turns/duration), when available. */
    agent?: RoleAgentUsage;
    /** The turn's route outcome (produced / blocked / revise / escalate). */
    outcome: string;
    /** The artifact the role produced (workspace-relative), when it produced one. */
    producedFile?: string;
    /** The agent's trace, when captured. */
    transcript?: RoleTranscript;
    /** The QUALITY score (0..1) of the produced artifact vs the recorded baseline, from the
     *  semantic/functional judge – present only when a sweep ran the quality gate. A fast candidate
     *  with a LOW score produced a conformant-but-thinner artifact than the baseline (the coverage
     *  the conformance gate can't see). Undefined = quality not judged (conformance-only run). */
    semanticScore?: number;
    /** BUILD DISCRIMINATOR classification (build sweeps only): the assess-style verdict on the
     *  produced code – "equivalent" (clean, converged with NO self-heal – the BEST outcome),
     *  "superseded-shift", "regression", or "insufficient" (the only failing verdict). Undefined
     *  on a design sweep (flat semanticScore instead). */
    classification?: string;
    /** The NEXT STEP the discriminator classification warrants (accept / permissive-refactor-
     *  superseded / driver-repair-with-directive / escalate). */
    nextStep?: string;
}

/** One candidate's judge verdict. `passed` is the pass bar (>= threshold for a semantic/functional
 *  score judge; classification != "insufficient" for a discriminator/verdict-alignment judge). The
 *  optional fields carry the discriminator/verdict-alignment detail so the report + summary can
 *  surface WHY (a clean "equivalent"/accept is a positive, not merely "passed"). */
interface QualityVerdict {
    passed: boolean;
    score?: number;
    classification?: string;
    nextStep?: string;
    reason?: string;
}
/** The MANDATORY quality gate for a sweep: a per-chain judge CLOSURE that scores a conformant
 *  candidate's produced output against the recorded reference and returns a QualityVerdict. This is
 *  a closure (not a fixed reference+judge pair) so EVERY chain kind supplies its OWN discriminator ,
 *  design/red use the opus text judge, assess uses the marker-alignment discriminator, review/reflect
 *  use the verdict-alignment judge, driver-green uses the build-code discriminator. The judge is
 *  REQUIRED: a conformant candidate whose judge is absent, throws, or yields no verdict is DISQUALIFIED
 *  (never silently unscored) – an LLM judge is a hard requirement of every evaluation, the only thing
 *  that guarantees product-result equivalence. `producedArtifacts` is the candidate's captured output
 *  tree, so a judge that needs more than the primary file (a code/verdict tree) can read it. */
interface QualityGate {
    judgeCandidate: (args: {
        candidateId: string;
        primary: string | undefined;
        producedArtifacts: Record<string, string>;
    }) => Promise<QualityVerdict>;
}
/** One candidate's measured outcome. `gatePassed` is the conformance bar (no violations + the
 *  artifact produced + the chain terminated at design-complete); `qualityPassed` is the
 *  quality-vs-baseline bar (undefined when no quality gate ran); `telemetry` is the trial record;
 *  `disqualified` (+ reason) marks a crash or a chain that never reached the live turn. */
interface SweepTrial {
    candidateId: string;
    levers: RoleLeverPatch;
    gatePassed: boolean;
    qualityPassed?: boolean;
    telemetry?: RoleTelemetry;
    /** The PRESERVED produced-artifact tree for this candidate ({relpath -> contents}), so the
     *  caller persists the actual outputs to a durable per-candidate dir – not just telemetry.
     *  Empty on a disqualified/crashed candidate that produced nothing. */
    producedArtifacts?: Record<string, string>;
    disqualified?: boolean;
    reason?: string;
}

/** One ranked row in the report (a gate-passing candidate + its deltas vs baseline). */
interface SweepRow {
    candidateId: string;
    levers: SweepTrial["levers"];
    outerDurationMs: number;
    costUsd?: number;
    /** % faster than baseline by wall-clock (positive = faster). */
    speedupPct: number;
    /** Dollar delta vs baseline (negative = cheaper). */
    costDeltaUsd?: number;
    /** BUILD discriminator classification (build sweeps only), surfaced as a positive note. */
    classification?: string;
}
/** The full sweep report. */
interface SweepReport {
    role: string;
    baselineMs: number;
    baselineCostUsd?: number;
    /** Gate-passers ranked fastest-first (includes the baseline). */
    ranked: SweepRow[];
    /** The fastest gate-passer that BEAT the baseline, or undefined when none did. */
    winner?: SweepRow;
    /** Candidates that failed the gate or crashed (id + why), for the report tail. */
    rejected: Array<{
        candidateId: string;
        reason: string;
    }>;
}

/** A driver turn the sweep can exercise, and the CONTAINED next-step navigator determination it is
 *  judged against. `evaluatorKind` picks the directional comparison (assess for green/repair, review
 *  for refactor); `refRel` is the camp-relative dir holding the recorded determination (copied into
 *  consort/evaluation/reference-assets/stockflow/next-step/ – the corpus is assumed deleted). */
interface DriverTurnSpec {
    driverTurn: "green" | "repair" | "refactor";
    evaluatorKind: "assess" | "review";
    /** Camp-relative dir (under BUILD_CORPUS_REL) with the recorded next-step determination. */
    refRel: string;
    /** The RECORDED original turn's wall-clock (ms), from the corpus agent-log – the fixed baseline the
     *  sweep scores each candidate's time against (same/better/worse), so we compare to the recording
     *  (not a noisy fresh baseline run). Absent => fall back to the live baseline candidate's median. */
    recordedBaselineMs?: number;
}
declare const DRIVER_TURN_SPECS: Record<string, DriverTurnSpec>;
/** Expand a --chains spec (a set keyword OR a comma list of handles) into concrete chain handles,
 *  validated against ROLE_CHAINS + BUILD_ROLE_CHAINS + synthetic handles (driver-green). Pure + exported for a unit test.
 *  De-dupes while preserving order. */
declare function expandChains(spec: string, chains?: Record<string, unknown>): string[];
/** Parsed CLI args. `chains` is the resolved handle list (one or many). */
interface OptimizeRoleArgs {
    chains: string[];
    baseModel?: string;
    telemetryDir?: string;
    concurrency?: number;
    /** Optional candidate-id subset (comma list). When set, only these candidates run – used to
     *  RESUME a partial driver-green sweep (run just the ones a crash didn't complete). Their trials
     *  MERGE with any per-candidate trials already persisted under the run dir, so the rollup covers
     *  the full set. Absent => every candidate runs. */
    candidates?: string[];
    /** Replicate each SELECTED candidate N times, as `<id>-r1..-rN` (unique ids => unique deterministic
     *  ports). Used to measure a single lever's VARIANCE by running it N times IN PARALLEL in one trial
     *  (pair with --concurrency N). Absent/1 => no replication. */
    replicas?: number;
    /** Path to an externalized EXPERIMENT config (turn + candidates + levers). When set (driver chains),
     *  it SUPPLIES the candidates + the corpus turn (preconditions) + concurrency/replicas – the run picks
     *  up the config instead of the hardcoded driverGreenCandidates()/default turn. See experiment-config. */
    experiment?: string;
}
/** Parse argv (pure + exported for a unit test). Accepts --chains <set|list> OR the back-compat
 *  single --role <handle>. Throws loud on an unknown/absent chain. */
declare function parseArgs(argv: string[], chains?: Record<string, unknown>): OptimizeRoleArgs;
/** Replicate each candidate N times as `<id>-r1..-rN` (same levers, unique ids). N<=1 => unchanged.
 *  Pure + exported for a unit test. The unique ids give each replica its own deterministic deploy port. */
declare function expandReplicas<C extends {
    id: string;
}>(cands: C[], replicas?: number): C[];
/** The driver-green sweep: a CLOUD LIVE run (requires RUN_LIVE_STEP + LAKEBASE_TEST_E2E to be set).
 *  Each candidate runs a FULL driver-GREEN cycle with the levers patched, gates on honest-GREEN, is
 *  JUDGED (code discriminator vs the 003-driver pin), and PRESERVED – all via the ONE sweep engine. */
/** Resolve which candidates a driver-green run executes: all of them, or the named subset (a resume of a
 *  partial sweep). Throws loud on an unknown id BEFORE any scaffold is spun up – a typo in a resume must
 *  not burn a live scaffold. Pure + exported for a unit test. */
declare function selectDriverCandidates<C extends {
    id: string;
}>(all: C[], subset?: string[]): C[];
declare function sweepDriverGreen(handle: string, runRoot: string, opts?: {
    concurrency?: number;
    candidates?: string[];
    replicas?: number;
    experiment?: string;
}): Promise<{
    summary: ChainSummary;
}>;
/** The camp-relative path to the recorded driver-GREEN code pin (003-driver's app/ DIRECTORY). The
 *  driver-green sweep judges every candidate's produced app/ against this. Exported so a hermetic
 *  test can assert it resolves to non-empty concatenated .py text (guards the dir-vs-file EISDIR
 *  the live path hit: readFileSync on this directory throws, so it MUST go through readCampAppDir). */
declare const DRIVER_GREEN_CODE_PIN_REL = "recorded-build/features/F6-split-tracking-code/stories/S1-split-columns-migration/turns/003-driver/code/app";
/** Concatenate the produced files under `prefix` with a matching extension into ONE deterministic text
 *  (sorted by relpath). Used to reconstruct the judged text when a chain's outputFile is a DIRECTORY
 *  (navigator-red's "tests"), where `producedArtifacts[outputFile]` is always undefined (snapshotTree
 *  only keys individual files). Exported so a hermetic guard can prove the reconstruction is non-empty
 *  (the latent bug: a bare-key lookup made the red judge always short-circuit to "no tests produced"). */
declare function concatTreeFiles(producedArtifacts: Record<string, string>, prefix: string, exts: readonly string[]): string;
/** Read a required recorded-code reference that is an app/ DIRECTORY (a tree of .py files) from the
 *  CAMP and concatenate its .py contents into ONE text, the SAME shape the driver-green judge builds
 *  from the candidate's produced app/ (its `app/**\/*.py` joined). Sorted by relpath so the reference
 *  text is deterministic across runs. Throws loud if the dir is absent or holds no .py (the code
 *  judge is mandatory and cannot run without its reference – never a silent skip). Exported for a
 *  hermetic guard test. */
declare function readCampAppDir(relFromCorpusRoot: string, what: string): string;
/** Build the MANDATORY per-chain judge (a QualityGate closure). Every chain kind routes to its OWN
 *  existing discriminator in consort/evaluation/semantic-gate, comparing the candidate's produced
 *  output to the committed recorded reference. There is NO judge-less branch – an LLM judge is a hard
 *  requirement of every evaluation (the guarantee of product-result equivalence). A missing reference
 *  throws (evaluation invalid), never a silent skip. */
declare function buildChainJudge(chain: RoleChain | BuildRoleChain, handle: string, isBuildChain: boolean): QualityGate;
/** The MANDATORY per-DRIVER-TURN judge (a QualityGate closure), SHARED by the live sweep (sweepDriverGreen)
 *  and the re-judge harness so BOTH score a driver candidate identically: run the candidate's captured
 *  NEXT-STEP navigator determination (marker files under NEXT_STEP_MARKER_PREFIX in producedArtifacts)
 *  through evaluateNextStepDetermination, comparing it to the CONTAINED recorded determination for that
 *  driver turn (assume corpus gone). Reuses makeSupersessionDeltaJudge (assess set-delta) +
 *  makeVerdictAlignmentJudge (review). Maps the directional verdict: pass + pass-with-honors => passed
 *  (honors surfaced via classification + nextStep); fail => not passed. A missing reference throws.
 *
 *  INVARIANT – the discriminator is the NAVIGATOR DETERMINATION, never a turn OUTPUT signal. DO NOT wrap
 *  this judge with an honest-GREEN (or any driver-output) shortcut that returns pass/pass-with-honors
 *  WITHOUT consulting the navigator determination. The corpus recorded not just the driver output but how
 *  the navigator EVALUATED it at that step; the trial re-runs that SAME evaluation live and this judge
 *  compares the two, SAME / BETTER / WORSE. Whether the driver's own green passed is a report signal only
 *  – a green that ignored a supersession is WORSE (it breaks prior tests), not "better", and ONLY the
 *  navigator determination tells them apart. A shortcut here silently mis-scores that case. This invariant
 *  is locked by "buildDriverNextStepJudge is the discriminator (no output shortcut)" in
 *  tests/bdd/optimize-role-cli.test.ts – keep it green. See consort/optimize/DRIVER-GREEN-LEVERS.md. */
declare function buildDriverNextStepJudge(handle: string): QualityGate;
/** Sweep ONE chain end to end + persist its evidence + report under <runRoot>/<handle>/. Returns
 *  the chain's report (for the multi-chain roll-up). LIVE – each candidate spawns a real claude
 *  turn; candidates fan out under `concurrency`. Handles both design role chains and build chains. */
declare function sweepOneChain(handle: string, runRoot: string, opts?: {
    baseModel?: string;
    concurrency?: number;
    baselineDir?: string;
    experiment?: string;
}): Promise<SweepReport>;
/** One chain's durable summary – winner + per-candidate median ms / gate / quality. Mirrors the
 *  committed examples/replay/optimize-results/<handle>/summary.json shape so both corpora are diffable. */
interface ChainSummary {
    chain: string;
    baseModel: string;
    winner: string | null;
    baselineMs: number | null;
    capturedAt: string;
    candidates: Array<{
        candidate: string;
        gatePassed: boolean;
        qualityPassed?: boolean;
        medianMs: number | null;
        disqualified?: boolean;
    }>;
}
/** Run the sweep for EVERY requested chain, each standalone against its reference example, and
 *  print a per-chain report + a roll-up. Returns the reports keyed by handle. LIVE. Chains run in
 *  sequence; each chain's candidates fan out under `concurrency` (a global cap – the chains do not
 *  overlap, so N concurrency is N in-flight candidates at any moment). */
declare function runOptimizeRole(args: OptimizeRoleArgs): Promise<Record<string, SweepReport | {
    summary: unknown;
}>>;
/** Load a candidate's preserved artifacts/ tree back into a producedArtifacts map (relpath -> contents),
 *  the SAME shape the live judge consumed. Pure (fs read). Empty when the dir is absent. */
declare function loadPreservedArtifacts(candidateDir: string): Record<string, string>;
/** A judge verdict whose reason signals its JUDGED TARGET was absent (the produced artifact the judge
 *  scores – the primary file / the tests tree / the review-or-reflect verdict / the app code). During a
 *  re-judge of PRESERVED data this is NOT a real FAIL: it means that target was not preserved (the run
 *  preserved SOME files but not the one the judge reads – e.g. navigator-reflect kept its code tree but
 *  not reflect-verdict.json). So it is "not rejudgeable (judge target not preserved)", same category as
 *  an entirely-empty artifacts/ dir, never a fresh FAIL. Matches the judges' own "no ... to judge" family
 *  (buildChainJudge + buildDriverNextStepJudge); a genuine content FAIL never carries these reasons. */
declare function isMissingJudgeTarget(reason: string | undefined): boolean;
/** Classify a re-judge outcome vs the stored verdict. Keys on whether a stored verdict VALUE exists
 *  (classification OR score) – a telemetry.json can exist verdict-less for a never-judged run, which is
 *  "first-verdict", NOT a reproduce. Compares the right KIND: classification-based judges (build
 *  discriminator) by EXACT class; score-based judges (design/red) by |Δ| <= tol (opus judges are
 *  near-deterministic, not bit-identical – default tol 0.1). Pure + exported for a hermetic guard. */
declare function classifyReproduce(stored: {
    storedClass?: string;
    storedScore?: number;
}, fresh: {
    classification?: string;
    score?: number;
}, tol?: number): string;
/** Re-judge every candidate of every chain under a preserved run dir. For each candidate: reconstruct
 *  producedArtifacts from artifacts/, resolve the chain's discriminator, re-run it vs the recorded
 *  reference, and compare to the stored telemetry verdict. Writes <candidate>/rejudge.json + prints a
 *  reproduce report. LOCAL (opus judges only) – safe to run alongside nothing-live. */
declare function runRejudge(runRoot: string, experimentPath?: string): Promise<void>;

export { DRIVER_GREEN_CODE_PIN_REL, DRIVER_TURN_SPECS, type DriverTurnSpec, type OptimizeRoleArgs, buildChainJudge, buildDriverNextStepJudge, classifyReproduce, concatTreeFiles, expandChains, expandReplicas, isMissingJudgeTarget, loadPreservedArtifacts, parseArgs, readCampAppDir, runOptimizeRole, runRejudge, selectDriverCandidates, sweepDriverGreen, sweepOneChain };
