// CopilotStepAgent: a PROTOTYPE StepAgent that backs a step with a GitHub Copilot CLI
// (`copilot -p …`) spawn, as the `kind:"copilot"` catalogue entry — the sibling of
// ClaudeStepAgent (`claude -p --agent <role>`). It proves the executor seam is model/harness
// agnostic: the deterministic orchestrator, gates, and immutable-test TDD loop are untouched;
// only WHO runs each role turn changes.
//
// SCOPE (prototype): the CONTAINED path only — build the `copilot` arg vector from the levers +
// the orchestrator's passed-through instructions, spawn it with cwd = the provided workspace, and
// surface the turn's usage/final-text. It does NOT route through the Claude-specific DriveCommand /
// execRunner live-dispatch seam (that machinery — session warmth, context-budget, replay overlay —
// is the Claude runner's; a production Copilot path would grow its own or generalize execRunner).
//
// Flag mapping (confirmed against `copilot --help`, CLI v1.0.114) — Claude Code → Copilot CLI:
//   claude -p "<task>"                 -> copilot -p "<task>"                 (non-interactive turn)
//   --agent <role>                     -> role SYSTEM PREAMBLE in the prompt body (baseline). Copilot
//                                         also has a native `--agent <name>` loading `.github/agents`
//                                         via `--add-dir`; wiring the role .md -> a Copilot agent def
//                                         is a follow-on (NATIVE_AGENT below is the seam for it).
//   --model <m>                        -> --model <m>                        (per-turn model; Copilot
//                                         can route to Claude/GPT/etc., so the MODEL is still a lever)
//   permission-mode=acceptEdits        -> --allow-all-tools --allow-all-paths (auto-approve edits+shell;
//                                         allow/deny lists below refine it). SAME caveat as Claude: an
//                                         enterprise managed policy can BLOCK allow-all headlessly.
//   --allowed-tools / --disallowed     -> --allow-tool 'shell(npm:*)' | 'write' / --deny-tool 'S(t)'
//   (structured stream)                -> --output-format json              (JSONL lifecycle events)
//   cwd = workspaceDir                 -> spawn cwd = workspaceDir (+ --add-dir to grant file access)
//
// OPEN ITEMS (need a live `copilot -p … --output-format json` run to pin — flagged, not guessed):
//   * EFFORT: Copilot exposes no reasoning-effort knob — dropped for Copilot roles (Claude-only).
//   * USAGE/COST: whether the JSONL carries per-turn tokens/cost is UNCONFIRMED; parseCopilotUsage
//     is tolerant (returns undefined when absent). Until confirmed, the dashboard cost card +
//     Level-2 telemetry degrade for Copilot runs.
//   * EVENT SCHEMA: the exact JSONL event/type names (session_complete / result / usage) are from
//     docs; parseCopilotUsage probes several shapes and must be reconciled to the live schema.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { TurnUsage } from "../../session/claude-usage.js";
import type { StepAgent, AgentInvocation } from "./agent-types.js";
// Type-only (elided at runtime, so no claude-step-agent → claude-runner → copilot-runner cycle).
import type { LiveDispatchFn } from "./claude-step-agent.js";
import { peekLastAgentTranscript } from "../drive/agent-transcript.js";

/** The knobs that start + manage a Copilot turn. Mirrors the Claude levers MINUS effort (no
 *  Copilot equivalent) and the Claude-only session/resume + fallback-model knobs (a prototype
 *  runs fresh, one-shot). All optional except role. */
export interface CopilotLevers {
  /** The role this turn runs as (spec-author, driver, …). Injected as a system preamble (baseline)
   *  or, when nativeAgent is set, passed as Copilot's native `--agent <role>`. */
  role: string;
  /** Which model backs the turn (PROVIDER/MODEL or a short alias Copilot resolves). Omit for the
   *  CLI default (settings.json / provider default). */
  model?: string;
  /** Allow specific tool rules instead of blanket allow-all (e.g. "shell(npm:*)", "write"). When
   *  set, these are emitted as `--allow-tool` and blanket allow-all is NOT. */
  allowedTools?: string[];
  /** Deny specific tools (always wins over allows), e.g. "GitHub(delete_repository)". */
  disallowedTools?: string[];
  /** Use Copilot's native `--agent <role>` (role def loaded from `.github/agents` under agentDir)
   *  instead of the prompt-preamble baseline. Requires agentDir. */
  nativeAgent?: boolean;
  /** Directory whose `.github/agents` + `.github/skills` Copilot should trust (`--add-dir`). */
  agentDir?: string;
}

/** The spawn seam — runs the `copilot` binary and returns the turn's result (usage + final text).
 *  Injectable so the agent is unit-testable with no CLI/cloud. The live implementation is
 *  copilot-runner's spawnCopilotStreaming (injected by the catalogue to avoid an import cycle). */
