// withTelemetry over the real driver loop (AC1 + AC3 decorator seam + consent
// no-op): a build run yields ONE consort.run root + one consort.gate child per
// PERFORMED action, correctly parented and sharing a trace id; the decorator
// never swallows a perform failure; and a disabled run is a byte-identical no-op.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDriver, type DriveEffects } from "../../consort/orchestrator/drive/orchestrator-run";
import type { DriveState, WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary";
import { beginTelemetryRun, type BeginRunDeps } from "../../consort/telemetry/with-telemetry";
import { memorySink, type MemorySink } from "../../consort/telemetry/emitter";
import { isRunSpan, type GateSpan, type RunSpan } from "../../consort/telemetry/spans";

/** A scripted DriveEffects that performs `actions` in order then reaches `done`.
 *  `transition` ignores state; `perform` advances a cursor (optionally throwing). */
function scripted(actions: WorkflowAction[], throwOnIndex?: number) {
  let i = 0;
  const performed: WorkflowAction[] = [];
  const effects: DriveEffects = {
    async readState() {
      return {} as DriveState;
    },
    async perform(action) {
      if (throwOnIndex !== undefined && i === throwOnIndex) {
        throw new Error("perform boom");
      }
      performed.push(action);
      i += 1;
    },
  };
  const transition = (): WorkflowAction => (i < actions.length ? actions[i] : { kind: "done" });
  return { effects, transition, performed };
}

const CONSENTING = (home: string, sink: MemorySink): BeginRunDeps => ({
  command: "build",
  sink,
  telemetryEnabled: true,
  isTTY: true,
  env: {},
  homedir: home,
  registerExitFlush: false,
});

describe("withTelemetry over the driver loop", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tele-drive-"));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("a build run emits one root + one child per action, parented + sharing a trace id", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun(CONSENTING(home, sink));
    expect(run.enabled).toBe(true);
    const actions: WorkflowAction[] = [
      { kind: "cut-experiment", story: "S1" },
      { kind: "prepare-pr" },
      { kind: "wait-ci" },
    ];
    const { effects, transition } = scripted(actions);
    await runDriver(run.wrap(effects), { transition, enforceExpectations: false });
    run.finish({ outcome: "completed", exit_code: 0 });

    expect(sink.payloads).toHaveLength(1);
    const spans = sink.payloads[0].spans;
    const roots = spans.filter(isRunSpan) as RunSpan[];
    const children = spans.filter((s) => !isRunSpan(s)) as GateSpan[];

    expect(roots).toHaveLength(1); // exactly one root
    expect(children).toHaveLength(3); // one per performed action; `done` is NOT a span

    const root = roots[0];
    expect(root.name).toBe("consort.run");
    expect(root.command).toBe("build");
    expect(root.outcome).toBe("completed");
    expect(root.gates_total).toBe(3);
    expect(root.duration_ms).toBeGreaterThanOrEqual(0);

    // Every child shares the trace id and is parented to the root span.
    for (const c of children) {
      expect(c.trace_id).toBe(root.trace_id);
      expect(c.parent_span_id).toBe(root.span_id);
      expect(c.name).toBe("consort.gate");
      expect(c.outcome).toBe("pass");
      expect(c.span_id).not.toBe(root.span_id);
    }
    // The children carry the real action kinds, in order.
    expect(children.map((c) => c.gate)).toEqual(["cut-experiment", "prepare-pr", "wait-ci"]);
    expect(children.map((c) => c.ordinal)).toEqual([0, 1, 2]);
    // The trace id is exposed on the session and matches.
    expect(run.traceId).toBe(root.trace_id);
    expect(root.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(root.span_id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("records a raise-to-hil action as an abort child span", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun(CONSENTING(home, sink));
    const actions: WorkflowAction[] = [{ kind: "raise-to-hil", reason: "x", source: "y" }];
    const { effects, transition } = scripted(actions);
    await runDriver(run.wrap(effects), { transition, enforceExpectations: false });
    run.finish({ outcome: "aborted", exit_code: 3 });
    const children = sink.payloads[0].spans.filter((s) => !isRunSpan(s)) as GateSpan[];
    expect(children).toHaveLength(1);
    expect(children[0].gate).toBe("raise-to-hil");
    expect(children[0].outcome).toBe("abort");
  });

  it("does NOT swallow a perform failure (records fail, then rethrows)", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun(CONSENTING(home, sink));
    const wrapped = run.wrap({
      async readState() {
        return {} as DriveState;
      },
      async perform() {
        throw new Error("perform boom");
      },
    });
    await expect(wrapped.perform({ kind: "deploy" })).rejects.toThrow("perform boom");
    run.finish({ outcome: "error", exit_code: 1 });
    const children = sink.payloads[0].spans.filter((s) => !isRunSpan(s)) as GateSpan[];
    expect(children).toHaveLength(1);
    expect(children[0].gate).toBe("deploy");
    expect(children[0].outcome).toBe("fail");
  });

  it("forwards optional seams unchanged (routing / correspondence / handback)", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun(CONSENTING(home, sink));
    const seen: string[] = [];
    const wrapped = run.wrap({
      async readState() {
        return {} as DriveState;
      },
      async perform() {},
      onRoutingDecision: () => seen.push("routing"),
      onCorrespondence: () => seen.push("correspondence"),
      onHandback: () => seen.push("handback"),
    });
    expect(wrapped.onRoutingDecision).toBeDefined();
    expect(wrapped.onCorrespondence).toBeDefined();
    expect(wrapped.onHandback).toBeDefined();
    wrapped.onRoutingDecision!({ kind: "done" }, {} as DriveState, 0, "nextTransition");
    expect(seen).toContain("routing");
  });

  it("disabled consent is a byte-identical no-op (no spans, no config file)", () => {
    const sink = memorySink();
    const run = beginTelemetryRun({ ...CONSENTING(home, sink), telemetryEnabled: false });
    expect(run.enabled).toBe(false);
    const inner: DriveEffects = { async readState() { return {} as DriveState; }, async perform() {} };
    expect(run.wrap(inner)).toBe(inner); // same object, no decoration
    run.finish({ outcome: "completed", exit_code: 0 });
    expect(sink.payloads).toHaveLength(0);
    // A no-op run never mints an install id / writes the config file.
    expect(existsSync(join(home, ".config", "consort", "telemetry.json"))).toBe(false);
  });

  it("fires the one-time first-run notice on the first consenting run only", () => {
    const notices: string[] = [];
    const first = beginTelemetryRun({ ...CONSENTING(home, memorySink()), onNotice: (m) => notices.push(m) });
    first.finish({ outcome: "completed", exit_code: 0 });
    expect(notices).toHaveLength(1);
    // A second run (config now exists) does not re-notice.
    const second = beginTelemetryRun({ ...CONSENTING(home, memorySink()), onNotice: (m) => notices.push(m) });
    second.finish({ outcome: "completed", exit_code: 0 });
    expect(notices).toHaveLength(1);
  });
});
