#!/usr/bin/env node
// consort-drive: the deterministic orchestrator driver (phase 3b).
//
//   consort-drive --feature <id> [--project-dir <dir>] [--tdd-dir <dir>]
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

import treeKill from "tree-kill";
import { consortEnv } from "../../consort/config/consort-env.js";
import {
  resolveConsortDir,
  ARTIFACT_ROOT,
  LEGACY_ARTIFACT_ROOT,
  featuresDir,
  hasFeatureRequest,
  featureProposalsMd,
} from "../../consort/config/consort-paths.js";
import { migrateLegacyArtifactDir } from "../../consort/config/migrate-artifact-dir.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { relaunchDetached as spawnDetached } from "../../consort/session/relaunch-detached.js";
import * as readline from "node:readline";

import { recordTurn, seedRecorderBaseline, recordCorrespondence, recordRoutingDecision, lastRecordedOrdinal, type CorrespondenceEntry } from "../../consort/logging/turn-recorder.js";
import { readAgentLog } from "../../consort/logging/agent-log.js";
import { recordBuildTurn, nextBuildTurnNumber } from "../../consort/pipeline/record-build.js";
import { runDriver, driverBoundOptions, ProtocolViolationError, UnexpectedCallbackError, type DriveEffects, type DriverBound, type RunDriverResult, type RunDriverOptions } from "../../consort/orchestrator/drive/orchestrator-run.js";
import type { DriveState } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";
import { writeEscalation } from "../../consort/gates/escalation.js";
import { RouteContractError } from "../../consort/orchestrator/steps/assert-route-satisfiable.js";
import { emitNextJson, buildNextSnapshot } from "../../consort/orchestrator/status/next.js";
import { emitAgentLogEvent } from "../../consort/logging/agent-log.js";
import { resetStaleTerminalPhase } from "../../consort/gates/workflow-phase.js";
import {
  isHitlGateAction,
  isHumanInputAction,
  pauseBeforeMilestone,
  type PauseMilestone,
  type WorkflowAction,
} from "../../consort/orchestrator/drive/orchestrator-drive.js";
import {
  buildDriveEffects,
  commandsForAction,
  planNextAction,
  type DriveEffectsConfig,
} from "../../consort/orchestrator/drive/orchestrator-effects.js";
import {
  runSprint,
  readSprintBacklog,
  backlogFeatureIds,
  shippedBecauseLaterFeatureClaimed,
  shippedByClearedClaim,
  syncBacklog,
  deriveSprintPlanningState,
  type SprintEffects,
  type DriveStepResult,
} from "../../consort/intake/orchestrator-sprint.js";
import { resolveConsortSettings, applyProjectOverrides } from "../../consort/orchestrator/settings/project-settings.js";
import { describeAction, approveHint, makeOnAction, parkedGateSurfacedEvent, gateAlreadySurfaced } from "../../consort/logging/orchestrator-logging.js";
import { kitVersion, exportConsortVersionEnv } from "../../consort/config/kit-bin.js";
import { isForeignFeatureClaim, readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { driveAuthPreflight } from "../../consort/orchestrator/provisioning/credentials.js";
import { writeRunConfig } from "../../consort/session/run-config.js";
import { resolveLaunchKitRef, pinRunKitRef, kitRefDriftWarning } from "../../consort/config/kit-ref.js";
import {
  buildCfg,
  execRunner,
  takeLastAgentTranscript,
  spawnCmd,
  type ParsedArgs,
  type TurnTranscript,
  ClaudeTurnError,
  ReplayCorpusMissError,
  ArtifactOutOfRootError,
  CliEffectError,
} from "../../consort/orchestrator/drive/claude-runner.js";
import { beginTelemetryRun, withTelemetry } from "../../consort/telemetry/with-telemetry.js";
import { commandForFeaturePhase, outcomeForExit, type TelemetryCommand } from "../../consort/telemetry/allowlist.js";
import { deriveFeaturePhase, summarizeStories } from "../../consort/orchestrator/status/feature-status.js";


function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--sprint": out.sprint = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": out.consortDir = argv[++i]; break;
      case "--instance": out.instance = argv[++i]; break;
      case "--deploy-target": out.deployTarget = argv[++i]; break;
      case "--approver": out.approver = argv[++i]; break;
      case "--dry-run": out.dryRun = true; break;
      case "--stop": out.stop = true; break;
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
  return `consort-drive (deterministic orchestrator driver)

Usage:
  consort-drive --feature <id> [flags]

Flags:
  --feature <id>       Feature to drive (required)
  --project-dir <dir>  Project root (default: cwd)
  --tdd-dir <dir>      artifact root (default: <project-dir>/${ARTIFACT_ROOT}, honors legacy roots)
  --instance <id>      Lakebase instance id (threaded to experiment branch ops)
  --deploy-target <t>  Deploy target for the deploy phase (default: local)
  --approver <name>    Headless gate approver (default: human-proxy)
  --detach             Re-launch in a NEW session (setsid) and return at once, so the
                       run survives this shell/turn ending. Use this INSTEAD of
                       nohup/& (which the harness reaps on turn-end). Prints the child
                       pid + the consort-watch command; follow the run via that.
  --dry-run            Print the single next action + its commands, then exit
  --max-steps <n>      Stop after n actions (incremental/live testing + safety)
  --plan-only          Tier-2: run the sprint planning sub-machine only (/plan)
  --only <phase>       Tier-2 bound: design | build | deploy (one phase, then stop)
  --pause-before <m>   PAUSE (not stop) just before a handoff: navigator (the
                       build kickoff) | release-engineer (the deploy/verify). The
                       driver blocks for a human [Y/n], then RESUMES the same run
                       on Y – it never leaves the state machine. n re-asks. Set
                       LAKEBASE_CONSORT_AUTO_CONTINUE=1 to auto-confirm (non-interactive).
  --gates <mode>       interactive (default: stop AT each HITL gate so the human
                       answers, then re-run) | proxy (headless: Human Proxy
                       approves; requires LAKEBASE_CONSORT_AUTO_CONTINUE=1 or CI).
                       Run-scoped: overrides project.gates for THIS run only,
                       never rewrites sftdd-config.json.
  --no-sizing          Skip the Architect's t-shirt-sizing (planning-poker) step:
                       planning goes propose -> author-requests, no estimate.
                       Sizing is ON by default. Aliases: --no-planning-poker,
                       --no-t-shirt-sizing.
`;
}


/**
 * The PAUSE gate's human wait: block the state machine at the handoff and ask
 * [Y/n], then RESUME on Y (n re-asks; the run never bails). Three input sources,
 * in order:
 *   1. LAKEBASE_CONSORT_AUTO_CONTINUE=1   – auto-confirm (CI / fully non-interactive).
 *   2. LAKEBASE_CONSORT_GATE_ANSWER_FILE  – poll that file for y/n (a parent process
 *      drives the gate, e.g. a controller answering on the human's behalf).
 *   3. an interactive stdin TTY       – prompt + read the human's line.
 * With none of those (piped, no control file), it auto-continues with a warning
 * rather than crashing or hanging. It never opens /dev/tty (absent in many
 * sandboxes, and its open error is async – the prior cause of a hard crash).
 */
function makeConfirmContinue(): (action: WorkflowAction) => Promise<void> {
  const auto = consortEnv("AUTO_CONTINUE") === "1";
  const answerFile = consortEnv("GATE_ANSWER_FILE")?.trim();
  const isYes = (a: string): boolean => a === "" || a === "y" || a === "yes";
  return (action) =>
    new Promise<void>((resolve, reject) => {
      const label = describeAction(action);
      const prompt = `\n[drive] PAUSED – continue past the ${label} handoff? [Y/n] `;
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
          if (a === "") return; // present but blank – keep waiting
          try { fs.rmSync(answerFile, { force: true }); } catch { /* ignore */ }
          if (a === "y" || a === "yes") { clearInterval(poll); process.stderr.write(`[drive] resuming.\n`); resolve(); }
          else process.stderr.write(`[drive] holding – write Y to ${answerFile} when ready.\n`);
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
            else { process.stderr.write(`[drive] holding – answer Y when ready.\n`); ask(); }
          });
        };
        return ask();
      }
      // No auto-confirm, no control channel, no TTY: there is NO human in the
      // loop, so STOP rather than silently proceed past the handoff (an
      // agent-driven non-TTY run must not self-approve). A deliberate headless
      // run sets LAKEBASE_CONSORT_AUTO_CONTINUE=1; a controller writes a gate-answer
      // file; a human uses a terminal. None present = refuse.
      reject(
        new Error(
          `[drive] PAUSED at the ${label} handoff with no human channel – refusing to continue. ` +
            `Set LAKEBASE_CONSORT_AUTO_CONTINUE=1 (deliberate headless), provide ` +
            `LAKEBASE_CONSORT_GATE_ANSWER_FILE, or run in an interactive terminal.`,
        ),
      );
    });
}

