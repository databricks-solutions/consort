// Coverage for the Copilot↔Claude PARITY refactor: the shared streaming engine driving the copilot
// backend. Proves (1) parseCopilotLine maps the real JSONL per-line shapes, (2) copilotBaseArgs maps
// the model alias + assembles the flag vector, (3) spawnCopilotStreaming (via spawnStreamingTurn)
// streams a LIVE agent-live.log sidecar as the turn runs and returns the parsed result, and (4) a
// non-zero exit rejects a typed CopilotTurnError (transient) so the execRunner envelope retries.
// Uses a tiny real `node -e` process as the "CLI" (deterministic, no network).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCopilotLine } from "../../consort/orchestrator/agents/copilot-step-agent";
import { spawnCopilotStreaming, copilotBaseArgs, CopilotTurnError } from "../../consort/orchestrator/agents/copilot-runner";

describe("parseCopilotLine: one real JSONL line → text/tools", () => {
  it("maps a message_delta to incremental text", () => {
    expect(parseCopilotLine(JSON.stringify({ type: "assistant.message_delta", data: { deltaContent: "hi" } }))).toEqual({ text: "hi" });
  });
  it("maps a consolidated assistant.message to content + tool names", () => {
    const line = JSON.stringify({ type: "assistant.message", data: { content: "done", toolRequests: [{ name: "shell" }, { name: "write" }] } });
    expect(parseCopilotLine(line)).toEqual({ text: "done", tools: ["shell", "write"] });
  });
  it("maps a standalone tool event", () => {
    expect(parseCopilotLine(JSON.stringify({ type: "tool_call", data: { name: "view" } }))).toEqual({ tools: ["view"] });
  });
  it("returns {} for non-JSON / unrecognized lines", () => {
    expect(parseCopilotLine("✔ Unity Gateway connected")).toEqual({});
    expect(parseCopilotLine(JSON.stringify({ type: "session.start", data: {} }))).toEqual({});
  });
});

describe("copilotBaseArgs: model alias mapping + flag vector", () => {
  it("maps a bare alias to the ug id and defaults to allow-all + json", () => {
    const args = copilotBaseArgs({ task: "DO IT", model: "opus" });
    expect(args.slice(0, 2)).toEqual(["-p", "DO IT"]);
    expect(args[args.indexOf("--model") + 1]).toBe("system.ai.claude-opus-5-5");
    expect(args).toContain("--allow-all-tools");
    expect(args).toContain("--allow-all-paths");
    expect(args.join(" ")).toContain("--output-format json");
  });
  it("passes a qualified model id through + narrows with allow/deny tools", () => {
    const args = copilotBaseArgs({ task: "x", model: "system.ai.claude-sonnet-5-5", allowedTools: ["write"], disallowedTools: ["shell(rm)"] });
    expect(args[args.indexOf("--model") + 1]).toBe("system.ai.claude-sonnet-5-5");
    expect(args).not.toContain("--allow-all-tools");
    expect(args.join(" ")).toContain("--allow-tool write");
    expect(args.join(" ")).toContain("--deny-tool shell(rm)");
  });
});

describe("spawnCopilotStreaming over the shared engine (real tiny `node` process)", () => {
  const dirs: string[] = [];
  const priorRecordDir = process.env.LAKEBASE_CONSORT_RECORD_DIR;
  afterEach(() => {
    if (priorRecordDir === undefined) delete process.env.LAKEBASE_CONSORT_RECORD_DIR;
    else process.env.LAKEBASE_CONSORT_RECORD_DIR = priorRecordDir;
    while (dirs.length) {
      try {
        rmSync(dirs.pop()!, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  });
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "copilot-engine-"));
    dirs.push(d);
    return d;
  }

  it("streams a live agent-live.log sidecar AND returns the parsed finalText", async () => {
    const recordDir = tmp();
    process.env.LAKEBASE_CONSORT_RECORD_DIR = recordDir;
    // The fake "copilot": emit a real assistant.message JSONL line, then exit 0.
    const script = `process.stdout.write(JSON.stringify({type:"assistant.message",data:{content:"PONG"}})+"\\n")`;
    const result = await spawnCopilotStreaming(["-p", "ping"], tmp(), () => ({ command: "node", baseArgs: ["-e", script, "--"] }));
    expect(result?.finalText).toBe("PONG");
    // The engine wrote the sidecar LIVE (TURN START at open, TURN CLOSE at close) to RECORD_DIR.
    const live = join(recordDir, "agent-live.log");
    expect(existsSync(live)).toBe(true);
    const body = readFileSync(live, "utf8");
    expect(body).toContain("TURN START role=copilot");
    expect(body).toContain("TURN CLOSE code=0");
  });

  it("rejects a typed CopilotTurnError (transient) on a non-zero exit, for the retry envelope", async () => {
    const script = `process.stderr.write("ERROR Model 'opus' isn't available\\n"); process.exit(1)`;
    await expect(
      spawnCopilotStreaming(["-p", "x"], tmp(), () => ({ command: "node", baseArgs: ["-e", script, "--"] })),
    ).rejects.toSatisfy((e: unknown) => e instanceof CopilotTurnError && e.transient === true);
  });

  it("records a transcript even on a failed turn (so the recorder still writes a clickable turn)", async () => {
    const recordDir = tmp();
    process.env.LAKEBASE_CONSORT_RECORD_DIR = recordDir;
    const script = `process.exit(2)`;
    await expect(
      spawnCopilotStreaming(["-p", "y"], tmp(), () => ({ command: "node", baseArgs: ["-e", script, "--"] })),
    ).rejects.toBeInstanceOf(CopilotTurnError);
    // The sidecar still opened + closed for the failed turn (liveness is unconditional).
    expect(readdirSync(recordDir)).toContain("agent-live.log");
  });
});