export type CopilotSpawnFn = (args: string[], cwd: string) => Promise<CopilotTurnResult | undefined>;

export interface CopilotTurnResult {
  usage?: TurnUsage;
  /** The turn's final assistant text (for the fenced ```agent-report channel the orchestrator reads). */
  finalText?: string;
  /** Tool actions in order (names), for the recorded turn transcript. */
  tools?: string[];
}

/** Strip a leading YAML frontmatter block (`---\n…\n---\n`) and return the trimmed body. Line-based so
 *  it is robust to trailing whitespace / `---` dividers inside the body. No frontmatter => the whole
 *  text, trimmed. */
function stripFrontmatter(md: string): string {
  const lines = md.split("\n");
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") return lines.slice(i + 1).join("\n").trim();
    }
  }
  return md.trim();
}

/** The role's FULL agent system prompt — the SAME `.claude/agents/<role>.md` body Claude loads via
 *  `claude --agent <role>` — so a Copilot role turn runs with its real contract, not just a pointer to
 *  it. Best-effort: a missing/unreadable file returns "" and `copilotRoleContract` degrades to the
 *  role-name stub rather than failing the turn. */
function loadRoleAgentBody(workspaceDir: string, role: string): string {
  try {
    return stripFrontmatter(readFileSync(join(workspaceDir, ".claude", "agents", `${role}.md`), "utf8"));
  } catch {
    return "";
  }
}

/**
 * THE COPILOT AGENT INTERFACE — the single, standard way EVERY Copilot role turn is given its role
 * contract, and the exact parallel to Claude's `claude --agent <role>`. Full reference:
 * `consort/orchestrator/agents/COPILOT-AGENT-INTERFACE.md`.
 *
 * Claude Code loads a role's system prompt from `<workspaceDir>/.claude/agents/<role>.md` when spawned
 * with `--agent <role> --setting-sources project`. The GitHub Copilot CLI has NO `--agent` — no way to
 * load a per-invocation system prompt — so Consort inlines that SAME `.md` body (frontmatter stripped)
 * as a preamble on the `-p` prompt. This function IS that inlining, and it is the ONE door it happens
 * at: both call sites funnel through it, so a turn gets byte-identical role binding on every path:
 *   - LIVE drive:        `copilotBaseArgs` (copilot-runner.ts), the production execRunner door.
 *   - CONTAINED / tests: `buildCopilotTask` (this file), the direct-spawn door.
 * It applies to EVERY role through one code path — the role name is the agent-file stem; there is NO
 * per-role special-case. A missing/unreadable `.md` degrades to a NAMED role stub (never a silent
 * empty contract). When `nativeAgent` is set it returns "" (Copilot's own `--agent` then carries the
 * role — the follow-on NATIVE_AGENT seam). The returned preamble ends with a `---` divider; prepend it
 * to the task body.
 */
export function copilotRoleContract(workspaceDir: string, role: string, opts: { nativeAgent?: boolean } = {}): string {
  if (opts.nativeAgent) return "";
  const body = loadRoleAgentBody(workspaceDir, role);
  return body
    ? `You are the "${role}" agent. Your role contract follows; obey it EXACTLY.\n\n${body}\n\n---\n\n`
    : `You are the "${role}" agent. Follow its role contract exactly.\n\n`;
}

/** Assemble the turn's task text: the orchestrator's prompt, a role preamble (baseline for the
 *  absent per-invocation `--agent`), the provided input CONTENTS (so the agent reads them from the
 *  prompt, never the filesystem), then guidelines. Identical input/guideline framing to
 *  ClaudeStepAgent so a role behaves the same regardless of harness. */
export function buildCopilotTask(invocation: AgentInvocation, levers: CopilotLevers): string {
  const { instructions, inputs } = invocation;
  // Role binding goes through the ONE Copilot agent interface — copilotRoleContract — the SAME door the
  // live drive uses (copilotBaseArgs). See its doc block + COPILOT-AGENT-INTERFACE.md.
  const rolePreamble = copilotRoleContract(invocation.workspaceDir, levers.role, { nativeAgent: levers.nativeAgent });
  const inputBlock = Object.keys(inputs).length
    ? `\n\nProvided inputs (read these; do NOT look elsewhere):\n${Object.entries(inputs)
        .map(([id, content]) => `<<INPUT id="${id}">>\n${content}\n<<END INPUT ${id}>>`)
        .join("\n\n")}`
    : "";
  const guidelines = instructions.guidelines?.length
    ? `\n\nGuidelines (follow all):\n${instructions.guidelines.map((g) => `- ${g}`).join("\n")}`
    : "";
  return rolePreamble + instructions.prompt + inputBlock + guidelines;
}

