#!/usr/bin/env node
// lakebase-sftdd-drive: the deterministic orchestrator driver (phase 3b).
//
//   lakebase-sftdd-drive --feature <id> [--project-dir <dir>] [--tdd-dir <dir>]
//                      [--instance <i>] [--deploy-target <t>] [--approver <a>]
//                      [--dry-run]
//
// Reads the project's persisted state, asks nextTransition for the next action,
// and performs it, looping to `done`. This replaces the LLM scrum-master with a
// code state-machine: instant routing, deterministic per-action logging, and
// the per-story pipeline actually streams (one process holds both lanes). Roles
// are still invoked as LLM subagents (claude -p --agent <role>); only the
// routing is code.
//
// --dry-run computes + prints the SINGLE next action and the commands it would
// run, then exits (no execution) - a safe "what will the driver do next?".

import { spawn } from "node:child_process";
import { sftddEnv } from "./sftdd-env.js";
import { resolveSftddDir, ARTIFACT_ROOT, LEGACY_ARTIFACT_ROOT } from "./sftdd-paths.js";
import { migrateLegacyArtifactDir } from "./migrate-artifact-dir.js";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { replayDesignTurn, REPLAYABLE_DESIGN_ROLES, restoreReflectVerdict } from "./replay-artifacts.js";
import { replayBuildTurn } from "./replay-build.js";
import { recordBuildTurn } from "./record-build.js";
import { recordTurn, seedRecorderBaseline } from "./turn-recorder.js";
import { runDriver, driverBoundOptions, ProtocolViolationError, UnexpectedCallbackError, type DriveEffects, type DriverBound, type RunDriverResult, type RunDriverOptions } from "./orchestrator-run.js";
import { writeEscalation } from "./escalation.js";
import { emitNextJson } from "./next.js";
import { emitAgentLogEvent } from "./agent-log.js";
import { writeWorkflowPhase, resetStaleTerminalPhase } from "./workflow-phase.js";
import {
  isHitlGateAction,
  isHumanInputAction,
  pauseBeforeMilestone,
  type PauseMilestone,
  type WorkflowAction,
} from "./orchestrator-drive.js";
import {
  buildDriveEffects,
  commandsForAction,
  planNextAction,
  type CommandRunner,
  type DriveCommand,
  type DriveEffectsConfig,
} from "./orchestrator-effects.js";
import {
  runSprint,
  readSprintBacklog,
  backlogFeatureIds,
  syncBacklog,
  deriveSprintPlanningState,
  type SprintEffects,
  type DriveStepResult,
} from "./orchestrator-sprint.js";
import { resolveModelForRole } from "./agent-models.js";
import { resolveSftddSettings, applyProjectOverrides } from "./sftdd-config.js";
import { parseTurnUsage, assistantTextFromLine, assistantEventSummary, type TurnUsage } from "./claude-usage.js";
import { resumeFitsBudget, turnContextTokens, CONTEXT_FREE_FRACTION_REQUIRED, isPromptTooLongSignal, startsFreshEachTurn } from "./context-budget.js";
import { writeRunConfig } from "./run-config.js";
import { resolveLaunchKitRef, pinRunKitRef, kitRefDriftWarning } from "./kit-ref.js";
import type { AgentRole } from "./agent-log.js";
import { makeOnAction, describeAction, approveHint } from "./orchestrator-logging.js";
import { resolveKitBinJs, kitVersion } from "./kit-bin.js";
import { isForeignFeatureClaim, readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { relocateStrayDesignArtifacts, malformedSiblingRoot } from "./stray-artifact-recovery.js";

// How many times a single role turn that overflows the model window mid-turn
// ("Prompt is too long") is retried on a FRESH session before the failure
// propagates. Each retry inherits the prior attempt's on-disk progress, so a
// small bound converges; it is a backstop, not a substitute for chunking work.
const MAX_PROMPT_TOO_LONG_RETRIES = 2;

interface ParsedArgs {
  feature?: string;
  sprint?: string;
  projectDir?: string;
  sftddDir?: string;
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

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--sprint": out.sprint = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": out.sftddDir = argv[++i]; break;
      case "--instance": out.instance = argv[++i]; break;
      case "--deploy-target": out.deployTarget = argv[++i]; break;
      case "--approver": out.approver = argv[++i]; break;
      case "--dry-run": out.dryRun = true; break;
      case "--max-steps": out.maxSteps = Number(argv[++i]); break;
      case "--plan-only": out.planOnly = true; break;
      case "--only": out.only = argv[++i]; break;
      case "--pause-before": out.pauseBefore = argv[++i]; break;
      case "--gates": out.gates = argv[++i]; break;
      // Sizing (the Architect's t-shirt-sizing / planning-poker step) is ON by
      // default. --no-sizing opts OUT: planning goes propose -> author-requests
      // with no estimate, for a backlog small enough not to need capacity sizing.
      case "--no-sizing":
      case "--no-planning-poker":
      case "--no-t-shirt-sizing": out.noSizing = true; break;
      case "--help": case "-h": out.help = true; break;
      default: break;
    }
  }
  return out;
}

function help(): string {
  return `lakebase-sftdd-drive (deterministic orchestrator driver)

Usage:
  lakebase-sftdd-drive --feature <id> [flags]

Flags:
  --feature <id>       Feature to drive (required)
  --project-dir <dir>  Project root (default: cwd)
  --tdd-dir <dir>      artifact root (default: <project-dir>/.sftdd, honors a legacy .tdd)
  --instance <id>      Lakebase instance id (threaded to experiment branch ops)
  --deploy-target <t>  Deploy target for the deploy phase (default: local)
  --approver <name>    Headless gate approver (default: human-proxy)
  --dry-run            Print the single next action + its commands, then exit
  --max-steps <n>      Stop after n actions (incremental/live testing + safety)
  --plan-only          Tier-2: run the sprint planning sub-machine only (/plan)
  --only <phase>       Tier-2 bound: design | build | deploy (one phase, then stop)
  --pause-before <m>   PAUSE (not stop) just before a handoff: navigator (the
                       build kickoff) | release-engineer (the deploy/verify). The
                       driver blocks for a human [Y/n], then RESUMES the same run
                       on Y , it never leaves the state machine. n re-asks. Set
                       LAKEBASE_SFTDD_AUTO_CONTINUE=1 to auto-confirm (non-interactive).
  --gates <mode>       interactive (default: stop AT each HITL gate so the human
                       answers, then re-run) | proxy (headless: Human Proxy
                       approves; requires LAKEBASE_SFTDD_AUTO_CONTINUE=1 or CI).
                       Run-scoped: overrides project.gates for THIS run only,
                       never rewrites sftdd-config.json.
  --no-sizing          Skip the Architect's t-shirt-sizing (planning-poker) step:
                       planning goes propose -> author-requests, no estimate.
                       Sizing is ON by default. Aliases: --no-planning-poker,
                       --no-t-shirt-sizing.
`;
}

function spawnCmd(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
  });
}


/**
 * Spawn a `claude -p --output-format stream-json --verbose` turn, TEE the
 * human-readable assistant text to stderr (so the live console still shows the
 * agent working, not raw JSON), and return the turn's usage from the terminal
 * `result` event , the per-turn CONTEXT SIZE (input_tokens) + output + cache +
 * cost. stderr is inherited so claude's own errors surface. Usage parsing is
 * best-effort: a missing result event yields undefined (never breaks the turn).
 */
/** A claude turn that exited non-zero. `promptTooLong` flags the recoverable
 *  context-overflow case: the turn itself ballooned past the model window
 *  WITHIN the turn (many tool calls in one shot), the "Prompt is too long"
 *  failure the resume-time context guard cannot pre-empt. The runner retries
 *  this case on a FRESH session; any other non-zero exit is a hard failure. */
class ClaudeTurnError extends Error {
  constructor(
    message: string,
    readonly promptTooLong: boolean,
  ) {
    super(message);
    this.name = "ClaudeTurnError";
  }
}

