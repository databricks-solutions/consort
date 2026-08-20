// The fire-and-forget emitter: a bounded span queue + a pluggable sink.
//
// Guarantees the whole feature rests on:
//   - NEVER throws into the caller (every path swallows its own errors).
//   - NEVER blocks (no awaited network I/O; delivery is fire-and-forget).
//   - Bounded queue (cap 200, drop-OLDEST) so a long / stuck run cannot grow
//     memory without bound.
//   - The DEFAULT sink is a local no-op: "nothing phones home until a human
//     flips the real endpoint." A real HTTP POST is used only when an endpoint
//     is configured AND the privacy sign-off flag is set.
//
// The sender is hand-rolled (a small NDJSON POST over global fetch) , NOT the
// OpenTelemetry SDK. One try, ~500ms timeout, all errors swallowed.

import {
  isRunSpan,
  sanitizeGateSpan,
  sanitizeRunSpan,
  type GateSpan,
  type ResourceAttrs,
  type TelemetrySpan,
  type TracePayload,
} from "./spans.js";

export const DEFAULT_QUEUE_CAP = 200;
export const DEFAULT_TIMEOUT_MS = 500;

/** A destination for delivered trace batches. MUST NOT throw; SHOULD NOT block. */
export interface TelemetrySink {
  deliver(payload: TracePayload): void;
}

/** The default sink: discards everything. No network, no I/O, no latency. */
export const noopSink: TelemetrySink = { deliver() {} };

/** An in-memory sink for tests: records every delivered payload. */
export interface MemorySink extends TelemetrySink {
  readonly payloads: TracePayload[];
  /** All spans across every delivered payload (flattened, for convenience). */
  spans(): TelemetrySpan[];
}
export function memorySink(): MemorySink {
  const payloads: TracePayload[] = [];
  return {
    payloads,
    deliver(payload) {
      payloads.push(payload);
    },
    spans() {
      return payloads.flatMap((p) => p.spans);
    },
  };
}

export interface HttpSinkOptions {
  endpoint: string;
  timeoutMs?: number;
  /** Injectable fetch (tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Observed on any delivery error (tests / diagnostics). Never rethrown. */
  onError?: (err: unknown) => void;
}

/**
 * The hand-rolled HTTP sink: POST the batch as NDJSON (one span per line) to
 * `<endpoint>/v1/traces`. The root span's line additionally carries the trace's
 * Resource attributes so a reader has them without a separate line. Fire-and-
 * forget: it kicks off the request and returns immediately; the ~500ms timeout
 * and all errors are swallowed, so the caller is never blocked and never sees a
 * failure.
 */
export function httpSink(opts: HttpSinkOptions): TelemetrySink {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    deliver(payload) {
      try {
        const body = payload.spans.map((s) => JSON.stringify(wireLine(s, payload))).join("\n") + "\n";
        // AbortSignal.timeout is native in Node 20. Guard its use so an
        // environment without it still never throws.
        const signal =
          typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
            ? AbortSignal.timeout(timeoutMs)
            : undefined;
        // Fire-and-forget: do NOT await. Swallow rejection so an unhandled
        // rejection never surfaces.
        void Promise.resolve(
          doFetch(`${opts.endpoint.replace(/\/$/, "")}/v1/traces`, {
            method: "POST",
            headers: { "content-type": "application/x-ndjson" },
            body,
            ...(signal ? { signal } : {}),
          }),
        ).then(
          () => {},
          (err) => opts.onError?.(err),
        );
      } catch (err) {
        // Even constructing the request must never throw into the caller.
        opts.onError?.(err);
      }
    },
  };
}

/** One NDJSON wire line for a span: the sanitized span + schema, with the trace's
 *  resource attached to the root span's line only (so it ships once). */
function wireLine(span: TelemetrySpan, payload: TracePayload): Record<string, unknown> {
  const clean = isRunSpan(span) ? sanitizeRunSpan(span) : sanitizeGateSpan(span as GateSpan);
  return isRunSpan(span)
    ? { schema: payload.schema, ...clean, resource: payload.resource }
    : { schema: payload.schema, ...clean };
}

/** The state of the endpoint gate: the two conditions that must BOTH hold for a
 *  real POST, and whether they do. */
export interface EndpointMode {
  endpoint?: string;
  signedOff: boolean;
  /** True only when a real endpoint is configured AND the sign-off flag is set. */
  willPost: boolean;
}

/** Read the endpoint gate from the env. A real POST requires BOTH
 *  CONSORT_TELEMETRY_ENDPOINT and the CONSORT_TELEMETRY_SIGNOFF privacy flag. */
export function endpointMode(env: NodeJS.ProcessEnv): EndpointMode {
  const endpoint = env.CONSORT_TELEMETRY_ENDPOINT?.trim() || undefined;
  const signedOff = /^(1|true)$/i.test((env.CONSORT_TELEMETRY_SIGNOFF ?? "").trim());
  return { endpoint, signedOff, willPost: !!endpoint && signedOff };
}

/**
 * Resolve the sink from the env: the local no-op sink by default; a real HTTP
 * sink ONLY when an endpoint is configured AND the sign-off flag is set. This is
 * the "nothing phones home until a human flips the real endpoint" gate.
 */
export function resolveSink(env: NodeJS.ProcessEnv): TelemetrySink {
  const mode = endpointMode(env);
  return mode.willPost ? httpSink({ endpoint: mode.endpoint! }) : noopSink;
}

export interface TelemetryEmitterOptions {
  sink: TelemetrySink;
  resource: ResourceAttrs;
  queueCap?: number;
}

/**
 * The bounded span queue. `enqueue` sanitizes + appends (dropping the oldest span
 * when at cap); `flush` drains the queue into ONE payload and hands it to the
 * sink fire-and-forget, swallowing everything. A no-op sink makes both a pure
 * in-memory no-op (offline path: no latency, no output).
 */
export class TelemetryEmitter {
  private readonly queue: TelemetrySpan[] = [];
  private readonly sink: TelemetrySink;
  private readonly resource: ResourceAttrs;
  private readonly cap: number;

  constructor(opts: TelemetryEmitterOptions) {
    this.sink = opts.sink;
    this.resource = opts.resource;
    this.cap = opts.queueCap ?? DEFAULT_QUEUE_CAP;
  }

  /** Number of spans currently queued (diagnostic; tests assert the cap). */
  get queued(): number {
    return this.queue.length;
  }

  /** Append a span, dropping the OLDEST if the queue is at cap. Sanitizes first,
   *  so a non-allowlisted field never reaches the queue. Never throws. */
  enqueue(span: TelemetrySpan): void {
    try {
      const clean = isRunSpan(span) ? sanitizeRunSpan(span) : sanitizeGateSpan(span as GateSpan);
      if (this.queue.length >= this.cap) this.queue.shift();
      this.queue.push(clean);
    } catch {
      /* telemetry never throws into the caller */
    }
  }

  /** Drain the queue into one payload and deliver it fire-and-forget. Swallows
   *  all errors. A no-op / empty queue returns immediately. */
  flush(): void {
    if (this.queue.length === 0) return;
    const spans = this.queue.splice(0);
    try {
      this.sink.deliver({ schema: this.resource.schema, resource: this.resource, spans });
    } catch {
      /* swallow: a broken sink must never break the CLI */
    }
  }
}
