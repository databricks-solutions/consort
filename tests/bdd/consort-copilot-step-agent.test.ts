// Prototype coverage for the `kind:"copilot"` executor — the GitHub Copilot CLI sibling of
// ClaudeStepAgent. Proves the arg-vector mapping (Claude Code flags → copilot flags), the task
// assembly (role preamble + inputs + guidelines), tolerant JSONL usage parsing, catalogue
// registration, and that invoke() surfaces usage via an injected spawn (no live CLI/cloud).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCopilotArgs,
  buildCopilotTask,
  parseCopilotOutput,
  CopilotStepAgent,
  type CopilotLevers,
} from "../../consort/orchestrator/agents/copilot-step-agent";
import { resolveCopilotCommand } from "../../consort/orchestrator/agents/copilot-runner";
import { resolveAgentKind, buildAgent } from "../../consort/orchestrator/agents/agent-catalogue";
import { copilotExecutorSelected, copilotExecutorSpec, copilotModelForTurn } from "../../consort/orchestrator/drive/executor-dispatch";
import { resolveConsortSettings } from "../../consort/orchestrator/settings/project-settings";
import type { StepManifest } from "../../consort/orchestrator/steps/manifest";
import type { AgentInvocation } from "../../consort/orchestrator/agents/agent-types";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

function inv(overrides: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    action: { kind: "invoke-role" } as unknown as AgentInvocation["action"],
    workspaceDir: "/tmp/ws",
    inputs: {},
    instructions: { prompt: "Do the thing." },
    ...overrides,
  };
}

describe("buildCopilotArgs: Claude→Copilot flag mapping", () => {
  it("defaults to acceptEdits-equivalent (allow-all) + JSON output + the prompt", () => {
    const args = buildCopilotArgs(inv(), { role: "driver" });
    expect(args[0]).toBe("-p");
    expect(args).toContain("--allow-all-tools");
    expect(args).toContain("--allow-all-paths");
    expect(args.join(" ")).toContain("--output-format json");
  });

  it("threads --model when a model lever is set", () => {
    const args = buildCopilotArgs(inv(), { role: "driver", model: "anthropic/claude-sonnet" });
    const i = args.indexOf("--model");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe("anthropic/claude-sonnet");
  });

  it("an explicit allow-list narrows instead of allow-all, and grants workspace path access", () => {
    const args = buildCopilotArgs(inv({ workspaceDir: "/tmp/proj" }), {
      role: "driver",
      allowedTools: ["write", "shell(npm:*)"],
      disallowedTools: ["GitHub(delete_repository)"],
    });
    expect(args).not.toContain("--allow-all-tools");
    expect(args.filter((a) => a === "--allow-tool")).toHaveLength(2);
    expect(args.join(" ")).toContain("--allow-tool shell(npm:*)");
    expect(args.join(" ")).toContain("--deny-tool GitHub(delete_repository)");
    expect(args.join(" ")).toContain("--add-dir /tmp/proj"); // path access without allow-all-paths
  });

  it("nativeAgent binds the role via --agent + --add-dir (and drops the prompt preamble)", () => {
    const levers: CopilotLevers = { role: "spec-author", nativeAgent: true, agentDir: "/kit" };
    const args = buildCopilotArgs(inv(), levers);
    expect(args.join(" ")).toContain("--agent spec-author");
    expect(args.join(" ")).toContain("--add-dir /kit");
    expect(buildCopilotTask(inv(), levers)).not.toContain("You are the");
  });
});

describe("buildCopilotTask: role preamble + embedded inputs + guidelines", () => {
  it("prepends a role preamble (baseline for the absent per-invocation --agent) and embeds inputs", () => {
    const task = buildCopilotTask(
      inv({ inputs: { spec: "SPEC-BODY" }, instructions: { prompt: "Build it.", guidelines: ["be terse"] } }),
      { role: "driver" },
    );
    expect(task).toContain('You are the "driver" agent');
    expect(task).toContain("Build it.");
    expect(task).toContain('<<INPUT id="spec">>\nSPEC-BODY');
    expect(task).toContain("- be terse");
  });
});

