// withTelemetry over the real driver loop (AC1 + AC3 decorator seam + consent
// no-op): a build run yields ONE consort.run root + one consort.gate child per
// PERFORMED action, correctly parented and sharing a trace id; the decorator
// never swallows a perform failure; and a disabled run is a byte-identical no-op.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDriver, type DriveEffects } from "../../consort/orchestrator/drive/orchestrator-run";
import type { DriveState, WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary";
import { beginTelemetryRun, type BeginRunDeps, type TelemetryRun } from "../../consort/telemetry/with-telemetry";
import { memorySink, type MemorySink } from "../../consort/telemetry/emitter";
import { isRunSpan, isTurnSpan, type GateSpan, type RunSpan, type TurnSpan } from "../../consort/telemetry/spans";
import { ROLE_VALUES } from "../../consort/telemetry/allowlist";

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

  // Regression (BLOCKING FIX 1): the production DriveEffects wire a real
  // performViaExecutor that returns a DEFINED bounded route for an executor-
  // dispatched action and `undefined` for every other action (the common case).
  // When it returns undefined the driver loop falls through to `perform`. The
  // decorator must record a span in EXACTLY ONE of those two places, never both.
  // The earlier scripted tests don't define performViaExecutor, so they skipped
  // this path entirely (the double-count bug lived here).
  it("records EXACTLY ONE gate span per action across the performViaExecutor path (no double-count)", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun(CONSENTING(home, sink));
    const A: WorkflowAction = { kind: "cut-experiment", story: "S1" }; // executor-dispatched
    const B: WorkflowAction = { kind: "prepare-pr" }; // NOT executor-dispatched -> perform
    let gaveA = false;
    const performedKinds: string[] = [];
    const effects: DriveEffects = {
      async readState() {
        return {} as DriveState;
      },
      // Real-shaped: A is handled by the executor (returns a defined bounded route
      // pointing at B, the next action); everything else returns undefined so the
      // loop falls through to perform.
      async performViaExecutor(action) {
        if (action.kind === "cut-experiment") return { action: B, sanctionedRetry: false };
        return undefined;
      },
      async perform(action) {
        performedKinds.push(action.kind);
      },
    };
    const transition = (): WorkflowAction => {
      if (!gaveA) {
        gaveA = true;
        return A;
      }
      return { kind: "done" };
    };
    await runDriver(run.wrap(effects), { transition, enforceExpectations: false });
    run.finish({ outcome: "completed", exit_code: 0 });

    const spans = sink.payloads[0].spans;
    const children = spans.filter((s) => !isRunSpan(s)) as GateSpan[];
    const root = spans.filter(isRunSpan)[0] as RunSpan;
    // A went through the executor (defined route, NOT perform); B fell through to
    // perform; `done` is the terminal perform (no span). cut-experiment must NOT
    // reach perform , that is the whole point of the executor path.
    expect(performedKinds).toEqual(["prepare-pr", "done"]);
    // EXACTLY one span per action , B is NOT double-counted.
    expect(children.map((c) => c.gate)).toEqual(["cut-experiment", "prepare-pr"]);
    expect(children).toHaveLength(2);
    expect(children.filter((c) => c.gate === "prepare-pr")).toHaveLength(1);
    expect(root.gates_total).toBe(2);
  });

  it("performViaExecutor returning undefined records NO span (the fall-through perform records it)", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun(CONSENTING(home, sink));
    const wrapped = run.wrap({
      async readState() {
        return {} as DriveState;
      },
      async performViaExecutor() {
        return undefined; // not executor-dispatched
      },
      async perform() {},
    });
    // Mirror the driver loop: performViaExecutor first (undefined) then perform.
    const bounded = await wrapped.performViaExecutor!({ kind: "deploy" }, {} as DriveState, {} as never);
    expect(bounded).toBeUndefined();
    await wrapped.perform({ kind: "deploy" });
    run.finish({ outcome: "completed", exit_code: 0 });
    const children = sink.payloads[0].spans.filter((s) => !isRunSpan(s)) as GateSpan[];
    expect(children).toHaveLength(1); // recorded once (by perform), not twice
    expect(children[0].gate).toBe("deploy");
  });

  // Regression (BLOCKING FIX 2): telemetry must never throw into consort-drive,
  // even when the home-dir config is unwritable (read-only home, permission
  // denied, disk full). beginTelemetryRun is called OUTSIDE the CLI try/catch.
  it("never throws when the config dir is unwritable; the run proceeds unaffected", async () => {
    // Point "home" at a regular FILE, so mkdir(<file>/.config/consort) fails ENOTDIR.
    const fileAsHome = join(home, "home-is-a-file");
    writeFileSync(fileAsHome, "x", "utf8");
    const sink = memorySink();
    let run!: TelemetryRun;
    expect(() => {
      run = beginTelemetryRun({
        command: "build",
        sink,
        telemetryEnabled: true,
        isTTY: true,
        env: {},
        homedir: fileAsHome,
        registerExitFlush: false,
      });
    }).not.toThrow();

    // The run proceeds (degraded to an ephemeral id) and a full driver pass +
    // finish complete without throwing.
    const { effects, transition } = scripted([{ kind: "cut-experiment", story: "S1" }]);
    await expect(
      runDriver(run.wrap(effects), { transition, enforceExpectations: false }),
    ).resolves.toBeDefined();
    expect(() => run.finish({ outcome: "completed", exit_code: 0 })).not.toThrow();

    // The write genuinely failed: no config file was created under the file-home.
    expect(existsSync(join(fileAsHome, ".config", "consort", "telemetry.json"))).toBe(false);
  });

  // ── Level 2 (opt-in) ────────────────────────────────────────────────────────
  // At Level 2 the SAME driver pass additionally emits a `consort.turn` span per
  // role invocation (role + timing) and attaches coarse repair/loop counts +
  // project shape to the root span. At Level 1 (the default) neither appears.
  const L2_ACTIONS: WorkflowAction[] = [
    { kind: "invoke-role", role: "navigator", story: "S1" }, // RED: turn span, NOT a red_green_cycle
    { kind: "invoke-role", role: "driver", story: "S1" }, // GREEN: turn span + red_green_cycles++
    { kind: "invoke-role", role: "driver", story: "S1", buildMode: "refactor" }, // turn span + refactor_iterations++
    { kind: "revise-route", story: "S1", role: "spec-author", gate: "spec", reason: "r", source: "s" }, // revise_rounds++
    { kind: "raise-to-hil", reason: "x", source: "y" }, // hil_escalations++ (terminal, so keep it last)
  ];

  it("Level 2 (opt-in) emits consort.turn spans + coarse run counts (resource level = 2)", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun({ ...CONSENTING(home, sink), level: 2 });
    const effects: DriveEffects = {
      async readState() {
        return { storyOrder: ["S1", "S2"], uiTrack: true } as unknown as DriveState;
      },
      async perform() {},
    };
    let i = 0;
    const transition = (): WorkflowAction => (i < L2_ACTIONS.length ? L2_ACTIONS[i++] : { kind: "done" });
    await runDriver(run.wrap(effects), { transition, enforceExpectations: false });
    run.finish({ outcome: "aborted", exit_code: 3 });

    const payload = sink.payloads[0];
    const turns = payload.spans.filter(isTurnSpan) as TurnSpan[];
    const root = payload.spans.filter(isRunSpan)[0] as RunSpan;

    // The resource carries the opted-in level.
    expect(payload.resource.level).toBe(2);

    // One turn span per role invocation, carrying role (within the closed enum) +
    // timing, parented to the root and sharing the trace id. No free-text fields.
    expect(turns.map((t) => t.role)).toEqual(["navigator", "driver", "driver"]);
    for (const t of turns) {
      expect(ROLE_VALUES).toContain(t.role);
      expect(t.trace_id).toBe(root.trace_id);
      expect(t.parent_span_id).toBe(root.span_id);
      expect(t.duration_ms).toBeGreaterThanOrEqual(0);
    }

    // Coarse repair/loop dynamics tallied from the structured action kinds.
    expect(root.red_green_cycles).toBe(1);
    expect(root.refactor_iterations).toBe(1);
    expect(root.revise_rounds).toBe(1);
    expect(root.hil_escalations).toBe(1);
    expect(root.selfheal_attempts).toBe(0);
    // Coarse project shape from the last state the driver observed.
    expect(root.story_count).toBe(2);
    expect(root.ui_track).toBe(true);
  });

  it("Level 1 (default) emits NO turn spans and NO L2 fields on the root", async () => {
    const sink = memorySink();
    const run = beginTelemetryRun({ ...CONSENTING(home, sink), level: 1 });
    let i = 0;
    const transition = (): WorkflowAction => (i < L2_ACTIONS.length ? L2_ACTIONS[i++] : { kind: "done" });
    await runDriver(
      run.wrap({
        async readState() {
          return { storyOrder: ["S1", "S2"], uiTrack: true } as unknown as DriveState;
        },
        async perform() {},
      }),
      { transition, enforceExpectations: false },
    );
    run.finish({ outcome: "aborted", exit_code: 3 });

    const payload = sink.payloads[0];
    expect(payload.resource.level).toBe(1);
    expect(payload.spans.some(isTurnSpan)).toBe(false);
    const root = payload.spans.filter(isRunSpan)[0] as RunSpan;
    expect(root.red_green_cycles).toBeUndefined();
    expect(root.hil_escalations).toBeUndefined();
    expect(root.story_count).toBeUndefined();
    expect(root.ui_track).toBeUndefined();
  });
});