/** A replay lane (LAKEBASE_SFTDD_REPLAY_DIR / _REPLAY_BUILD_DIR) was told to
 *  reproduce a turn the corpus has no artifact for. A replay is a RECORDING: it
 *  must never fall through to a live agent (that would let an agent "take over"
 *  a run meant to be deterministic, and silently mask a broken/incomplete
 *  corpus). So a miss is a hard, loud failure that names the missing artifact.
 *  Almost always the corpus is missing a file (e.g. a `.gitignore` glob dropped
 *  it) , put the artifact in the right place, do not run the model. */
class ReplayCorpusMissError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayCorpusMissError";
  }
}

/** FEIP-8006: a role turn completed but its expected artifact never landed under
 *  the project's `.sftdd/`. The subagent almost always resolved the project root
 *  wrong and wrote outside it (e.g. `$HOME/<somewhere>`), so a downstream
 *  consuming effect would otherwise crash reading the absent file, with a cryptic,
 *  MISATTRIBUTED error that blames the wrong step. We fail loud + attributed at the
 *  producing role instead, naming the role, the artifact, and where we looked. */
class ArtifactOutOfRootError extends Error {
  constructor(
    readonly role: string,
    readonly label: string,
    readonly anyOf: string[],
    readonly sftddDir: string,
    /** FEIP-8038: the known malformed-sibling root we also checked (+ tried to
     *  relocate from). Named so the human knows exactly where to look. */
    readonly checkedSibling?: string,
  ) {
    super(
      `role '${role}' produced no ${label} under ${path.basename(sftddDir)}/ ` +
        `(expected one of: ${anyOf.join(", ")}).\n` +
        `        The subagent likely resolved the project root wrong and wrote outside it. ` +
        (checkedSibling
          ? `Checked (and tried to relocate from) the malformed sibling ${checkedSibling}; nothing there either. `
          : `(check $HOME and other dirs for a stray copy). `) +
        `Nothing downstream can consume the absent artifact. Re-run to re-dispatch the role.`,
    );
    this.name = "ArtifactOutOfRootError";
  }
}

function spawnClaudeStreaming(args: string[], cwd: string): Promise<TurnUsage | undefined> {
  return new Promise((resolve, reject) => {
    // Capture BOTH stdout (the stream-json events) and stderr (claude's own
    // errors), teeing the human-readable parts to the console, so a context-
    // overflow message printed to either stream is detectable for the retry.
    const child = spawn("claude", args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const lines: string[] = [];
    let sawTooLong = false;
    // Tee a COMPACT trace: each tool action (liveness) as it streams, and the
    // turn's FINAL assistant text (the outcome) at close. The interstitial
    // "now I'll... / let me check..." prose is buffered and overwritten, so only
    // the last text (the result line) survives , the deliberation never hits the
    // log. Set LAKEBASE_SFTDD_VERBOSE_AGENT=1 to tee every assistant text delta.
    const verboseAgent = !!sftddEnv("VERBOSE_AGENT");
    let lastText = "";
    const rl = readline.createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      lines.push(line);
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (verboseAgent) {
        const text = assistantTextFromLine(line);
        if (text) process.stderr.write(text);
        return;
      }
      const { text, tools } = assistantEventSummary(line);
      for (const t of tools) process.stderr.write(`  · ${t}\n`);
      if (text) lastText = text; // hold; only the final one is printed at close
    });
    const erl = readline.createInterface({ input: child.stderr! });
    erl.on("line", (line) => {
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      process.stderr.write(`${line}\n`); // tee: keep claude's own errors visible
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      rl.close();
      erl.close();
      // The turn's final assistant text = the outcome (rule 5). Print it once,
      // after the tool trace, so the log shows actions + result, not the prose.
      if (!verboseAgent && lastText) process.stderr.write(`${lastText}\n`);
      if (code !== 0) return reject(new ClaudeTurnError(`claude exited ${code}`, sawTooLong));
      resolve(parseTurnUsage(lines));
    });
  });
}

// Resolve a kit child-CLI bin name to its compiled JS via the kit's OWN
// package.json `bin` map (the single authoritative source). Spawning
// `node <dist/...>` makes the driver self-contained: its kit children resolve
// from its own install location, with no dependency on the bins being on PATH
// (the smoke runs the kit via lk/npx, not a global install). Deriving from the
// bin map , instead of a hand-maintained list , means a new kit bin the driver
// emits can never silently drift out of sync (a missing entry once caused a
// `spawn <bin> ENOENT` the moment the feature drive emitted lakebase-sftdd-log).
// External tools (claude) are not in the bin map, so they stay bare on PATH.
//
// resolveKitBinJs lives in ./kit-bin (shared with the CLIs that delegate to a
// sibling bin, e.g. pipeline accept -> experiment merge), so the resolution has
// one home.

/** The live runner: claude -p for roles, the kit CLIs for state, a direct
 *  workflow-state write for the coarse phase. */
