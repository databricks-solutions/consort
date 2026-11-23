// Coverage for the Copilot↔Claude PARITY refactor: the shared streaming engine driving the copilot
// backend. Proves (1) parseCopilotLine maps the real JSONL per-line shapes, (2) copilotBaseArgs maps
// the model alias + assembles the flag vector, (3) spawnCopilotStreaming (via spawnStreamingTurn)
// streams a LIVE agent-live.log sidecar as the turn runs and returns the parsed result, and (4) a
// non-zero exit rejects a typed CopilotTurnError (transient) so the execRunner envelope retries.
// Uses a tiny real `node -e` process as the "CLI" (deterministic, no network).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCopilotLine, buildCopilotTask, copilotRoleContract } from "../../consort/orchestrator/agents/copilot-step-agent";
import { spawnCopilotStreaming, copilotBaseArgs, CopilotTurnError } from "../../consort/orchestrator/agents/copilot-runner";

/** A temp project workspace carrying a role agent md at .claude/agents/<role>.md. */
function workspaceWithAgent(role: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "copilot-iface-"));
  mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
  writeFileSync(join(dir, ".claude", "agents", `${role}.md`), `---\nname: ${role}\n---\n${body}\n`);
  return dir;
}

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
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } });

  it("maps a bare alias to the ug id and defaults to allow-all + json", () => {
    const dir = workspaceWithAgent("driver", "DRIVER CONTRACT BODY"); dirs.push(dir);
    const args = copilotBaseArgs({ task: "DO IT", role: "driver", model: "opus" }, dir);
    expect(args[0]).toBe("-p");
    expect(args[args.indexOf("--model") + 1]).toBe("system.ai.claude-opus-5-5");
    expect(args).toContain("--allow-all-tools");
    expect(args).toContain("--allow-all-paths");
    expect(args.join(" ")).toContain("--output-format json");
  });
  it("passes a qualified model id through + narrows with allow/deny tools", () => {
    const dir = workspaceWithAgent("dba", "DBA CONTRACT"); dirs.push(dir);
    const args = copilotBaseArgs({ task: "x", role: "dba", model: "system.ai.claude-sonnet-5-5", allowedTools: ["write"], disallowedTools: ["shell(rm)"] }, dir);
    expect(args[args.indexOf("--model") + 1]).toBe("system.ai.claude-sonnet-5-5");
    expect(args).not.toContain("--allow-all-tools");
    expect(args.join(" ")).toContain("--allow-tool write");
    expect(args.join(" ")).toContain("--deny-tool shell(rm)");
  });
});

// REGRESSION GUARD for the live-path agent-contract bug: the live drive uses copilotBaseArgs (NOT
// buildCopilotTask), so the role's .claude/agents/<role>.md MUST be injected THERE. This is the test
// that was missing when the body-injection shipped only in the contained door.
describe("Copilot agent interface: the role .md contract reaches the LIVE door (copilotBaseArgs)", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } });

  it("copilotBaseArgs PREPENDS the role's .claude/agents/<role>.md body to the -p prompt", () => {
    const dir = workspaceWithAgent("spec-author", "WRITE the As a / I want / So that narrative"); dirs.push(dir);
    const prompt = copilotBaseArgs({ task: "Break down F1.", role: "spec-author" }, dir)[1];
    expect(prompt).toContain('You are the "spec-author" agent');
    expect(prompt).toContain("WRITE the As a / I want / So that narrative"); // the real contract body
    expect(prompt).toContain("Break down F1."); // task preserved, after the contract
    expect(prompt.indexOf("WRITE the As a")).toBeLessThan(prompt.indexOf("Break down F1.")); // contract FIRST
  });

  it("a missing agent md degrades to a NAMED stub, never a silent empty contract", () => {
    const dir = mkdtempSync(join(tmpdir(), "copilot-iface-")); dirs.push(dir);
    const prompt = copilotBaseArgs({ task: "t", role: "navigator" }, dir)[1];
    expect(prompt).toContain('You are the "navigator" agent');
    expect(prompt).toContain("t");
  });

  it("ONE INTERFACE: the LIVE door (copilotBaseArgs) and the CONTAINED door (buildCopilotTask) inject the IDENTICAL contract", () => {
    const dir = workspaceWithAgent("architect-reviewer", "ARCHITECT CANON XYZ"); dirs.push(dir);
    const contract = copilotRoleContract(dir, "architect-reviewer");
    const live = copilotBaseArgs({ task: "TASK", role: "architect-reviewer" }, dir)[1];
    const contained = buildCopilotTask(
      {
        action: { kind: "invoke-role" } as unknown as import("../../consort/orchestrator/agents/agent-types").AgentInvocation["action"],
        workspaceDir: dir,
        instructions: { prompt: "TASK" },
        inputs: {},
      },
      { role: "architect-reviewer" },
    );
    expect(contract).toContain("ARCHITECT CANON XYZ");
    expect(live.startsWith(contract)).toBe(true);
    expect(contained.startsWith(contract)).toBe(true);
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