describe("buildCopilotTask: injects the role's FULL .claude/agents/<role>.md body (parity with claude --agent)", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) { try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } } });
  // A workspace whose contained .claude/agents/<role>.md carries YAML frontmatter + a marked body —
  // exactly the shape Claude loads via `--agent <role>`.
  function wsWithAgent(role: string, body: string): string {
    const dir = mkdtempSync(join(tmpdir(), "copilot-agentbody-"));
    dirs.push(dir);
    mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
    writeFileSync(join(dir, ".claude", "agents", `${role}.md`), `---\nname: ${role}\ndescription: the ${role}\n---\n\n${body}\n`);
    return dir;
  }

  it("injects the agent body (frontmatter stripped) for the role, not just a pointer to it", () => {
    const ws = wsWithAgent("dba", "DBA-CONTRACT: db-design.json has EXACTLY {tables,relationships}.");
    const task = buildCopilotTask(inv({ workspaceDir: ws, instructions: { prompt: "Design the schema." } }), { role: "dba" });
    expect(task).toContain('You are the "dba" agent');
    expect(task).toContain("DBA-CONTRACT: db-design.json has EXACTLY {tables,relationships}.");
    expect(task).not.toContain("name: dba"); // frontmatter is stripped, not pasted
    expect(task).not.toContain("description: the dba");
    expect(task).toContain("Design the schema."); // the orchestrator prompt still follows
  });

  it("is role-GENERIC: the same code path injects whichever role's body (one path, no per-role special-case)", () => {
    const wsSpec = wsWithAgent("spec-author", "SPEC-AUTHOR-MARKER: write acceptance criteria.");
    const wsNav = wsWithAgent("navigator", "NAVIGATOR-MARKER: flag the cross-feature refactor.");
    expect(buildCopilotTask(inv({ workspaceDir: wsSpec }), { role: "spec-author" })).toContain("SPEC-AUTHOR-MARKER: write acceptance criteria.");
    expect(buildCopilotTask(inv({ workspaceDir: wsNav }), { role: "navigator" })).toContain("NAVIGATOR-MARKER: flag the cross-feature refactor.");
  });

  it("falls back to the role-name stub when the agent .md is missing/unreadable (best-effort, never fails the turn)", () => {
    const task = buildCopilotTask(inv({ workspaceDir: "/tmp/no-such-ws", instructions: { prompt: "Go." } }), { role: "driver" });
    expect(task).toContain('You are the "driver" agent. Follow its role contract exactly.');
    expect(task).toContain("Go.");
  });

  it("does NOT inject the body on the nativeAgent path (Copilot's own --agent carries the role)", () => {
    const ws = wsWithAgent("dba", "DBA-CONTRACT-SHOULD-NOT-APPEAR");
    const task = buildCopilotTask(inv({ workspaceDir: ws }), { role: "dba", nativeAgent: true, agentDir: "/kit" });
    expect(task).not.toContain("DBA-CONTRACT-SHOULD-NOT-APPEAR");
    expect(task).not.toContain("You are the");
  });
});

describe("parseCopilotOutput: real `ug copilot --output-format json` schema", () => {
  it("prefers the consolidated assistant.message content + maps result wall-clock to durationMs, skipping noise", () => {
    // Shapes captured from a live `ug copilot -p … --output-format json` stream (fields under `data`).
    const jsonl = [
      "✔ Unity Gateway connected", // non-JSON launcher noise is skipped
      JSON.stringify({ type: "session.start", data: { selectedModel: "system.ai.claude-sonnet-5-5" } }),
      JSON.stringify({ type: "assistant.message_delta", data: { deltaContent: "Hello " } }),
      JSON.stringify({ type: "assistant.message_delta", data: { deltaContent: "world" } }),
      JSON.stringify({ type: "assistant.message", data: { content: "Hello world", model: "system.ai.claude-sonnet-5-5", toolRequests: [] } }),
      JSON.stringify({ type: "result", exitCode: 0, usage: { premiumRequests: 0, totalApiDurationMs: 891, sessionDurationMs: 2075 } }),
    ].join("\n");
    const r = parseCopilotOutput(jsonl);
    expect(r.finalText).toBe("Hello world");
    // Copilot reports no tokens/cost — honest 0s + the wall-clock (prefers totalApiDurationMs).
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0, durationMs: 891 });
  });

  it("falls back to concatenated deltas when no consolidated assistant.message arrives", () => {
    const jsonl = [
      JSON.stringify({ type: "assistant.message_delta", data: { deltaContent: "par" } }),
      JSON.stringify({ type: "assistant.message_delta", data: { deltaContent: "tial" } }),
    ].join("\n");
    expect(parseCopilotOutput(jsonl).finalText).toBe("partial");
  });

  it("degrades to {} when the stream carries no message or result", () => {
    expect(parseCopilotOutput('not json\n{"type":"session.start","data":{}}\n')).toEqual({});
  });

  it("collects tool-request names (in order) from the assistant.message for the recorded transcript", () => {
    const jsonl = [
      JSON.stringify({ type: "assistant.message", data: { content: "ok", toolRequests: [{ name: "shell" }, { name: "write" }] } }),
    ].join("\n");
    const r = parseCopilotOutput(jsonl);
    expect(r.tools).toEqual(["shell", "write"]);
    expect(r.finalText).toBe("ok");
  });
});