function execRunner(cfg: DriveEffectsConfig): CommandRunner {
  // Per-role Claude session ids, scoped to this runner (one feature drive). A
  // role's first invocation creates a session (--session-id); later invocations
  // resume it (--resume) so the agent's context + prompt cache stay warm instead
  // of a cold respawn per story/cycle. Resume is an optimization layered on top
  // of the artifact-as-API contract: each role still reads/writes its artifacts,
  // so correctness never depends on the retained session, only speed.
  const sessions = new Map<string, string>();
  // Per-resumeKey running CONTEXT SIZE (the last turn's total prompt tokens:
  // input + cache + the response it added). The context-budget guard reads this
  // to decide whether a RESUME would blow the model window; a fresh session
  // resets it. Keeps the warm-resume optimization while never starting a turn
  // that cannot fit, the "Prompt is too long" failure that killed F5.
  const sessionContext = new Map<string, number>();
  // Per-story Navigator/Driver turn ordinal, for per-turn build replay: the Kth
  // build turn of this story maps to the Kth recorded turn dir in the corpus.
  const buildTurns = new Map<string, number>();
  return {
    async run(cmd: DriveCommand) {
      if (cmd.kind === "set-phase") {
        // Stamp the phase's owning feature (FEIP-8022): the phase slot is
        // per-project, so an un-owned phase leaks to the next feature. featureId
        // is "" for sprint planning (no owner stamped).
        writeWorkflowPhase(cfg.sftddDir, cmd.phase, cfg.featureId || undefined);
        return;
      }
      if (cmd.kind === "sync-backlog") {
        // Deterministic, in-process (no CLI): project backlog.json from the
        // PO's committed feature-requests + the Architect's estimates.
        syncBacklog(cfg.sftddDir, cmd.sprint);
        return;
      }
      if (cmd.kind === "claude") {
        // Per-turn BUILD replay: when LAKEBASE_SFTDD_REPLAY_BUILD_DIR is set, a
        // Navigator/Driver turn overlays its recorded artifact (code + cycle/
        // experiment records) from the corpus instead of spawning the model. The
        // orchestrator still VISITS the turn (logs + transitions + runs the live
        // cycle-record CLIs that stamp RED/GREEN against the overlaid code), so
        // every Navigator<->Driver event is reproduced , only the artifact
        // delivery is mocked. The Kth Navigator/Driver turn maps to the Kth
        // recorded turn dir. A replay is a RECORDING: a corpus miss is a HARD
        // FAILURE (ReplayCorpusMissError), never a fall-through to a live agent ,
        // an agent taking over would defeat the deterministic reproduction and
        // silently mask an incomplete corpus.
        const replayBuildDir = sftddEnv("REPLAY_BUILD_DIR");
        const story = cmd.replay?.story;
        if (replayBuildDir && story && (cmd.role === "navigator" || cmd.role === "driver")) {
          // The reflect turn is a DESIGN GATE that runs in the build lane: its only
          // output is reflect-verdict.json (a .sftdd artifact), never code. Restore
          // JUST the verdict , do NOT restore its recorded code snapshot (that would
          // overwrite the freshly-scaffolded tree with the recording's project-name-
          // baked files and leave it dirty, so the pre-build cut-experiment fork
          // refuses) , and do NOT count it as a build turn (replayBuildTurn's index
          // skips reflect turns, so RED maps to the first real recorded build turn).
          if (cmd.replay?.buildMode === "reflect") {
            const rd = sftddEnv("REPLAY_DIR");
            // The verdict lives in the DESIGN corpus. When it is present (REPLAY_DIR
            // set), it MUST restore; a miss is a corpus defect, not a reason to run
            // the Navigator live. (When REPLAY_DIR is unset the design lane is not
            // being replayed, so there is no recorded verdict to restore here.)
            if (rd) {
              const restored = restoreReflectVerdict({ replayDir: rd, sftddDir: cfg.sftddDir, featureId: cfg.featureId, story });
              if (!restored) {
                throw new ReplayCorpusMissError(
                  `[drive] REPLAY CORPUS MISS: reflect verdict for ${story} is not in the corpus ` +
                    `(expected features/${cfg.featureId}/stories/${story}/reflect-verdict.json under ${rd}). ` +
                    `Replay will NOT run the Navigator live , put the recorded verdict in the corpus (check .gitignore is not dropping it).`,
                );
              }
            }
            process.stderr.write(`[drive] replayed reflect (navigator ${story}) from corpus , verdict only (no code, not counted)\n`);
            return;
          }
          const turnIndex = (buildTurns.get(story) ?? 0) + 1;
          buildTurns.set(story, turnIndex);
          const replayed = replayBuildTurn({
            replayBuildDir,
            projectDir: cfg.projectDir,
            sftddDir: cfg.sftddDir,
            featureId: cfg.featureId,
            story,
            turnIndex,
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed build turn ${turnIndex} (${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""} ${story}) from corpus (no model spawn)\n`,
            );
            return;
          }
          throw new ReplayCorpusMissError(
            `[drive] REPLAY CORPUS MISS: build turn ${turnIndex} for ${story} (${cmd.role}) has no recorded turn dir under ` +
              `${replayBuildDir} (features/${cfg.featureId}/stories/${story}/turns). The live orchestrator dispatched more ` +
              `build turns than the corpus recorded, or the corpus is incomplete. Replay will NOT run the agent live , ` +
              `re-record or fix the corpus so it covers every dispatched turn.`,
          );
        }
        // Fast-forward replay: when LAKEBASE_SFTDD_REPLAY_DIR is set, a design-lane
        // role's turn copies its recorded output from the corpus instead of
        // spawning the model. The orchestrator still VISITS the turn (logs +
        // transitions + runs its deterministic effects); only the LLM generation
        // is replaced. Navigator/Driver are never replayed (not design roles),
        // so the real TDD begins at the Navigator handoff. A replay is a RECORDING:
        // if the deterministic pipeline dispatched a replayable design turn, the
        // corpus MUST have its artifact , a miss is a HARD FAILURE, never a
        // fall-through to a live agent (the .gitignore corpus drop this guards).
        const replayDir = sftddEnv("REPLAY_DIR");
        if (replayDir && REPLAYABLE_DESIGN_ROLES.has(cmd.role)) {
          const replayed = replayDesignTurn({
            turn: { role: cmd.role, mode: cmd.replay?.mode, story: cmd.replay?.story },
            replayDir,
            sftddDir: cfg.sftddDir,
            featureId: cfg.featureId,
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed ${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""} from corpus (no model spawn)\n`,
            );
            return;
          }
          const where = `${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""}`;
          throw new ReplayCorpusMissError(
            `[drive] REPLAY CORPUS MISS: no recorded artifact for design turn '${where}' under ${replayDir} ` +
              `(features/${cfg.featureId}/...). The deterministic pipeline dispatched this turn but the corpus lacks its ` +
              `output. Replay will NOT run the agent live , put the recorded artifact in the corpus (check .gitignore is not dropping it).`,
          );
        }
        // stream-json (requires --verbose with --print) lets us capture the turn's
        // token usage from the result event while teeing readable text to the console.
        const baseArgs = ["-p", cmd.task, "--agent", cmd.role, "--model", cmd.model, "--strict-mcp-config", "--output-format", "stream-json", "--verbose"];
        // Per-role/turn model-side knobs (sftdd-config.json): effort (set on judgment
        // turns to run fast), fallback model (auto-failover when the primary is
        // overloaded), and a per-invocation dollar cap.
        if (cmd.effort) baseArgs.push("--effort", cmd.effort);
        if (cmd.fallbackModel) baseArgs.push("--fallback-model", cmd.fallbackModel);
        if (typeof cmd.maxBudgetUsd === "number") baseArgs.push("--max-budget-usd", String(cmd.maxBudgetUsd));
        // Resolve this attempt's session flags. `forceFresh` ignores the warm
        // session (used when retrying after a mid-turn "Prompt is too long").
        const sessionArgsFor = (forceFresh: boolean): string[] => {
          if (!cmd.resumeKey) return [];
          // Proactive per-turn context cap: a HEAVY role (Driver/Navigator) starts
          // EVERY turn on a fresh session, so no turn inherits a prior turn's
          // accumulated context. This is the deterministic companion to the reactive
          // budget guard below (which only resets AFTER a session already grew too
          // big). Artifact-as-API makes a cold turn always correct: the turn reloads
          // exactly what it needs from disk. Overridable via LAKEBASE_SFTDD_HEAVY_ROLES.
          if (startsFreshEachTurn(cmd.role)) {
            const id = randomUUID();
            sessions.set(cmd.resumeKey, id);
            sessionContext.delete(cmd.resumeKey);
            return ["--session-id", id];
          }
          const existing = sessions.get(cmd.resumeKey);
          // Context-budget guard: only resume when the warm session still leaves
          // >= the required free fraction of the model window; otherwise the turn
          // would risk "Prompt is too long". When it would not fit (or we are
          // forcing fresh after a mid-turn overflow), start FRESH (new session-id,
          // reset the tracked size) instead of failing the turn.
          const priorCtx = sessionContext.get(cmd.resumeKey) ?? 0;
          const wouldFit = !forceFresh && resumeFitsBudget(priorCtx, cmd.model);
          if (existing && wouldFit) return ["--resume", existing];
          if (existing && !forceFresh && !wouldFit) {
            process.stderr.write(
              `[drive] context guard: fresh ${cmd.role} session ` +
                `(warm ~${priorCtx.toLocaleString()} tok < ${Math.round(CONTEXT_FREE_FRACTION_REQUIRED * 100)}% of ${cmd.model} window free)\n`,
            );
          }
          const id = randomUUID();
          sessions.set(cmd.resumeKey, id);
          sessionContext.delete(cmd.resumeKey);
          return ["--session-id", id];
        };
        // Spawn with a bounded retry on a MID-TURN context overflow. The resume-time
        // guard above cannot pre-empt a turn that balloons WITHIN itself (one shot,
        // many tool calls , the failure that killed F6/S3-split-drop-old). When that
        // turn fails with "Prompt is too long", restart it on a FRESH session: the
        // artifacts the failed attempt already wrote (.sftdd + code + tests) persist,
        // so each retry has strictly less to do and converges, instead of aborting
        // the whole drive. A non-overflow failure (or exhausted retries) still throws.
        let usage: TurnUsage | undefined;
        const turnStart = Date.now();
        for (let attempt = 0; ; attempt++) {
          const args = [...baseArgs, ...sessionArgsFor(attempt > 0)];
          try {
            usage = await spawnClaudeStreaming(args, cfg.projectDir);
            break;
          } catch (e) {
            if (e instanceof ClaudeTurnError && e.promptTooLong && attempt < MAX_PROMPT_TOO_LONG_RETRIES) {
              process.stderr.write(
                `[drive] context guard (mid-turn): ${cmd.role} overflowed ${cmd.model}; ` +
                  `fresh-session retry ${attempt + 1}/${MAX_PROMPT_TOO_LONG_RETRIES}\n`,
              );
              continue;
            }
            throw e;
          }
        }
        // Log the turn's CONTEXT SIZE + usage right after it returns (role + model
        // + effort after role; the token counts in metadata). Best-effort: never
        // let a logging hiccup break the turn.
        const turnMs = Date.now() - turnStart;
        if (usage) {
          // Record this turn's total context so the next resume decision for this
          // session can apply the context-budget guard above.
          if (cmd.resumeKey) sessionContext.set(cmd.resumeKey, turnContextTokens(usage));
          // Wall-clock per turn: the missing signal for perf work. Emitted on the
          // turn.usage event (+ a terse console line) so a run's log shows WHERE the
          // seconds go (which role/turn) instead of guessing.
          process.stderr.write(`[drive] ${cmd.role} turn ${(turnMs / 1000).toFixed(1)}s (${cmd.model})\n`);
          try {
            emitAgentLogEvent(
              {
                role: cmd.role as AgentRole,
                level: "info",
                event: "turn.usage",
                model: cmd.model,
                ...(cmd.effort ? { effort: cmd.effort } : {}),
                feature_id: cfg.featureId,
                slots: {
                  duration_ms: turnMs,
                  input_tokens: usage.inputTokens,
                  output_tokens: usage.outputTokens,
                  ...(usage.cacheReadTokens !== undefined ? { cache_read_tokens: usage.cacheReadTokens } : {}),
                  ...(usage.cacheCreationTokens !== undefined ? { cache_creation_tokens: usage.cacheCreationTokens } : {}),
                  ...(usage.costUsd !== undefined ? { cost_usd: usage.costUsd } : {}),
                  ...(cmd.replay?.story ? { story: cmd.replay.story } : {}),
                  ...(cmd.replay?.mode ? { phase: cmd.replay.mode } : {}),
                },
              },
              { sftddDir: cfg.sftddDir },
            );
          } catch {
            /* usage logging is observability, never load-bearing */
          }
        }
        return;
      }
      if (cmd.kind === "verify-artifact") {
        // FEIP-8006 out-of-root guard: the role's expected artifact must exist
        // UNDER the project's sftddDir (a file, or a non-empty dir for per-story
        // ACs). A subagent that resolved the project root wrong wrote it elsewhere;
        // fail loud + attributed HERE, before a downstream effect consumes the
        // absent artifact and crashes with a cryptic, misattributed error.
        const isPresent = (): boolean =>
          cmd.anyOf.some((p) => {
            try {
              const st = fs.statSync(p);
              return st.isDirectory() ? fs.readdirSync(p).length > 0 : true;
            } catch {
              return false;
            }
          });
        if (!isPresent()) {
          // FEIP-8038: a subagent may have resolved a MALFORMED project root
          // (parent + project hyphen-joined) and written the artifact to that
          // sibling. Relocate a stray .sftdd/.tdd tree from it into the real root
          // and re-check, so the run self-heals instead of deadlocking on the
          // "re-run" remedy (which no-ops , the artifact never lands in-root).
          const strayFix = relocateStrayDesignArtifacts(cfg.projectDir);
          if (strayFix.relocated) {
            process.stderr.write(
              `[drive] recovered ${strayFix.moved.length} stray artifact(s) from a malformed root ` +
                `(${strayFix.from}) into the project root (FEIP-8038)\n`,
            );
          }
          if (!isPresent()) {
            throw new ArtifactOutOfRootError(
              cmd.role,
              cmd.label,
              cmd.anyOf,
              cfg.sftddDir,
              malformedSiblingRoot(cfg.projectDir),
            );
          }
        }
        return;
      }
      // cmd.kind === "cli": resolve the kit bin to its dist JS via the kit's
      // package.json bin map so it runs regardless of PATH; fall back to the
      // bare name for anything not a kit bin (external tools on PATH).
      const js = resolveKitBinJs(cmd.bin);
      if (js) {
        await spawnCmd("node", [js, ...cmd.args], cfg.projectDir);
      } else {
        await spawnCmd(cmd.bin, cmd.args, cfg.projectDir);
      }
    },
  };
}

