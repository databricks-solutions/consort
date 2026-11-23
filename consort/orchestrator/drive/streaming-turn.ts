// The reusable per-turn STREAMING ENGINE shared by the Claude and Copilot runners.
// Extracted verbatim from spawnClaudeStreaming so BOTH CLIs get identical liveness:
// the agent-live.log sidecar, the inactivity/heartbeat monitor + tree-kill on a
// stall, the stderr tee, and the `· <stamp> <tool>` trace. The per-CLI differences
// — the binary, how a stdout line maps to assistant text / tool / retry-signal, and
// what the close does with the accumulated result — live behind a `StreamBackend`.
//
// CRITICAL: this module imports NO runner (claude-runner / copilot-runner) so there
// is no import cycle — only node + the generic turn monitor + env/paths helpers.
// Transcript + usage recording are the BACKEND's job (its onClose), never the engine's.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { consortEnv } from "../../config/consort-env.js";
import { resolveConsortDir } from "../../config/consort-paths.js";
import { createMonitorController, type TurnMonitor, type TurnProgress } from "../turns/turn-monitor.js";

// Per-turn INACTIVITY timeout: how long the agent stream may go completely silent
// (no stdout/stderr line) before the turn is treated as wedged, the child tree-killed,
// and the turn re-run as a transient failure. Silence — not duration — is the signal:
// a turn that keeps streaming re-arms the timer on every tool marker and never trips.
// The threshold must exceed the longest SINGLE quiet tool step; 10 min is past that
// while still catching a true stall in one heartbeat window. 0/empty disables.
export const TURN_INACTIVITY_TIMEOUT_MS = Number(consortEnv("TURN_INACTIVITY_TIMEOUT_MS") ?? String(10 * 60 * 1000));
// How long the stream may be silent before a heartbeat line is written to the sidecar
// (liveness marker, not a kill). Shorter than the kill deadline. 0/empty disables.
export const TURN_HEARTBEAT_MS = Number(consortEnv("TURN_HEARTBEAT_MS") ?? String(60 * 1000));

/** Build the per-turn liveness monitor from the env-configured windows (tests inject
 *  a fake-clock-driven one instead). Omitted => no-op when both windows are disabled. */
export function defaultTurnMonitor(sink: (p: TurnProgress) => void): TurnMonitor | undefined {
  const heartbeatMs = TURN_HEARTBEAT_MS > 0 ? TURN_HEARTBEAT_MS : undefined;
  const inactivityTimeoutMs = TURN_INACTIVITY_TIMEOUT_MS > 0 ? TURN_INACTIVITY_TIMEOUT_MS : undefined;
  if (heartbeatMs === undefined && inactivityTimeoutMs === undefined) return undefined;
  return { onProgress: sink, heartbeatMs, inactivityTimeoutMs };
}

/** What a backend extracts from ONE stdout line: assistant text + tool names for the
 *  sidecar/liveness, plus retry signals (prompt-too-long / transient blip) if the CLI
 *  surfaces them. All optional — a keepalive/system line returns `{}`. */
export interface StreamLineResult {
  text?: string;
  tools?: string[];
  tooLong?: boolean;
  transient?: boolean;
}

/** The accumulated turn state handed to the backend's onClose. */
export interface StreamCloseCtx {
  code: number | null;
  lines: string[]; // every stdout line, in order (for usage parsing)
  allText: string; // all assistant text this turn (joined by "\n")
  lastText: string; // the LAST assistant message (the outcome line)
  allTools: string[];
  stalled: boolean; // the inactivity monitor tree-killed the child
  sawTooLong: boolean;
  sawTransient: boolean;
  err: string; // accumulated stderr (for a backend's loud-failure diagnostic)
  cwd: string;
}

/** Per-CLI adapter: the only things that differ between the Claude and Copilot runners. */
export interface StreamBackend<R> {
  /** Full argv to spawn: `{ command: "claude", args }` or the resolved copilot command. */
  target: { command: string; args: string[] };
  /** For the agent-live.log `TURN START` header line. */
  header: { role: string; task: string };
  /** Map one stdout line → assistant text / tools / retry signals. */
  onLine(line: string): StreamLineResult;
  /** Optional: retry signals carried on a stderr line (claude prints prompt-too-long there). */
  onStderrLine?(line: string): { tooLong?: boolean; transient?: boolean };
  /** Produce the turn result from the accumulated state. THROW to reject (typed error
   *  for the retry envelope); return (incl. undefined) to resolve. Does the transcript +
   *  usage recording itself — the engine never touches those. */
  onClose(ctx: StreamCloseCtx): R | undefined;
  /** Tee every assistant text delta to stderr (LAKEBASE_CONSORT_VERBOSE_AGENT); default from env. */
  verbose?: boolean;
}

/**
 * Spawn `<command> <args>` with cwd = the turn's workspace, stream its stdout through
 * the backend's line parser into the sidecar + monitor, tee stderr, and on close hand
 * the accumulated state to `backend.onClose` (which resolves or throws). stdin = /dev/null
 * ("ignore"): a headless `-p` turn takes its prompt from args, and an inherited/open stdin
 * lets an agent shell command that reads stdin (`cat > file`) block the drive forever.
 */
