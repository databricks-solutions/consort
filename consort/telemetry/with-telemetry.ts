// The withTelemetry decorator + its run session.
//
// One consort-drive run == one trace. `beginTelemetryRun` opens the root
// `consort.run` span (if consent passes) and returns a session; `wrap` decorates
// the DriveEffects the SAME way withTurnRecording / withBuildRecording do (every
// optional seam forwarded UNCHANGED, so composition never silently disables a
// hook), adding one child `consort.gate` span per PERFORMED action off the
// perform / performViaExecutor seam; `finish` closes the root span with the run
// outcome and flushes fire-and-forget.
//
// When consent fails, `beginTelemetryRun` returns a NO-OP session: `wrap` returns
// the effects unchanged and `finish` does nothing , the drive is byte-identical
// to a build without telemetry (no spans, no config write, no latency, no output).
//
// The decorator NEVER throws into the driver and NEVER awaits network I/O: child
// spans are enqueued synchronously after the inner effect resolves, and delivery
// is the emitter's fire-and-forget flush.

import type { DriveEffects } from "../orchestrator/drive/orchestrator-run.js";
import type { WorkflowAction } from "../orchestrator/workflow/workflow-vocabulary.js";
import {
  GATE_SPAN_NAME,
  RUN_SPAN_NAME,
  isKnownGateKind,
  type GateOutcome,
  type RunOutcome,
  type TelemetryCommand,
} from "./allowlist.js";
import { shouldEmitTelemetry } from "./consent.js";
import { TelemetryEmitter, resolveSink, type TelemetrySink } from "./emitter.js";
import { isFirstRun, isTelemetryEnabled } from "./home-config.js";
import { buildResourceAttrs, type ResourceDeps } from "./resource.js";
import { newSpanId, newTraceId, type GateSpan, type RunSpan } from "./spans.js";

/** The one-time first-run notice (stderr). Pseudonymous, local no-op by default. */
export const FIRST_RUN_NOTICE =
  "[consort] Anonymous* usage telemetry is on (*pseudonymous: a random per-install id, no PII).\n" +
  "          Nothing leaves this machine until a maintainer enables a real endpoint.\n" +
  "          Turn it off any time: `consort-telemetry disable` (or DO_NOT_TRACK=1).\n" +
  "          Details: TELEMETRY.md.\n";

export interface RunFinishInfo {
  outcome: RunOutcome;
  exit_code: number;
}

export interface TelemetryRun {
  /** True when consent passed and the root span is open (else a no-op session). */
  readonly enabled: boolean;
  /** The trace id (undefined on a no-op session). */
  readonly traceId?: string;
  /** Decorate DriveEffects to emit one child span per performed action. */
  wrap(inner: DriveEffects): DriveEffects;
  /** Close the root span with the run outcome + flush. Idempotent. */
  finish(info: RunFinishInfo): void;
}

export interface BeginRunDeps extends ResourceDeps {
  /** The consort-drive command this run represents (plan|design|build|deploy). */
  command: TelemetryCommand;
  /** Injectable sink (tests). Defaults to resolveSink(env) , no-op unless signed off. */
  sink?: TelemetrySink;
  /** Clock (tests). Defaults to Date.now. */
  now?: () => number;
  /** Persisted consent flag override (tests). Defaults to isTelemetryEnabled(deps). */
  telemetryEnabled?: boolean;
  /** stdout.isTTY override (tests). Defaults to process.stdout.isTTY. */
  isTTY?: boolean;
  /** One-time first-run notice writer (stderr in production; captured in tests). */
  onNotice?: (msg: string) => void;
  /** Register a best-effort exit flush (default true). Off in tests to avoid leaks. */
  registerExitFlush?: boolean;
}

/** The immutable no-op session returned when consent fails. */
const NOOP_RUN: TelemetryRun = {
  enabled: false,
  traceId: undefined,
  wrap: (inner) => inner,
  finish: () => {},
};

/** Map a performed action to a child-span outcome. The driver is deterministic:
 *  a raise-to-hil is an abort; a thrown perform is a fail; otherwise pass. */
function gateOutcome(action: WorkflowAction, threw: boolean): GateOutcome {
  if (action.kind === "raise-to-hil") return "abort";
  return threw ? "fail" : "pass";
}

/**
 * Begin a telemetry run. Opens the root `consort.run` span when consent passes;
 * otherwise returns a no-op session. Building the resource here mints the
 * install_id on first use, so it happens only AFTER consent.
 */
