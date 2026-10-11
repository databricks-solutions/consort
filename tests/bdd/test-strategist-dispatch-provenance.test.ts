// The test-strategist is a SUPERVISOR: it must fan out to one per-kind test-analyst subagent
// (behavior / fitness / client) and reconcile their slices, NOT author the test list solo. Nothing
// downstream can tell a fanned-out list from a solo-authored one (both can be schema-conformant), so
// the enforcement gates on PROCESS: the roster prompt mandates a `test-analyst:<kind>` dispatch
// reasoning event per analyst. It is enforced at the SPEC GATE (testStrategistFanOutReason, reading the
// PERSISTED .consort/agent-log.jsonl) — NOT as a meta-channel agent-log output validator, which the
// executor skips because the resolved meta path is not the persisted log (the no-op that let a
// solo-authored S1 reach the gate live).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { missingAnalystDispatchKinds, testStrategistFanOutReason } from "../../consort/gates/gate-conformance-guard";

const TL = JSON.stringify({ feature_id: "F1", items: [{ id: "T1", ac_id: "AC1", kind: "behavior" }] });
const EMPTY_TL = JSON.stringify({ feature_id: "F1", items: [] });

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Build a project with `.consort/features/F1/` + `.consort/agent-log.jsonl` (one role=test-strategist
 *  reasoning line per message) + a uiTrack config. Returns the consortDir. */
function project(messages: string[], uiTrack: boolean): string {
  dir = mkdtempSync(join(tmpdir(), "ts-fanout-"));
  const consortDir = join(dir, ".consort");
  mkdirSync(join(consortDir, "features", "F1"), { recursive: true });
  mkdirSync(join(dir, ".lakebase"), { recursive: true });
  writeFileSync(join(dir, ".lakebase", "consort-config.json"), JSON.stringify({ project: { uiTrack } }));
  const lines = messages.map((m) =>
    JSON.stringify({ timestamp: "2026-10-11T00:00:00.000Z", level: "debug", role: "test-strategist", event: "reasoning", message: m }),
  );
  writeFileSync(join(consortDir, "agent-log.jsonl"), lines.join("\n") + "\n");
  return consortDir;
}

describe("missingAnalystDispatchKinds (pure fan-out check, runnable against a real agent-log)", () => {
  const log = (msgs: string[]) => msgs.map((m) => JSON.stringify({ role: "test-strategist", message: m })).join("\n");
  it("returns [] when every enabled kind has a test-analyst:<kind> dispatch", () => {
    const text = log(["test-analyst:behavior model=sonnet", "test-analyst:fitness model=opus", "test-analyst:client model=sonnet"]);
    expect(missingAnalystDispatchKinds(text, ["behavior", "fitness", "client"])).toEqual([]);
  });
  it("returns the missing kind(s) when one analyst was never dispatched", () => {
    const text = log(["test-analyst:behavior", "test-analyst:client"]);
    expect(missingAnalystDispatchKinds(text, ["behavior", "fitness", "client"])).toEqual(["fitness"]);
  });
  it("returns ALL kinds for a solo-authored log (zero dispatch tokens)", () => {
    const text = log(["ordered_for=design-momentum; S1 slice authored directly by supervisor rather than dispatch"]);
    expect(missingAnalystDispatchKinds(text, ["behavior", "fitness", "client"])).toEqual(["behavior", "fitness", "client"]);
  });
  it("ignores dispatch tokens attributed to a non-test-strategist role", () => {
    const text = JSON.stringify({ role: "navigator", message: "test-analyst:fitness" });
    expect(missingAnalystDispatchKinds(text, ["fitness"])).toEqual(["fitness"]);
  });
});

describe("testStrategistFanOutReason (spec-gate condition over the PERSISTED log)", () => {
  it("passes (null) when the test-list is fanned out to every enabled analyst (uiTrack on => all 3)", () => {
    const c = project(["test-analyst:behavior", "test-analyst:fitness", "test-analyst:client"], true);
    expect(testStrategistFanOutReason(c, "F1", TL)).toBeNull();
  });
  it("BLOCKS a solo-authored list (no dispatch events), naming the missing analysts", () => {
    const c = project(["ordered_for=...; authored directly rather than dispatch"], true);
    const r = testStrategistFanOutReason(c, "F1", TL);
    expect(r).not.toBeNull();
    expect(r).toMatch(/behavior/);
    expect(r).toMatch(/fitness/);
    expect(r).toMatch(/client/);
    expect(r).toMatch(/SUPERVISES|solo/i);
  });
  it("BLOCKS when exactly one analyst (fitness) was not dispatched (names only the missing one)", () => {
    const c = project(["test-analyst:behavior", "test-analyst:client"], true);
    const r = testStrategistFanOutReason(c, "F1", TL);
    // The missing-kinds clause names only fitness (the roster is listed elsewhere in the explanation).
    expect(r).toMatch(/did not fan out to the fitness analyst/);
    expect(r).not.toMatch(/did not fan out to the behavior/);
  });
  it("does NOT require the client analyst when uiTrack is off (no-frontend project)", () => {
    const c = project(["test-analyst:behavior", "test-analyst:fitness"], false);
    expect(testStrategistFanOutReason(c, "F1", TL)).toBeNull();
  });
  it("is idempotent-safe: a later no-op re-run still passes because the earlier fan-out persists in the log", () => {
    // The log accumulates: the authoring turn's dispatch events are still present on a resume, so a
    // re-run that adds nothing (and dispatches nothing) is NOT retroactively blocked.
    const c = project(["test-analyst:behavior", "test-analyst:fitness", "test-analyst:client", "resume: list already complete, ran the generator"], true);
    expect(testStrategistFanOutReason(c, "F1", TL)).toBeNull();
  });
  it("does not fire before the test-strategist has produced items (empty test-list)", () => {
    const c = project(["ordered_for=..."], true);
    expect(testStrategistFanOutReason(c, "F1", EMPTY_TL)).toBeNull();
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
  it("keeps a role-event agent-log validator (fan-out is enforced at the spec gate, not the skipped meta output)", () => {
    expect(manifest.outputs.find((o) => o.id === "agent-log")?.validator).toBe("testStrategistLoggedAuthoring");
  });
  it("no longer runs the supervise+reconcile+order turn at effort:low", () => {
    expect(manifest.agentOptions.effort).toBe("default");
  });
});
