// copilot-runner: the LIVE spawn seam for the `kind:"copilot"` executor — the GitHub Copilot CLI
// sibling of claude-runner's spawnClaudeStreaming. Resolves WHICH binary form to run (standalone
// `copilot`, Databricks' Unity Gateway `ug copilot`, or `gh copilot --`), spawns it with the turn's
// arg vector + cwd, captures the JSONL stream, and returns the parsed usage + final text.
//
// Binary resolution order (first match wins):
//   1. CONSORT_COPILOT_BIN override — a full command, e.g. "ug copilot" or "gh copilot --".
//      (In a Databricks env the GitHub-hosted CLI is policy-blocked; set CONSORT_COPILOT_BIN="ug copilot"
//       to route through Unity Gateway to Databricks models.)
//   2. `ug` on PATH (Unity Gateway)        -> `ug copilot …`
//   3. standalone `copilot` on PATH        -> `copilot …`
//   4. fallback                            -> `gh copilot -- …`  (the gh extension shim)
//
// Why `ug` is preferred OVER a native `copilot` (and not the other way round): `ug` only exists on a
// Databricks machine (installed via `uv tool install … unity-gateway`), and on exactly those machines the
// GitHub-hosted `copilot` is policy-blocked (403 "not authorized to use this Copilot feature"). So when BOTH
// are present, the native `copilot` is the broken one and `ug copilot` is the working route — auto-picking
// `copilot` first would deterministically select the blocked binary. A customer with an entitled native
// `copilot` has no `ug`, so they still get `copilot`; the rare "I have `ug` but want native" case uses the
// CONSORT_COPILOT_BIN override.
//
// Isolated to its own module so copilot-step-agent.ts stays import-cycle-free: the agent keeps a
// loud-stub default spawn and the catalogue (agent-catalogue.ts) injects spawnCopilotStreaming — so
// this runner imports the agent's pure parser, never the reverse.

import { spawnSync } from "node:child_process";
import { parseCopilotOutput, parseCopilotLine, mapCopilotModel, type CopilotTurnResult } from "./copilot-step-agent.js";
import { recordAgentTranscript, type TurnTranscript } from "../drive/agent-transcript.js";
import { spawnStreamingTurn, type StreamBackend } from "../drive/streaming-turn.js";
import { type TurnMonitor } from "../turns/turn-monitor.js";

export interface CopilotCommand {
  command: string;
  /** Leading args BEFORE the copilot arg vector (e.g. ["copilot"] for `ug`, ["copilot","--"] for `gh`). */
  baseArgs: string[];
}

