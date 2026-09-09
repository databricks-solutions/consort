// The reusable drive spawn engine: buildCfg, execRunner, and their private
// helpers. Extracted from drive.cli.ts so that drive.cli.ts itself AND the
// optimize harness (bin/consort/optimize.cli.ts) can import the seams without
// dragging drive.cli's `main()`/isCliEntry CLI entry block into their bundle.
//
// CRITICAL: tsup has splitting:false, which inlines modules into a single bundle.
// A bundled isCliEntry block in an imported module would fire as a phantom side
// effect when consumed (e.g. when optimize.cli.js imports buildCfg), running the
// drive's main() and crashing with exit-3. This module has NO main() and NO
// isCliEntry, so importing it NEVER drags a CLI entry point.

import { spawn, execFileSync } from "node:child_process";
import { consortEnv } from "../../config/consort-env.js";
import { resyncAgentsOnKitDrift } from "../../setup/project-consort-setup.js";
import { resolveConsortDir, syncBacklog } from "../../config/consort-paths.js";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { replayDesignTurn, REPLAYABLE_DESIGN_ROLES, restoreReflectVerdict } from "../../logging/replay-artifacts.js";
import { replayBuildTurn } from "../../logging/replay-build.js";
import { recordBuildTurn, nextBuildTurnNumber } from "../../pipeline/record-build.js";
import { recordTurn, seedRecorderBaseline } from "../../logging/turn-recorder.js";
import { emitAgentLogEvent } from "../../logging/agent-log.js";
import { writeWorkflowPhase } from "../../gates/workflow-phase.js";
import {
  commandsForAction,
  type CommandRunner,
  type DriveCommand,
  type DriveEffectsConfig,
} from "./orchestrator-effects.js";
import { resolveModelForRole } from "../../config/agent-models.js";
import { resolveConsortSettings } from "../settings/project-settings.js";
import { parseTurnUsage, assistantTextFromLine, assistantEventSummary, type TurnUsage } from "../../session/claude-usage.js";
import { resumeFitsBudget, turnContextTokens, CONTEXT_FREE_FRACTION_REQUIRED, isPromptTooLongSignal, isTransientApiErrorSignal, startsFreshEachTurn } from "../../session/context-budget.js";
import type { AgentRole } from "../../logging/agent-log.js";
import { makeOnAction, describeAction } from "../../logging/orchestrator-logging.js";
import { resolveKitBinJs, kitRoot } from "../../config/kit-bin.js";
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { relocateStrayDesignArtifacts, malformedSiblingRoot } from "../../setup/stray-artifact-recovery.js";
import type { WorkflowAction } from "./orchestrator-drive.js";
import { createMonitorController, type TurnMonitor } from "../turns/turn-monitor.js";

// How many times a single role turn that overflows the model window mid-turn
// ("Prompt is too long") is retried on a FRESH session before the failure
// propagates. Each retry inherits the prior attempt's on-disk progress, so a
// small bound converges; it is a backstop, not a substitute for chunking work.
const MAX_PROMPT_TOO_LONG_RETRIES = 2;
// A transient API/network blip (connection dropped, overloaded, 5xx) is not the
// agent's or the workflow's fault; re-running the same turn a moment later
// usually succeeds. Retry more times than the context-overflow case (a blip is
// pure chance, so more attempts pay off) with exponential backoff, so one blip
// cannot kill a multi-hour unattended capture. Overridable for tests.
const MAX_TRANSIENT_RETRIES = Number(consortEnv("MAX_TRANSIENT_RETRIES") ?? "5");
const TRANSIENT_BACKOFF_MS = Number(consortEnv("TRANSIENT_BACKOFF_MS") ?? "5000");
// Per-turn INACTIVITY timeout: how long the agent stream may go completely silent
// (no stdout/stderr line) before we treat the turn as wedged, tree-kill the child,
// and re-run it as a transient failure. This is the fix for the stalled-API-stream
// wedge: the child stays alive with an open TLS socket but no bytes ever arrive, so
// `close` never fires and the await hangs forever. Silence, not duration, is the
// signal – a turn that keeps streaming (a 45-min driver-green doing `uv sync` + live
// pytest) re-arms the timer on every tool marker and never trips. The threshold must
// exceed the longest SINGLE quiet tool step (a cold dependency sync, a long test run);
// 10 min is comfortably past that while still catching a true stall in one heartbeat
// window. 0/empty disables (byte-identical to before). Overridable for tests + ops.
const TURN_INACTIVITY_TIMEOUT_MS = Number(consortEnv("TURN_INACTIVITY_TIMEOUT_MS") ?? String(10 * 60 * 1000));
// How long the stream may be silent before we EMIT a heartbeat line to the sidecar
// (liveness marker, not a kill). Shorter than the kill deadline so a watcher sees
// "still alive, waiting" beats before any timeout. 0/empty disables.
const TURN_HEARTBEAT_MS = Number(consortEnv("TURN_HEARTBEAT_MS") ?? String(60 * 1000));

export interface ParsedArgs {
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
export class CliEffectError extends Error {
  constructor(
    public readonly bin: string,
    public readonly code: number | null,
    /** The failing command's captured stdout+stderr tail, threaded into the escalation so a human
     *  sees the actual error without re-running the command. Undefined when nothing was captured. */
    public readonly capturedOutput?: string,
  ) {
    super(`${bin} exited ${code}`);
    this.name = "CliEffectError";
  }
}

/** Cap on the captured output tail attached to a CliEffectError (keep the escalation legible). */
const CLI_CAPTURE_MAX = 16_000;

export function spawnCmd(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // PIPE stdout/stderr so a non-zero exit can attach the failing output to the escalation, but TEE
    // it straight back to the parent's streams so live tailing (drive-live.log) + console output are
    // unchanged – the failure is both surfaced live AND captured for the escalation record.
    const child = spawn(bin, args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const chunks: string[] = [];
    child.stdout?.on("data", (d: Buffer) => { process.stdout.write(d); chunks.push(d.toString()); });
    child.stderr?.on("data", (d: Buffer) => { process.stderr.write(d); chunks.push(d.toString()); });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const captured = chunks.join("");
      const tail = captured.length > CLI_CAPTURE_MAX ? captured.slice(-CLI_CAPTURE_MAX) : captured;
      reject(new CliEffectError(bin, code, tail.trim() || undefined));
    });
  });
}


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
export class ClaudeTurnError extends Error {
  constructor(
    message: string,
    readonly promptTooLong: boolean,
    /** The turn's output matched a transient API/network failure (connection
     *  dropped, overloaded, rate-limited, 5xx), so re-running it may succeed. */
    readonly transient = false,
    /** The turn was tree-killed by the inactivity monitor (stream went silent past
     *  the deadline – a stalled API stream that would otherwise hang forever). A
     *  stall IS a transient (retry on a fresh session), flagged distinctly so the
     *  retry log names it as a stall, not a wire blip. */
    readonly stalled = false,
  ) {
    super(message);
    this.name = "ClaudeTurnError";
  }
}