/**
 * Wrap effects so that, when LAKEBASE_CONSORT_RECORD_BUILD_DIR is set, the driver
 * snapshots each Navigator/Driver turn AFTER its effect lands – the per-turn
 * build corpus the event-by-event replay plays back. A no-op when unset, so a
 * normal run is unaffected. Only build turns (invoke-role navigator|driver) are
 * recorded; design/deploy turns are not build output.
 */
function withBuildRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  const recordBuildDir = consortEnv("RECORD_BUILD_DIR")?.trim();
  if (!recordBuildDir) return inner;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    // Forward the routing-decision seam UNCHANGED (withTurnRecording records it; this build-only
    // wrapper just preserves it so composition never drops it).
    onRoutingDecision: inner.onRoutingDecision ? (a, s, i, src) => inner.onRoutingDecision!(a, s, i, src) : undefined,
    onHandback: inner.onHandback ? (h, d) => inner.onHandback!(h, d) : undefined,
    // Forward the executor-dispatch seam UNCHANGED (see withTurnRecording): an executor-dispatched
    // build turn records via the executor's wrapper, not here, so this only fires for a non-dispatched
    // navigator/driver perform turn. Preserved so recording doesn't disable executor dispatch.
    performViaExecutor: inner.performViaExecutor ? (a, s, r) => inner.performViaExecutor!(a, s, r) : undefined,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver")) {
        // Seed the ordinal PER-STORY from disk (not a per-process counter): a
        // resumed drive continues the story's sequence instead of restarting at 1
        // and writing a stray 001-… dir that sorts before the earlier turns and
        // corrupts replay order.
        const turn = nextBuildTurnNumber(recordBuildDir, cfg.featureId, action.story);
        const dir = recordBuildTurn({
          recordBuildDir,
          projectDir: cfg.projectDir,
          consortDir: cfg.consortDir,
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
 * Wrap effects so that, when LAKEBASE_CONSORT_RECORD_DIR is set, the driver records
 * EVERY state-machine turn AFTER its effect lands – the universal per-turn
 * timeline (design, gates, build, deploy, accept, promote), not just the build
 * lane. Each turn writes turns/<NNNN>-<label>/ (manifest + the .tdd/code delta it
 * produced) + refreshes the cumulative recorded-artifacts mirror that
 * replayDesignTurn consumes. Composes with withBuildRecording (which populates
 * recorded-build for replayBuildTurn), so one recordDir holds the whole
 * record/replay corpus. A no-op when unset, so a normal run is unaffected.
 */
/** Project a HIL touchpoint (author-requests / a gate) + the proxy's fresh agent-log entries into a
 *  CorrespondenceEntry: the orchestrator's REQUEST paired with the proxy's ANSWER/SUBMISSION + outcome.
 *  Reads the response side from what the proxy LOGGED this turn (intake.supplied / gate.approved /
 *  their refused variants) – the faithful record of what the proxy submitted + whether it validated.
 *  Stage 4 adds interview answers[]; here the response is the artifact submission + gate decision. */
function projectCorrespondence(
  seq: number,
  iteration: number,
  action: WorkflowAction,
  state: DriveState,
  fresh: import("../../consort/logging/agent-log.js").AgentLogEvent[],
  isGate: boolean,
  recordDir: string,
): [CorrespondenceEntry, CorrespondenceEntry] {
  const phase = (state as { phase?: string }).phase;
  const kind: CorrespondenceEntry["request"]["kind"] = isGate ? "gate" : "author-requests";
  const supplied = fresh.filter((e) => e.event === "intake.supplied");
  const gateEv = fresh.find((e) => e.event === "gate.approved" || e.event === "gate.rejected");
  const anyRefused = fresh.some((e) => e.event === "intake.refused" || e.event === "gate.rejected");
  const violations = fresh.flatMap((e) => {
    const v = (e.metadata as { violations?: unknown })?.violations;
    return Array.isArray(v) ? (v as string[]) : [];
  });
  const submitted = supplied.map((e) => {
    const md = (e.metadata ?? {}) as { artifact?: string; from?: string; to?: string };
    return { artifact: md.artifact ?? "artifact", ...(md.from ? { from: md.from } : {}), ...(md.to ? { contentRef: md.to } : {}) };
  });
  const approved = isGate ? (gateEv?.event === "gate.approved") : undefined;
  // Explicit FK to the turn this exchange ran at: onCorrespondence fires after perform() recorded the
  // turn (author-requests / gate ARE recorded turns), so the just-recorded turn is the last index
  // entry. null only if nothing was recorded (should not happen for a HIL touchpoint).
  const ordinal = lastRecordedOrdinal(recordDir);
  const at = new Date().toISOString();
  const askPrompt = isGate
    ? `orchestrator presents ${describeAction(action)} for HIL approval`
    : `orchestrator asks the PO to author the sprint's feature-requests (${describeAction(action)})`;
  const askRendered = isGate
    ? `**HIL approval requested** – ${describeAction(action)}`
    : `**PO input requested** – author the sprint's feature-requests (${describeAction(action)})`;
  // EVERY HIL exchange is a two-beat round-trip, recorded faithfully (mirrors the kickoff/intake beats):
  //   ask    (orch-to-hil): the orchestrator poses the request (a gate approval, or the PO author ask).
  //   answer (hil-to-orch): the HIL's decision/submission + outcome.
  // Both beats carry the same turn FK (ordinal) + iteration so a reader can pair them.
  const ask: CorrespondenceEntry = {
    seq,
    direction: "orch-to-hil",
    ordinal,
    iteration,
    at,
    ...(phase ? { phase } : {}),
    request: { kind, prompt: askPrompt, presentation: { format: "markdown", rendered: askRendered } },
    response: { by: "orchestrator" },
    outcome: { validated: true },
  };
  const answer: CorrespondenceEntry = {
    seq: seq + 1,
    direction: "hil-to-orch",
    ordinal,
    iteration,
    at,
    ...(phase ? { phase } : {}),
    request: { kind, prompt: askPrompt, presentation: { format: "markdown", rendered: askRendered } },
    response: {
      by: "human-proxy",
      ...(submitted.length ? { submitted } : {}),
      ...(isGate ? { decision: approved ? ("approved" as const) : ("rejected" as const) } : {}),
      // Presentation: the proxy's decision/submission as shown – the agent-log message lines it wrote,
      // preserved so the recorded transcript reads like the interactive exchange.
      presentation: {
        format: "markdown",
        rendered: fresh.map((e) => `- ${e.message}`).join("\n"),
      },
    },
    outcome: {
      validated: !anyRefused,
      ...(isGate ? { approved: !!approved } : {}),
      ...(violations.length ? { violations } : {}),
    },
  };
  return [ask, answer];
}

function withTurnRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  // One recorder, two fidelities (the single path: a corpus can be replayed, a live build can be
  // seen). An explicit RECORD_DIR is a CAPTURE – snapshot each turn's content into that corpus, so
  // it is historically accurate + replayable. Otherwise a plain LIVE build records into `.consort`
  // ITSELF (index + transcript, NO content snapshot): every turn is a viewable timeline entry with
  // its prompt/tools/reasoning + the files it added/modified/removed, and a clicked file is read at
  // HEAD (may have changed since – not historically accurate, by design). During REPLAY we write
  // nothing (the corpus is the input, not an output).
  const external = consortEnv("RECORD_DIR")?.trim();
  const isReplay = !!consortEnv("REPLAY_DIR")?.trim() || !!consortEnv("REPLAY_BUILD_DIR")?.trim();
  if (!external && isReplay) return inner;
  const recordDir = external || cfg.consortDir;
  const snapshotContent = !!external;
  // Seed the delta baseline with the current (post-scaffold/intake) state ONCE,
  // so the first recorded turn reports only what it produced, not the pre-existing
  // scaffold. A no-op once a baseline exists (later drive processes in the run).
  seedRecorderBaseline({ recordDir, projectDir: cfg.projectDir, consortDir: cfg.consortDir });
  // Correspondence bookkeeping: snapshot the agent-log length BEFORE each perform so onCorrespondence
  // (fired AFTER perform, in the loop) can read exactly the entries the proxy appended THIS turn +
  // pair them with the orchestrator's request. seq is the monotonic correspondence counter.
  // The kickoff/intake round-trip (recorded before the drive loop) consumed seq 0,1,2; the perform-path
  // HIL exchanges (gate/author-requests) continue from 3 so the correspondence stream stays dense.
  let corrSeq = 3;
  let logLenBeforePerform = readAgentLog({ consortDir: cfg.consortDir }).length;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    // Routing-decision observability (diagnostic stream the turn recorder lacks): append the
    // action + the state bag that CHOSE it to routing-decisions.jsonl. Fires for EVERY iteration
    // (agent + non-agent + terminal), so "why did this turn route here" is answerable from the
    // corpus. Chains any inner hook first, then records. Gated on the same recordDir as recordTurn.
    onRoutingDecision: (a, s, i, source) => {
      inner.onRoutingDecision?.(a, s, i, source);
      recordRoutingDecision(recordDir, a, s, i, source);
    },
    onHandback: inner.onHandback ? (h, d) => inner.onHandback!(h, d) : undefined,
    // Correspondence: a HIL touchpoint (author-requests / a gate) just ran on the perform path; the
    // proxy has appended its response to agent-log. Pair the orchestrator's REQUEST with the proxy's
    // fresh ANSWER/SUBMISSION + outcome, and record it as a run-level transcript entry. Non-HIL
    // actions record nothing. Delegates the inner hook first (routing observability stays intact).
    onCorrespondence(action, state, iteration) {
      inner.onCorrespondence?.(action, state, iteration);
      const isGate = isHitlGateAction(action);
      const isInput = isHumanInputAction(action);
      if (!isGate && !isInput) return;
      const after = readAgentLog({ consortDir: cfg.consortDir });
      const fresh = after.slice(logLenBeforePerform); // entries the proxy appended this turn
      // Two beats per exchange: the orchestrator's ASK (orch-to-hil) + the HIL's ANSWER (hil-to-orch).
      const beats = projectCorrespondence(corrSeq, iteration, action, state, fresh, isGate, recordDir);
      for (const beat of beats) recordCorrespondence(recordDir, beat);
      corrSeq += beats.length;
    },
    // Forward the executor-dispatch seam UNCHANGED: an executor-dispatched turn runs THROUGH the
    // executor (whose ReplayRecorderWrapper records it, from cfg.takeTranscript) and NEVER reaches
    // perform, so this effects-level recorder only fires for the NON-dispatched (perform) turns ,
    // gates/deploy/human-proxy. Disjoint writers by construction (orchestrator-run.ts:326-330).
    // Dropping this property silently disabled the executor path under recording – the bug this fixes.
    performViaExecutor: inner.performViaExecutor ? (a, s, r) => inner.performViaExecutor!(a, s, r) : undefined,
    async perform(action) {
      logLenBeforePerform = readAgentLog({ consortDir: cfg.consortDir }).length; // pre-perform cursor for correspondence
      await inner.perform(action);
      // `done` IS a recorded turn: it is no longer a bare no-op – it performs the
      // parent-tier landing (git checkout -f <parentBranch>) that ends the feature
      // on its parent, not the just-merged (soon-deleted) feature branch. That is
      // the terminal step a faithful capture must carry, so the recorded timeline
      // ends at `done`, not `merge`. Its .consort output delta is typically empty
      // (recordTurn already tolerates zero produced/deleted, as merge/gate turns do);
      // the value is the terminal marker + the branch-switch it represents. There is
      // no agent transcript for a non-invoke-role action (gates, deploy, merge, done).
      // An invoke-role action just ran an agent; grab its outcome-level
      // transcript (prompt + final reasoning + tool list) to record alongside
      // the artifact delta. Non-agent actions (gates, deploy) have none.
      const transcript = takeLastAgentTranscript();
      const rec = recordTurn({ recordDir, projectDir: cfg.projectDir, consortDir: cfg.consortDir, action, step: 0, transcript, snapshotContent });
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
  // – the same transition the Human Proxy performs headless.
  return (a) => (base?.(a) ?? false) || isHitlGateAction(a) || isHumanInputAction(a);
}

/** The HITL gate a bounded run halted at (interactive mode), or undefined. */
function pendingGateOf(r: RunDriverResult): WorkflowAction | undefined {
  return r.stoppedAtBound && r.stoppedAt && isHitlGateAction(r.stoppedAt) ? r.stoppedAt : undefined;
}

/** The HUMAN-INPUT stop a bounded run halted at (interactive mode) – the PO's
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

function reportGate(gate: WorkflowAction, ctx: { featureId?: string; sprint?: string; featureBranch?: string; consortDir?: string } = {}): void {
  // Surface the parked gate to the log so the dashboard shows "waiting on you" and
  // the gate flashes. The driver STOPS before a HITL gate in interactive mode
  // (orchestrator-run halts at stopWhen, before onAction/perform), so a gate that
  // parks directly – intake / plan / deploy / promote – would otherwise never emit
  // gate.surfaced. This is the ONE place the interactive park surfaces it; idempotent
  // via gateAlreadySurfaced, so a re-run at the same park + the spec/acceptance gates
  // that pre-surface (surface-gate / await-acceptance) never double-log.
  if (ctx.consortDir) {
    const surfaced = parkedGateSurfacedEvent(gate, { featureId: ctx.featureId, sprint: ctx.sprint });
    if (surfaced && !gateAlreadySurfaced(readAgentLog({ consortDir: ctx.consortDir }), gate)) {
      try {
        emitAgentLogEvent(surfaced, { consortDir: ctx.consortDir });
      } catch {
        /* swallow: observability is not load-bearing for the run */
      }
    }
  }
  // Reuse the shared action narration (DRY) instead of dumping raw JSON; the
  // full action is available under LAKEBASE_CONSORT_TRACE for debugging.
  const trace = consortEnv("TRACE") ? `  ${JSON.stringify(gate)}` : "";
  process.stderr.write(
    `[drive] GATE awaiting human approval: ${describeAction(gate)}.${trace}\n` +
      `        Record your decision with:\n` +
      `          ${approveHint(gate, ctx)}\n` +
      `        then re-run to continue.\n`,
  );
}