/** Is a bare binary resolvable on PATH? POSIX `command -v`; Windows `where`. Best-effort (false on error). */
function onPath(bin: string): boolean {
  try {
    const r =
      process.platform === "win32"
        ? spawnSync("where", [bin], { stdio: "ignore" })
        : spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Resolve the Copilot CLI invocation for this machine. Pure given its opts (probes are injectable so
 * the resolver unit-tests without a real PATH): `binOverride` wins; else prefer `ug copilot` (Unity
 * Gateway) when `ug` is present — see the header note on why it beats a native `copilot` — then the
 * standalone `copilot`, then `gh copilot --`.
 */
export function resolveCopilotCommand(
  opts: { binOverride?: string; has?: (bin: string) => boolean } = {},
): CopilotCommand {
  const override = (opts.binOverride ?? process.env.CONSORT_COPILOT_BIN ?? "").trim();
  if (override) {
    const parts = override.split(/\s+/);
    return { command: parts[0], baseArgs: parts.slice(1) };
  }
  const has = opts.has ?? onPath;
  if (has("ug")) return { command: "ug", baseArgs: ["copilot"] };
  if (has("copilot")) return { command: "copilot", baseArgs: [] };
  return { command: "gh", baseArgs: ["copilot", "--"] };
}

/**
 * Build the copilot CLI arg vector (the `-p …` part; the binary + its leading args are resolved by
 * spawnCopilotStreaming) from a drive command — the execRunner-envelope sibling of claude's
 * claudeBaseArgs. Mirrors buildCopilotArgs' flag assembly: the model alias is mapped to the ug/
 * Databricks id here (one door), acceptEdits-equivalent allow-all by default (else an explicit
 * allow-/deny-tool list), and structured `--output-format json` so the stream parses.
 */
export function copilotBaseArgs(cmd: { task: string; model?: string; allowedTools?: string[]; disallowedTools?: string[] }): string[] {
  const args: string[] = ["-p", cmd.task];
  if (cmd.model) args.push("--model", mapCopilotModel(cmd.model));
  if (cmd.allowedTools?.length) {
    for (const t of cmd.allowedTools) args.push("--allow-tool", t);
  } else {
    args.push("--allow-all-tools", "--allow-all-paths");
  }
  for (const t of cmd.disallowedTools ?? []) args.push("--deny-tool", t);
  args.push("--output-format", "json");
  return args;
}

/** A typed copilot turn failure, mirroring ClaudeTurnError. Copilot surfaces no prompt-too-long token
 *  signal, so only `transient`/`stalled`; execRunner catches it to retry the turn on a fresh session. */
export class CopilotTurnError extends Error {
  constructor(
    message: string,
    readonly transient = false,
    readonly stalled = false,
  ) {
    super(message);
    this.name = "CopilotTurnError";
  }
}

/**
 * Spawn a Copilot turn via the SHARED streaming engine (spawnStreamingTurn) — the same engine the
 * Claude runner uses, so Copilot gets identical liveness: the agent-live.log sidecar streamed as each
 * JSONL line arrives, the inactivity/heartbeat monitor + tree-kill on a stall, and the stderr tee.
 * This backend supplies only the Copilot-specific parts: binary resolution (`resolveCopilotCommand`),
 * per-line parsing (`parseCopilotLine`), and the close semantics — the loud `[copilot] turn FAILED`
 * diagnostic, transcript recording, usage via `parseCopilotOutput`, and a `CopilotTurnError` throw on
 * a stall / non-zero exit so the execRunner envelope retries (an exit-0 empty turn resolves, as before).
 */
export function spawnCopilotStreaming(
  copilotArgs: string[],
  cwd: string,
  resolve: () => CopilotCommand = resolveCopilotCommand,
  monitorOverride?: TurnMonitor,
): Promise<CopilotTurnResult | undefined> {
  const { command, baseArgs } = resolve();
  const pIdx = copilotArgs.indexOf("-p");
  const prompt = pIdx >= 0 && pIdx + 1 < copilotArgs.length ? copilotArgs[pIdx + 1] : "";
  const backend: StreamBackend<CopilotTurnResult | undefined> = {
    target: { command, args: [...baseArgs, ...copilotArgs] },
    header: { role: "copilot", task: prompt },
    onLine: (line) => parseCopilotLine(line),
    onClose: (ctx) => {
      const result = parseCopilotOutput(ctx.lines.join("\n"));
      // LOUD failure diagnostic: a non-zero exit, or an empty parse with stderr present, is a real turn
      // failure — surface the cause (bad model id, auth 403, …) instead of a silently-empty turn.
      const emptyResult = !result || (!result.finalText && !result.usage && !(result.tools && result.tools.length));
      if ((ctx.code ?? 0) !== 0 || (emptyResult && ctx.err.trim())) {
        const tail = ctx.err.trim().split("\n").slice(-6).join("\n");
        process.stderr.write(
          `[copilot] turn FAILED via \`${[command, ...baseArgs].join(" ")}\` (exit ${ctx.code ?? "?"})${tail ? `:\n${tail}` : " — no stderr captured"}\n`,
        );
      }
      // Record the transcript into the shared sink so the executor's recorder writes a CLICKABLE turn.
      const tx: TurnTranscript = { prompt, finalText: result?.finalText ?? "", tools: result?.tools ?? [] };
      try {
        recordAgentTranscript(cwd, tx);
      } catch {
        /* best-effort: a transcript-record failure must not fail the turn */
      }
      // Retry parity with the Claude path: a stall or a non-zero exit re-runs via the execRunner envelope
      // (fresh session). An exit-0 empty turn resolves (logged above), matching the prior contained behavior.
      if (ctx.stalled) throw new CopilotTurnError(`copilot turn stalled (inactivity timeout); killed for retry`, true, true);
      if ((ctx.code ?? 0) !== 0) throw new CopilotTurnError(`copilot exited ${ctx.code}`, true, false);
      return result;
    },
  };
  return spawnStreamingTurn(backend, cwd, monitorOverride);
}