export function beginTelemetryRun(deps: BeginRunDeps): TelemetryRun {
  const env = deps.env ?? process.env;
  const isTTY = deps.isTTY ?? !!process.stdout.isTTY;
  const enabledFlag = deps.telemetryEnabled ?? isTelemetryEnabled(deps);
  if (!shouldEmitTelemetry({ telemetryEnabled: enabledFlag, isTTY, env })) return NOOP_RUN;

  const now = deps.now ?? Date.now;
  // Fire the one-time notice BEFORE building the resource (which creates the
  // config file), so "first run" is detected against the pre-existing state.
  if (deps.onNotice && isFirstRun(deps)) deps.onNotice(FIRST_RUN_NOTICE);

  const resource = buildResourceAttrs({ ...deps, isTTY });
  const sink = deps.sink ?? resolveSink(env);
  const emitter = new TelemetryEmitter({ sink, resource });

  const traceId = newTraceId();
  const rootSpanId = newSpanId();
  const rootStart = now();
  let gates = 0;
  let finished = false;

  const recordChild = (action: WorkflowAction, ordinal: number, start: number, threw: boolean): void => {
    // `done` is the terminal no-op, not real work , never a child span.
    if (action.kind === "done") return;
    // Only allowlisted kinds ship as a `gate`; a kind the frozen enum does not
    // know is dropped rather than shipped as a raw string (defense in depth ,
    // the enum is kept in lockstep with the union by the reachability test).
    if (!isKnownGateKind(action.kind)) return;
    const end = now();
    const span: GateSpan = {
      trace_id: traceId,
      parent_span_id: rootSpanId,
      span_id: newSpanId(),
      name: GATE_SPAN_NAME,
      gate: action.kind,
      ordinal,
      start_ts: start,
      end_ts: end,
      duration_ms: end - start,
      outcome: gateOutcome(action, threw),
    };
    emitter.enqueue(span);
    gates += 1;
  };

  const wrap = (inner: DriveEffects): DriveEffects => {
    // onAction fires immediately before each perform/performViaExecutor with the
    // loop iteration; capture it as the child span's ordinal.
    let pendingOrdinal = 0;
    return {
      readState: () => inner.readState(),
      onAction: (action, i) => {
        pendingOrdinal = i;
        inner.onAction?.(action, i);
      },
      // Forward every optional seam UNCHANGED (mirrors the recording decorators),
      // so telemetry composition never disables routing / correspondence / etc.
      onRoutingDecision: inner.onRoutingDecision
        ? (a, s, i, src) => inner.onRoutingDecision!(a, s, i, src)
        : undefined,
      onCorrespondence: inner.onCorrespondence
        ? (a, s, i) => inner.onCorrespondence!(a, s, i)
        : undefined,
      onHandback: inner.onHandback ? (h, d) => inner.onHandback!(h, d) : undefined,
      assertRouteSatisfiable: inner.assertRouteSatisfiable
        ? (a, s) => inner.assertRouteSatisfiable!(a, s)
        : undefined,
      // Executor-dispatched agent turns run THROUGH performViaExecutor (perform is
      // not called), so a child span must be timed here too.
      performViaExecutor: inner.performViaExecutor
        ? async (action, state, routerDeps) => {
            const start = now();
            try {
              const r = await inner.performViaExecutor!(action, state, routerDeps);
              recordChild(action, pendingOrdinal, start, false);
              return r;
            } catch (err) {
              recordChild(action, pendingOrdinal, start, true);
              throw err;
            }
          }
        : undefined,
      async perform(action) {
        const start = now();
        try {
          await inner.perform(action);
          recordChild(action, pendingOrdinal, start, false);
        } catch (err) {
          recordChild(action, pendingOrdinal, start, true);
          throw err;
        }
      },
    };
  };

  const finish = (info: RunFinishInfo): void => {
    if (finished) return;
    finished = true;
    const end = now();
    const root: RunSpan = {
      trace_id: traceId,
      span_id: rootSpanId,
      name: RUN_SPAN_NAME,
      start_ts: rootStart,
      end_ts: end,
      duration_ms: end - rootStart,
      command: deps.command,
      outcome: info.outcome,
      exit_code: info.exit_code,
      gates_total: gates,
    };
    emitter.enqueue(root);
    emitter.flush();
  };

  // Best-effort exit flush: if the run ends without an explicit finish (a killed
  // process), still drain whatever is queued. Non-blocking; off in tests.
  if (deps.registerExitFlush !== false) {
    process.once("beforeExit", () => {
      if (!finished) emitter.flush();
    });
  }

  return { enabled: true, traceId, wrap, finish };
}

/**
 * The documented decorator: wrap DriveEffects for the given run. Sugar over
 * `run.wrap(inner)`, so drive.cli reads
 * `runDriver(withTelemetry(withTurnRecording(...), run), ...)`.
 */
export function withTelemetry(inner: DriveEffects, run: TelemetryRun): DriveEffects {
  return run.wrap(inner);
}
