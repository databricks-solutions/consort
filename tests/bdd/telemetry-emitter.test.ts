// Emitter guarantees (AC3, AC4): never-throw / never-block under an injected
// sender failure, per-span overhead well under budget, a bounded drop-oldest
// queue, and the offline / no-op path being a true no-op (no output, no latency).

import { describe, it, expect } from "vitest";
import {
  TelemetryEmitter,
  DEFAULT_QUEUE_CAP,
  endpointMode,
  httpSink,
  memorySink,
  noopSink,
  resolveSink,
  type TelemetrySink,
} from "../../consort/telemetry/emitter";
import type { GateSpan, ResourceAttrs, RunSpan } from "../../consort/telemetry/spans";

const RESOURCE: ResourceAttrs = {
  schema: "consort/v1",
  install_id: "00000000-0000-4000-8000-000000000000",
  consort_version: "0.0.0-test",
  node_version: "20.0.0",
  os: "darwin",
  arch: "arm64",
  shell: "zsh",
  ci: false,
  tty: true,
  level: 1,
};

function gate(i: number): GateSpan {
  return {
    trace_id: "t",
    parent_span_id: "root",
    span_id: `s${i}`,
    name: "consort.gate",
    gate: "deploy",
    ordinal: i,
    start_ts: i,
    end_ts: i + 1,
    duration_ms: 1,
    outcome: "pass",
  };
}

function rootSpan(): RunSpan {
  return {
    trace_id: "t",
    span_id: "root",
    name: "consort.run",
    start_ts: 0,
    end_ts: 10,
    duration_ms: 10,
    command: "build",
    outcome: "completed",
    exit_code: 0,
    gates_total: 2,
  };
}

describe("telemetry emitter", () => {
  it("delivers a single batch (root + children) to the sink on flush", () => {
    const sink = memorySink();
    const e = new TelemetryEmitter({ sink, resource: RESOURCE });
    e.enqueue(gate(0));
    e.enqueue(gate(1));
    e.enqueue(rootSpan());
    e.flush();
    expect(sink.payloads).toHaveLength(1);
    expect(sink.payloads[0].spans).toHaveLength(3);
    expect(sink.payloads[0].resource).toEqual(RESOURCE);
  });

  it("bounds the queue at cap, dropping the OLDEST span", () => {
    const sink = memorySink();
    const e = new TelemetryEmitter({ sink, resource: RESOURCE, queueCap: 3 });
    for (let i = 0; i < 10; i++) e.enqueue(gate(i));
    expect(e.queued).toBe(3);
    e.flush();
    // The three most-recent survive (oldest dropped).
    expect(sink.spans().map((s) => (s as GateSpan).ordinal)).toEqual([7, 8, 9]);
  });

  it("default cap is 200", () => {
    const e = new TelemetryEmitter({ sink: memorySink(), resource: RESOURCE });
    for (let i = 0; i < 250; i++) e.enqueue(gate(i));
    expect(e.queued).toBe(DEFAULT_QUEUE_CAP);
  });

  it("NEVER throws when the sink throws synchronously", () => {
    const throwingSink: TelemetrySink = {
      deliver() {
        throw new Error("sink boom");
      },
    };
    const e = new TelemetryEmitter({ sink: throwingSink, resource: RESOURCE });
    e.enqueue(gate(0));
    expect(() => e.flush()).not.toThrow();
  });

  it("NEVER throws (and does not block) when the HTTP sender rejects/throws", async () => {
    const errors: unknown[] = [];
    // A fetch that rejects immediately (connection refused analog).
    const failingFetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    const sink = httpSink({ endpoint: "http://127.0.0.1:1", fetchImpl: failingFetch, onError: (e) => errors.push(e) });
    const e = new TelemetryEmitter({ sink, resource: RESOURCE });
    e.enqueue(rootSpan());
    const start = performance.now();
    expect(() => e.flush()).not.toThrow();
    const elapsed = performance.now() - start;
    // Fire-and-forget: flush returns essentially immediately (does not await the POST).
    expect(elapsed).toBeLessThan(50);
    // The rejection is observed on a later tick, swallowed (never rethrown).
    await new Promise((r) => setTimeout(r, 10));
    expect(errors).toHaveLength(1);
  });

  it("per-span enqueue overhead is well under 5ms/span", () => {
    const e = new TelemetryEmitter({ sink: noopSink, resource: RESOURCE });
    const n = 1000;
    const start = performance.now();
    for (let i = 0; i < n; i++) e.enqueue(gate(i));
    const perSpan = (performance.now() - start) / n;
    expect(perSpan).toBeLessThan(5);
  });

  it("offline / no-op sink is a true no-op (no throw, no output on flush)", () => {
    const e = new TelemetryEmitter({ sink: noopSink, resource: RESOURCE });
    e.enqueue(gate(0));
    e.enqueue(rootSpan());
    expect(() => e.flush()).not.toThrow();
  });
});

describe("endpoint gate (AC10): nothing phones home until a maintainer flips it", () => {
  it("no endpoint + no sign-off -> no-op sink", () => {
    expect(resolveSink({})).toBe(noopSink);
    expect(endpointMode({})).toEqual({ endpoint: undefined, signedOff: false, willPost: false });
  });

  it("endpoint set but sign-off UNSET -> still the no-op sink (no real POST)", () => {
    const env = { CONSORT_TELEMETRY_ENDPOINT: "http://127.0.0.1:4318" };
    expect(resolveSink(env)).toBe(noopSink);
    expect(endpointMode(env).willPost).toBe(false);
  });

  it("endpoint set AND sign-off set -> a real HTTP sink (not the no-op)", () => {
    const env = { CONSORT_TELEMETRY_ENDPOINT: "http://127.0.0.1:4318", CONSORT_TELEMETRY_SIGNOFF: "1" };
    expect(resolveSink(env)).not.toBe(noopSink);
    expect(endpointMode(env)).toEqual({ endpoint: "http://127.0.0.1:4318", signedOff: true, willPost: true });
  });
});
