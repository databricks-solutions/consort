// End-to-end emitter -> collector loop (AC7, AC9, AC10).
//
//   AC9: a two-action run POSTed to the collector lands 3 NDJSON lines (root +
//        two gate children) that all share one trace id.
//   AC7: the collector tolerates an unknown field and still answers 202.
//   AC10: with the sign-off flag unset the sink is the local no-op , no real POST
//        reaches the collector.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCollector, type RunningCollector } from "../../tools/telemetry-collector/collector";
import { simulateRun } from "../../tools/telemetry-collector/simulate-run";
import { beginTelemetryRun } from "../../consort/telemetry/with-telemetry";
import { resolveSink } from "../../consort/telemetry/emitter";
import { runDriver, type DriveEffects } from "../../consort/orchestrator/drive/orchestrator-run";
import type { DriveState, WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary";

/** Poll the NDJSON out file until it has at least `n` non-blank lines. */
async function waitForLines(file: string, n: number, timeoutMs = 3000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(file)) {
      const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length >= n) return lines;
    }
    if (Date.now() > deadline) {
      const got = existsSync(file) ? readFileSync(file, "utf8") : "(no file)";
      throw new Error(`timed out waiting for ${n} NDJSON lines; got:\n${got}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("telemetry collector E2E", () => {
  let dir: string;
  let outFile: string;
  let collector: RunningCollector;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "tele-e2e-"));
    outFile = join(dir, "traces.ndjson");
    collector = await startCollector({ outFile, port: 0 }); // ephemeral port
  });
  afterEach(async () => {
    await collector.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("a two-action run lands 3 NDJSON lines that share one trace id (AC9)", async () => {
    const { traceId } = await simulateRun({ endpoint: collector.url, deps: { homedir: dir } });
    const lines = await waitForLines(outFile, 3);
    expect(lines).toHaveLength(3);
    const records = lines.map((l) => JSON.parse(l) as { trace_id: string; name: string });
    // All three share the run's trace id.
    for (const r of records) expect(r.trace_id).toBe(traceId);
    // Exactly one root + two gate children.
    expect(records.filter((r) => r.name === "consort.run")).toHaveLength(1);
    expect(records.filter((r) => r.name === "consort.gate")).toHaveLength(2);
    // The root line carries the Resource attrs (shipped once).
    const root = records.find((r) => r.name === "consort.run") as unknown as { resource?: { schema: string } };
    expect(root.resource?.schema).toBe("consort/v1");
  });

  it("tolerates an unknown field and answers 202 (AC7)", async () => {
    const res = await fetch(`${collector.url}/v1/traces`, {
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: JSON.stringify({ trace_id: "abc", name: "consort.gate", some_future_field: 42, nested: { x: 1 } }) + "\n",
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { accepted: boolean };
    expect(body.accepted).toBe(true);
    const lines = await waitForLines(outFile, 1);
    expect(JSON.parse(lines[0])).toMatchObject({ some_future_field: 42 });
  });

  it("sign-off flag unset -> no-op sink, so NO real POST reaches the collector (AC10)", async () => {
    // resolveSink with only an endpoint (no sign-off) must be the no-op sink.
    const env = { CONSORT_TELEMETRY_ENDPOINT: collector.url };
    const run = beginTelemetryRun({
      command: "build",
      sink: resolveSink(env), // <- the production resolution, sign-off UNSET
      telemetryEnabled: true,
      isTTY: true,
      env: {},
      homedir: dir,
      registerExitFlush: false,
    });
    const actions: WorkflowAction[] = [{ kind: "deploy" }, { kind: "merge" }];
    let i = 0;
    const effects: DriveEffects = {
      async readState() {
        return {} as DriveState;
      },
      async perform() {
        i += 1;
      },
    };
    await runDriver(run.wrap(effects), {
      transition: () => (i < actions.length ? actions[i] : { kind: "done" }),
      enforceExpectations: false,
    });
    run.finish({ outcome: "completed", exit_code: 0 });
    // Give any (erroneously sent) POST time to land, then assert nothing did.
    await new Promise((r) => setTimeout(r, 150));
    expect(existsSync(outFile)).toBe(false);
  });
});