describe("mapCopilotModel: Claude alias → ug (Databricks) model id", () => {
  it("maps bare opus/sonnet to the ug system.ai ids via buildCopilotArgs", () => {
    const opus = buildCopilotArgs(inv(), { role: "product-owner", model: "opus" });
    expect(opus[opus.indexOf("--model") + 1]).toBe("system.ai.claude-opus-5-5");
    const sonnet = buildCopilotArgs(inv(), { role: "driver", model: "sonnet" });
    expect(sonnet[sonnet.indexOf("--model") + 1]).toBe("system.ai.claude-sonnet-5-5");
  });
  it("passes an already-qualified model id through unmapped", () => {
    const args = buildCopilotArgs(inv(), { role: "driver", model: "system.ai.claude-sonnet-5-5" });
    expect(args[args.indexOf("--model") + 1]).toBe("system.ai.claude-sonnet-5-5");
  });
});

describe("agent-catalogue: kind:'copilot'", () => {
  it("is a registered kind", () => {
    expect(resolveAgentKind("copilot").description).toMatch(/Copilot/i);
  });

  it("builds a CopilotStepAgent from a manifest spec", () => {
    const agent = buildAgent({ kind: "copilot", config: { role: "driver" } }, { workspaceDir: "/tmp/ws" });
    expect(agent).toBeInstanceOf(CopilotStepAgent);
  });

  it("throws loud when config.role is missing", () => {
    expect(() => buildAgent({ kind: "copilot", config: {} }, { workspaceDir: "/tmp/ws" })).toThrowError(/requires config\.role/);
  });
});

describe("CopilotStepAgent.invoke", () => {
  it("spawns with cwd=workspace and surfaces the turn usage", async () => {
    let seen: { args: string[]; cwd: string } | undefined;
    const agent = new CopilotStepAgent({ role: "driver" }, async (args, cwd) => {
      seen = { args, cwd };
      return { usage: { inputTokens: 10, outputTokens: 5 }, finalText: "done" };
    });
    await agent.invoke(inv({ workspaceDir: "/tmp/proj" }));
    expect(seen?.cwd).toBe("/tmp/proj");
    expect(seen?.args[0]).toBe("-p");
    expect(agent.lastResult?.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(agent.lastResult?.finalText).toBe("done");
  });

  it("throws loud when invoked with no spawn seam wired (prototype stub)", async () => {
    await expect(new CopilotStepAgent({ role: "driver" }).invoke(inv())).rejects.toThrowError(/no spawn seam/);
  });
});

describe("resolveCopilotCommand: standalone copilot / Unity Gateway `ug` / gh shim", () => {
  it("honors a CONSORT_COPILOT_BIN-style override (e.g. 'ug copilot')", () => {
    expect(resolveCopilotCommand({ binOverride: "ug copilot" })).toEqual({ command: "ug", baseArgs: ["copilot"] });
    expect(resolveCopilotCommand({ binOverride: "gh copilot --" })).toEqual({ command: "gh", baseArgs: ["copilot", "--"] });
  });
  it("uses standalone `copilot` when it is the only Copilot binary present", () => {
    expect(resolveCopilotCommand({ has: (b) => b === "copilot" })).toEqual({ command: "copilot", baseArgs: [] });
  });
  it("uses `ug copilot` (Unity Gateway) when only `ug` is present", () => {
    expect(resolveCopilotCommand({ has: (b) => b === "ug" })).toEqual({ command: "ug", baseArgs: ["copilot"] });
  });
  it("prefers `ug copilot` OVER a native `copilot` when BOTH are present (native is policy-blocked where `ug` lives)", () => {
    expect(resolveCopilotCommand({ has: (b) => b === "ug" || b === "copilot" })).toEqual({ command: "ug", baseArgs: ["copilot"] });
  });
  it("falls back to `gh copilot --` when neither is present", () => {
    expect(resolveCopilotCommand({ has: () => false })).toEqual({ command: "gh", baseArgs: ["copilot", "--"] });
  });
});

describe("copilot executor selection (ONE door: project.executor in consort-config.json, no env)", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) { try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } } });
  function projectWith(executor?: string): string {
    const dir = mkdtempSync(join(tmpdir(), "consort-exec-"));
    dirs.push(dir);
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(join(dir, ".lakebase", "consort-config.json"), JSON.stringify(executor ? { project: { executor } } : {}));
    return dir;
  }
  it("copilotExecutorSelected is true ONLY when project.executor === copilot", () => {
    expect(copilotExecutorSelected(projectWith("copilot"))).toBe(true);
    expect(copilotExecutorSelected(projectWith("claude"))).toBe(false);
    expect(copilotExecutorSelected(projectWith(undefined))).toBe(false); // default = claude
  });
  it("copilotExecutorSpec remaps a claude manifest spec to copilot, carrying role + model", () => {
    const manifest = { agent: { kind: "claude", config: { role: "driver" } }, agentOptions: { model: "anthropic/claude-sonnet" } } as unknown as StepManifest;
    expect(copilotExecutorSpec(manifest)).toEqual({ kind: "copilot", config: { role: "driver", model: "anthropic/claude-sonnet" } });
  });
  it("copilotExecutorSpec omits model when the manifest declares none", () => {
    const manifest = { agent: { kind: "claude", config: { role: "spec-author" } } } as unknown as StepManifest;
    expect(copilotExecutorSpec(manifest)).toEqual({ kind: "copilot", config: { role: "spec-author" } });
  });
  it("copilotExecutorSpec uses the resolved model (the ONE door) OVER the manifest's own agentOptions", () => {
    const manifest = { agent: { kind: "claude", config: { role: "driver" } }, agentOptions: { model: "sonnet" } } as unknown as StepManifest;
    // The caller threads the resolver's answer; it wins over the manifest default.
    expect(copilotExecutorSpec(manifest, "opus")).toEqual({ kind: "copilot", config: { role: "driver", model: "opus" } });
  });
});

