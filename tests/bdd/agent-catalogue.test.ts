// agent-catalogue: the catalogue of concrete StepAgent kinds a user can assemble into a
// manifest by NAME. A manifest declares `agent: { kind, config }`; the runner resolves the
// kind against this catalogue and builds the agent from `config` + a build CONTEXT (the
// env: corpus root, kit dir, workspace – NOT part of the manifest). This decouples "which
// agent" from any script – no hardcoded agentFor.
//
// Kinds: "claude" (the real live-spawn agent), "replay" (emits recorded artifacts), "mock"
// (a test double writing configured fixtures). resolveAgentKind throws loud on an unknown
// kind (a manifest typo is a hard failure, never a silent default).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  AGENT_CATALOGUE,
  resolveAgentKind,
  buildAgent,
  type AgentBuildContext,
} from "../../consort/orchestrator/agents/agent-catalogue";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

let ws: string;
let corpus: string;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "agent-cat-ws-"));
  corpus = mkdtempSync(join(tmpdir(), "agent-cat-corpus-"));
});
afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
  rmSync(corpus, { recursive: true, force: true });
});

const ACTION: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };

function ctx(over: Partial<AgentBuildContext> = {}): AgentBuildContext {
  return { workspaceDir: ws, corpusRoot: corpus, kitDir: process.cwd(), ...over };
}

describe("agent-catalogue: the catalogue is a named, documented set of StepAgent kinds", () => {
  it("catalogues claude, copilot, replay, and mock – each with a description + config summary", () => {
    const kinds = Object.keys(AGENT_CATALOGUE).sort();
    expect(kinds).toEqual(["claude", "copilot", "mock", "replay"]);
    for (const k of kinds) {
      expect(AGENT_CATALOGUE[k].description.length).toBeGreaterThan(0);
      expect(typeof AGENT_CATALOGUE[k].build).toBe("function");
    }
  });

  it("resolveAgentKind THROWS loud on an unknown kind (a manifest typo is not a silent skip)", () => {
    expect(() => resolveAgentKind("noSuchKind")).toThrow(/noSuchKind|unknown|not.*catalogue/i);
  });

  it("resolveAgentKind returns the catalogue entry for a known kind", () => {
    expect(resolveAgentKind("claude")).toBe(AGENT_CATALOGUE.claude);
  });
});

describe("agent-catalogue: buildAgent assembles a StepAgent from kind + config + context", () => {
  it("kind:mock builds an agent that writes the configured fixture outputs into the workspace", async () => {
    const agent = buildAgent({ kind: "mock", config: { outputs: { "feature-spec.json": '{"ok":true}' } } }, ctx());
    await agent.invoke({ action: ACTION, workspaceDir: ws, inputs: {}, instructions: { prompt: "p" } });
    expect(existsSync(join(ws, "feature-spec.json"))).toBe(true);
    expect(readFileSync(join(ws, "feature-spec.json"), "utf8")).toBe('{"ok":true}');
  });

  it("kind:replay builds a corpus-reading agent that copies the configured recorded seeds", async () => {
    // A recorded seed file lives under the corpus root.
    writeFileSync(join(corpus, "product-overview.md"), "# Overview\nrecorded.\n");
    const agent = buildAgent(
      { kind: "replay", config: { role: "product-owner", seeds: [{ outputId: "product-overview", from: "product-overview.md", to: "product-overview.md" }] } },
      ctx(),
    );
    await agent.invoke({ action: ACTION, workspaceDir: ws, inputs: {}, instructions: { prompt: "p" } });
    expect(readFileSync(join(ws, "product-overview.md"), "utf8")).toBe("# Overview\nrecorded.\n");
    // and it logged an authoring event (so the manifest's log validator passes).
    expect(existsSync(join(ws, "agent-log.jsonl"))).toBe(true);
  });

  it("kind:claude builds a ClaudeStepAgent from the config levers – WITHOUT spawning here", () => {
    // We only assert construction + that its buildCommand reflects the configured levers;
    // no live spawn in a hermetic test.
    const agent = buildAgent({ kind: "claude", config: { role: "spec-author", model: "sonnet", effort: "low", session: "fresh" } }, ctx()) as {
      buildCommand?: (inv: unknown) => { role: string; model: string; effort?: string };
    };
    expect(typeof agent.buildCommand).toBe("function");
    const cmd = agent.buildCommand!({ action: { kind: "invoke-role", role: "spec-author", mode: "breakdown" }, workspaceDir: ws, inputs: {}, instructions: { prompt: "Break it down" } });
    expect(cmd.role).toBe("spec-author");
    expect(cmd.model).toBe("sonnet");
    expect(cmd.effort).toBe("low");
  });

  it("buildAgent THROWS loud on an unknown kind", () => {
    expect(() => buildAgent({ kind: "bogus", config: {} }, ctx())).toThrow(/bogus|unknown|not.*catalogue/i);
  });

  it("kind:claude with context.liveDispatch takes the LIVE path (delegates to the seam, no raw spawn)", async () => {
    // The LIVE drive supplies context.liveDispatch; buildClaude must pass it as the agent's third
    // ctor arg so invoke() delegates to the production seam instead of spawning claude. This is the
    // Stage A seam that lets the live drive resolve its agent from `manifest.agent` (same as tests).
    let seamCalls = 0;
    const liveDispatch = async () => {
      seamCalls++;
    };
    const agent = buildAgent({ kind: "claude", config: { role: "spec-author" } }, ctx({ liveDispatch }));
    await agent.invoke({ action: ACTION, workspaceDir: ws, inputs: {}, instructions: { prompt: "p" } });
    expect(seamCalls).toBe(1);
  });

  it("kind:claude WITHOUT context.liveDispatch stays on the CONTAINED path (byte-identical to before)", () => {
    // No liveDispatch => the contained raw-spawn agent, exactly as every current caller builds it.
    // We assert construction + a buildCommand reflecting the levers (no spawn in a hermetic test).
    const agent = buildAgent({ kind: "claude", config: { role: "spec-author", model: "sonnet" } }, ctx()) as {
      buildCommand?: (inv: unknown) => { role: string };
    };
    expect(typeof agent.buildCommand).toBe("function");
    expect(agent.buildCommand!({ action: ACTION, workspaceDir: ws, inputs: {}, instructions: { prompt: "p" } }).role).toBe("spec-author");
  });
});