/** Build a DriveEffectsConfig for a feature (or planning, featureId ""). */
function buildCfg(args: ParsedArgs, featureId: string): DriveEffectsConfig {
  const projectDir = args.projectDir ?? process.cwd();
  const sftddDir = args.sftddDir ?? resolveSftddDir(projectDir);
  // Resolve the Lakebase instance + the feature's branch from the SCM workflow
  // state (.lakebase/workflow-state.json, written at claim). The per-story
  // experiment ops need both: the instance to create/merge the paired branch,
  // and the feature branch as the experiment's parent + merge target. --instance
  // overrides the recorded project_id when given.
  const scm = readWorkflowState(projectDir);
  // Unified config: one resolution of the per-role/turn model+effort matrix + the
  // build/plan/project knobs (sftdd-config.json -> LAKEBASE_SFTDD_* env -> default).
  const settings = resolveSftddSettings({ projectDir });
  return {
    projectDir,
    sftddDir,
    featureId,
    sprintName: args.sprint,
    // Recorded feature-requests present (capture/replay) => the planning PROPOSE
    // step is deterministic (project feature-proposals.md from them) instead of an
    // LLM spawn. Unset (interactive) keeps the live Spec Author propose turn.
    recordedRequests: !!sftddEnv("SPRINT_REQUESTS")?.trim(),
    instance: args.instance ?? scm?.project_id,
    featureBranch: scm?.branch,
    parentBranch: scm?.parent_branch,
    // Deploy target from the config (the --deploy-target flag wrote through to it).
    deployTarget: settings.project.deployTarget,
    approver: args.approver ?? "human-proxy",
    // UI track: the config (project.uiTrack, the single source) decides whether the
    // Spec Author frames user-facing capabilities as E2E (browser/screen) stories vs API-only.
    uiTrack: settings.project.uiTrack,
    // P5: Navigator/Driver session scope (story warm-resume vs cycle cold-spawn).
    buildSessionScope: settings.build.sessionScope,
    // P6 (back-compat): the navigator REVIEW turn's effort, still surfaced for
    // run-config + any caller without effortForTurn. effortForTurn (below) is the
    // primary, per-role/turn resolver and supersedes this.
    reviewEffort: ((): string => {
      const e = settings.effortFor("navigator", "review");
      return e === "default" ? "" : e;
    })(),
    // P8b: build loop granularity + batch cap (config / env).
    loopGranularity: settings.build.loopGranularity,
    batchCap: settings.build.batchCap,
    // Unified per-role/turn model-side resolvers ("" => omit --effort).
    effortForTurn: (role, turn) => {
      const e = settings.effortFor(role, turn);
      return e === "default" ? "" : e;
    },
    fallbackModelForRole: (role) => settings.fallbackModels[role],
    maxBudgetUsdForRole: (role) => settings.budgets[role],
    modelForRole: (role) => settings.models[role] ?? resolveModelForRole(role as AgentRole, projectDir),
    // Model tiering: per-turn model (driver GREEN/REFACTOR on a cheaper model than
    // its RED). Falls through to the role's base model when no per-turn map applies.
    modelForTurn: (role, turn) => settings.modelFor(role, turn),
    runner: { async run() {} },
    onAction: composeOnAction(
      // Narrate each routing decision in plain language (DRY: the same message
      // the structured log uses). The machine-readable form is already written to
      // the structured agent-log by makeOnAction below, so the raw action JSON is
      // console noise on every line , append it only under LAKEBASE_SFTDD_TRACE.
      (action, i) => {
        const trace = sftddEnv("TRACE") ? `  ${JSON.stringify(action)}` : "";
        process.stderr.write(`[drive] ${String(i).padStart(3, "0")} ${describeAction(action, { featureId })}${trace}\n`);
      },
      // Code-emit the orchestrator's lifecycle (handoff / phase.start /
      // gate.surfaced / experiment.* / phase.end) through the ONE common logger,
      // so the structured trail is written every run with no LLM in the loop.
      // The resolvers stamp each per-turn phase.start with the model + effort it
      // ran with (right after `role`).
      makeOnAction({
        sftddDir,
        featureId,
        modelForRole: (role) => settings.models[role],
        effortForTurn: (role, turn) => {
          const e = settings.effortFor(role, turn);
          return e === "default" ? "" : e;
        },
      }),
    ),
  };
}