export function spawnStreamingTurn<R>(
  backend: StreamBackend<R>,
  cwd: string,
  monitorOverride?: TurnMonitor,
): Promise<R | undefined> {
  return new Promise((resolve, reject) => {
    const child = spawn(backend.target.command, backend.target.args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const lines: string[] = [];
    let err = "";
    let sawTooLong = false;
    let sawTransient = false;
    const verbose = backend.verbose ?? !!consortEnv("VERBOSE_AGENT");
    // Liveness sidecar: stream the agent's intermediate reasoning + each tool action to
    // agent-live.log as it arrives, timestamped — a monitor / the dashboard ticker can
    // `tail -f` it and see fresh prose + tool actions the moment the agent acts. Written on
    // EVERY run (RECORD_DIR when set, else the project's own .consort). Append-only, best-effort.
    const liveLogDir = consortEnv("RECORD_DIR")?.trim() || resolveConsortDir(cwd);
    let liveLog: number | undefined;
    if (liveLogDir) {
      try {
        fs.mkdirSync(liveLogDir, { recursive: true });
        liveLog = fs.openSync(path.join(liveLogDir, "agent-live.log"), "a");
        fs.writeSync(liveLog, `\n=== ${new Date().toISOString()} TURN START role=${backend.header.role} :: ${backend.header.task}\n`);
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
    // Stamp each sidecar tool/text line with wall-clock + seconds since the PREVIOUS emission,
    // so a turn's time is attributable to the exact operation from the log alone.
    let lastEmitMs = Date.now();
    const stamp = (): string => {
      const now = Date.now();
      const dSec = Math.round((now - lastEmitMs) / 1000);
      lastEmitMs = now;
      return `${new Date(now).toISOString().slice(11, 19)} +${dSec}s`;
    };
    let allText = "";
    const allTools: string[] = [];
    let stalled = false;
    const monitor =
      monitorOverride ??
      defaultTurnMonitor((p) => {
        if (p.kind === "heartbeat") {
          liveWrite(`  ⏳ ${new Date().toISOString()} no agent output for ~${Math.round((TURN_HEARTBEAT_MS || 0) / 1000)}s (waiting; kills at ${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1000)}s of silence)\n`);
        }
      });
    const monitorCtl = createMonitorController(monitor, () => {
      // Inactivity deadline hit: the stream has been silent past the threshold. Tree-kill
      // so `close` fires; the backend's onClose then rejects as a stalled/transient retry.
      stalled = true;
      liveWrite(`  ✖ ${new Date().toISOString()} INACTIVITY TIMEOUT (~${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1000)}s silent) – tree-killing pid ${child.pid} for a fresh-session retry\n`);
      process.stderr.write(`[drive] turn stalled: no agent output for ~${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1000)}s; killing pid ${child.pid} and retrying on a fresh session\n`);
      try {
        child.kill("SIGKILL");
      } catch {
        /* best-effort: if the kill races the natural close, close still fires */
      }
    });
    monitorCtl.start();
    const rl = readline.createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      lines.push(line);
      const r = backend.onLine(line);
      if (r.tooLong) sawTooLong = true;
      if (r.transient) sawTransient = true;
      const tools = r.tools ?? [];
      const text = r.text ?? "";
      if (verbose) {
        if (text) {
          process.stderr.write(text);
          liveWrite(text);
          monitorCtl.progress({ kind: "text" });
        }
        for (const t of tools) {
          allTools.push(t);
          liveWrite(`  · ${stamp()} ${t}\n`);
          monitorCtl.progress({ kind: "tool", tool: t });
        }
        return;
      }
      for (const t of tools) {
        // One stamp per tool, used for BOTH the stderr line and the sidecar line, so the
        // per-tool duration rides the stderr line a parallel-lane adapter funnels into the
        // MAIN agent-live.log — not only each lane's isolated sidecar. Compute once.
        const st = stamp();
        process.stderr.write(`  · ${st} ${t}\n`);
        allTools.push(t);
        liveWrite(`  · ${st} ${t}\n`);
        monitorCtl.progress({ kind: "tool", tool: t });
      }
      if (text) {
        lastText = text; // hold for the console; only the final one is printed at close
        allText += (allText ? "\n" : "") + text;
        liveWrite(text.endsWith("\n") ? text : `${text}\n`);
        monitorCtl.progress({ kind: "text" });
      }
      // CRITICAL: do NOT re-arm the silence clock on non-content lines. A stalled stream still
      // dribbles keepalive/ping/system events that fire this handler but carry no text or tool;
      // re-arming on those defeats the timeout. Liveness == the SAME events that advance the sidecar.
    });
    const erl = readline.createInterface({ input: child.stderr! });
    erl.on("line", (line) => {
      // stderr carries the CLI's own error/status prose (not keepalive), so a stderr line IS
      // meaningful activity — re-arm on it.
      monitorCtl.progress({ kind: "text" });
      err += `${line}\n`;
      const r = backend.onStderrLine?.(line);
      if (r?.tooLong) sawTooLong = true;
      if (r?.transient) sawTransient = true;
      process.stderr.write(`${line}\n`); // tee: keep the CLI's own errors visible
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
      // The turn's final assistant text = the outcome. Print it once, after the tool trace.
      if (!verbose && lastText) process.stderr.write(`${lastText}\n`);
      liveWrite(`--- ${new Date().toISOString()} TURN CLOSE code=${code}${lastText ? ` :: ${lastText}` : ""}\n`);
      closeLiveLog();
      try {
        resolve(backend.onClose({ code, lines, allText, lastText, allTools, stalled, sawTooLong, sawTransient, err, cwd }));
      } catch (e) {
        reject(e);
      }
    });
  });
}
