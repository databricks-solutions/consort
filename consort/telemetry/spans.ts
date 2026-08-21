// Telemetry span + trace identity model (schema "consort/v1").
//
// Hand-rolled ids (no OpenTelemetry SDK): a trace_id is 16 random bytes (32 hex
// chars), a span_id is 8 random bytes (16 hex chars) , the OTLP-compatible
// widths, generated with node:crypto so nothing is imported for it. The span
// SHAPES are the allowlist's RUN_SPAN_FIELDS / GATE_SPAN_FIELDS made concrete;
// `sanitizeRunSpan` / `sanitizeGateSpan` DROP any non-allowlisted key so a span
// that accidentally grew a field never ships it.

import { randomBytes } from "node:crypto";
import {
  GATE_SPAN_FIELDS,
  GATE_SPAN_NAME,
  RUN_SPAN_FIELDS,
  RUN_SPAN_NAME,
  TURN_SPAN_FIELDS,
  TURN_SPAN_NAME,
  pickAllowed,
  type ArchValue,
  type EffortValue,
  type FailClass,
  type GateKind,
  type GateOutcome,
  type ModelValue,
  type OsValue,
  type RoleValue,
  type RunOutcome,
  type ShellValue,
  type TelemetryCommand,
  type TokenBucketValue,
} from "./allowlist.js";

/** A 128-bit trace id as 32 lowercase hex chars (OTLP width). */
export const newTraceId = (): string => randomBytes(16).toString("hex");
/** A 64-bit span id as 16 lowercase hex chars (OTLP width). */
export const newSpanId = (): string => randomBytes(8).toString("hex");

/** The Resource attributes (shipped once per trace). Pseudonymous, not
 *  anonymous: `install_id` is a persistent per-install UUIDv4. No PII. */
export interface ResourceAttrs {
  schema: string;
  install_id: string;
  consort_version: string;
  node_version: string;
  os: OsValue;
  arch: ArchValue;
  shell: ShellValue;
  ci: boolean;
  tty: boolean;
  level: number;
}

/** The root span: one per runDriver invocation. The L2 fields are OPTIONAL and
 *  present only on a level-2 (opted-in) run; they are all counts / a boolean lever
 *  , never free text. See RUN_SPAN_FIELDS_L2 in the allowlist. */
export interface RunSpan {
  trace_id: string;
  span_id: string;
  name: typeof RUN_SPAN_NAME;
  start_ts: number;
  end_ts: number;
  duration_ms: number;
  command: TelemetryCommand;
  outcome: RunOutcome;
  exit_code: number;
  gates_total: number;
  // ── Level-2 (opt-in) additions: repair/loop dynamics + coarse project shape ──
  red_green_cycles?: number;
  refactor_iterations?: number;
  revise_rounds?: number;
  selfheal_attempts?: number;
  hil_escalations?: number;
  feature_count?: number;
  story_count?: number;
  ac_count?: number;
  test_count?: number;
  ui_track?: boolean;
}

/** The child span: one per performed action/gate, parented to the root span. The
 *  L2 `fail_class` is OPTIONAL (present only on a level-2 run, and only when a
 *  fail/abort was categorized): the categorized signature enum, NEVER error text. */
export interface GateSpan {
  trace_id: string;
  parent_span_id: string;
  span_id: string;
  name: typeof GATE_SPAN_NAME;
  gate: GateKind;
  ordinal: number;
  start_ts: number;
  end_ts: number;
  duration_ms: number;
  outcome: GateOutcome;
  fail_class?: FailClass | null;
}

/** The LEVEL-2-only span: one per role invocation ("who is slow / expensive /
 *  flaky"). `role` is a closed enum; `model` / `effort` / `token_bucket` are
 *  closed-enum coarse buckets and OPTIONAL (only carried when the executor layer
 *  surfaces them , they are not available at every seam). Never free text. */
export interface TurnSpan {
  trace_id: string;
  parent_span_id: string;
  span_id: string;
  name: typeof TURN_SPAN_NAME;
  role: RoleValue;
  model?: ModelValue;
  effort?: EffortValue;
  duration_ms: number;
  retry_count?: number;
  token_bucket?: TokenBucketValue;
}

export type TelemetrySpan = RunSpan | GateSpan | TurnSpan;

/** The internal batch handed to a sink: the trace's resource + its spans. The
 *  wire encoding (NDJSON, OTLP, ...) is the sink's concern, not this model's. */
export interface TracePayload {
  schema: string;
  resource: ResourceAttrs;
  spans: TelemetrySpan[];
}

/** Drop any non-allowlisted key from a root span (runtime tooth). */
export const sanitizeRunSpan = (s: RunSpan): RunSpan => pickAllowed(s, RUN_SPAN_FIELDS) as unknown as RunSpan;
/** Drop any non-allowlisted key from a child span (runtime tooth). */
export const sanitizeGateSpan = (s: GateSpan): GateSpan => pickAllowed(s, GATE_SPAN_FIELDS) as unknown as GateSpan;
/** Drop any non-allowlisted key from a turn span (runtime tooth). */
export const sanitizeTurnSpan = (s: TurnSpan): TurnSpan => pickAllowed(s, TURN_SPAN_FIELDS) as unknown as TurnSpan;

/** True when a span is the root run span (by its constant name). */
export const isRunSpan = (s: TelemetrySpan): s is RunSpan => s.name === RUN_SPAN_NAME;
/** True when a span is a level-2 turn span (by its constant name). */
export const isTurnSpan = (s: TelemetrySpan): s is TurnSpan => s.name === TURN_SPAN_NAME;

/** Sanitize ANY span by its kind (the single dispatch point for the emitter). */
export const sanitizeSpan = (s: TelemetrySpan): TelemetrySpan =>
  isRunSpan(s) ? sanitizeRunSpan(s) : isTurnSpan(s) ? sanitizeTurnSpan(s) : sanitizeGateSpan(s as GateSpan);
