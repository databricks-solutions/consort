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
import type { DriveState, WorkflowAction } from "../orchestrator/workflow/workflow-vocabulary.js";
import {
  GATE_SPAN_NAME,
  RUN_SPAN_NAME,
  TURN_SPAN_NAME,
  isKnownGateKind,
  isKnownRole,
  type GateOutcome,
  type RunOutcome,
  type TelemetryCommand,
  type TelemetryLevel,
} from "./allowlist.js";
import { shouldEmitTelemetry } from "./consent.js";
import { TelemetryEmitter, resolveSink, type TelemetrySink } from "./emitter.js";
import {
  isFirstRun,
  isL2NoticeSeen,
  isTelemetryEnabled,
  markL2NoticeSeen,
  resolveTelemetryLevel,
  telemetryDebug,
} from "./home-config.js";
import { buildResourceAttrs, type ResourceDeps } from "./resource.js";
import { newSpanId, newTraceId, type GateSpan, type RunSpan, type TurnSpan } from "./spans.js";

/** The one-time first-run notice (stderr). Pseudonymous, armed by default. */
export const FIRST_RUN_NOTICE =
  "[consort] Anonymous* usage telemetry is on (*pseudonymous: a random per-install id, no PII).\n" +
  "          Each interactive run reports to the Consort maintainers' endpoint; only\n" +
  "          allowlisted, non-sensitive fields are sent (no paths, code, or names).\n" +
  "          Turn it off any time: `consort-telemetry disable` (or CONSORT_TELEMETRY=0).\n" +
  "          Details: TELEMETRY.md.\n";

/** The one-time LEVEL-2 opt-in notice (stderr). Shown once, on the first run after
 *  a user explicitly opts in to Level 2. Level 2 is a SEPARATE opt-in on top of the
 *  Level-1 default; it captures MORE (per-role turn timings, coarse repair/loop
 *  counts, a categorized failure class) , still only allowlisted enums / counts /
 *  durations, never prompts, code, paths, or names. */
export const L2_OPT_IN_NOTICE =
  "[consort] Level-2 usage telemetry is ON (you opted in).\n" +
  "          On top of Level 1, it reports per-role turn timings and coarse\n" +
  "          repair/loop counts , still only allowlisted enums, counts, and\n" +
  "          durations (no prompts, code, paths, error text, or names).\n" +
  "          Back to Level 1 any time: `consort-telemetry enable --level 1`.\n" +
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
  /** Active telemetry level override (tests). Defaults to resolveTelemetryLevel(deps). */
  level?: TelemetryLevel;
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
  try {
    return beginTelemetryRunUnsafe(deps);
  } catch (err) {
    // The emitter must NEVER throw into consort-drive. Any failure setting up the
    // run (e.g. an unwritable ~/.config while building the resource) disables
    // telemetry for this run rather than propagating , a silent no-op.
    telemetryDebug("beginTelemetryRun failed; telemetry disabled for this run", err);
    return NOOP_RUN;
  }
}

/** The setup body. May throw; beginTelemetryRun wraps it so the caller never sees
 *  a throw (see the never-throw invariant in TELEMETRY.md). */