/** Run several onAction hooks in order (stderr trace + structured emit). */
function composeOnAction(
  ...hooks: Array<(action: WorkflowAction, i: number) => void>
): (action: WorkflowAction, i: number) => void {
  return (action, i) => {
    for (const h of hooks) h(action, i);
  };
}

/**
 * The PAUSE gate's human wait: block the state machine at the handoff and ask
 * [Y/n], then RESUME on Y (n re-asks; the run never bails). Three input sources,
 * in order:
 *   1. LAKEBASE_SFTDD_AUTO_CONTINUE=1   , auto-confirm (CI / fully non-interactive).
 *   2. LAKEBASE_SFTDD_GATE_ANSWER_FILE  , poll that file for y/n (a parent process
 *      drives the gate, e.g. a controller answering on the human's behalf).
 *   3. an interactive stdin TTY       , prompt + read the human's line.
 * With none of those (piped, no control file), it auto-continues with a warning
 * rather than crashing or hanging. It never opens /dev/tty (absent in many
 * sandboxes, and its open error is async , the prior cause of a hard crash).
 */
function makeConfirmContinue(): (action: WorkflowAction) => Promise<void> {
  const auto = sftddEnv("AUTO_CONTINUE") === "1";
  const answerFile = sftddEnv("GATE_ANSWER_FILE")?.trim();
  const isYes = (a: string): boolean => a === "" || a === "y" || a === "yes";
  return (action) =>
    new Promise<void>((resolve, reject) => {
      const label = describeAction(action);
      const prompt = `\n[drive] PAUSED , continue past the ${label} handoff? [Y/n] `;
      if (auto) {
        process.stderr.write(`[drive] PAUSE gate (auto-continue): proceeding past ${label}\n`);
        return resolve();
      }
      // (2) Control channel: poll the answer file (written y/n by a controller).
      if (answerFile) {
        process.stderr.write(`${prompt}\n[drive] (awaiting answer in ${answerFile})\n`);
        const poll = setInterval(() => {
          let raw: string;
          try { raw = fs.readFileSync(answerFile, "utf8"); } catch { return; } // not written yet
          const a = raw.trim().toLowerCase();
          if (a === "") return; // present but blank , keep waiting
          try { fs.rmSync(answerFile, { force: true }); } catch { /* ignore */ }
          if (a === "y" || a === "yes") { clearInterval(poll); process.stderr.write(`[drive] resuming.\n`); resolve(); }
          else process.stderr.write(`[drive] holding , write Y to ${answerFile} when ready.\n`);
        }, 1000);
        return;
      }
      // (3) Interactive terminal.
      if (process.stdin.isTTY) {
        const ask = (): void => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
          rl.question(prompt, (answer) => {
            rl.close();
            if (isYes(answer.trim().toLowerCase())) { process.stderr.write(`[drive] resuming.\n`); resolve(); }
            else { process.stderr.write(`[drive] holding , answer Y when ready.\n`); ask(); }
          });
        };
        return ask();
      }
      // No auto-confirm, no control channel, no TTY: there is NO human in the
      // loop, so STOP rather than silently proceed past the handoff (an
      // agent-driven non-TTY run must not self-approve). A deliberate headless
      // run sets LAKEBASE_SFTDD_AUTO_CONTINUE=1; a controller writes a gate-answer
      // file; a human uses a terminal. None present = refuse.
      reject(
        new Error(
          `[drive] PAUSED at the ${label} handoff with no human channel , refusing to continue. ` +
            `Set LAKEBASE_SFTDD_AUTO_CONTINUE=1 (deliberate headless), provide ` +
            `LAKEBASE_SFTDD_GATE_ANSWER_FILE, or run in an interactive terminal.`,
        ),
      );
    });
}

/**
 * Wrap effects so that, when LAKEBASE_SFTDD_RECORD_BUILD_DIR is set, the driver
 * snapshots each Navigator/Driver turn AFTER its effect lands , the per-turn
 * build corpus the event-by-event replay plays back. A no-op when unset, so a
 * normal run is unaffected. Only build turns (invoke-role navigator|driver) are
 * recorded; design/deploy turns are not build output.
 */
function withBuildRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  const recordBuildDir = sftddEnv("RECORD_BUILD_DIR")?.trim();
  if (!recordBuildDir) return inner;
  let turn = 0;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver")) {
        turn += 1;
        const dir = recordBuildTurn({
          recordBuildDir,
          projectDir: cfg.projectDir,
          sftddDir: cfg.sftddDir,
          featureId: cfg.featureId,
          story: action.story,
          turn,
          role: action.role,
          ac: "ac" in action ? action.ac : undefined,
          mode: action.buildMode,
        });
        process.stderr.write(
          `[record] turn ${turn}: ${action.role}${action.buildMode ? ` (${action.buildMode})` : ""}` +
            `${"ac" in action && action.ac ? ` ${action.ac}` : ""} -> ${dir}\n`,
        );
      }
    },
  };
}

/**
 * Wrap effects so that, when LAKEBASE_SFTDD_RECORD_DIR is set, the driver records
 * EVERY state-machine turn AFTER its effect lands , the universal per-turn
 * timeline (design, gates, build, deploy, accept, promote), not just the build
 * lane. Each turn writes turns/<NNNN>-<label>/ (manifest + the .tdd/code delta it
 * produced) + refreshes the cumulative recorded-artifacts mirror that
 * replayDesignTurn consumes. Composes with withBuildRecording (which populates
 * recorded-build for replayBuildTurn), so one recordDir holds the whole
 * record/replay corpus. A no-op when unset, so a normal run is unaffected.
 */
function withTurnRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  const recordDir = sftddEnv("RECORD_DIR")?.trim();
  if (!recordDir) return inner;
  // Seed the delta baseline with the current (post-scaffold/intake) state ONCE,
  // so the first recorded turn reports only what it produced, not the pre-existing
  // scaffold. A no-op once a baseline exists (later drive processes in the run).
  seedRecorderBaseline({ recordDir, projectDir: cfg.projectDir, sftddDir: cfg.sftddDir });
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    onHandback: inner.onHandback ? (h, d) => inner.onHandback!(h, d) : undefined,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "done") return; // terminal no-op, produces nothing
      const rec = recordTurn({ recordDir, projectDir: cfg.projectDir, sftddDir: cfg.sftddDir, action, step: 0 });
      process.stderr.write(
        `[record] turn ${rec.ordinal} (${rec.dir}): ${rec.produced.length} produced` +
          `${rec.deleted.length ? `, ${rec.deleted.length} deleted` : ""}\n`,
      );
    },
  };
}

/** Compose a phase bound's stopWhen with the interactive gate stop: in
 *  interactive mode the driver also halts at each HITL gate for the human. */
function gatedStopWhen(
  base: RunDriverOptions["stopWhen"],
  interactive: boolean,
): RunDriverOptions["stopWhen"] {
  if (!interactive) return base;
  // Interactive: also stop where the HUMAN provides an input artifact (the PO's
  // feature-requests at author-requests), so the human supplies them and re-runs
  // , the same transition the Human Proxy performs headless.
  return (a) => (base?.(a) ?? false) || isHitlGateAction(a) || isHumanInputAction(a);
}

/** The HITL gate a bounded run halted at (interactive mode), or undefined. */
function pendingGateOf(r: RunDriverResult): WorkflowAction | undefined {
  return r.stoppedAtBound && r.stoppedAt && isHitlGateAction(r.stoppedAt) ? r.stoppedAt : undefined;
}

/** The HUMAN-INPUT stop a bounded run halted at (interactive mode) , the PO's
 *  `author-requests`, or undefined. gatedStopWhen halts here so the human supplies
 *  the feature-request(s); it is NOT an approval gate, so pendingGateOf misses it.
 *  Surfacing it separately is why interactive `--plan-only` no longer misreports a
 *  PO pause (nothing produced) as "plan gate approved" (Finding 5). */
function pendingInputOf(r: RunDriverResult): WorkflowAction | undefined {
  return r.stoppedAtBound && r.stoppedAt && isHumanInputAction(r.stoppedAt) ? r.stoppedAt : undefined;
}

