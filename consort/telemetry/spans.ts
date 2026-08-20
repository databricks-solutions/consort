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
  pickAllowed,
  type ArchValue,
  type GateKind,
  type GateOutcome,
  type OsValue,
  type RunOutcome,
  type ShellValue,
  type TelemetryCommand,
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

/** The root span: one per runDriver invocation. */
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
}

/** The child span: one per performed action/gate, parented to the root span. */
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
}

export type TelemetrySpan = RunSpan | GateSpan;

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

/** True when a span is the root run span (by its constant name). */
export const isRunSpan = (s: TelemetrySpan): s is RunSpan => s.name === RUN_SPAN_NAME;
