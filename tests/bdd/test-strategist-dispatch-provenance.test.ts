// The test-strategist is a SUPERVISOR: it must fan out to one per-kind test-analyst subagent
// (behavior / fitness / client) and reconcile their slices, NOT author the test list solo. Nothing
// downstream can tell a fanned-out list from a solo-authored one (both can be schema-conformant), so
// the enforcement gates on PROCESS: the roster prompt mandates a `test-analyst:<kind>` dispatch
// reasoning event per analyst, and testStrategistDispatchedAnalysts (the shipped manifest's agent-log
// validator) requires one per ENABLED analyst. A solo turn logs none and fails -> bounded retry -> HIL.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testStrategistDispatchedAnalysts } from "../../consort/orchestrator/validators/conformance/validator-registry";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Build a project with `.consort/agent-log.jsonl` (one line per message, all role=test-strategist)
 *  and an optional uiTrack config. Returns the agent-log path (what the validator receives). */
function project(messages: string[], uiTrack?: boolean): string {
  dir = mkdtempSync(join(tmpdir(), "ts-dispatch-"));
  const consortDir = join(dir, ".consort");
  mkdirSync(consortDir, { recursive: true });
  if (uiTrack !== undefined) {
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(join(dir, ".lakebase", "consort-config.json"), JSON.stringify({ project: { uiTrack } }));
  }
  const lines = messages.map((m) =>
    JSON.stringify({ timestamp: "2026-10-11T00:00:00.000Z", level: "debug", role: "test-strategist", event: "reasoning", message: m }),
  );
  const logPath = join(consortDir, "agent-log.jsonl");
  writeFileSync(logPath, lines.join("\n") + "\n");
  return logPath;
}

describe("testStrategistDispatchedAnalysts: the fan-out provenance gate", () => {
  it("passes when every enabled analyst has a test-analyst:<kind> dispatch event (uiTrack on => all 3)", () => {
    const log = project(
      [
        "ordered_for=design-momentum rationale ...",
        "test-analyst:behavior model=sonnet effort=default tool_scope=[Read]",
        "test-analyst:fitness model=opus effort=high tool_scope=[Read]",
        "test-analyst:client model=sonnet effort=default tool_scope=[Read]",
      ],
      true,
    );
    expect(testStrategistDispatchedAnalysts(log)).toEqual({ ok: true, violations: [] });
  });

  it("FAILS a solo-authored turn (no dispatch events) naming the missing analysts", () => {
    const log = project(["ordered_for=design-momentum; I authored all 16 items myself"], true);
    const res = testStrategistDispatchedAnalysts(log);
    expect(res.ok).toBe(false);
    expect(res.violations[0]).toMatch(/behavior/);
    expect(res.violations[0]).toMatch(/fitness/);
    expect(res.violations[0]).toMatch(/client/);
    expect(res.violations[0]).toMatch(/SUPERVISES|solo/i);
  });

  it("FAILS when exactly one analyst (fitness) was not dispatched", () => {
    const log = project(
      [
        "test-analyst:behavior model=sonnet",
        "test-analyst:client model=sonnet",
        // no test-analyst:fitness
      ],
      true,
    );
    const res = testStrategistDispatchedAnalysts(log);
    expect(res.ok).toBe(false);
    expect(res.violations[0]).toMatch(/fitness/);
    expect(res.violations[0]).not.toMatch(/behavior/);
  });

  it("does NOT require the client analyst when uiTrack is off (no-frontend project)", () => {
    const log = project(["test-analyst:behavior model=sonnet", "test-analyst:fitness model=opus"], false);
    expect(testStrategistDispatchedAnalysts(log)).toEqual({ ok: true, violations: [] });
  });

  it("FAILS when the role logged nothing at all (the base role-event requirement is subsumed)", () => {
    dir = mkdtempSync(join(tmpdir(), "ts-dispatch-"));
    mkdirSync(join(dir, ".consort"), { recursive: true });
    const logPath = join(dir, ".consort", "agent-log.jsonl");
    writeFileSync(logPath, "");
    const res = testStrategistDispatchedAnalysts(logPath);
    expect(res.ok).toBe(false);
  });
});

describe("the shipped test-strategist manifest wires the deterministic enforcement", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const manifest = require("../../consort/orchestrator/steps/manifests/test-strategist.json") as {
    outputs: Array<{ id: string; validator: string }>;
    agentOptions: { effort: string };
  };
  it("validates the test-list for SCHEMA conformance at the turn (not merely non-empty)", () => {
    expect(manifest.outputs.find((o) => o.id === "test-list")?.validator).toBe("testListConformant");
  });
  it("gates the agent-log on FAN-OUT provenance (not merely 'logged something')", () => {
    expect(manifest.outputs.find((o) => o.id === "agent-log")?.validator).toBe("testStrategistDispatchedAnalysts");
  });
  it("no longer runs the supervise+reconcile+order turn at effort:low", () => {
    expect(manifest.agentOptions.effort).toBe("default");
  });
});