// REGRESSION GUARD for the Copilot project-override gap: copilotExecutorSpec was a pure manifest
// remap that never consulted resolveConsortSettings, so a Copilot project silently ignored EVERY
// project model override (per-role AND per-step-type). copilotModelForTurn routes the remap's model
// through the SAME door the claude runner uses (resolveConsortSettings.modelFor keyed by role+TurnKey)
// — so the per-step-type override that already lives in consort-config.json roles.<role>.model (a
// TurnKey map) reaches BOTH executors identically, with no new config shape.
describe("copilotModelForTurn: a project's model override reaches the Copilot executor (ONE door)", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } });
  function projectWithConfig(config: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "copilot-model-"));
    dirs.push(dir);
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(join(dir, ".lakebase", "consort-config.json"), JSON.stringify(config));
    return dir;
  }
  // A driver manifest + its plain build turn (turnKeyForAction => "green").
  const driverManifest = { agent: { kind: "claude", config: { role: "driver" } }, agentOptions: { model: "sonnet" } } as unknown as StepManifest;
  const greenAction = { kind: "invoke-role", role: "driver" } as unknown as WorkflowAction;

  it("a per-ROLE scalar override reaches the Copilot model (wins for every turn)", () => {
    const dir = projectWithConfig({ project: { executor: "copilot" }, roles: { driver: { model: "opus" } } });
    expect(copilotModelForTurn(driverManifest, greenAction, dir)).toBe("opus");
  });

  it("a per-STEP-TYPE override (roles.<role>.model keyed by TurnKey) reaches the Copilot model for the step it names", () => {
    const dir = projectWithConfig({ project: { executor: "copilot" }, roles: { driver: { model: { green: "haiku" } } } });
    expect(copilotModelForTurn(driverManifest, greenAction, dir)).toBe("haiku"); // the "green" step
    // An UNmapped step (driver REFACTOR) does NOT pick up the "green" override — proves per-step keying.
    const refactorAction = { kind: "invoke-role", role: "driver", buildMode: "refactor" } as unknown as WorkflowAction;
    expect(copilotModelForTurn(driverManifest, refactorAction, dir)).not.toBe("haiku");
  });

  it("resolves BYTE-IDENTICALLY to the claude door (resolveConsortSettings.modelFor) — one door, both executors", () => {
    const dir = projectWithConfig({ project: { executor: "copilot" }, roles: { "spec-author": { model: { breakdown: "opus" } } } });
    const breakdownManifest = { agent: { kind: "claude", config: { role: "spec-author" } } } as unknown as StepManifest;
    const breakdownAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" } as unknown as WorkflowAction;
    const claudeDoor = resolveConsortSettings({ projectDir: dir }).modelFor("spec-author", "breakdown");
    expect(copilotModelForTurn(breakdownManifest, breakdownAction, dir)).toBe(claudeDoor);
    expect(claudeDoor).toBe("opus"); // and the project's per-step override is what both see
  });

  it("returns undefined when the manifest declares no role (copilotExecutorSpec keeps its manifest fallback)", () => {
    const dir = projectWithConfig({ project: { executor: "copilot" } });
    const roleless = { agent: { kind: "claude", config: {} } } as unknown as StepManifest;
    expect(copilotModelForTurn(roleless, greenAction, dir)).toBeUndefined();
  });
});