/** Map a driver result to the sprint's DriveStepResult. Carries BOTH halt kinds:
 *  a clean interactive pause (pendingGate) AND a raise-to-HIL (escalated), so the
 *  sprint orchestrator stops on either instead of counting an escalated feature
 *  "complete" and advancing (which then trips the next claim's already-claimed
 *  guard). Mirrors the single-feature drive's escalated/pendingGate handling. */
function stepResultOf(r: RunDriverResult): DriveStepResult {
  return { pendingGate: pendingGateOf(r), pendingInput: pendingInputOf(r), escalated: r.escalated, escalation: r.escalation };
}

function reportGate(gate: WorkflowAction, ctx: { featureId?: string; sprint?: string; featureBranch?: string } = {}): void {
  // Reuse the shared action narration (DRY) instead of dumping raw JSON; the
  // full action is available under LAKEBASE_SFTDD_TRACE for debugging.
  const trace = sftddEnv("TRACE") ? `  ${JSON.stringify(gate)}` : "";
  process.stderr.write(
    `[drive] GATE awaiting human approval: ${describeAction(gate)}.${trace}\n` +
      `        Record your decision with:\n` +
      `          ${approveHint(gate, ctx)}\n` +
      `        then re-run to continue.\n`,
  );
}

/** Report an interactive pause awaiting HUMAN INPUT (the PO's feature-request(s)
 *  at author-requests). Unlike a gate (work done, awaiting approval), NOTHING has
 *  been produced , so this must never read as "approved/complete". */
function reportInput(action: WorkflowAction, sprint?: string): void {
  const s = sprint ?? "<sprint>";
  process.stderr.write(
    `[drive] PAUSED , awaiting human input (${describeAction(action)}). Nothing was approved or produced yet.\n` +
      `        The Product Owner must:\n` +
      `          1. author the sprint's feature-request(s) at .sftdd/features/<id>/feature-request.md, then\n` +
      `          2. commit the backlog: lakebase-sftdd-sync-backlog --sprint ${s} --features <id[,id...]>\n` +
      `        then re-run the drive , it will advance to the (interactive) plan gate.\n`,
  );
}

/**
 * Tier-1 sprint mode (`--sprint <name>`, no `--feature`): the `/sprint`
 * orchestrator. Drives sprint planning to the plan gate, then claims + drives
 * each backlog feature. `--plan-only` runs planning only (the `/plan` command).
 * `--gates interactive` halts at each HITL gate for the human + re-runs to resume.
 */