/** Feature ids that already have an authored `feature-request.md` on disk
 *  (a staged first-project seeds one per feature; a prior planning turn may too). */
function featuresWithAuthoredRequest(consortDir: string): string[] {
  try {
    return fs
      .readdirSync(featuresDir(consortDir), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((id) => hasFeatureRequest(consortDir, id))
      .sort();
  } catch {
    return [];
  }
}

/** Candidate feature ids the Spec Author proposed for THIS sprint – the `## F...`
 *  headings in `planning/feature-proposals.md`. NOTE: these are only the RAW
 *  heading tokens; the Spec Author may label items with its own positional ids
 *  (`## F1`, `## F2`, ...) that are a DIFFERENT id space from the authored folder
 *  ids (`F1-stock-visibility`, ...). Callers MUST validate against the real
 *  folders before treating these as feature ids (see composeInputPause). */
function proposedFeatureIds(consortDir: string): string[] {
  try {
    const md = fs.readFileSync(featureProposalsMd(consortDir), "utf8");
    return [...md.matchAll(/^##\s+(F\S+)/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

/** Compose the interactive pause message for the planning `author-requests` step.
 *  NOTHING has been approved/committed, so this must never read as "complete".
 *  But the human's ACTION depends on disk state, and conflating the two is what
 *  makes this pause look like the orchestrator is "confused":
 *   - No `feature-request.md` yet   -> author them, then commit the backlog.
 *   - Requests ALREADY authored (staged first-project, or a prior propose turn)
 *     -> there is nothing to author; the human only COMMITS which of the existing
 *     requests are in this sprint. We branch on the real state and name the exact
 *     commit command (pre-filling the proposed features when planning proposed a
 *     set), so a pre-seeded backlog is never mislabeled as "author the requests".
 *  Pure (returns the string) so the branching is unit-testable off a fixture dir. */
export function composeInputPause(action: WorkflowAction, sprint?: string, consortDir?: string): string {
  const s = sprint ?? "<sprint>";
  const existing = consortDir ? featuresWithAuthoredRequest(consortDir) : [];
  const proposed = consortDir ? proposedFeatureIds(consortDir) : [];
  if (existing.length > 0) {
    // Requests exist on disk: this is a COMMIT-the-backlog decision, not authoring.
    // ONLY pre-fill --features with proposal ids that EXACTLY match an authored
    // feature-request folder. The Spec Author may label its proposal items with a
    // positional id space (`## F1`, `## F2`, ...) that is NOT the folder id space
    // (`F1-stock-visibility`, ...), and `consort-sync-backlog` matches folder ids
    // EXACTLY – so pre-filling raw proposal labels would emit a --features list
    // that resolves to NOTHING (an empty backlog + "no feature-request.md"
    // warnings, exit 2), or – worse if a future matcher went prefix – silently
    // select the wrong folders (e.g. `F5` -> a deferred `F5-cycle-count`). When the
    // proposal's labels do not match real folders, DO NOT guess: fall back to the
    // placeholder and make the human commit by the real folder ids listed above.
    const authored = new Set(existing);
    const proposedValid = proposed.filter((id) => authored.has(id));
    const mismatched = proposed.filter((id) => !authored.has(id));
    const pick = proposedValid.length ? proposedValid.join(",") : "<id[,id...]>";
    const proposedLine = proposedValid.length
      ? `        Planning proposed for this sprint: ${proposedValid.join(", ")} (see ${ARTIFACT_ROOT}/planning/feature-proposals.md).\n`
      : "";
    const mismatchLine = mismatched.length
      ? `        NOTE: the proposal labels its items ${mismatched.join(", ")} – the Spec Author's own numbering, NOT the authored\n` +
        `        folder ids above. Commit by the FOLDER ids (map from the proposal's titles); do not pass the proposal's labels.\n`
      : "";
    return (
      `[drive] PAUSED – awaiting the Product Owner's sprint backlog. This is a DECISION, not an authoring task:\n` +
      `        ${existing.length} feature-request(s) are already authored (${existing.join(", ")}) – none need writing.\n` +
      proposedLine +
      mismatchLine +
      `        COMMIT which features are in sprint "${s}" (by folder id):\n` +
      `          consort-sync-backlog --sprint ${s} --features ${pick}\n` +
      `        then re-run the drive – it advances to the (interactive) plan gate.\n`
    );
  }
  return (
    `[drive] PAUSED – awaiting human input (${describeAction(action)}). Nothing was approved or produced yet.\n` +
    `        No feature-request.md exists yet, so the Product Owner must:\n` +
    `          1. author the sprint's feature-request(s) at ${ARTIFACT_ROOT}/features/<id>/feature-request.md, then\n` +
    `          2. commit the backlog: consort-sync-backlog --sprint ${s} --features <id[,id...]>\n` +
    `        then re-run the drive – it will advance to the (interactive) plan gate.\n`
  );
}

/** Write the planning `author-requests` pause to stderr (see composeInputPause). */
function reportInput(action: WorkflowAction, sprint?: string, consortDir?: string): void {
  process.stderr.write(composeInputPause(action, sprint, consortDir));
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
  const consortDir = args.consortDir ?? resolveConsortDir(projectDir);
  // Claim through the project's lk shim, exactly as per-feature mode and
  // capture-scenario.sh do. scm-claim-feature is a SUBSTRATE bin
  // (lakebase-scm-claim-feature-branch); post-extraction it lives in
  // node_modules/@databricks-solutions/lakebase-scm-utils, NOT the kit dist, so a
  // hardcoded kit-relative path no longer resolves. The lk shim routes the bin
  // through node_modules + the run's pinned kit ref.
  const lkShim = path.join(projectDir, "scripts", "lk");
  // sizing comes from consort-config.json; the gate mode is RUN-SCOPED (--gates
  // override else the project's declared policy), never read back from a
  // flag-mutated file.
  const settings = resolveConsortSettings({ projectDir });
  const gates = effectiveGates(args, projectDir);
  const interactive = gates === "interactive";
  const skipSizing = !settings.plan.sizing;

  // Correspondence step 0 (the kickoff): record the /sprint command that STARTED this session, so a
  // recorded capture's transcript begins where the user begins – the real /sprint, not the first agent
  // turn. Only when recording (RECORD_DIR set); the command + its formatting are preserved.
  //
  // Intake IS the HIL's response to /sprint: when the human (proxy) runs /sprint, the artifacts they
  // hand over – product-overview.md, nfrs.md, design-brief.md, and the brand asset(s) – are the
  // SUBMISSION on this kickoff exchange. They were placed on disk by the pre-drive intake supply
  // (human-proxy supply), so surface each that EXISTS as a kickoff `submitted[]` entry, keyed by
  // reference (contentRef = its project path). The icon is a BINARY asset (recorded by reference only,
  // never inlined). direction=hil-to-orch; ordinal=null (kickoff precedes turn 0, no turn to key to).
  const recordDirForKickoff = consortEnv("RECORD_DIR")?.trim();
  if (recordDirForKickoff) {
    const cmd = `/sprint ${sprint} --gates ${gates}`;
    const by = interactive ? "human" : ("human-proxy" as const);
    const nowIso = (): string => new Date().toISOString();
    // The intake exchange is a THREE-BEAT round-trip, recorded faithfully so the corpus begins where
    // the human begins (the /sprint), shows the ORCHESTRATOR asking its project questions, and then
    // the HIL's submission – not a single conflated entry.
    //   seq 0  kickoff       (hil-to-orch): the HIL types `/sprint` – the command that starts the run.
    //   seq 1  intake        (orch-to-hil): the orchestrator ASKS for the project intake it needs to
    //                          plan (the "project questions"): product overview, NFRs, design brief,
    //                          brand asset(s). This is the beat that was missing.
    //   seq 2  intake        (hil-to-orch): the HIL SUBMITS the intake artifacts in response – each
    //                          that exists on disk becomes a `submitted[]` entry (contentRef = its
    //                          project path; a binary asset by reference only, never inlined).
    const intakeCandidates: Array<{ artifact: string; rel: string; binary?: boolean; ask: string }> = [
      { artifact: "product-overview.md", rel: "product-overview.md", ask: "a product overview – the framing + goals the features are proposed from" },
      { artifact: "nfrs.md", rel: "nfrs.md", ask: "the non-functional requirements (NFRs) the work must satisfy" },
      { artifact: "design-brief.md", rel: path.join("design", "design-brief.md"), ask: "a design brief – the UX/visual direction for the SPA" },
      { artifact: "warehouse.png", rel: path.join("design", "assets", "warehouse.png"), binary: true, ask: "any brand asset(s) (logo/icon) to carry into the design" },
    ];
    const resolved = intakeCandidates.map((c) => ({ ...c, abs: path.join(consortDir, c.rel) }));

    // Beat 0 – the kickoff command (the HIL's `/sprint`).
    recordCorrespondence(recordDirForKickoff, {
      seq: 0,
      direction: "hil-to-orch",
      ordinal: null,
      iteration: -1,
      at: nowIso(),
      phase: "planning",
      request: { kind: "kickoff", prompt: cmd, presentation: { format: "markdown", rendered: `\`${cmd}\`` } },
      response: { by, presentation: { format: "markdown", rendered: `Starting sprint \`${sprint}\`.` } },
      outcome: { validated: true },
    });

    // Beat 1 – the ORCHESTRATOR asks the HIL for the project intake it needs to plan.
    const questions = resolved.map((c, i) => `${i + 1}. ${c.ask} (\`${c.rel}\`)`).join("\n");
    const askPrompt =
      `To plan this sprint I need the project intake. Please provide:\n${questions}\n\n` +
      `Place each under the project's \`.consort/\`; I will read them as the proposal + design inputs.`;
    recordCorrespondence(recordDirForKickoff, {
      seq: 1,
      direction: "orch-to-hil",
      ordinal: null,
      iteration: -1,
      at: nowIso(),
      phase: "planning",
      request: { kind: "intake", prompt: askPrompt, presentation: { format: "markdown", rendered: askPrompt } },
      response: { by: "orchestrator" },
      outcome: { validated: true },
    });

    // Beat 2 – the HIL SUBMITS the intake. COPY each submitted artifact INTO the record dir
    // (`<REC>/intake/<rel>`) and reference THAT copy – the recording OWNS the bytes and never points
    // at an external/ephemeral source (the project `.consort/` is deleted on reclaim; the seed folder
    // can change). contentRef is stored record-relative (`intake/<rel>`) so the corpus is portable.
    const intakeCopyDir = path.join(recordDirForKickoff, "intake");
    const submitted = resolved
      .filter((c) => fs.existsSync(c.abs))
      .map((c) => {
        const dest = path.join(intakeCopyDir, c.rel);
        try {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(c.abs, dest); // binary-safe (byte copy), so the PNG icon is preserved
        } catch {
          /* best-effort: a failed intake copy must never break the run */
        }
        return { artifact: c.artifact, contentRef: path.join("intake", c.rel), ...(c.binary ? { binary: true } : {}) };
      });
    recordCorrespondence(recordDirForKickoff, {
      seq: 2,
      direction: "hil-to-orch",
      ordinal: null,
      iteration: -1,
      at: nowIso(),
      phase: "planning",
      request: { kind: "intake", prompt: "Intake for the sprint.", presentation: { format: "markdown", rendered: "Submitting project intake." } },
      response: {
        by,
        ...(submitted.length ? { submitted } : {}),
        presentation: {
          format: "markdown" as const,
          rendered: submitted.length
            ? submitted.map((s) => `- INTAKE supplied ${s.artifact}`).join("\n")
            : "(no intake artifacts on disk)",
        },
      },
      outcome: { validated: submitted.length > 0 },
    });
  }

  // Telemetry for the SPRINT path (the `/consort:start` default). Sprint mode used to
  // emit NOTHING – beginTelemetryRun lived only in the single-feature path, so every
  // `--sprint` run (planning + each per-feature drive) was invisible: an empty
  // telemetry.runs despite heavy use. One run per sprint-mode invocation, opened here
  // so drivePlanning + driveFeature (below) can wrap their runDriver with it; finished
  // in the finally at the end. Consent + the detached sink resolve exactly as the
  // feature path (a no-op session when consent fails; never blocks the drive).
  // A `--sprint --plan-only` invocation (the /plan command) enters runSprintMode too but
  // runs ONLY planning (the runBody planOnly branch below), so it reports `plan`, not
  // `sprint`. A full `--sprint` (planning + every feature drive) reports `sprint`. Without
  // this split, /plan collapsed into `sprint` and never appeared as its own command.
  const telemetry = beginTelemetryRun({
    command: args.planOnly ? "plan" : "sprint",
    onNotice: (m) => process.stderr.write(m),
  });

  const effects: SprintEffects = {
    async drivePlanning() {
      const cfg = buildCfg(args, "");
      cfg.runner = execRunner(cfg);
      // Scope the planning primitives to THIS sprint. author-requests emits
      // supply-requests + sync-backlog keyed on `cfg.sprintName ?? "sprint"`, and the plan gate
      // reads it too; deriveSprintPlanningState (readState / readFreshDriveState below) reads the
      // backlog for `sprint`. If sprintName is unset, the perform writes backlog.json under the
      // "sprint" FALLBACK while the deriver reads <sprint> => empty backlog => requestsAuthored
      // never flips => the loop re-derives author-requests => DRIVER STALL (the J2 planning stall).
      // Set it to the real --sprint so both sides agree.
      cfg.sprintName = sprint;
      snapshotRunConfig(cfg, "plan", gates);
      // Build effects via buildDriveEffects so the PLANNING lane gets the SAME executor path the
      // feature drive has: its performViaExecutor dispatches the planning AGENT turns (spec-author
      // propose, architect estimate – both executor-allowlisted + manifested) through the StepExecutor,
      // while its perform runs the deterministic planning primitives (author-requests, sync-backlog,
      // estimate-committed, the plan gate). Only readState differs from a feature drive – override it
      // with the sprint-planning deriver.
      //
      // The executor's post-turn `state-derived` re-derive must ALSO use the planning deriver, not the
      // feature probe: a propose turn routes state-derived, and the feature probe reports phase:"feature"
      // (no planning block), so nextTransition would derive `breakdown` instead of `estimate` (the J2
      // defect). cfg.readFreshDriveState is the executor's fresh-reader seam – point it at the SAME
      // deriveSprintPlanningState so the executor's routing authority matches this drive's readState.
      // It is SYNC (the executor's `allowed` is sync); deriveSprintPlanningState is sync.
      cfg.readFreshDriveState = () => deriveSprintPlanningState(consortDir, sprint, { skipSizing });
      const planning: DriveEffects = {
        ...buildDriveEffects(cfg),
        // Sizing is ON by default; --no-sizing (or config plan.sizing:false) opts out.
        readState: async () => deriveSprintPlanningState(consortDir, sprint, { skipSizing }),
      };
      const base = driverBoundOptions("plan");
      const r = await runDriver(withTelemetry(withTurnRecording(planning, cfg), telemetry), {
        ...base,
        stopWhen: gatedStopWhen(base.stopWhen, interactive),
      });
      return stepResultOf(r);
    },
    async readBacklog() {
      return backlogFeatureIds(readSprintBacklog(consortDir, sprint));
    },
    async commitAndPushRequests() {
      // Commit the feature-requests planning authored + push the entry tier so
      // each feature branch (which forks from origin/<parent>) inherits them. The
      // add + commit are tolerant (a no-op when nothing changed, e.g. the requests
      // were pre-seeded + already committed); a PUSH failure is loud, since a
      // silent one resurfaces later as a cryptic Spec Author refusal on the fork.
      const root = path.basename(consortDir);
      for (const id of backlogFeatureIds(readSprintBacklog(consortDir, sprint))) {
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
      // done) is NOT detected here – that divergence is the reconcile capability's
      // job (FEIP-8018). Best-effort: any read/derive error => not shipped (drive it).
      try {
        const { action } = await planNextAction(buildCfg(args, featureId));
        if (action.kind === "done") return true;
        // Fallback for the shared-SCM-state trap: the single workflow-state holds ONE
        // claim, so once a LATER backlog feature is claimed, this earlier (shipped)
        // feature's promote-phase derive reads the LATER feature's SCM ladder and never
        // returns `done` – so isFeatureShipped was false and the loop re-claimed it,
        // tripping `already at feature-claimed for <later>`. A later feature holding the
        // claim PROVES this one was released at merge (the claim frees only on ship).
        const scm = readWorkflowState(projectDir);
        const backlog = backlogFeatureIds(readSprintBacklog(consortDir, sprint));
        if (shippedBecauseLaterFeatureClaimed(featureId, scm?.feature_id, backlog)) return true;
        // The LAST shipped feature / a fully-complete sprint: the claim is CLEARED (it frees
        // only at merge) and this feature's stories are all done+accepted, so it deployed +
        // promoted (shipped). Its own-derive above can't return `done` here – the merge record
        // lived in the now-cleared claim state – so without this a sprint RE-RUN re-drives the
        // shipped feature and errors (exit 2) instead of skipping it and reporting the sprint
        // already complete (exit 0).
        return shippedByClearedClaim(scm?.feature_id, deriveFeaturePhase(summarizeStories(consortDir, featureId)));
      } catch {
        return false;
      }
    },
    async claimFeature(featureId) {
      await spawnCmd(lkShim, ["lakebase-scm-claim-feature-branch", featureId, "--project-dir", projectDir, "--json"], projectDir);
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
      resetStaleTerminalPhase(cfg.consortDir);
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, "full", gates);
      const r = await runDriver(withTelemetry(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), telemetry), {
        stopWhen: gatedStopWhen(undefined, interactive),
      });
      return stepResultOf(r);
    },
    onFeature: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f}\n`),
    onSkip: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f} – already shipped, skipping\n`),
  };

  const runBody = async (): Promise<number> => {
  // /plan: planning only (do not enter the per-feature loop).
  if (args.planOnly) {
    try {
      const planning = await effects.drivePlanning();
      // A HITL gate pause = work produced, awaiting approval (resumable, exit 0).
      if (planning.pendingGate) {
        reportGate(planning.pendingGate, { sprint, consortDir });
        return 0;
      }
      // A human-input pause = the PO must author requests FIRST; nothing was
      // produced and the plan gate was NOT reached. Report it honestly and exit
      // non-zero (the postcondition – an approved plan – is not met), so a caller
      // never advances on an empty backlog thinking the plan was approved.
      if (planning.pendingInput) {
        reportInput(planning.pendingInput, sprint, consortDir);
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
      // human resolves the escalation recorded under <consortDir>/escalations/.
      const e = result.escalation;
      const on = result.pendingFeature ? ` on ${result.pendingFeature}` : "";
      process.stderr.write(
        `[sprint] RAISED TO HIL${on} – halting sprint ${sprint}.\n` +
          (e?.source ? `        source: ${e.source}\n` : "") +
          (e?.reason ? `        reason: ${e.reason}\n` : "") +
          `        recorded under ${path.basename(consortDir)}/escalations/ ; once the root cause is fixed, clear it with \`consort-resolve-escalation\` (keeps the record – do NOT rm it), then re-run to resume.\n` +
          `        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose\n`,
      );
      return 3;
    }
    if (result.pendingGate) {
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}\n`);
      reportGate(result.pendingGate, { sprint, featureId: result.pendingFeature, consortDir });
      return 0;
    }
    if (result.pendingInput) {
      // Planning paused for the PO to author feature-request(s): the sprint did
      // NOT run (empty backlog). Report + exit non-zero so nothing treats it as a
      // completed sprint.
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}\n`);
      reportInput(result.pendingInput, sprint, consortDir);
      return 2;
    }
    process.stderr.write(`[sprint] ${sprint} complete: ${result.features.length} feature(s)\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  };

  // Bracket EVERY sprint exit path in the telemetry run's lifecycle: finish() closes
  // the root span + hands the batch to the detached sender (survives process.exit).
  // outcome + exit_code BOTH derive from the run's actual exit `code` via outcomeForExit
  // (0 => completed, 3 => aborted, any other non-zero => error), so an author-requests
  // pause / empty-backlog failure (exit 2) is recorded as `error`, never `completed`.
  let code = 1;
  try {
    code = await runBody();
  } finally {
    const outcome = outcomeForExit(code);
    try {
      telemetry.finish({ outcome, exit_code: code });
    } catch {
      /* telemetry never affects CLI behavior */
    }
    // Auto-emit the AUTHORITATIVE sprint "what next" snapshot to <root>/next.json on
    // EVERY sprint stop (parity with the feature path's emitNextJson). Sprint mode used
    // to write NOTHING here, so after a plan gate / backlog pause the driving session
    // and the extension had no deterministic on-disk signal – they were left tailing the
    // TRANSIENT drive-live.log (empty/gone between turns), which is why an interactive
    // sprint sat silent at the plan gate. This is exactly what `consort-next --sprint`
    // returns; the session's contract is "on any drive exit, read next.json + surface it".
    const recordingOrReplaying =
      !!consortEnv("REPLAY_DIR") || !!consortEnv("REPLAY_BUILD_DIR") || !!consortEnv("RECORD_BUILD_DIR") || !!consortEnv("RECORD_DIR");
    if (!recordingOrReplaying) {
      try {
        // Scope the snapshot to WHERE the drive actually is. Once a feature is claimed
        // (SCM feature_id set), the sprint is executing THAT feature's lane, so a
        // planning-scoped snapshot would mis-describe it – it can't see the feature's
        // spec/accept gates, so its `awaiting_human` reads false at a real feature gate
        // and a consumer keying on next.json would miss it. Emit the FEATURE-scoped
        // snapshot then (reusing the exact feature-path writer), and the planning snapshot
        // only while no feature is claimed (true planning scope). Purely changes next.json
        // CONTENT – an advisory artifact the drive never reads back – so no run/telemetry
        // side effect.
        const claimed = readWorkflowState(projectDir)?.feature_id?.trim();
        if (claimed) {
          emitNextJson(consortDir, claimed, projectDir, { version: kitVersion() });
        } else {
          const snap = buildNextSnapshot(
            "sprint",
            deriveSprintPlanningState(consortDir, sprint, { skipSizing }),
            { sprint, version: kitVersion() },
          );
          fs.mkdirSync(consortDir, { recursive: true });
          fs.writeFileSync(path.join(consortDir, "next.json"), JSON.stringify(snap, null, 2) + "\n", "utf8");
        }
      } catch {
        /* best-effort: next.json is advisory; never let it fail the run */
      }
    }
  }
  return code;
}

/** The RUN-SCOPED gate mode: a `--gates` flag overrides for THIS run only; absent,
 *  the project's declared policy in consort-config.json wins. The flag never rewrites
 *  the file (that let one headless run flip an interactive project to proxy), so the
 *  effective mode is resolved fresh here, not read back from a mutated file. */
function effectiveGates(args: ParsedArgs, projectDir: string): "interactive" | "proxy" {
  const flag = args.gates as "interactive" | "proxy" | undefined;
  return flag ?? resolveConsortSettings({ projectDir }).project.gates;
}

/** True when the run has an explicit non-interactive signal (CI / auto-continue).
 *  Headless proxy gating is only legitimate with one of these; otherwise a stray
 *  LAKEBASE_CONSORT_HUMAN_PROXY leaking into a dev shell would silently bypass HITL. */
function hasNonInteractiveSignal(): boolean {
  return consortEnv("AUTO_CONTINUE") === "1" || /^(1|true)$/i.test(process.env.CI ?? "");
}

/** P0.1: snapshot the resolved model + option matrix to .tdd/run-config.json (and
 *  the corpus root when recording) at the start of an ACTUAL run (not --dry-run),
 *  so a timing report is self-describing and two runs are A/B-comparable.
 *  Best-effort: writeRunConfig swallows its own IO errors. */
function snapshotRunConfig(cfg: DriveEffectsConfig, bound: string, gates: "interactive" | "proxy"): void {
  writeRunConfig({
    projectDir: cfg.projectDir,
    consortDir: cfg.consortDir,
    bound,
    // Run-scoped effective gate mode (--gates override else project policy),
    // recorded here so the snapshot is where the run-scoped choice lives – the
    // flag never persists into consort-config.json.
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

/** Re-launch THIS drive in its own session (detached) and return immediately, so a
 *  long run survives the launching shell/turn ending. This is the durable fix for the
 *  "detached drive gets reaped between turns" failure: `nohup … &` is NOT enough on
 *  macOS – the harness SIGTERMs the launching tool call's whole PROCESS GROUP when it
 *  returns, and macOS has no `setsid` binary to escape it. Node's `spawn(detached:true)`
 *  DOES call setsid(2), putting the child in a NEW session + process group that the
 *  SIGTERM never reaches; `.unref()` frees the parent's event loop so we can exit now.
 *
 *  The child re-runs the exact same resolved bin (`process.argv[1]`, whatever the `lk`
 *  shim resolved) with `--detach` stripped, and self-tees its narration to
 *  `.consort/drive-live.log` (so `stdio: "ignore"` here loses nothing). We print the
 *  child PID + the poll-once watch command and exit 0. Returns the child pid, or null
 *  when spawning failed (caller then falls through to a normal in-process run). */
/** The pid file the ACTUAL drive process records for ITSELF (whatever layer
 *  launched it – lk shim, --detach parent, or a plain invocation), so
 *  `consort-drive --stop` always halts the real orchestrator, never a launcher
 *  (issue #204.3). */
export function drivePidPath(consortDir: string): string {
  return path.join(consortDir, "drive.pid");
}

/** Record THIS drive process's own pid. Written by the process that actually
 *  runs the loop (after the --detach re-launch), never by a launcher. */
export function writeDrivePid(consortDir: string): void {
  try {
    fs.writeFileSync(
      drivePidPath(consortDir),
      JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }) + "\n",
    );
  } catch {
    /* best-effort: a pid file failure never breaks the run */
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Halt the running drive + its whole process tree (the executor's claude -p
 *  children included), reading the pid the drive recorded for itself. */
export async function stopDrive(consortDir: string): Promise<number> {
  const file = drivePidPath(consortDir);
  if (!fs.existsSync(file)) {
    process.stderr.write("consort-drive: no drive.pid found (no drive running here, or it predates pid recording).\n");
    return 1;
  }
  let pid: number | undefined;
  try {
    pid = (JSON.parse(fs.readFileSync(file, "utf8")) as { pid?: number }).pid;
  } catch {
    pid = undefined;
  }
  if (typeof pid !== "number" || !pidAlive(pid)) {
    fs.rmSync(file, { force: true });
    process.stdout.write("consort-drive: no live drive (stale drive.pid removed).\n");
    return 0;
  }
  await new Promise<void>((resolve) => treeKill(pid, "SIGTERM", () => resolve()));
  fs.rmSync(file, { force: true });
  process.stdout.write(`consort-drive: stopped the drive at pid ${pid} (whole process tree, executor children included).\n`);
  return 0;
}

function relaunchDetached(rawArgv: string[], consortDir: string): number | null {
  // stdio "ignore": the drive self-tees its narration to .consort/drive-live.log, so
  // the detached child loses nothing by discarding its stdio.
  const pid = spawnDetached(
    rawArgv.filter((a) => a !== "--detach"),
    { stdio: "ignore" },
  );
  if (pid === null) return null; // spawn failed – caller runs in-process instead of losing the run
  const logPath = path.join(consortDir, "drive-live.log");
  process.stdout.write(
    `consort-drive: detached into its own session as pid ${pid} (survives this turn/shell).\n` +
      `  live log: ${logPath}\n` +
      `  relay it:  ./scripts/lk consort-watch --since 0 --pid ${pid}   (then re-poll with the printed cursor)\n` +
      `  stop it:   ./scripts/lk consort-drive --stop   (halts the whole drive process tree)\n`,
  );
  return pid;
}

/** Tee the drive's stderr narration to `<consortDir>/drive-live.log` so a watcher
 *  (`consort-watch`) can follow it REGARDLESS of how the drive was launched. Visibility
 *  used to depend on the caller redirecting stderr (`> .consort/drive-live.log`); when a
 *  session instead detached the drive as a harness background task, that redirect was
 *  lost and the log stayed empty (the watcher saw nothing). The drive OWNS the log now
 *  – do NOT also shell-redirect stderr to it (that double-writes). Best-effort: a log
 *  failure never breaks the run. Fresh file per run (truncate). */
function teeStderrToDriveLog(consortDir: string): void {
  try {
    fs.mkdirSync(consortDir, { recursive: true });
    // SYNCHRONOUS fd, not createWriteStream. The CLI exits via process.exit(code) (see the entry
    // point), which does NOT flush an async write stream's buffer , so the LAST narration lines
    // (a turn's completion "[drive] <role> turn <N>s" emit + the gate-park line, written
    // milliseconds before exit) were silently dropped from drive-live.log. That is why consort-watch
    // never saw the turn-done line to open a finished role's artifacts, and why the log ended at the
    // agent's output. writeSync lands every line on disk the instant it is written, so nothing is
    // lost at exit. Fresh file per run (truncate via "w"); the fd is closed by the OS on exit.
    const fd = fs.openSync(path.join(consortDir, "drive-live.log"), "w");
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array, enc?: unknown, cb?: unknown): boolean => {
      try { fs.writeSync(fd, chunk as never); } catch { /* never break the run on a log write */ }
      return (orig as (c: unknown, e?: unknown, cb?: unknown) => boolean)(chunk, enc, cb);
    }) as typeof process.stderr.write;
  } catch {
    /* logging is best-effort; never abort the drive */
  }
}

async function main(): Promise<number> {
  // Label the substrate's Postgres connections this run opens as consort/<version> (see
  // exportConsortVersionEnv); child processes the drive spawns inherit it.
  exportConsortVersionEnv();
  const rawArgv = process.argv.slice(2);
  const args = parseArgs(rawArgv);
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  // --stop: halt the running drive + its whole tree (reads the pid the DRIVE
  // recorded for itself, so a launcher pid is never mistaken for the
  // orchestrator, issue #204.3).
  if (args.stop) {
    const cdir = args.consortDir ?? resolveConsortDir(args.projectDir ?? process.cwd());
    return stopDrive(cdir);
  }
  // --detach: re-launch in a NEW session and return immediately, so the run survives
  // the launching turn/shell ending (the recurring "reaped between turns" failure).
  // Must happen BEFORE any side effect (log tee, config write, provisioning) so the
  // child – not this short-lived parent – owns them. Falls through to an in-process
  // run only if the re-spawn itself failed (never silently drops the run).
  const cdir = args.consortDir ?? resolveConsortDir(args.projectDir ?? process.cwd());
  if (rawArgv.includes("--detach")) {
    const pid = relaunchDetached(rawArgv, cdir);
    if (pid !== null) return 0;
    process.stderr.write("consort-drive: detach re-spawn failed – running in-process instead.\n");
  }
  // Record THIS process's own pid (post-detach, so it is always the real
  // orchestrator's) for `consort-drive --stop` (issue #204.3).
  writeDrivePid(cdir);
  // Auto-migrate a legacy artifact dir (".sftdd"/".tdd") to ".consort" before any
  // mode runs, so existing projects move to the current name on their next
  // orchestrated run (no-op once ".consort" exists). History follows via git mv.
  if (!args.consortDir) {
    const projectDir = args.projectDir ?? process.cwd();
    const m = migrateLegacyArtifactDir(projectDir);
    if (m.migrated) {
      process.stderr.write(
        `consort-drive: migrated legacy ${LEGACY_ARTIFACT_ROOT}/ to ${ARTIFACT_ROOT}/ (via ${m.via}).\n`,
      );
    }
  }
  // Self-tee the live narration to .consort/drive-live.log so `consort-watch` can
  // follow it no matter how this drive was launched (foreground, nohup, or a harness
  // background task). Do this BEFORE any phase runs so nothing is missed.
  teeStderrToDriveLog(args.consortDir ?? resolveConsortDir(args.projectDir ?? process.cwd()));
  // Write-through the drive's ad-hoc override flags into consort-config.json BEFORE
  // any settings resolution, so the file stays the single source of truth (the
  // flag is a WRITER, not a parallel reader; absent flags never mutate the file).
  // NB: --gates is NOT here – it is run-scoped policy, resolved per run and never
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
      if (drift) process.stderr.write(`consort-drive: ${drift}\n`);
      const r = pinRunKitRef(pd, launchRef);
      if (r.pinned) {
        process.stderr.write(
          `consort-drive: pinned kit-ref '${launchRef}' to .lakebase/kit-ref.local for this run` +
            (r.previous ? ` (was '${r.previous}')` : "") +
            `.\n`,
        );
      }
    }
  }

  // HITL enforcement: headless proxy gating is only legitimate with an explicit
  // non-interactive signal. Refuse `proxy` in an interactive/dev context so a
  // stray LAKEBASE_CONSORT_HUMAN_PROXY (which the /plan|/sprint|... commands turn
  // into `--gates proxy`) can't silently bypass the human. CI + the smokes set
  // LAKEBASE_CONSORT_AUTO_CONTINUE=1 (or CI), so they pass.
  if (effectiveGates(args, args.projectDir ?? process.cwd()) === "proxy" && !hasNonInteractiveSignal()) {
    process.stderr.write(
      `consort-drive: gate mode 'proxy' (Human Proxy approves headlessly) requires an explicit\n` +
        `non-interactive signal (LAKEBASE_CONSORT_AUTO_CONTINUE=1 or CI). Refusing to bypass HITL in an\n` +
        `interactive/dev context. Unset LAKEBASE_CONSORT_HUMAN_PROXY, or pass --gates interactive.\n`,
    );
    return 2;
  }

  // Fail-fast auth preflight (before ANY mode dispatch / agent spawn). A LIVE
  // drive spawns expensive LLM turns + DB-backed verifies; if the Databricks
  // OAuth refresh token is expired, credential minting fails deep inside a
  // test's DB connection and degrades into a hang, spinning the drive for hours.
  // Exercise the refresh token up front (scm-utils checkDatabricksAuth ->
  // `databricks auth token --force-refresh`) and halt immediately with the
  // reauth remediation. SKIP in replay/build-replay lanes (no live workspace):
  // those reproduce a recorded corpus and never mint a real credential.
  const inReplayLane = !!(consortEnv("REPLAY_DIR") || consortEnv("REPLAY_BUILD_DIR"));
  if (!inReplayLane && consortEnv("SKIP_AUTH_PREFLIGHT") !== "1") {
    // No --databricks-host flag on the drive; checkDatabricksAuth exercises the
    // active profile's session (DATABRICKS_CONFIG_PROFILE / default), which is
    // exactly the session the agents + DB mint will use.
    const auth = await driveAuthPreflight();
    if (!auth.ok) {
      process.stderr.write(
        `consort-drive: Databricks auth preflight FAILED – halting before any agent spawn.\n${auth.message}\n`,
      );
      return 2;
    }
  }

  // Tier-1: `--sprint <name>` with no `--feature` runs the whole-sprint orchestrator.
  if (args.sprint && !args.feature) {
    return runSprintMode(args);
  }
  if (!args.feature) {
    process.stderr.write(`consort-drive: --feature is required.\n\n${help()}`);
    return 2;
  }

  // Resolve the Tier-2 phase bound (at most one). --plan-only is the sprint
  // planning bound; --only <phase> bounds a feature run to one phase.
  let bound: DriverBound | undefined;
  if (args.planOnly) bound = "plan";
  if (args.only) {
    if (!["design", "build", "deploy"].includes(args.only)) {
      process.stderr.write(`consort-drive: --only must be design|build|deploy (got "${args.only}").\n`);
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
        `consort-drive: --pause-before must be navigator|release-engineer (got "${args.pauseBefore}").\n`,
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
  // would fork from (and the build commit onto) the wrong branch. Block loud – the
  // human claims this feature (or reconciles the prior one) first.
  {
    const scm = readWorkflowState(cfg.projectDir);
    if (isForeignFeatureClaim(scm, cfg.featureId)) {
      process.stderr.write(
        `consort-drive: refusing to drive "${cfg.featureId}" – the SCM workflow state records a\n` +
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
  resetStaleTerminalPhase(cfg.consortDir);

  if (args.dryRun) {
    const plan = await planNextAction(cfg, boundOpts.transition);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }

  // Fail-closed: branch claiming is owned by the COMMAND, not this driver. /sprint,
  // /design, /build, /deploy all claim the paired branch via
  // lakebase-scm-claim-feature-branch as an un-skippable Step 0 BEFORE invoking
  // consort-drive. Invoking consort-drive DIRECTLY with no feature claimed (e.g. to
  // bound a phase with `--only design`) leaves the SCM workflow state with no
  // feature_id and the working tree still on the tier parent (e.g. staging), so the
  // design/build lane would silently write its artifacts THERE with no paired branch.
  // The foreign-claim guard above refuses a DIFFERENT feature; this refuses the
  // NO-claim case. Skipped in replay lanes (no live branch); never reached by
  // --dry-run (returned above), so planning stays unblocked.
  if (!inReplayLane) {
    const claimed = readWorkflowState(cfg.projectDir)?.feature_id?.trim();
    if (!claimed) {
      process.stderr.write(
        `consort-drive: refusing to drive "${cfg.featureId}" – no feature branch is claimed\n` +
          `        (the SCM workflow state has no feature_id, so the working tree is still on the tier\n` +
          `        parent). Driving now would write the ${bound ?? "feature"} lane's artifacts onto the parent\n` +
          `        branch with no paired ${cfg.featureId} branch. Claim it first (as /sprint and /design do,\n` +
          `        as an un-skippable step), then re-run:\n` +
          `          lakebase-scm-claim-feature-branch ${cfg.featureId}\n`,
      );
      return 2;
    }
  }

  cfg.runner = execRunner(cfg);
  const gates = effectiveGates(args, cfg.projectDir);
  snapshotRunConfig(cfg, bound ?? "full", gates);
  const interactive = gates === "interactive";
  // Consort telemetry (Level 1): one trace per consort-drive run. A NO-OP unless
  // consent passes (persisted-enabled + interactive TTY + not CI/
  // CONSORT_TELEMETRY=0), and even then nothing leaves the machine until a
  // maintainer arms a real endpoint (the sink defaults to a local no-op). The
  // decorator never throws into the driver and never blocks it. `command`: an
  // explicit Tier-2 bound (--plan-only / --only) maps to its slash command; a plain
  // --feature drive (what /design, /build, /deploy all invoke, no phase flag) DERIVES
  // its command from the feature's phase on disk, so a design or deploy drive no longer
  // mislabels as "build". Best-effort – any read failure falls back to "build".
  const featureDriveCommand = (): TelemetryCommand => {
    try {
      return commandForFeaturePhase(deriveFeaturePhase(summarizeStories(cfg.consortDir, cfg.featureId)));
    } catch {
      return "build";
    }
  };
  const telemetry = beginTelemetryRun({
    command: bound ?? featureDriveCommand(),
    onNotice: (m) => process.stderr.write(m),
  });
  let result: RunDriverResult | undefined;
  // Capture the REAL exit code the drive returns, so telemetry's outcome + exit_code BOTH
  // derive from it (via outcomeForExit) below – a non-zero exit (a guard / pending-input /
  // CLI-effect failure: 2 or 3) can never be mis-recorded as a completed run. The IIFE lets
  // the finish() see the actual returned code instead of re-deriving it and drifting.
  const exitCode: number = await (async (): Promise<number> => {
  try {
    result = await runDriver(
      withTelemetry(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), telemetry),
      {
        maxSteps: args.maxSteps,
        transition: boundOpts.transition,
        stopWhen: gatedStopWhen(boundOpts.stopWhen, interactive),
        pauseBefore,
        confirmContinue,
      },
    );
    const pendingGate = pendingGateOf(result);
    const pendingInput = pendingInputOf(result);
    if (result.escalated) {
      // Surface + halt: a blocking problem was raised to the HIL. The escalation
      // is recorded under ${path.basename(cfg.consortDir)}/escalations/; exit non-zero so the run fails loud
      // (the increment is genuinely not done) and a human resolves it.
      const e = result.escalation;
      process.stderr.write(
        `[drive] RAISED TO HIL after ${result.iterations} actions – awaiting HIL decision.\n` +
          `        source: ${e?.source}\n        reason: ${e?.reason}\n` +
          `        recorded under ${path.basename(cfg.consortDir)}/escalations/ ; once the root cause is fixed, clear it with \`consort-resolve-escalation\` (keeps the record – do NOT rm it), then re-run to resume.\n` +
          `        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose\n`,
      );
      return 3;
    } else if (result.stoppedAtMax) {
      process.stderr.write(`[drive] stopped at --max-steps ${args.maxSteps} (${result.iterations} actions)\n`);
    } else if (pendingGate) {
      reportGate(pendingGate, { featureId: cfg.featureId, featureBranch: cfg.featureBranch, consortDir: cfg.consortDir });
    } else if (pendingInput) {
      // A human-input pause (the PO's author-requests) is NOT a completed bound:
      // nothing was produced. Report honestly + exit non-zero (never "complete").
      reportInput(pendingInput, cfg.sprintName, cfg.consortDir);
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
    // error"), then abort non-zero so the run fails loud – a human resolves it.
    if (err instanceof ProtocolViolationError) {
      const h = err.handoff;
      try {
        writeEscalation(cfg.consortDir, {
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
          { consortDir: cfg.consortDir },
        );
      } catch {
        /* logging/escalation is best-effort; the abort below is the real signal */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.consortDir)}/escalations/ ; fix the responder, then re-run.\n`);
      return 3;
    }
    // A wrong / unexpected caller (concurrent dispatch): a callback arrived from a
    // role we are not awaiting. Record + abort, same as a contract violation.
    if (err instanceof UnexpectedCallbackError) {
      try {
        writeEscalation(cfg.consortDir, {
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
          { consortDir: cfg.consortDir },
        );
      } catch {
        /* best-effort */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.consortDir)}/escalations/ ; resolve it, then re-run.\n`);
      return 3;
    }
    // A deterministic CLI effect (an SCM bin – wait-ci / merge / prepare-pr – or
    // deploy) exited non-zero mid-drive: the CI-failure class. Record a RESUMABLE
    // escalation and emit the CLASSIFIED `RAISED TO HIL` halt line so a session
    // tailing drive-live.log (or a Monitor watching it) actually SURFACES the
    // failure. Without this the reject fell to the bare-message catch-all below ,
    // an UNPREFIXED "<bin> exited N" line that classifyDriveLine returns null for ,
    // so the watcher skipped it and the run looked like it was "still waiting on CI"
    // after the drive had already died. The bin itself streamed its own diagnosis
    // (e.g. "CI failed for PR <url>. Failed checks: …") to the drive log above;
    // consort-diagnose bundles it. Mirrors the deploy-verify escalation pattern.
    if (err instanceof CliEffectError) {
      const reason = `${err.bin} exited ${err.code}. See the drive log above for the failing checks / cause; fix them (push to the branch) and re-run.`;
      // The failing command's captured stdout/stderr travels WITH the escalation, so a human (or a
      // resuming session) sees the actual error without manually re-running the command.
      const captured_output = err.capturedOutput;
      try {
        writeEscalation(cfg.consortDir, { source: `cli:${err.bin}`, reason, feature_id: cfg.featureId, captured_output });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `cli:${err.bin}`, reason },
          },
          { consortDir: cfg.consortDir },
        );
      } catch {
        /* best-effort; the classified halt line below is the load-bearing signal */
      }
      process.stderr.write(
        `[drive] RAISED TO HIL – ${err.bin} failed.\n` +
          `        reason: ${reason}\n` +
          (captured_output ? `        failing output (tail):\n${captured_output.split("\n").map((l) => "        | " + l).join("\n")}\n` : "") +
          `        recorded under ${path.basename(cfg.consortDir)}/escalations/ ; once the root cause is fixed, clear it with \`consort-resolve-escalation\` (keeps the record – do NOT rm it), then re-run to resume.\n` +
          `        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose\n`,
      );
      return 3;
    }
    // A PRE-DISPATCH route-contract failure: the router selected a turn whose REQUIRED
    // process event was never produced (assertRouteSatisfiable), so the turn is refused
    // BEFORE any agent spawns. Without a typed branch this fell to the bare ABORTED
    // catch-all below (return 1, NO escalation), so a `--detach`ed run died leaving only
    // a truncated drive log – no escalation, so consort-next never showed awaiting_human
    // and a resuming session had nothing to act on. Record a RESUMABLE escalation (so
    // consort-next surfaces awaiting_human) and emit the classified halt line, mirroring
    // the ProtocolViolationError path. It is a routing/producer defect – the same
    // fix-then-resume shape as the other pre-spawn contract failures.
    if (err instanceof RouteContractError) {
      const story =
        "story" in err.action && typeof (err.action as { story?: unknown }).story === "string"
          ? (err.action as { story: string }).story
          : undefined;
      const source = `route-contract:${err.event}`;
      try {
        writeEscalation(cfg.consortDir, {
          source,
          reason: err.message,
          feature_id: cfg.featureId,
          ...(story ? { story_id: story } : {}),
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source, reason: err.message, ...(story ? { story } : {}) },
          },
          { consortDir: cfg.consortDir },
        );
      } catch {
        /* best-effort; the classified halt line below is the load-bearing signal */
      }
      process.stderr.write(
        `[drive] RAISED TO HIL – route-contract check refused a mis-fired turn before dispatch.\n` +
          `        reason: ${err.message}\n` +
          `        recorded under ${path.basename(cfg.consortDir)}/escalations/ ; fix the route or the producer, then clear it with \`consort-resolve-escalation\` (keeps the record – do NOT rm it) and re-run to resume.\n` +
          `        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose\n`,
      );
      return 3;
    }
    // A replay corpus miss: the recording is incomplete for a turn the pipeline
    // dispatched. Not an escalation (no live workflow to resume) – it is a corpus/
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
    // Last resort: an UNEXPECTED error escaped every typed branch. Do NOT let it die
    // as a bare, unprefixed line – classifyDriveLine returns null for that, so a
    // session / Monitor tailing drive-live.log never learns the drive crashed (the run
    // looks still-in-flight). Prefix + a terminal `ABORTED` marker the watcher STOPS on.
    process.stderr.write(
      `[drive] ABORTED – unexpected error: ${err instanceof Error ? err.message : String(err)}\n` +
        `        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose\n`,
    );
    return 1;
  }
  })();
  // Close the telemetry root span: outcome + exit_code BOTH derive from the ACTUAL exit
  // code via outcomeForExit (0 => completed, 3 => aborted, any other non-zero => error),
  // so a guard / pending-input / CLI-effect failure (exit 2 or 3) is never recorded
  // "completed". A no-op when telemetry consent did not pass; never throws into the CLI.
  try {
    telemetry.finish({ outcome: outcomeForExit(exitCode), exit_code: exitCode });
  } catch {
    /* telemetry never affects CLI behavior */
  }
  // Auto-emit the authoritative "what next" snapshot to <root>/next.json on EVERY stop (a
  // gate, an escalation, feature-complete, an error, a killed run), so an orchestrating
  // agent's contract is "on any stop, read next.json and present its options" instead of
  // reverse-engineering the next move and drifting into freeform (FEIP-8017). Feature scope
  // only (the stops that need it); `consort-next --sprint` answers sprint scope on demand.
  // Skipped under replay/record so the recorded corpora stay clean; best-effort inside.
  const recordingOrReplaying =
    !!consortEnv("REPLAY_DIR") || !!consortEnv("REPLAY_BUILD_DIR") || !!consortEnv("RECORD_BUILD_DIR") || !!consortEnv("RECORD_DIR");
  if (cfg.featureId && !recordingOrReplaying) {
    emitNextJson(cfg.consortDir, cfg.featureId, cfg.projectDir, {
      uiTrack: cfg.uiTrack,
      version: kitVersion(),
      ...(cfg.featureBranch ? { featureBranch: cfg.featureBranch } : {}),
    });
  }
  return exitCode;
}

// Guard the CLI entry so this module can be imported (by tests + the optimize
// harness, which reuse buildCfg/execRunner/claudeToolArgs) without spawning a
// drive. Only `node drive.cli.js` (the bin) actually runs main().
if (isCliEntry(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
