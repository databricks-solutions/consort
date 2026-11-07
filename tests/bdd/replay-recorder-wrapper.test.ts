// ReplayRecorderWrapper: the record decorator, mirror of the step-aware replay agent (Stage E).
// wrapWithRecorder(inner, ctx) lets the inner agent produce its turn's delta, then records that
// delta + transcript into the corpus (turns/NNNN-<label>/{turn.json,files/}) via the SAME recorder
// primitives (recordTurn) the drive.cli effects wrapper uses. Recording a NEW live scenario = wrap
// the live agent. Because record WRITES the same format the step-aware replay agent READS, a
// recorded turn round-trips: re-recording a replay reproduces the corpus.
//
// Proves: wrapping a `mock` agent records the turn (turn.json + files/ + agent-log); the wrapper is
// a TRUE PASS-THROUGH (the inner agent's inputs are forwarded verbatim and its members – buildCommand,
// lastResult – remain visible through the wrapper); and record→replay round-trips.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The recorded TURN dirs under a corpus turns/ – directories only (turns/ also holds index.json). */
function turnDirs(recordDirRoot: string): string[] {
  const t = join(recordDirRoot, "turns");
  return existsSync(t) ? readdirSync(t).filter((n) => statSync(join(t, n)).isDirectory()) : [];
}
import { wrapWithRecorder } from "../../consort/orchestrator/agents/replay-recorder-wrapper";
import { recordTurn } from "../../consort/logging/turn-recorder";
import { makeStepReplayAgent, resetStepReplayCursor } from "../../consort/orchestrator/agents/mock-replay-agent";
import type { StepAgent, AgentInvocation } from "../../consort/orchestrator/agents/agent-types";
import type { WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary";

let recordDir: string;
let project: string;
let consortDir: string;

beforeEach(() => {
  recordDir = mkdtempSync(join(tmpdir(), "recorder-corpus-"));
  project = mkdtempSync(join(tmpdir(), "recorder-project-"));
  consortDir = join(project, ".consort");
  mkdirSync(consortDir, { recursive: true });
});
afterEach(() => {
  rmSync(recordDir, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const ACTION: WorkflowAction = { kind: "invoke-role", role: "spec-author", story: "S1-file-stock" };

function inv(): AgentInvocation {
  return { action: ACTION, workspaceDir: project, inputs: {}, instructions: { prompt: "p" } };
}

/** An inner agent that writes one artifact into the workspace .consort on invoke, and exposes
 *  extra members (buildCommand, lastResult) so we can prove the wrapper passes them through. */
function fakeInner(): StepAgent & { buildCommand: () => string; lastResult?: { finalText: string } } {
  const agent = {
    buildCommand: () => "the-command",
    lastResult: undefined as { finalText: string } | undefined,
    async invoke(invocation: AgentInvocation): Promise<void> {
      const p = join(invocation.workspaceDir, ".consort", "features", "F1", "stories", "S1-file-stock", "acs", "AC1.json");
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, '{"id":"AC1"}');
      agent.lastResult = { finalText: "authored AC1" }; // set DURING invoke, must reflect through the proxy
    },
  };
  return agent;
}

describe("wrapWithRecorder: records the inner agent's turn into the corpus", () => {
  it("records a turns/NNNN-<label>/ slice with turn.json.produced + files/ + an agent-log line", async () => {
    const inner = fakeInner();
    const agent = wrapWithRecorder(inner, { recordDir, projectDir: project, consortDir, featureId: "F1" });
    await agent.invoke(inv());

    const turnsDir = join(recordDir, "turns");
    const dirs = turnDirs(recordDir);
    expect(dirs.length).toBe(1);
    const label = dirs[0];
    expect(label).toMatch(/spec-author/); // labelForAction stamps the role
    const turnJson = JSON.parse(readFileSync(join(turnsDir, label, "turn.json"), "utf8"));
    expect(turnJson.action).toEqual(ACTION);
    expect(turnJson.produced).toContain(".consort/features/F1/stories/S1-file-stock/acs/AC1.json");
    // The files/ delta carries the produced artifact (what a step-aware replay reads back).
    expect(existsSync(join(turnsDir, label, "files", ".consort/features/F1/stories/S1-file-stock/acs/AC1.json"))).toBe(true);
  });

  it("is a TRUE PASS-THROUGH: inner members (buildCommand, lastResult set during invoke) show through the wrapper", async () => {
    const inner = fakeInner();
    const wrapped = wrapWithRecorder(inner, { recordDir, projectDir: project, consortDir, featureId: "F1" }) as typeof inner;
    // A non-invoke member is visible before the turn.
    expect(wrapped.buildCommand()).toBe("the-command");
    await wrapped.invoke(inv());
    // lastResult, set by the inner agent DURING invoke, reflects through the proxy afterward
    // (this is what the executor/Step read for the phase-6 record + recorded transcript).
    expect(wrapped.lastResult?.finalText).toBe("authored AC1");
  });

  it("record → replay round-trips: re-recording a step-replay reproduces the corpus (migration proof)", async () => {
    // 1) Record an original corpus from the fake inner.
    const original = mkdtempSync(join(tmpdir(), "recorder-orig-"));
    try {
      const rec1 = wrapWithRecorder(fakeInner(), { recordDir: original, projectDir: project, consortDir, featureId: "F1" });
      await rec1.invoke(inv());

      // 2) Replay that corpus into a fresh workspace, WRAPPED by the recorder writing a NEW corpus.
      const project2 = mkdtempSync(join(tmpdir(), "recorder-project2-"));
      const consort2 = join(project2, ".consort");
      mkdirSync(consort2, { recursive: true });
      const replayThenRecord = wrapWithRecorder(makeStepReplayAgent({ corpusRoot: original }), {
        recordDir, projectDir: project2, consortDir: consort2, featureId: "F1",
      });
      await replayThenRecord.invoke({ action: ACTION, workspaceDir: project2, inputs: {}, instructions: { prompt: "p" } });
      resetStepReplayCursor(original);

      // The re-recorded corpus carries the same produced artifact for the same action.
      const dirs = turnDirs(recordDir);
      const tj = JSON.parse(readFileSync(join(recordDir, "turns", dirs[0], "turn.json"), "utf8"));
      expect(tj.action).toEqual(ACTION);
      expect(tj.produced).toContain(".consort/features/F1/stories/S1-file-stock/acs/AC1.json");

      rmSync(project2, { recursive: true, force: true });
    } finally {
      rmSync(original, { recursive: true, force: true });
    }
  });
});

// Hardening: the per-turn record audit must check the dir recordTurn ACTUALLY wrote, not the
// turnDir the wrapper computed BEFORE inner.invoke(). recordTurn re-reads turns/index.json at write
// time, so if the index grows during the invoke (the ux-designer establish+ia split appended an
// intervening turn; a too-fast kill+relaunch raced two writers) the two ordinals diverge and the old
// audit false-failed on a stale dir name that was never written.
describe("wrapWithRecorder: audits the dir recordTurn ACTUALLY wrote when the index grows mid-invoke", () => {
  it("does NOT false-fail the record audit when an intervening turn bumps the ordinal during inner.invoke", async () => {
    // An inner agent that records an INTERVENING turn during its own invoke (mimicking the perform-path
    // recording a dispatch turn, i.e. the live ux-designer straddle) so turns/index.json grows between
    // the wrapper's pre-invoke turnDirFor (ordinal 0) and recordTurn's write (ordinal 1).
    const inner: StepAgent = {
      async invoke(invocation: AgentInvocation): Promise<void> {
        const p = join(invocation.workspaceDir, ".consort", "features", "F1", "stories", "S1-file-stock", "acs", "AC1.json");
        mkdirSync(join(p, ".."), { recursive: true });
        writeFileSync(p, '{"id":"AC1"}');
        // intervening index append -> 0000-dispatch; the agent turn then lands at 0001-spec-author
        recordTurn({ recordDir: consortDir, projectDir: project, consortDir, action: { kind: "dispatch" } as WorkflowAction, step: 0, snapshotContent: false });
      },
    };
    const agent = wrapWithRecorder(inner, {
      recordDir: consortDir,
      projectDir: project,
      consortDir,
      featureId: "F1",
      takeTranscript: () => ({ role: "spec-author", model: "sonnet", prompt: "p", finalText: "x", tools: [] }),
      liveIndex: true,
    });
    // The pre-invoke turnDir was 0000-spec-author, but 0000 is now the dispatch turn and the agent
    // turn is 0001-spec-author. Auditing the stale 0000-spec-author would throw RECORD AUDIT FAILED;
    // auditing the real write dir passes.
    await expect(agent.invoke(inv())).resolves.toBeUndefined();
    const agentTurn = turnDirs(consortDir).find((d) => /spec-author/.test(d))!;
    expect(agentTurn).toMatch(/^0001-spec-author/);
    expect(existsSync(join(consortDir, "turns", agentTurn, "transcript.md"))).toBe(true);
    // The stale pre-invoke dir name was never written.
    expect(existsSync(join(consortDir, "turns", "0000-spec-author"))).toBe(false);
  });
});

describe("wrapWithRecorder: LIVE INDEX (record into .consort, no content snapshot)", () => {
  it("records turn.json + transcript.md + produced INDEX, but NO files/ delta and NO replay-set", async () => {
    const inner = fakeInner();
    // liveIndex mode with a transcript source (the live drive supplies one).
    const agent = wrapWithRecorder(inner, {
      recordDir: consortDir, // the LIVE record targets the project's own .consort
      projectDir: project,
      consortDir,
      featureId: "F1",
      takeTranscript: () => ({ role: "spec-author", model: "sonnet", prompt: "p", finalText: "authored AC1", tools: ["Read x", "Write y"] }),
      liveIndex: true,
    });
    await agent.invoke(inv());

    const dirs = turnDirs(consortDir);
    expect(dirs.length).toBe(1);
    const label = dirs[0];
    const turnJson = JSON.parse(readFileSync(join(consortDir, "turns", label, "turn.json"), "utf8"));
    // The INDEX is captured: produced paths + snapshotted:false + the transcript summary.
    expect(turnJson.produced).toContain(".consort/features/F1/stories/S1-file-stock/acs/AC1.json");
    expect(turnJson.snapshotted).toBe(false);
    expect(turnJson.transcript).toMatchObject({ role: "spec-author", model: "sonnet", toolCount: 2 });
    // The transcript IS persisted (prompt/tools/reasoning viewable).
    expect(existsSync(join(consortDir, "turns", label, "transcript.md"))).toBe(true);
    // But NO content snapshot + NO replay-set pre-state (read at HEAD instead).
    expect(existsSync(join(consortDir, "turns", label, "files"))).toBe(false);
    expect(existsSync(join(consortDir, "turns", label, "replay-set"))).toBe(false);
    // And recording into .consort does NOT churn its own output on a subsequent turn.
    await agent.invoke(inv());
    const t2 = JSON.parse(readFileSync(join(consortDir, "turns", turnDirs(consortDir).sort()[1], "turn.json"), "utf8"));
    expect(t2.produced).not.toContain("turns/index.json");
    expect(t2.produced.some((p: string) => p.startsWith(".consort/turns/"))).toBe(false);
  });
});
