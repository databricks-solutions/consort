// Drive a synthetic two-action consort-drive run and POST its trace to a
// collector , the end-to-end exerciser for the emitter + collector loop.
//
// It builds a real telemetry run (beginTelemetryRun) with an httpSink pointed at
// the endpoint, wraps a scripted DriveEffects that performs exactly two actions,
// runs the real driver loop to `done`, then finishes the run. That yields one
// `consort.run` root + two `consort.gate` children (the terminal `done` is a
// no-op, not a span) , three NDJSON lines sharing a trace id.
//
// `simulateRun` is exported so the E2E test reuses it; `npm run simulate-run`
// runs it against a local collector (default http://127.0.0.1:4318).

import { runDriver, type DriveEffects } from "../../consort/orchestrator/drive/orchestrator-run.js";
import type { DriveState, WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";
import { httpSink } from "../../consort/telemetry/emitter.js";
import { beginTelemetryRun, type BeginRunDeps } from "../../consort/telemetry/with-telemetry.js";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

/** The two scripted actions (both non-role, so no handoff expectation to
 *  discharge). Distinct kinds so the driver's stall guard never trips. */
const SCRIPT: WorkflowAction[] = [{ kind: "cut-experiment", story: "S1" }, { kind: "prepare-pr" }];

/** A scripted DriveEffects: `transition` returns the next scripted action (then
 *  `done`); `perform` just advances the cursor. State is a dummy , the scripted
 *  transition ignores it. */
function scriptedEffects(): { effects: DriveEffects; transition: (s: DriveState) => WorkflowAction } {
  let i = 0;
  const effects: DriveEffects = {
    async readState() {
      return {} as DriveState;
    },
    async perform() {
      i += 1;
    },
  };
  const transition = (): WorkflowAction => (i < SCRIPT.length ? SCRIPT[i] : { kind: "done" });
  return { effects, transition };
}

export interface SimulateRunOptions {
  endpoint: string;
  /** Extra deps forwarded to beginTelemetryRun (env/homedir isolation in tests). */
  deps?: Partial<BeginRunDeps>;
}

export interface SimulateRunResult {
  traceId: string;
  /** Number of child (gate) spans emitted (expected 2 for the two-action run). */
  actions: number;
}

/** Run the synthetic two-action trace against `endpoint`. Returns the trace id. */
export async function simulateRun(opts: SimulateRunOptions): Promise<SimulateRunResult> {
  const run = beginTelemetryRun({
    command: "build",
    sink: httpSink({ endpoint: opts.endpoint }),
    // Force consent ON for the simulation (a scripted, non-interactive exerciser).
    telemetryEnabled: true,
    isTTY: true,
    env: { ...process.env, CI: "", DO_NOT_TRACK: "", CONSORT_TELEMETRY: "1" },
    registerExitFlush: false,
    ...opts.deps,
  });
  const { effects, transition } = scriptedEffects();
  await runDriver(run.wrap(effects), { transition, enforceExpectations: false });
  run.finish({ outcome: "completed", exit_code: 0 });
  return { traceId: run.traceId ?? "", actions: SCRIPT.length };
}

if (isCliEntry(import.meta.url)) {
  const endpoint = process.env.CONSORT_TELEMETRY_ENDPOINT?.trim() || "http://127.0.0.1:4318";
  void simulateRun({ endpoint }).then((r) => {
    process.stderr.write(`[simulate-run] posted trace ${r.traceId} (${r.actions} action span(s) + root) to ${endpoint}\n`);
    // Give the fire-and-forget POST a moment to land before the process exits
    // (dev-script convenience only; the emitter itself never blocks).
    setTimeout(() => process.exit(0), 300);
  });
}