/** A replay lane (LAKEBASE_CONSORT_REPLAY_DIR / _REPLAY_BUILD_DIR) was told to
 *  reproduce a turn the corpus has no artifact for. A replay is a RECORDING: it
 *  must never fall through to a live agent (that would let an agent "take over"
 *  a run meant to be deterministic, and silently mask a broken/incomplete
 *  corpus). So a miss is a hard, loud failure that names the missing artifact.
 *  Almost always the corpus is missing a file (e.g. a `.gitignore` glob dropped
 *  it) – put the artifact in the right place, do not run the model. */
export class ReplayCorpusMissError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayCorpusMissError";
  }
}

/** FEIP-8006: a role turn completed but its expected artifact never landed under
 *  the project's `.consort/`. The subagent almost always resolved the project root
 *  wrong and wrote outside it (e.g. `$HOME/<somewhere>`), so a downstream
 *  consuming effect would otherwise crash reading the absent file, with a cryptic,
 *  MISATTRIBUTED error that blames the wrong step. We fail loud + attributed at the
 *  producing role instead, naming the role, the artifact, and where we looked. */
export class ArtifactOutOfRootError extends Error {
  constructor(
    readonly role: string,
    readonly label: string,
    readonly anyOf: string[],
    readonly consortDir: string,
    /** FEIP-8038: the known malformed-sibling root we also checked (+ tried to
     *  relocate from). Named so the human knows exactly where to look. */
    readonly checkedSibling?: string,
  ) {
    super(
      `role '${role}' produced no ${label} under ${path.basename(consortDir)}/ ` +
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

/** The prompt + final reasoning + tool list captured from ONE agent turn, for
 *  the recorder to persist (demo transcript). Not the raw stream (that includes
 *  every interstitial "let me check" delta); just the outcome-level trace. */
export interface TurnTranscript {
  /** The task prompt the agent was dispatched with (`claude -p <task>`). */
  prompt: string;
  role?: string;
  model?: string;
  /** The turn's FINAL assistant text (the outcome/rationale). */
  finalText: string;
  /** Each tool action in order (name + a clipped target), as they streamed. */
  tools: string[];
}

/** Set by spawnClaudeStreaming on each turn's close; read + cleared by the
 *  recorder wrapper (withTurnRecording) so it lands in that turn's dir. Module-
 *  level for the same reason `sessions`/`sessionContext` are: the spawn and the
 *  record wrapper are separated by the effects boundary. */
let lastAgentTranscript: TurnTranscript | undefined;
/** Per-cwd (per-worktree) transcript index, set alongside the global on each turn's close. CONCURRENCY
 *  SAFETY: the bare `lastAgentTranscript` global is a RACE when candidates run in parallel (each spawn
 *  overwrites it, so a peek returns whoever flushed last – cross-candidate transcript crosstalk). A
 *  concurrent caller (the optimize sweep, one worktree per candidate) peeks BY ITS cwd to get its OWN
 *  turn, never a sibling's. The serial drive keeps using the no-arg global path unchanged. */
const lastAgentTranscriptByCwd = new Map<string, TurnTranscript>();
export function takeLastAgentTranscript(cwd?: string): TurnTranscript | undefined {
  if (cwd !== undefined) {
    const t = lastAgentTranscriptByCwd.get(cwd);
    lastAgentTranscriptByCwd.delete(cwd);
    return t;
  }
  const t = lastAgentTranscript;
  lastAgentTranscript = undefined;
  return t;
}
/** PEEK the last turn's transcript WITHOUT clearing it – for an intermediate consumer (the
 *  ClaudeStepAgent reads finalText for its lastResult) that must NOT rob the recorder wrapper's
 *  take() of the transcript. The take()-clears contract is a single-consumer design; when TWO
 *  consumers run per turn (the agent's lastResult + the record wrapper), the earlier one MUST peek,
 *  or the wrapper gets undefined and transcript.md is silently never written (the bug this fixes:
 *  every executor-dispatched agent turn lost its transcript to the double-consume race). The record
 *  wrapper remains the sole take()-clearer, at end of turn.
 *  Pass `cwd` to read the transcript for THAT worktree – the concurrency-safe path (see
 *  lastAgentTranscriptByCwd); omit it for the serial global. */
export function peekLastAgentTranscript(cwd?: string): TurnTranscript | undefined {
  return cwd !== undefined ? lastAgentTranscriptByCwd.get(cwd) : lastAgentTranscript;
}
/** Record a turn's transcript as both the global last AND the per-cwd entry. Exported so the crosstalk
 *  safety (peek-by-cwd returns THIS cwd's turn, never a concurrent sibling's) is unit-testable without
 *  spawning claude. Called by spawnClaudeStreaming on each turn's close. */
export function recordAgentTranscript(cwd: string, tx: TurnTranscript): void {
  lastAgentTranscript = tx;
  lastAgentTranscriptByCwd.set(cwd, tx);
}

// Per-cwd last-turn USAGE (cost + tokens + numTurns + duration), the SAME crosstalk-safe mechanism as
// the transcript: an optimize sweep peeks its OWN worktree's turn usage so EVERY run can record cost with
// the consistent TurnUsage attribute set (parity with the design-lane sweep, which already carries usage).
let lastAgentUsage: TurnUsage | undefined;
const lastAgentUsageByCwd = new Map<string, TurnUsage>();
/** PEEK the last turn's usage WITHOUT clearing it. Pass `cwd` for the concurrency-safe per-worktree read. */
export function peekLastAgentUsage(cwd?: string): TurnUsage | undefined {
  return cwd !== undefined ? lastAgentUsageByCwd.get(cwd) : lastAgentUsage;
}
/** Record a turn's usage as both the global last AND the per-cwd entry (mirrors recordAgentTranscript). */
export function recordAgentUsage(cwd: string, usage: TurnUsage): void {
  lastAgentUsage = usage;
  lastAgentUsageByCwd.set(cwd, usage);
}

/** Per-turn EXECUTION metadata for the telemetry decorator: the model + reasoning-effort the turn
 *  actually ran with, how many times it was retried (context-overflow + transient budgets combined),
 *  and the turn's usage (tokens). Distinct from TurnUsage (which is parsed from the CLI result event):
 *  model/effort/retryCount are runner-side knobs not present in that event. Recorded by the runner AFTER
 *  a turn's retry loop settles; TAKEn by the telemetry decorator (with-telemetry) when it builds the
 *  per-turn span. Best-effort observability, never load-bearing. */
export interface TurnMeta {
  role?: string;
  /** The exact model id the turn ran on (e.g. an "opus"/"sonnet" family id); bucketed at the span. */
  model?: string;
  /** The reasoning-effort lever the turn ran with ("" / undefined when none was passed). */
  effort?: string;
  /** Combined retry count for the turn (context-overflow retries + transient retries). 0 = clean. */
  retryCount?: number;
  usage?: TurnUsage;
}
// Per-cwd last-turn META, the SAME crosstalk-safe mechanism as the transcript + usage: a concurrent
// sweep TAKEs its OWN worktree's turn meta, never a sibling's. The serial drive uses the no-arg global.
let lastTurnMeta: TurnMeta | undefined;
const lastTurnMetaByCwd = new Map<string, TurnMeta>();
/** TAKE (read + clear) the last turn's meta. Mirrors takeLastAgentTranscript: the telemetry decorator is
 *  the SOLE per-turn consumer, so take-clears prevents a stale meta leaking onto the NEXT turn's span (a
 *  gate action between two role turns records no meta; without the clear it would inherit the prior
 *  turn's model/effort). Pass `cwd` for the concurrency-safe per-worktree read; omit for the serial drive. */
export function takeLastTurnMeta(cwd?: string): TurnMeta | undefined {
  if (cwd !== undefined) {
    const m = lastTurnMetaByCwd.get(cwd);
    lastTurnMetaByCwd.delete(cwd);
    return m;
  }
  const m = lastTurnMeta;
  lastTurnMeta = undefined;
  return m;
}
/** PEEK the last turn's meta WITHOUT clearing (parity with peekLastAgentTranscript / peekLastAgentUsage). */
export function peekLastTurnMeta(cwd?: string): TurnMeta | undefined {
  return cwd !== undefined ? lastTurnMetaByCwd.get(cwd) : lastTurnMeta;
}
/** Record a turn's meta as both the global last AND the per-cwd entry (mirrors recordAgentUsage). */
export function recordTurnMeta(cwd: string, meta: TurnMeta): void {
  lastTurnMeta = meta;
  lastTurnMetaByCwd.set(cwd, meta);
}

/** Build the default per-turn monitor from the module timeout constants. A turn with
 *  neither an inactivity nor a heartbeat window returns undefined (a byte-identical
 *  no-op controller). Exposed as its own function so tests can assert the mapping and
 *  callers can override. */
export function defaultTurnMonitor(sink: (p: import("../turns/turn-monitor.js").TurnProgress) => void): TurnMonitor | undefined {
  const heartbeatMs = TURN_HEARTBEAT_MS > 0 ? TURN_HEARTBEAT_MS : undefined;
  const inactivityTimeoutMs = TURN_INACTIVITY_TIMEOUT_MS > 0 ? TURN_INACTIVITY_TIMEOUT_MS : undefined;
  if (heartbeatMs === undefined && inactivityTimeoutMs === undefined) return undefined;
  return { onProgress: sink, heartbeatMs, inactivityTimeoutMs };
}

export function spawnClaudeStreaming(
  args: string[],
  cwd: string,
  /** Override the per-turn liveness monitor (tests inject a fake-clock-driven one).
   *  Omitted => the default built from TURN_INACTIVITY_TIMEOUT_MS / TURN_HEARTBEAT_MS. */
  monitorOverride?: TurnMonitor,
): Promise<TurnUsage | undefined> {
  return new Promise((resolve, reject) => {
    // Capture BOTH stdout (the stream-json events) and stderr (claude's own
    // errors), teeing the human-readable parts to the console, so a context-
    // overflow message printed to either stream is detectable for the retry.
    const child = spawn("claude", args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const lines: string[] = [];
    let sawTooLong = false;
    let sawTransient = false;
    // Tee a COMPACT trace: each tool action (liveness) as it streams, and the
    // turn's FINAL assistant text (the outcome) at close. The interstitial
    // "now I'll... / let me check..." prose is buffered and overwritten, so only
    // the last text (the result line) survives – the deliberation never hits the
    // log. Set LAKEBASE_CONSORT_VERBOSE_AGENT=1 to tee every assistant text delta.
    const verboseAgent = !!consortEnv("VERBOSE_AGENT");
    // Liveness sidecar: when recording, ALWAYS stream the agent's intermediate reasoning + each tool
    // action to <RECORD_DIR>/agent-live.log as it arrives, timestamped. This is the "is it working or
    // spinning?" channel – a monitor can `tail -f` it and see fresh prose the moment the agent thinks,
    // WITHOUT polluting the compact capture log (which still shows only `· tool` markers + the final
    // outcome). Independent of VERBOSE_AGENT (that tees to the console); this always writes to disk when
    // RECORD_DIR is set. Append-only, one line per delta, best-effort (a sidecar write must never break
    // a turn). The file is per-run (all turns append); the turn boundary is marked at open below.
    const liveLogDir = consortEnv("RECORD_DIR")?.trim();
    let liveLog: number | undefined;
    if (liveLogDir) {
      try {
        fs.mkdirSync(liveLogDir, { recursive: true });
        liveLog = fs.openSync(path.join(liveLogDir, "agent-live.log"), "a");
        const pIdxL = args.indexOf("-p"), rIdxL = args.indexOf("--agent");
        const role = rIdxL >= 0 ? args[rIdxL + 1] : "agent";
        const task = pIdxL >= 0 ? (args[pIdxL + 1] ?? "") : "";
        fs.writeSync(liveLog, `\n=== ${new Date().toISOString()} TURN START role=${role} :: ${task}\n`);
      } catch {
        liveLog = undefined; // sidecar is observability, never a gate
      }
    }
    const liveWrite = (s: string): void => {
      if (liveLog === undefined) return;
      try {
        fs.writeSync(liveLog, s);
      } catch {
        /* best-effort: a failed sidecar write must never break the turn */
      }
    };
    let lastText = "";
    // Accumulate ALL assistant text this turn. The ```agent-report block may precede a closing message
    // and/or stream across events, so the LAST message alone can miss it; the full text always contains
    // the complete block. Used (below) as finalText WHEN a report block is present, so the record/log
    // phase can extract it (formatAgentReport reads finalText); otherwise finalText stays the last message.
    let allText = "";
    const allTools: string[] = []; // accumulate for the recorded transcript
    // Per-turn liveness monitor (Slice 3): fed one progress event per stream line, it
    // re-arms an inactivity deadline on every line and, after a stretch of total silence
    // (a stalled API stream: child alive, socket open, no bytes, so `close` never fires),
    // tree-kills the child and lets the close handler reject with a STALLED transient
    // ClaudeTurnError – which the existing transient-retry envelope re-runs on a fresh
    // session. Heartbeats are written to the sidecar so a `tail -f` sees "still waiting"
    // beats before any kill. Default no-op when both windows are disabled.
    let stalled = false;
    const monitor = monitorOverride ?? defaultTurnMonitor((p) => {
      if (p.kind === "heartbeat") {
        liveWrite(`  ⏳ ${new Date().toISOString()} no agent output for ~${Math.round((TURN_HEARTBEAT_MS || 0) / 1000)}s (waiting; kills at ${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1000)}s of silence)\n`);
      }
    });
    const monitorCtl = createMonitorController(monitor, () => {
      // Inactivity deadline hit: the stream has been silent past the threshold. Kill the
      // whole child process group (a stalled `claude` may have live child procs holding
      // the socket) so `close` fires; the close handler then rejects as STALLED.
      stalled = true;
      liveWrite(`  ✖ ${new Date().toISOString()} INACTIVITY TIMEOUT (~${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1000)}s silent) – tree-killing pid ${child.pid} for a fresh-session retry\n`);
      process.stderr.write(`[drive] turn stalled: no agent output for ~${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1000)}s; killing pid ${child.pid} and retrying on a fresh session\n`);
      try {
        // Negative pid => kill the process GROUP. spawn() puts the child in its own group
        // only with detached; without it, SIGKILL the pid directly (its children are
        // reparented but the socket dies with the main process, unblocking the await).
        child.kill("SIGKILL");
      } catch {
        /* best-effort: if the kill races the natural close, close still fires */
      }
    });
    monitorCtl.start();
    const rl = readline.createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      lines.push(line);
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (isTransientApiErrorSignal(line)) sawTransient = true;
      if (verboseAgent) {
        const text = assistantTextFromLine(line);
        if (text) process.stderr.write(text);
        if (text) liveWrite(text); // intermediate reasoning -> sidecar (liveness)
        if (text) monitorCtl.progress({ kind: "text" }); // MEANINGFUL content only re-arms the silence clock
        // still collect tools for the transcript even in verbose mode
        for (const t of assistantEventSummary(line).tools) {
          allTools.push(t);
          liveWrite(`  · ${t}\n`);
          monitorCtl.progress({ kind: "tool", tool: t });
        }
        return;
      }
      const { text, tools } = assistantEventSummary(line);
      for (const t of tools) {
        process.stderr.write(`  · ${t}\n`);
        allTools.push(t);
        liveWrite(`  · ${t}\n`);
        monitorCtl.progress({ kind: "tool", tool: t }); // a tool marker = real liveness; re-arm
      }
      // Intermediate reasoning goes to the sidecar as it streams (liveness), even though the compact
      // console log holds only the final text. This is the whole point: the sidecar shows the agent is
      // thinking, not spinning, mid-turn.
      if (text) {
        lastText = text; // hold for the console; only the final one is printed at close
        allText += (allText ? "\n" : "") + text; // full assistant text (report block may not be the last message / may stream)
        liveWrite(text.endsWith("\n") ? text : `${text}\n`);
        monitorCtl.progress({ kind: "text" }); // assistant text = real liveness; re-arm
      }
      // CRITICAL: do NOT re-arm the silence clock on non-content lines. A stalled API stream
      // still dribbles stream-json keepalive/ping/system events that fire this handler but
      // carry no assistant text or tool call. Re-arming on those defeats the whole timeout (the
      // wedge that made this fix miss on its first live test: raw lines kept the timer alive while
      // the agent produced nothing for 11+min). Liveness == the SAME events that advance the
      // sidecar (assistant text + tool markers), nothing else.
    });
    const erl = readline.createInterface({ input: child.stderr! });
    erl.on("line", (line) => {
      // stderr carries claude's own error/status prose (not stream-json keepalive), so a stderr
      // line IS meaningful activity – re-arm on it.
      monitorCtl.progress({ kind: "text" });
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (isTransientApiErrorSignal(line)) sawTransient = true;
      process.stderr.write(`${line}\n`); // tee: keep claude's own errors visible
    });
    const closeLiveLog = (): void => {
      if (liveLog === undefined) return;
      try {
        fs.closeSync(liveLog);
      } catch {
        /* best-effort */
      }
      liveLog = undefined;
    };
    child.on("error", (err) => {
      monitorCtl.stop();
      closeLiveLog();
      reject(err);
    });
    child.on("close", (code) => {
      monitorCtl.stop(); // clear the inactivity/heartbeat timers; safe after a timeout too
      rl.close();
      erl.close();
      // The turn's final assistant text = the outcome (rule 5). Print it once,
      // after the tool trace, so the log shows actions + result, not the prose.
      if (!verboseAgent && lastText) process.stderr.write(`${lastText}\n`);
      liveWrite(`--- ${new Date().toISOString()} TURN CLOSE code=${code}${lastText ? ` :: ${lastText}` : ""}\n`);
      closeLiveLog();
      // A stall killed the child: reject as a STALLED transient so the retry envelope
      // re-runs on a fresh session. Take this branch regardless of the (kill-induced)
      // exit code, and BEFORE the generic non-zero branch.
      if (stalled) {
        return reject(new ClaudeTurnError(`claude turn stalled (inactivity timeout); killed for retry`, false, true, true));
      }
      if (code !== 0) return reject(new ClaudeTurnError(`claude exited ${code}`, sawTooLong, sawTransient));
      // Stash this turn's outcome-level transcript for the recorder. `-p <task>`
      // and `--agent <role>` / `--model <m>` are positional in the args we built.
      const pIdx = args.indexOf("-p");
      const rIdx = args.indexOf("--agent");
      const mIdx = args.indexOf("--model");
      const tx: TurnTranscript = {
        prompt: pIdx >= 0 ? args[pIdx + 1] ?? "" : "",
        role: rIdx >= 0 ? args[rIdx + 1] : undefined,
        model: mIdx >= 0 ? args[mIdx + 1] : undefined,
        // When the turn emitted a ```agent-report block, use the FULL assistant text as finalText so the
        // record/log phase can extract the (possibly non-final / streamed) block; otherwise keep the last
        // message (unchanged for turns that emit no report block).
        finalText: allText.includes("```agent-report") ? allText : lastText,
        tools: allTools,
      };
      // Record as global last AND per-cwd (the worktree), so a concurrent peek gets ITS OWN turn, not a
      // sibling's – the fix for cross-candidate transcript crosstalk in parallel sweeps (global is a race).
      recordAgentTranscript(cwd, tx);
      // Record the turn's usage (cost + tokens + numTurns + duration) the SAME crosstalk-safe way, so a
      // concurrent optimize sweep can peek ITS worktree's cost and record it (cost parity across runs).
      const parsed = parseTurnUsage(lines);
      if (parsed) recordAgentUsage(cwd, parsed);
      resolve(parsed);
    });
  });
}

/**
 * The spawn flags for a claude command's optional tool-scope levers (the
 * optimize harness's Family-2 "restrict what the agent can scan/do" knob). A
 * pure function of the command so it is hermetically testable and has ONE
 * source of truth. Empty (both fields absent or empty) => `[]`, so a normal
 * drive command (which sets neither) spawns byte-identically to before.
 */
export function claudeToolArgs(cmd: Extract<DriveCommand, { kind: "claude" }>): string[] {
  const out: string[] = [];
  // Pre-approve the ux-designer's browser tools alongside any Family-2 allow-list. The
  // agent frontmatter GRANTS these (makes them available) and the browser MCP is LOADED,
  // but under `--permission-mode acceptEdits` (headless, no human) an un-pre-approved MCP
  // /WebFetch call is DENIED ("...you haven't granted it yet") — PROVEN live: without
  // these in --allowed-tools mcp__playwright__browser_navigate is permission-denied; with
  // them it is permitted. So the role that loads the browser MCP must also allow its tools.
  const allowed = [...new Set([...(cmd.allowedTools ?? []), ...browserAllowedToolsForRole(cmd.role)])];
  if (allowed.length) out.push("--allowed-tools", allowed.join(","));
  if (cmd.disallowedTools && cmd.disallowedTools.length) out.push("--disallowed-tools", cmd.disallowedTools.join(","));
  return out;
}

/** Kit-shipped MCP config the ux-designer role uses by default: a headless browser
 *  server so the design turn can navigate the reference sites the brief names and read
 *  their real computed styles. Absolute (via kitRoot) so it resolves in a dev clone AND
 *  an installed package, independent of workspace provisioning. */
export const UX_BROWSER_MCP_CONFIG = "skills/consort/config/ux-browser-mcp.json";

/** The default `--mcp-config` path for a role when consort-config.json sets no explicit
 *  override: the kit-shipped browser MCP for ux-designer, undefined for every other role
 *  (so no other spawn changes). ONE source of truth for the default, shared by the drive
 *  config wiring and its guard test. */
export function defaultMcpConfigForRole(role: string): string | undefined {
  return role === "ux-designer" ? path.join(kitRoot(), UX_BROWSER_MCP_CONFIG) : undefined;
}

/** The tools the ux-designer's browser turn needs PRE-APPROVED for headless auto-run.
 *  Paired with defaultMcpConfigForRole: the role that LOADS the browser MCP is the one
 *  whose MCP + web tools must be in `--allowed-tools`, or acceptEdits denies them with no
 *  human to grant. `mcp__playwright` (the browser server), `WebFetch` (read a named
 *  reference), `WebSearch` (find references when the brief names none) — the same three
 *  the ux-designer frontmatter grants. Empty for every other role (spawn unchanged). */
export const UX_BROWSER_ALLOWED_TOOLS = ["mcp__playwright", "WebFetch", "WebSearch"] as const;
export function browserAllowedToolsForRole(role: string | undefined): string[] {
  return role === "ux-designer" ? [...UX_BROWSER_ALLOWED_TOOLS] : [];
}

/** The command that installs the browser the ux-designer's MCP drives. `@playwright/mcp` does
 *  NOT auto-install a browser — without Chromium present the MCP starts but every navigate fails
 *  ("browser not installed"), so the ux-designer reports the browser unavailable and degrades to
 *  the brief. `@latest` keeps the installed browser aligned with `@playwright/mcp@latest` in
 *  ux-browser-mcp.json. Exported so the guard test pins it. */
export const UX_BROWSER_INSTALL_CMD = { command: "npx", args: ["--yes", "playwright@latest", "install", "chromium"] } as const;

let uxBrowserEnsured = false;
/** Ensure Playwright's Chromium is installed BEFORE the ux-designer's browser MCP launches. Run
 *  here (in the drive, ahead of the `claude -p` spawn) rather than inside the MCP command so the
 *  potentially slow first-time download happens OUTSIDE the MCP's own startup timeout — otherwise
 *  a cold Chromium fetch makes the server look like it failed to start. Idempotent (a no-op once
 *  installed), memoized to once per drive process, and never fatal: on failure the ux-designer
 *  still runs and degrades to the brief exactly as it does when the browser is unavailable. */
export function ensureUxBrowserChromium(): void {
  if (uxBrowserEnsured) return;
  uxBrowserEnsured = true;
  try {
    process.stderr.write("[drive] ensuring Playwright Chromium for the ux-designer browser (one-time)…\n");
    execFileSync(UX_BROWSER_INSTALL_CMD.command, [...UX_BROWSER_INSTALL_CMD.args], { stdio: "ignore" });
  } catch {
    process.stderr.write(
      "[drive] could not pre-install Chromium — the ux-designer will degrade to the brief if the browser can't launch\n",
    );
  }
}

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
export function claudeBaseArgs(cmd: Extract<DriveCommand, { kind: "claude" }>): string[] {
  return [
    "-p", cmd.task,
    "--agent", cmd.role,
    "--model", cmd.model,
    "--permission-mode", "acceptEdits",
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--output-format", "stream-json",
    "--verbose",
  ];
}

export function execRunner(cfg: DriveEffectsConfig): CommandRunner {
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
        writeWorkflowPhase(cfg.consortDir, cmd.phase, cfg.featureId || undefined);
        return;
      }
      if (cmd.kind === "sync-backlog") {
        // Deterministic, in-process (no CLI): project sprints/<sprint>/backlog.json from the PO's
        // committed feature-requests (scoped by requested.json) + the Architect's estimates. This is
        // the ONE bridge from "author-requests supplied the request" to the backlog the planning
        // deriver reads; without it deriveSprintPlanningState sees an empty backlog, requestsAuthored
        // never flips, and the planning loop re-derives author-requests forever (the J2 stall). The
        // arm was previously a no-op (the comment claimed another module handled it – nothing did).
        syncBacklog(cfg.consortDir, cmd.sprint);
        return;
      }
      if (cmd.kind === "claude") {
        // Per-turn BUILD replay: when LAKEBASE_CONSORT_REPLAY_BUILD_DIR is set, a
        // Navigator/Driver turn overlays its recorded artifact (code + cycle/
        // experiment records) from the corpus instead of spawning the model. The
        // orchestrator still VISITS the turn (logs + transitions + runs the live
        // cycle-record CLIs that stamp RED/GREEN against the overlaid code), so
        // every Navigator<->Driver event is reproduced – only the artifact
        // delivery is mocked. The Kth Navigator/Driver turn maps to the Kth
        // recorded turn dir. A replay is a RECORDING: a corpus miss is a HARD
        // FAILURE (ReplayCorpusMissError), never a fall-through to a live agent ,
        // an agent taking over would defeat the deterministic reproduction and
        // silently mask an incomplete corpus.
        const replayBuildDir = consortEnv("REPLAY_BUILD_DIR");
        const story = cmd.replay?.story;
        if (replayBuildDir && story && (cmd.role === "navigator" || cmd.role === "driver")) {
          // The reflect turn is a DESIGN GATE that runs in the build lane: its only
          // output is reflect-verdict.json (a .consort artifact), never code. Restore
          // JUST the verdict – do NOT restore its recorded code snapshot (that would
          // overwrite the freshly-scaffolded tree with the recording's project-name-
          // baked files and leave it dirty, so the pre-build cut-experiment fork
          // refuses) – and do NOT count it as a build turn (replayBuildTurn's index
          // skips reflect turns, so RED maps to the first real recorded build turn).
          if (cmd.replay?.buildMode === "reflect") {
            const rd = consortEnv("REPLAY_DIR");
            // The verdict lives in the DESIGN corpus. When it is present (REPLAY_DIR
            // set), it MUST restore; a miss is a corpus defect, not a reason to run
            // the Navigator live. (When REPLAY_DIR is unset the design lane is not
            // being replayed, so there is no recorded verdict to restore here.)
            if (rd) {
              const restored = restoreReflectVerdict({ replayDir: rd, consortDir: cfg.consortDir, featureId: cfg.featureId, story });
              if (!restored) {
                throw new ReplayCorpusMissError(
                  `[drive] REPLAY CORPUS MISS: reflect verdict for ${story} is not in the corpus ` +
                    `(expected features/${cfg.featureId}/stories/${story}/reflect-verdict.json under ${rd}). ` +
                    `Replay will NOT run the Navigator live – put the recorded verdict in the corpus (check .gitignore is not dropping it).`,
                );
              }
            }
            process.stderr.write(`[drive] replayed reflect (navigator ${story}) from corpus – verdict only (no code, not counted)\n`);
            return;
          }
          const turnIndex = (buildTurns.get(story) ?? 0) + 1;
          buildTurns.set(story, turnIndex);
          const replayed = replayBuildTurn({
            replayBuildDir,
            projectDir: cfg.projectDir,
            consortDir: cfg.consortDir,
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
              `build turns than the corpus recorded, or the corpus is incomplete. Replay will NOT run the agent live – ` +
              `re-record or fix the corpus so it covers every dispatched turn.`,
          );
        }
        // Fast-forward replay: when LAKEBASE_CONSORT_REPLAY_DIR is set, a design-lane
        // role's turn copies its recorded output from the corpus instead of
        // spawning the model. The orchestrator still VISITS the turn (logs +
        // transitions + runs its deterministic effects); only the LLM generation
        // is replaced. Navigator/Driver are never replayed (not design roles),
        // so the real TDD begins at the Navigator handoff. A replay is a RECORDING:
        // if the deterministic pipeline dispatched a replayable design turn, the
        // corpus MUST have its artifact – a miss is a HARD FAILURE, never a
        // fall-through to a live agent (the .gitignore corpus drop this guards).
        const replayDir = consortEnv("REPLAY_DIR");
        if (replayDir && REPLAYABLE_DESIGN_ROLES.has(cmd.role)) {
          const replayed = replayDesignTurn({
            turn: { role: cmd.role, mode: cmd.replay?.mode, story: cmd.replay?.story },
            replayDir,
            consortDir: cfg.consortDir,
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
              `output. Replay will NOT run the agent live – put the recorded artifact in the corpus (check .gitignore is not dropping it).`,
          );
        }
        // stream-json (requires --verbose with --print) lets us capture the turn's
        // token usage from the result event while teeing readable text to the console.
        const baseArgs = claudeBaseArgs(cmd);
        // Per-role/turn model-side knobs (consort-config.json): effort (set on judgment
        // turns to run fast), fallback model (auto-failover when the primary is
        // overloaded), and a per-invocation dollar cap.
        if (cmd.effort) baseArgs.push("--effort", cmd.effort);
        if (cmd.fallbackModel) baseArgs.push("--fallback-model", cmd.fallbackModel);
        if (typeof cmd.maxBudgetUsd === "number") baseArgs.push("--max-budget-usd", String(cmd.maxBudgetUsd));
        // Per-role MCP server (ux-designer's headless browser). Under the base
        // --strict-mcp-config, ONLY this file's servers load, for this turn only. A
        // server that fails to start is non-fatal (the agent runs without those tools);
        // absent on every other role, so their spawn is byte-identical.
        if (cmd.mcpConfig) {
          // The ux-designer's browser MCP (@playwright/mcp) needs Chromium present, and it does
          // not install one itself — ensure it up front (outside the MCP's startup timeout) so the
          // browser actually launches instead of the ux-designer degrading to the brief.
          if (cmd.role === "ux-designer") ensureUxBrowserChromium();
          baseArgs.push("--mcp-config", cmd.mcpConfig);
        }
        // Optional tool-scope restriction (optimize harness Family-2 lever). A
        // normal drive sets neither field, so this is a no-op there.
        baseArgs.push(...claudeToolArgs(cmd));
        // Resolve this attempt's session flags. `forceFresh` ignores the warm
        // session (used when retrying after a mid-turn "Prompt is too long").
        const sessionArgsFor = (forceFresh: boolean): string[] => {
          if (!cmd.resumeKey) return [];
          // Proactive per-turn context cap: a HEAVY role (Driver/Navigator) starts
          // EVERY turn on a fresh session, so no turn inherits a prior turn's
          // accumulated context. This is the deterministic companion to the reactive
          // budget guard below (which only resets AFTER a session already grew too
          // big). Artifact-as-API makes a cold turn always correct: the turn reloads
          // exactly what it needs from disk. Overridable via LAKEBASE_CONSORT_HEAVY_ROLES.
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
        // many tool calls – the failure that killed F6/S3-split-drop-old). When that
        // turn fails with "Prompt is too long", restart it on a FRESH session: the
        // artifacts the failed attempt already wrote (.consort + code + tests) persist,
        // so each retry has strictly less to do and converges, instead of aborting
        // the whole drive. A non-overflow failure (or exhausted retries) still throws.
        let usage: TurnUsage | undefined;
        const turnStart = Date.now();
        // Two independent bounded retry budgets on a failed turn: a mid-turn
        // context overflow (retry on a FRESH session, converges as artifacts
        // persist) and a TRANSIENT API/network blip (retry the same session after
        // a backoff). A blip must never hard-halt a long unattended capture; an
        // auth failure is deliberately not transient, so it still surfaces.
        let overflowRetries = 0;
        let transientRetries = 0;
        // A stalled turn was tree-killed, so its retry must NOT resume the (suspect)
        // killed session. This one-shot flag forces the next attempt fresh without
        // spending the prompt-too-long budget on an unrelated cause.
        let forceFreshAfterStall = false;
        for (;;) {
          const args = [...baseArgs, ...sessionArgsFor(overflowRetries > 0 || forceFreshAfterStall)];
          forceFreshAfterStall = false;
          try {
            usage = await spawnClaudeStreaming(args, cfg.projectDir);
            break;
          } catch (e) {
            if (e instanceof ClaudeTurnError && e.promptTooLong && overflowRetries < MAX_PROMPT_TOO_LONG_RETRIES) {
              overflowRetries++;
              process.stderr.write(
                `[drive] context guard (mid-turn): ${cmd.role} overflowed ${cmd.model}; ` +
                  `fresh-session retry ${overflowRetries}/${MAX_PROMPT_TOO_LONG_RETRIES}\n`,
              );
              continue;
            }
            if (e instanceof ClaudeTurnError && e.transient && transientRetries < MAX_TRANSIENT_RETRIES) {
              transientRetries++;
              const backoff = TRANSIENT_BACKOFF_MS * transientRetries;
              // A stall was already tree-killed, so force its retry onto a FRESH session
              // (the killed session is suspect) and name it a stall in the log.
              const kind = e.stalled ? "stalled turn (inactivity timeout)" : "transient API error";
              if (e.stalled) forceFreshAfterStall = true;
              process.stderr.write(
                `[drive] ${kind} on ${cmd.role} (${cmd.model}); ` +
                  `retry ${transientRetries}/${MAX_TRANSIENT_RETRIES} after ${(backoff / 1000).toFixed(0)}s${e.stalled ? " on a FRESH session" : ""}\n`,
              );
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            throw e;
          }
        }
        // Record this turn's execution meta for the telemetry decorator to read when it builds the
        // per-turn span: the model + effort it ACTUALLY ran with, the combined retry count (both
        // budgets), and the usage. Recorded on the SAME cwd the turn spawned under (crosstalk-safe),
        // unconditionally (model/effort/retry are worth capturing even when usage parsing yielded
        // nothing). Best-effort observability; a plain assignment that never throws.
        recordTurnMeta(cfg.projectDir, {
          role: cmd.role,
          model: cmd.model,
          effort: cmd.effort,
          retryCount: overflowRetries + transientRetries,
          usage,
        });
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
              { consortDir: cfg.consortDir },
            );
          } catch {
            /* usage logging is observability, never load-bearing */
          }
        }
        return;
      }
      if (cmd.kind === "verify-artifact") {
        // FEIP-8006 out-of-root guard: the role's expected artifact must exist
        // UNDER the project's consortDir (a file, or a non-empty dir for per-story
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
          // "re-run" remedy (which no-ops – the artifact never lands in-root).
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
              cfg.consortDir,
              malformedSiblingRoot(cfg.projectDir),
            );
          }
        }
        return;
      }
      // cmd.kind === "cli": resolve the kit bin to its dist JS via the kit's
      // package.json bin map so it runs regardless of PATH; fall back to the
      // bare name for anything not a kit bin (external tools on PATH). Re-key any
      // CliEffectError to the LOGICAL bin (cmd.bin, e.g. "lakebase-scm-wait-ci"),
      // not the "node" interpreter spawnCmd saw – so the drive's halt names the
      // step that failed (wait-ci / merge / prepare-pr) instead of "node exited 1".
      const js = resolveKitBinJs(cmd.bin);
      try {
        if (js) {
          await spawnCmd("node", [js, ...cmd.args], cfg.projectDir);
        } else {
          await spawnCmd(cmd.bin, cmd.args, cfg.projectDir);
        }
      } catch (e) {
        if (e instanceof CliEffectError) throw new CliEffectError(cmd.bin, e.code);
        throw e;
      }
    },
  };
}