/**
 * Claude per-role / per-turn model aliases → the model ids `ug copilot` (Unity Gateway → Databricks)
 * actually serves. The kit's step manifests AND project `roles.*` config use short Claude aliases
 * (`opus`/`sonnet`/`haiku`); passed verbatim, `ug copilot` rejects them ("Model 'opus' isn't available
 * in ug copilot") and the turn exits empty. This is the ONE chokepoint every model value passes through
 * on its way to `--model` (per-turn manifest, config role, or `--agent-model` override), so the
 * translation lives here — one door. A value already qualified (contains `.` or `/`, e.g.
 * `system.ai.claude-opus-5-5` or `anthropic/claude-sonnet`) passes through untouched; an unknown bare
 * alias also passes through (and will loud-fail at the runner) rather than be silently rewritten.
 */
export const COPILOT_MODEL_ALIASES: Record<string, string> = {
  opus: "system.ai.claude-opus-5-5",
  sonnet: "system.ai.claude-sonnet-5-5",
  haiku: "system.ai.claude-haiku-5-5",
};

export function mapCopilotModel(model: string): string {
  const m = model.trim();
  if (!m || m.includes(".") || m.includes("/")) return m; // already a qualified provider/model id
  return COPILOT_MODEL_ALIASES[m.toLowerCase()] ?? m;
}

/** The full `copilot` arg vector for an invocation. Pure + exported for guarding/tests. */
export function buildCopilotArgs(invocation: AgentInvocation, levers: CopilotLevers): string[] {
  const args: string[] = ["-p", buildCopilotTask(invocation, levers)];
  if (levers.model) args.push("--model", mapCopilotModel(levers.model));
  // Permissioning. Default = acceptEdits-equivalent (auto-approve edits + shell + the paths the
  // workspace needs). An explicit allow-list narrows it instead of blanket allow-all.
  if (levers.allowedTools?.length) {
    for (const t of levers.allowedTools) args.push("--allow-tool", t);
    // Still need path access to write within the workspace when not using allow-all-tools.
    args.push("--add-dir", invocation.workspaceDir);
  } else {
    args.push("--allow-all-tools", "--allow-all-paths");
  }
  for (const t of levers.disallowedTools ?? []) args.push("--deny-tool", t);
  // Native per-role agent (optional): bind the role via Copilot's own --agent + trust its dir.
  if (levers.nativeAgent) {
    args.push("--agent", levers.role);
    if (levers.agentDir) args.push("--add-dir", levers.agentDir);
  }
  // Structured lifecycle events so invoke() can parse usage + the final assistant text.
  args.push("--output-format", "json");
  return args;
}

/** Parse ONE Copilot JSONL line → assistant text + tool names, for the shared streaming engine's
 *  live sidecar (streamed as each line arrives). Same per-event shapes as parseCopilotOutput:
 *  `assistant.message_delta.data.deltaContent` (incremental), `assistant.message.data.content`
 *  (consolidated) + `.toolRequests[].name`, and standalone tool events. A non-JSON / unrecognized
 *  line returns `{}`. Copilot surfaces no prompt-too-long / transient token signals, so neither is set. */
export function parseCopilotLine(line: string): { text?: string; tools?: string[] } {
  const s = line.trim();
  if (!s || s[0] !== "{") return {};
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
  const type = typeof o.type === "string" ? o.type : "";
  const data = o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : {};
  if (type === "assistant.message_delta" && typeof data.deltaContent === "string") return { text: data.deltaContent };
  if (type === "assistant.message") {
    const out: { text?: string; tools?: string[] } = {};
    if (typeof data.content === "string") out.text = data.content;
    if (Array.isArray(data.toolRequests)) {
      const tools = data.toolRequests
        .map((tr) => (tr as Record<string, unknown> | null)?.name ?? (tr as Record<string, unknown> | null)?.tool)
        .filter((n): n is string => typeof n === "string");
      if (tools.length) out.tools = tools;
    }
    return out;
  }
  if (/tool/i.test(type) && type !== "assistant.message") {
    const n = data.name ?? data.tool ?? o.name;
    if (typeof n === "string") return { tools: [n] };
  }
  return {};
}

/** Tolerantly parse a Copilot CLI (`--output-format json`) JSONL stream for the turn's final assistant
 *  text, usage, and tool names. Event shapes are from the live `ug copilot` stream: fields hang off a
 *  nested `data` object; `assistant.message_delta.data.deltaContent` carries incremental text and
 *  `assistant.message.data.content` the consolidated message; the terminal `result` event carries a
 *  top-level `usage` with request/duration units (NOT tokens/cost). A non-JSON line is skipped. */