async function runSprintMode(args: ParsedArgs): Promise<number> {
  const sprint = args.sprint as string;
  const projectDir = args.projectDir ?? process.cwd();
  const sftddDir = args.sftddDir ?? resolveSftddDir(projectDir);
  // The claim CLI lives in dist/scripts/lakebase/, a sibling-of-parent of this
  // file's dist dir, so it resolves regardless of PATH (the smoke runs via npx).
  const claimJs = path.join(__dirname, "..", "lakebase", "scm-claim-feature.cli.js");
  // sizing comes from sftdd-config.json; the gate mode is RUN-SCOPED (--gates
  // override else the project's declared policy), never read back from a
  // flag-mutated file.
  const settings = resolveSftddSettings({ projectDir });
  const gates = effectiveGates(args, projectDir);
  const interactive = gates === "interactive";
  const skipSizing = !settings.plan.sizing;

  const effects: SprintEffects = {
    async drivePlanning() {
      const cfg = buildCfg(args, "");
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, "plan", gates);
      const planning: DriveEffects = {
        // Sizing is ON by default; --no-sizing (or config plan.sizing:false) opts out.
        readState: async () => deriveSprintPlanningState(sftddDir, sprint, { skipSizing }),
        async perform(action) {
          for (const cmd of commandsForAction(action, cfg)) await cfg.runner.run(cmd);
        },
        onAction: cfg.onAction,
      };
      const base = driverBoundOptions("plan");
      const r = await runDriver(withTurnRecording(planning, cfg), {
        ...base,
        stopWhen: gatedStopWhen(base.stopWhen, interactive),
      });
      return stepResultOf(r);
    },
    async readBacklog() {
      return backlogFeatureIds(readSprintBacklog(sftddDir, sprint));
    },
    async commitAndPushRequests() {
      // Commit the feature-requests planning authored + push the entry tier so
      // each feature branch (which forks from origin/<parent>) inherits them. The
      // add + commit are tolerant (a no-op when nothing changed, e.g. the requests
      // were pre-seeded + already committed); a PUSH failure is loud, since a
      // silent one resurfaces later as a cryptic Spec Author refusal on the fork.
      const root = path.basename(sftddDir);
      for (const id of backlogFeatureIds(readSprintBacklog(sftddDir, sprint))) {
        await spawnCmd("git", ["add", "--", `${root}/features/${id}/feature-request.md`], projectDir).catch(() => undefined);
      }
      await spawnCmd("git", ["commit", "-m", `plan: ${sprint} feature-requests`], projectDir).catch(() => undefined);
      await spawnCmd("git", ["push", "origin", "HEAD"], projectDir);
    },
    async isFeatureShipped(featureId) {
      // Skip a backlog feature that is already shipped so the sprint does not
      // re-claim + re-drive it (FEIP-8022). "Shipped" = the feature's OWN
      // workflow (now feature-scoped, so no cross-feature phase leak) derives to
      // `done`: every story built + accepted, deployed, and promoted/merged. This
      // reliably skips a feature the sprint itself drove to done (resume) or one
      // shipped in-band via the drive. A feature shipped fully out-of-band (its
      // promotion merged outside the drive, so its recorded state never reached
      // done) is NOT detected here , that divergence is the reconcile capability's
      // job (FEIP-8018). Best-effort: any read/derive error => not shipped (drive it).
      try {
        const { action } = await planNextAction(buildCfg(args, featureId));
        return action.kind === "done";
      } catch {
        return false;
      }
    },
    async claimFeature(featureId) {
      await spawnCmd("node", [claimJs, featureId, "--project-dir", projectDir, "--json"], projectDir);
    },
    async driveFeature(featureId) {
      const cfg = buildCfg(args, featureId);
      // A fresh feature in the sprint loop (feature 2+, or the first feature of a
      // later sprint on the same project) must NOT inherit the PRIOR feature's
      // terminal TDD phase: the per-project workflow-state.json carries
      // "shipped"/"done" from the last feature, and neither the SCM claim nor
      // anything else clears it, so the next feature's drive reads phase === done
      // and exits at turn 000 without building. Same guard the single-feature
      // drive applies (see runFeatureMode); only a terminal phase is cleared, so a
      // resumed mid-flight feature is untouched.
      resetStaleTerminalPhase(cfg.sftddDir);
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, "full", gates);
      const r = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
        stopWhen: gatedStopWhen(undefined, interactive),
      });
      return stepResultOf(r);
    },
    onFeature: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f}\n`),
    onSkip: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f} , already shipped, skipping\n`),
  };

  // /plan: planning only (do not enter the per-feature loop).
  if (args.planOnly) {
    try {
      const planning = await effects.drivePlanning();
      // A HITL gate pause = work produced, awaiting approval (resumable, exit 0).
      if (planning.pendingGate) {
        reportGate(planning.pendingGate, { sprint });
        return 0;
      }
      // A human-input pause = the PO must author requests FIRST; nothing was
      // produced and the plan gate was NOT reached. Report it honestly and exit
      // non-zero (the postcondition , an approved plan , is not met), so a caller
      // never advances on an empty backlog thinking the plan was approved.
      if (planning.pendingInput) {
        reportInput(planning.pendingInput, sprint);
        return 2;
      }
      process.stderr.write(`[plan] ${sprint} planning complete (plan gate approved)\n`);
      return 0;
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }

  try {
    const result = await runSprint(effects);
    if (result.escalated) {
      // A step RAISED TO HIL: the sprint is NOT complete. Surface + halt (exit
      // non-zero) exactly like the single-feature drive, so the capture harness
      // stops instead of advancing to the next sprint (whose claim would trip
      // `already-claimed-other` on the still-open feature). Resumable after the
      // human resolves the escalation recorded under <sftddDir>/escalations/.
      const e = result.escalation;
      const on = result.pendingFeature ? ` on ${result.pendingFeature}` : "";
      process.stderr.write(
        `[sprint] RAISED TO HIL${on} , halting sprint ${sprint}.\n` +
          (e?.source ? `        source: ${e.source}\n` : "") +
          (e?.reason ? `        reason: ${e.reason}\n` : "") +
          `        recorded under ${path.basename(sftddDir)}/escalations/ ; resolve it, then re-run to resume.\n`,
      );
      return 3;
    }
    if (result.pendingGate) {
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}\n`);
      reportGate(result.pendingGate, { sprint, featureId: result.pendingFeature });
      return 0;
    }
    if (result.pendingInput) {
      // Planning paused for the PO to author feature-request(s): the sprint did
      // NOT run (empty backlog). Report + exit non-zero so nothing treats it as a
      // completed sprint.
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}\n`);
      reportInput(result.pendingInput, sprint);
      return 2;
    }
    process.stderr.write(`[sprint] ${sprint} complete: ${result.features.length} feature(s)\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

/** The RUN-SCOPED gate mode: a `--gates` flag overrides for THIS run only; absent,
 *  the project's declared policy in sftdd-config.json wins. The flag never rewrites
 *  the file (that let one headless run flip an interactive project to proxy), so the
 *  effective mode is resolved fresh here, not read back from a mutated file. */
function effectiveGates(args: ParsedArgs, projectDir: string): "interactive" | "proxy" {
  const flag = args.gates as "interactive" | "proxy" | undefined;
  return flag ?? resolveSftddSettings({ projectDir }).project.gates;
}

/** True when the run has an explicit non-interactive signal (CI / auto-continue).
 *  Headless proxy gating is only legitimate with one of these; otherwise a stray
 *  LAKEBASE_SFTDD_HUMAN_PROXY leaking into a dev shell would silently bypass HITL. */
function hasNonInteractiveSignal(): boolean {
  return sftddEnv("AUTO_CONTINUE") === "1" || /^(1|true)$/i.test(process.env.CI ?? "");
}

/** P0.1: snapshot the resolved model + option matrix to .tdd/run-config.json (and
 *  the corpus root when recording) at the start of an ACTUAL run (not --dry-run),
 *  so a timing report is self-describing and two runs are A/B-comparable.
 *  Best-effort: writeRunConfig swallows its own IO errors. */
function snapshotRunConfig(cfg: DriveEffectsConfig, bound: string, gates: "interactive" | "proxy"): void {
  writeRunConfig({
    projectDir: cfg.projectDir,
    sftddDir: cfg.sftddDir,
    bound,
    // Run-scoped effective gate mode (--gates override else project policy),
    // recorded here so the snapshot is where the run-scoped choice lives , the
    // flag never persists into sftdd-config.json.
    gates,
    uiTrack: cfg.uiTrack,
    buildSessionScope: cfg.buildSessionScope,
    reviewEffort: cfg.reviewEffort,
    deployTarget: cfg.deployTarget,
    // loop + batchCap from the resolved settings (single source), so the snapshot
    // records what the drive actually used, never a stale env value.
    loopGranularity: cfg.loopGranularity,
    batchCap: cfg.batchCap,
    modelForRole: cfg.modelForRole ?? (() => "inherit"),
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  // Auto-migrate a legacy ".tdd" artifact dir to ".sftdd" before any mode runs,
  // so existing projects move to the current name on their next orchestrated run
  // (no-op once ".sftdd" exists). History follows via git mv when possible.
  if (!args.sftddDir) {
    const projectDir = args.projectDir ?? process.cwd();
    const m = migrateLegacyArtifactDir(projectDir);
    if (m.migrated) {
      process.stderr.write(
        `lakebase-sftdd-drive: migrated legacy ${LEGACY_ARTIFACT_ROOT}/ to ${ARTIFACT_ROOT}/ (via ${m.via}).\n`,
      );
    }
  }
  // Write-through the drive's ad-hoc override flags into sftdd-config.json BEFORE
  // any settings resolution, so the file stays the single source of truth (the
  // flag is a WRITER, not a parallel reader; absent flags never mutate the file).
  // NB: --gates is NOT here , it is run-scoped policy, resolved per run and never
  // persisted (see effectiveGates / applyProjectOverrides).
  applyProjectOverrides(args.projectDir ?? process.cwd(), {
    deployTarget: args.deployTarget,
    sizing: args.noSizing === true ? false : undefined,
  });

  // Pin the kit ref for the WHOLE run to a checkout-proof, gitignored file
  // (.lakebase/kit-ref.local) BEFORE any feature/sprint drive performs a branch
  // checkout (Finding 28). The committed .lakebase/kit-ref is git-tracked, so a
  // claim checkout / experiment re-fork (both fork from origin/<parent>) restores
  // a branch-committed ref out from under the run, silently running the WRONG kit.
  // The gitignored .local survives checkouts and the lk shim reads it with
  // precedence, so the orchestrator + subagents + manual lk calls all keep the
  // launch ref. Warn loudly when the committed ref drifts from the pinned ref.
  // Skipped under LAKEBASE_KIT_DIR (dir override) or when no ref is pinned.
  {
    const pd = args.projectDir ?? process.cwd();
    const launchRef = resolveLaunchKitRef(pd, process.env);
    if (launchRef) {
      const drift = kitRefDriftWarning(pd, launchRef);
      if (drift) process.stderr.write(`lakebase-sftdd-drive: ${drift}\n`);
      const r = pinRunKitRef(pd, launchRef);
      if (r.pinned) {
        process.stderr.write(
          `lakebase-sftdd-drive: pinned kit-ref '${launchRef}' to .lakebase/kit-ref.local for this run` +
            (r.previous ? ` (was '${r.previous}')` : "") +
            `.\n`,
        );
      }
    }
  }

  // HITL enforcement: headless proxy gating is only legitimate with an explicit
  // non-interactive signal. Refuse `proxy` in an interactive/dev context so a
  // stray LAKEBASE_SFTDD_HUMAN_PROXY (which the /plan|/sprint|... commands turn
  // into `--gates proxy`) can't silently bypass the human. CI + the smokes set
  // LAKEBASE_SFTDD_AUTO_CONTINUE=1 (or CI), so they pass.
  if (effectiveGates(args, args.projectDir ?? process.cwd()) === "proxy" && !hasNonInteractiveSignal()) {
    process.stderr.write(
      `lakebase-sftdd-drive: gate mode 'proxy' (Human Proxy approves headlessly) requires an explicit\n` +
        `non-interactive signal (LAKEBASE_SFTDD_AUTO_CONTINUE=1 or CI). Refusing to bypass HITL in an\n` +
        `interactive/dev context. Unset LAKEBASE_SFTDD_HUMAN_PROXY, or pass --gates interactive.\n`,
    );
    return 2;
  }

  // Tier-1: `--sprint <name>` with no `--feature` runs the whole-sprint orchestrator.
  if (args.sprint && !args.feature) {
    return runSprintMode(args);
  }
  if (!args.feature) {
    process.stderr.write(`lakebase-sftdd-drive: --feature is required.\n\n${help()}`);
    return 2;
  }

  // Resolve the Tier-2 phase bound (at most one). --plan-only is the sprint
  // planning bound; --only <phase> bounds a feature run to one phase.
  let bound: DriverBound | undefined;
  if (args.planOnly) bound = "plan";
  if (args.only) {
    if (!["design", "build", "deploy"].includes(args.only)) {
      process.stderr.write(`lakebase-sftdd-drive: --only must be design|build|deploy (got "${args.only}").\n`);
      return 2;
    }
    bound = args.only as DriverBound;
  }
  const boundOpts = bound ? driverBoundOptions(bound) : {};

  // --pause-before: a HITL gate (NOT a stop) just before a handoff (the Navigator
  // build kickoff, or the Release Engineer deploy). The driver blocks for a human
  // [Y/n] then RESUMES the same run. Backs run-to-navigator / run-to-release.
  let pauseMilestone: PauseMilestone | undefined;
  if (args.pauseBefore) {
    if (!["navigator", "release-engineer"].includes(args.pauseBefore)) {
      process.stderr.write(
        `lakebase-sftdd-drive: --pause-before must be navigator|release-engineer (got "${args.pauseBefore}").\n`,
      );
      return 2;
    }
    pauseMilestone = args.pauseBefore as PauseMilestone;
  }
  const pauseBefore = pauseMilestone ? pauseBeforeMilestone(pauseMilestone) : undefined;
  const confirmContinue = pauseMilestone ? makeConfirmContinue() : undefined;

  const cfg = buildCfg(args, args.feature);

  // FEIP-8023: refuse to drive a feature whose recorded SCM claim names a
  // DIFFERENT feature. With a prior feature shipped out-of-band and
  // .lakebase/workflow-state.json never reconciled, buildCfg would adopt the
  // stale predecessor's branch as this feature's featureBranch, so the experiment
  // would fork from (and the build commit onto) the wrong branch. Block loud , the
  // human claims this feature (or reconciles the prior one) first.
  {
    const scm = readWorkflowState(cfg.projectDir);
    if (isForeignFeatureClaim(scm, cfg.featureId)) {
      process.stderr.write(
        `lakebase-sftdd-drive: refusing to drive "${cfg.featureId}" , the SCM workflow state records a\n` +
          `DIFFERENT feature "${scm?.feature_id}" (branch ${scm?.branch ?? "?"}). Driving now would fork the\n` +
          `experiment from the wrong branch and commit build output onto it. Claim this feature first\n` +
          `(lakebase-scm-claim-feature-branch ${cfg.featureId}), or reconcile the prior out-of-band feature,\n` +
          `then re-run.\n`,
      );
      return 2;
    }
  }

  // A fresh --feature invocation must not inherit a PRIOR feature's terminal
  // TDD phase (the per-project .tdd/workflow-state.json carries "shipped"/"done"
  // from the last feature). Clear it so the feature being driven now re-derives
  // its phase from disk artifacts instead of exiting "done in 1".
  resetStaleTerminalPhase(cfg.sftddDir);

  if (args.dryRun) {
    const plan = await planNextAction(cfg, boundOpts.transition);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }

  cfg.runner = execRunner(cfg);
  const gates = effectiveGates(args, cfg.projectDir);
  snapshotRunConfig(cfg, bound ?? "full", gates);
  const interactive = gates === "interactive";
  try {
    const result = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
      maxSteps: args.maxSteps,
      transition: boundOpts.transition,
      stopWhen: gatedStopWhen(boundOpts.stopWhen, interactive),
      pauseBefore,
      confirmContinue,
    });
    const pendingGate = pendingGateOf(result);
    const pendingInput = pendingInputOf(result);
    if (result.escalated) {
      // Surface + halt: a blocking problem was raised to the HIL. The escalation
      // is recorded under ${path.basename(cfg.sftddDir)}/escalations/; exit non-zero so the run fails loud
      // (the increment is genuinely not done) and a human resolves it.
      const e = result.escalation;
      process.stderr.write(
        `[drive] RAISED TO HIL after ${result.iterations} actions , awaiting HIL decision.\n` +
          `        source: ${e?.source}\n        reason: ${e?.reason}\n` +
          `        recorded under ${path.basename(cfg.sftddDir)}/escalations/ ; resolve it, then re-run to resume.\n`,
      );
      return 3;
    } else if (result.stoppedAtMax) {
      process.stderr.write(`[drive] stopped at --max-steps ${args.maxSteps} (${result.iterations} actions)\n`);
    } else if (pendingGate) {
      reportGate(pendingGate, { featureId: cfg.featureId, featureBranch: cfg.featureBranch });
    } else if (pendingInput) {
      // A human-input pause (the PO's author-requests) is NOT a completed bound:
      // nothing was produced. Report honestly + exit non-zero (never "complete").
      reportInput(pendingInput);
      return 2;
    } else if (result.stoppedAtBound) {
      const label = bound ?? "phase";
      // 0 actions on a bounded run means the phase was ALREADY satisfied (e.g.
      // `--only deploy` after every story already deployed + accepted per the
      // per-story pipeline), NOT a no-op failure. Say so plainly (FEIP-8016).
      process.stderr.write(
        result.iterations === 0
          ? `[drive] ${label} already complete (0 actions, nothing to do; the per-story pipeline already carried it out)\n`
          : `[drive] ${label} complete in ${result.iterations} actions (bounded)\n`,
      );
    } else {
      process.stderr.write(`[drive] done in ${result.iterations} actions\n`);
    }
    return 0;
  } catch (err) {
    // A handoff EXPECTATION violation: a role returned nothing/null for the
    // artifact it owed (or the workflow tried to advance past an unmet handoff).
    // Record an escalation + emit escalation.raised (honor "escalate on any
    // error"), then abort non-zero so the run fails loud , a human resolves it.
    if (err instanceof ProtocolViolationError) {
      const h = err.handoff;
      try {
        writeEscalation(cfg.sftddDir, {
          source: `protocol:${h.responder}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...(h.story ? { story_id: h.story } : {}),
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:${h.responder}`, reason: err.message, ...(h.story ? { story: h.story } : {}) },
          },
          { sftddDir: cfg.sftddDir },
        );
      } catch {
        /* logging/escalation is best-effort; the abort below is the real signal */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.sftddDir)}/escalations/ ; fix the responder, then re-run.\n`);
      return 3;
    }
    // A wrong / unexpected caller (concurrent dispatch): a callback arrived from a
    // role we are not awaiting. Record + abort, same as a contract violation.
    if (err instanceof UnexpectedCallbackError) {
      try {
        writeEscalation(cfg.sftddDir, {
          source: `protocol:unexpected-caller:${err.from}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...(err.scope.story ? { story_id: err.scope.story } : {}),
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:unexpected-caller:${err.from}`, reason: err.message, ...(err.scope.story ? { story: err.scope.story } : {}) },
          },
          { sftddDir: cfg.sftddDir },
        );
      } catch {
        /* best-effort */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.sftddDir)}/escalations/ ; resolve it, then re-run.\n`);
      return 3;
    }
    // A replay corpus miss: the recording is incomplete for a turn the pipeline
    // dispatched. Not an escalation (no live workflow to resume) , it is a corpus/
    // config defect. Fail loud with the missing-artifact guidance; no agent ran.
    if (err instanceof ReplayCorpusMissError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    // A role produced no artifact under the project root (out-of-root write): a
    // producing-role defect, not a resumable workflow escalation. Fail loud with
    // the attributed guidance so the crash names the real culprit, not a cryptic
    // downstream consumer.
    if (err instanceof ArtifactOutOfRootError) {
      process.stderr.write(`[drive] ${err.message}\n`);
      return 3;
    }
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  } finally {
    // Auto-emit the authoritative "what next" snapshot to .sftdd/next.json on
    // EVERY stop (a gate, an escalation, feature-complete, an error, a killed
    // run), so an orchestrating agent's contract is "on any stop, read next.json
    // and present its options" instead of reverse-engineering the next move and
    // drifting into freeform (FEIP-8017). Feature scope only (the stops that need
    // it); `lakebase-sftdd-next --sprint` answers sprint scope on demand. Skipped
    // under replay/record so the recorded corpora stay clean; best-effort inside.
    const recordingOrReplaying =
      !!sftddEnv("REPLAY_DIR") || !!sftddEnv("REPLAY_BUILD_DIR") || !!sftddEnv("RECORD_BUILD_DIR") || !!sftddEnv("RECORD_DIR");
    if (cfg.featureId && !recordingOrReplaying) {
      emitNextJson(cfg.sftddDir, cfg.featureId, cfg.projectDir, {
        uiTrack: cfg.uiTrack,
        version: kitVersion(),
        ...(cfg.featureBranch ? { featureBranch: cfg.featureBranch } : {}),
      });
    }
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