function beginTelemetryRunUnsafe(deps: BeginRunDeps): TelemetryRun {
  const env = deps.env ?? process.env;
  const isTTY = deps.isTTY ?? !!process.stdout.isTTY;
  const enabledFlag = deps.telemetryEnabled ?? isTelemetryEnabled(deps);
  if (!shouldEmitTelemetry({ telemetryEnabled: enabledFlag, isTTY, env })) return NOOP_RUN;

  const now = deps.now ?? Date.now;
  const level = deps.level ?? resolveTelemetryLevel(deps);
  const l2 = level === 2;
  // Fire the one-time notices BEFORE building the resource (which creates the
  // config file), so "first run" is detected against the pre-existing state.
  if (deps.onNotice && isFirstRun(deps)) deps.onNotice(FIRST_RUN_NOTICE);
  // The Level-2 opt-in notice fires once, on the first run after opting in.
  if (deps.onNotice && l2 && !isL2NoticeSeen(deps)) {
    deps.onNotice(L2_OPT_IN_NOTICE);
    markL2NoticeSeen(deps);
  }

  const resource = buildResourceAttrs({ ...deps, isTTY, level });
  const sink = deps.sink ?? resolveSink(env);
  const emitter = new TelemetryEmitter({ sink, resource });

  const traceId = newTraceId();
  const rootSpanId = newSpanId();
  const rootStart = now();
  let gates = 0;
  let finished = false;

  // ── Level-2 (opt-in) accumulators. Populated ONLY when l2; at Level 1 they
  //    stay zero and are never attached to the root span. ──────────────────────
  const l2Counts = {
    red_green_cycles: 0,
    refactor_iterations: 0,
    revise_rounds: 0,
    selfheal_attempts: 0,
    hil_escalations: 0,
  };
  // The last DriveState the driver read (captured through the readState seam), so
  // finish() can record coarse project shape WITHOUT an async read of its own.
  let lastState: DriveState | undefined;

  /** Tally the coarse L2 repair/loop dynamics from a performed action. Reads ONLY
   *  the action's structured `kind` / `role` / `buildMode` / `mode` , never any
   *  free-text field. */
  const tallyL2 = (action: WorkflowAction): void => {
    switch (action.kind) {
      case "raise-to-hil":
        l2Counts.hil_escalations += 1;
        break;
      case "revise-route":
        l2Counts.revise_rounds += 1;
        break;
      case "invoke-role": {
        const bm = "buildMode" in action ? action.buildMode : undefined;
        if (bm && bm.startsWith("refactor")) l2Counts.refactor_iterations += 1;
        else if (bm && (bm.startsWith("assess") || bm === "repair")) l2Counts.selfheal_attempts += 1;
        else if (action.role === "driver" && bm === undefined) l2Counts.red_green_cycles += 1;
        break;
      }
      case "deploy-verify-heal":
        if (action.mode.startsWith("refactor")) l2Counts.refactor_iterations += 1;
        else l2Counts.selfheal_attempts += 1;
        break;
    }
  };

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

    // Level-2 (opt-in) only: tally coarse dynamics and, for a role invocation,
    // emit a `consort.turn` span (role + timing). model / effort / token_bucket /
    // retry_count are NOT available at this seam, so they are simply omitted , the
    // sanitizer keeps only allowlisted keys either way.
    if (l2) {
      tallyL2(action);
      if (action.kind === "invoke-role" && isKnownRole(action.role)) {
        const turn: TurnSpan = {
          trace_id: traceId,
          parent_span_id: rootSpanId,
          span_id: newSpanId(),
          name: TURN_SPAN_NAME,
          role: action.role,
          duration_ms: end - start,
        };
        emitter.enqueue(turn);
      }
    }
  };

  const wrap = (inner: DriveEffects): DriveEffects => {
    // onAction fires immediately before each perform/performViaExecutor with the
    // loop iteration; capture it as the child span's ordinal.
    let pendingOrdinal = 0;
    return {
      // Tap the readState seam to capture the last state the driver observed, so
      // finish() can record coarse L2 project shape without its own async read.
      readState: async () => {
        const s = await inner.readState();
        lastState = s;
        return s;
      },
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
      // Executor-dispatched agent turns run THROUGH performViaExecutor (the driver
      // does NOT then call perform), so a child span is timed here , but ONLY when
      // the inner returns a DEFINED bounded route, i.e. the action was actually
      // handled by the executor. When it returns `undefined` the action was NOT
      // executor-dispatched: the driver falls through to `perform`, whose wrapper
      // records the span, so recording here too would DOUBLE-COUNT every non-
      // executor action (the common case: gates, cut-experiment, deploy, merge, ...).
      // On a throw we still record (fail), since no fall-through perform will run.
      performViaExecutor: inner.performViaExecutor
        ? async (action, state, routerDeps) => {
            const start = now();
            try {
              const r = await inner.performViaExecutor!(action, state, routerDeps);
              if (r !== undefined) recordChild(action, pendingOrdinal, start, false);
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
    // Level-2 (opt-in) only: attach the coarse repair/loop counts + project shape.
    if (l2) {
      root.red_green_cycles = l2Counts.red_green_cycles;
      root.refactor_iterations = l2Counts.refactor_iterations;
      root.revise_rounds = l2Counts.revise_rounds;
      root.selfheal_attempts = l2Counts.selfheal_attempts;
      root.hil_escalations = l2Counts.hil_escalations;
      if (lastState) {
        if (typeof lastState.uiTrack === "boolean") root.ui_track = lastState.uiTrack;
        if (Array.isArray(lastState.storyOrder)) root.story_count = lastState.storyOrder.length;
      }
    }
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