export function parseCopilotOutput(stdout: string): CopilotTurnResult {
  let usage: TurnUsage | undefined;
  const deltas: string[] = [];
  const tools: string[] = [];
  let finalMessage: string | undefined;
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  for (const line of stdout.split("\n")) {
    const s = line.trim();
    if (!s || s[0] !== "{") continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(s) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = typeof o.type === "string" ? o.type : "";
    const data = o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : {};
    // Assistant text: accumulate the deltas, and prefer the consolidated assistant.message content.
    if (type === "assistant.message_delta" && typeof data.deltaContent === "string") deltas.push(data.deltaContent);
    if (type === "assistant.message") {
      if (typeof data.content === "string") finalMessage = data.content;
      // Tool actions ride on the assistant.message (toolRequests[]); collect their names for the transcript.
      if (Array.isArray(data.toolRequests)) {
        for (const tr of data.toolRequests) {
          const n = (tr as Record<string, unknown> | null)?.name ?? (tr as Record<string, unknown> | null)?.tool;
          if (typeof n === "string") tools.push(n);
        }
      }
    }
    // Defensive: a standalone tool event (type contains "tool"); schema for tool-using turns unconfirmed.
    if (/tool/i.test(type) && type !== "assistant.message") {
      const n = data.name ?? data.tool ?? o.name;
      if (typeof n === "string") tools.push(n);
    }
    // Usage rides on the terminal `result` event's top-level `usage`. Copilot reports request/duration
    // units, NOT tokens or cost — map the wall-clock to durationMs; tokens/cost stay unset (honest 0s).
    if (type === "result") {
      const u = o.usage && typeof o.usage === "object" ? (o.usage as Record<string, unknown>) : undefined;
      if (u) {
        const durationMs = num(u.totalApiDurationMs) ?? num(u.sessionDurationMs);
        usage = { inputTokens: 0, outputTokens: 0, ...(durationMs !== undefined ? { durationMs } : {}) };
      }
    }
  }
  const finalText = finalMessage ?? (deltas.length ? deltas.join("") : undefined);
  return { ...(usage ? { usage } : {}), ...(finalText ? { finalText } : {}), ...(tools.length ? { tools } : {}) };
}

/**
 * The prototype Copilot StepAgent. invoke() builds the arg vector, spawns the CLI with cwd = the
 * provided workspace (so the agent's edits land inside the orchestrator-given dir, never elsewhere),
 * and records the turn's usage + final text on lastResult. Spawn is injected (default: the real
 * copilot runner) so the agent unit-tests without a live call.
 */
export class CopilotStepAgent implements StepAgent {
  private readonly spawn: CopilotSpawnFn;
  lastResult: CopilotTurnResult | undefined;

  private readonly liveDispatch: LiveDispatchFn | undefined;

  constructor(
    private readonly levers: CopilotLevers,
    spawn?: CopilotSpawnFn,
    /** The UNCONTAINED production dispatch seam (parity with ClaudeStepAgent). When supplied (the live
     *  executor-dispatch path), invoke() delegates to it so the turn runs through the SAME execRunner
     *  envelope (session/retry/monitor/transcript) as Claude, routed to the Copilot CLI. When omitted
     *  (tests, integration chains), invoke() takes the contained direct-spawn path. */
    liveDispatch?: LiveDispatchFn,
  ) {
    // Default spawn is a loud stub: the contained path requires an injected CopilotSpawnFn (tests) or
    // the catalogue's spawnCopilotStreaming. The live path uses liveDispatch, not this.
    this.spawn =
      spawn ??
      (async () => {
        throw new Error(
          "CopilotStepAgent: no spawn seam supplied. Inject a CopilotSpawnFn (contained path) or supply " +
            "liveDispatch (the live execRunner path).",
        );
      });
    this.liveDispatch = liveDispatch;
  }

  /** The arg vector this agent will spawn — exported via the pure buildCopilotArgs for guarding. */
  spawnArgs(invocation: AgentInvocation): string[] {
    return buildCopilotArgs(invocation, this.levers);
  }

  async invoke(invocation: AgentInvocation): Promise<void> {
    // UNCONTAINED (live drive): delegate to the production seam — execRunner owns cwd=project, the
    // retry loop, the stall monitor, and transcript recording (routed to the Copilot CLI via the
    // command's executor:"copilot"). Read the turn's final text HERE (peek, don't take: the record
    // wrapper is the sole clearer), so lastResult surfaces identically on both paths.
    if (this.liveDispatch) {
      await this.liveDispatch(invocation);
      const finalText = peekLastAgentTranscript()?.finalText;
      this.lastResult = finalText ? { finalText } : {};
      return;
    }
    const result = await this.spawn(this.spawnArgs(invocation), invocation.workspaceDir);
    this.lastResult = result ?? {};
  }
}