let agentResyncDone = false;
/** Run the version-aware agent refresh at most once per drive process, and
 *  never during capture/replay (it mutates the tree; a recorded corpus must
 *  stay a pure product of its turns). Best-effort – resyncAgentsOnKitDrift
 *  swallows its own errors. */
function maybeResyncAgents(projectDir: string): void {
  if (agentResyncDone) return;
  agentResyncDone = true;
  const recordingOrReplaying =
    !!consortEnv("REPLAY_DIR") ||
    !!consortEnv("REPLAY_BUILD_DIR") ||
    !!consortEnv("RECORD_BUILD_DIR") ||
    !!consortEnv("RECORD_DIR");
  if (recordingOrReplaying) return;
  const r = resyncAgentsOnKitDrift(projectDir);
  if (r.refreshed) {
    process.stderr.write(`[drive] kit moved (${r.from ?? "unknown"} -> ${r.to}); refreshed .claude/agents/ from the kit\n`);
  }
}

/** Build a DriveEffectsConfig for a feature (or planning, featureId ""). */
export function buildCfg(args: ParsedArgs, featureId: string): DriveEffectsConfig {
  const projectDir = args.projectDir ?? process.cwd();
  const consortDir = args.consortDir ?? resolveConsortDir(projectDir);
  // Version-aware agent refresh: if the kit moved since this project last synced
  // its .claude/agents/, force-refresh them so a role-prompt bugfix reaches the
  // project (create-time copyMissingMd only seeds missing files). Once per drive
  // process, best-effort, and NEVER during capture/replay (it mutates the tree
  // and would pollute a recorded corpus).
  maybeResyncAgents(projectDir);
  // Resolve the Lakebase instance + the feature's branch from the SCM workflow
  // state (.lakebase/workflow-state.json, written at claim). The per-story
  // experiment ops need both: the instance to create/merge the paired branch,
  // and the feature branch as the experiment's parent + merge target. --instance
  // overrides the recorded project_id when given.
  const scm = readWorkflowState(projectDir);
  // Unified config: one resolution of the per-role/turn model+effort matrix + the
  // build/plan/project knobs (consort-config.json -> LAKEBASE_CONSORT_* env -> default).
  const settings = resolveConsortSettings({ projectDir });
  return {
    projectDir,
    consortDir,
    featureId,
    sprintName: args.sprint,
    // Recorded feature-requests present (capture/replay) => the planning PROPOSE
    // step is deterministic (project feature-proposals.md from them) instead of an
    // LLM spawn. Unset (interactive) keeps the live Spec Author propose turn.
    recordedRequests: !!consortEnv("SPRINT_REQUESTS")?.trim(),
    // Force a LIVE propose even with recorded requests (capture exercising the
    // full plan lane): the Spec Author proposes from product-overview + nfrs,
    // the proxy still commits the recorded request at author-requests.
    livePropose: !!consortEnv("LIVE_PROPOSE")?.trim(),
    // Agent turns dispatch THROUGH the StepExecutor (the unified path) – now the DEFAULT (J1). Every
    // executor-allowlisted action has a shipped manifest (guarded by executor-dispatch-coverage.test),
    // so the executor is the sole agent path. LAKEBASE_CONSORT_USE_MANIFEST_STEPS is a one-cycle escape
    // hatch: set it to 0/false/off/no to force the legacy commandsForAction dispatch (retired in J5).
    useManifestSteps: !/^(0|false|off|no)$/i.test(consortEnv("USE_MANIFEST_STEPS")?.trim() ?? ""),
    // Hand the executor's ReplayRecorderWrapper the just-completed live turn's transcript, so an
    // executor-dispatched turn records prompt + reasoning + tools alongside its delta – the SAME
    // source the effects-level withTurnRecording uses. Colocated with takeLastAgentTranscript (this
    // module) so there's no runtime edge from the executor onto the runner. Read whenever the turn is
    // recorded: a CAPTURE (RECORD_DIR) OR the always-on LIVE index into `.consort` (every live build).
    takeTranscript: takeLastAgentTranscript,
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
    // Per-role MCP config: an explicit consort-config.json override wins; otherwise
    // ux-designer defaults ON to the kit-shipped headless-browser MCP so "make it look
    // like <these sites>" is honored out of the box (the agent navigates each named
    // reference and reads its real fonts/colors/spacing) with zero operator setup. The
    // path is absolute via kitRoot() so it resolves in dev-clone AND installed layouts,
    // independent of workspace provisioning. Every other role resolves undefined.
    mcpConfigForRole: (role) => settings.mcpConfigs[role] ?? defaultMcpConfigForRole(role),
    modelForRole: (role) => settings.models[role] ?? resolveModelForRole(role as AgentRole, projectDir),
    // Model tiering: per-turn model (driver GREEN/REFACTOR on a cheaper model than
    // its RED). Falls through to the role's base model when no per-turn map applies.
    modelForTurn: (role, turn) => settings.modelFor(role, turn),
    runner: { async run() {} },
    onAction: composeOnAction(
      // Narrate each routing decision in plain language (DRY: the same message
      // the structured log uses). The machine-readable form is already written to
      // the structured agent-log by makeOnAction below, so the raw action JSON is
      // console noise on every line – append it only under LAKEBASE_CONSORT_TRACE.
      (action, i) => {
        // Per-turn progress narration to stderr, ON BY DEFAULT so the drive is not
        // silent during a run (the human – or the relaying session tailing this ,
        // sees each phase/role/gate transition). LAKEBASE_CONSORT_QUIET=1 silences
        // it for captures / CI where the structured agent-log is the record.
        if (consortEnv("QUIET")) return;
        const trace = consortEnv("TRACE") ? `  ${JSON.stringify(action)}` : "";
        process.stderr.write(`[drive] ${String(i).padStart(3, "0")} ${describeAction(action, { featureId })}${trace}\n`);
      },
      // Code-emit the orchestrator's lifecycle (handoff / phase.start /
      // gate.surfaced / experiment.* / phase.end) through the ONE common logger,
      // so the structured trail is written every run with no LLM in the loop.
      // The resolvers stamp each per-turn phase.start with the model + effort it
      // ran with (right after `role`).
      makeOnAction({
        consortDir,
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
