// The CLOSED telemetry attribute allowlist for schema "consort/v1".
//
// WHY THIS EXISTS (mirrors consort/logging/agent-log-events.ts): telemetry that
// can ship an ARBITRARY attribute is a privacy hazard , a stray path, branch
// name, hostname, or error string leaks the moment someone adds a field. This
// module is the single source of truth for EVERY field the emitter may ship:
//   - the Resource attributes (RESOURCE_ATTR_KEYS),
//   - the root `consort.run` span fields (RUN_SPAN_FIELDS),
//   - the child `consort.gate` span fields (GATE_SPAN_FIELDS),
//   - the closed enums each constrained field draws from, and
//   - the `gate` enum, FROZEN to the real WorkflowAction `kind` values.
//
// Two teeth back it: (1) `pickAllowed` DROPS any key not on the list at emit
// time (so an accidental extra field never leaves the process), and (2) the
// Vitest reachability guard (telemetry-allowlist-reachability.test.ts) fails the
// build if the emitter can produce a key that is not listed here, or if the
// `gate` enum drifts from the WorkflowAction union in the source. Only
// enum / numeric / boolean / structured-id fields ship: NO free text (no paths,
// branches, spec content, hostnames, or error messages) is ever allowlisted.

export const TELEMETRY_SCHEMA = "consort/v1" as const;
/** Level 1 (consort-drive only): one trace per run, root + per-action spans. */
export const TELEMETRY_LEVEL = 1 as const;

/** The Resource attributes shipped once per trace. All are enum / boolean /
 *  numeric / structured-id , never free text. */
export const RESOURCE_ATTR_KEYS = [
  "schema",
  "install_id",
  "consort_version",
  "node_version",
  "os",
  "arch",
  "shell",
  "ci",
  "tty",
  "level",
] as const;
export type ResourceAttrKey = (typeof RESOURCE_ATTR_KEYS)[number];

/** The root `consort.run` span fields (one per runDriver invocation). */
export const RUN_SPAN_FIELDS = [
  "trace_id",
  "span_id",
  "name",
  "start_ts",
  "end_ts",
  "duration_ms",
  "command",
  "outcome",
  "exit_code",
  "gates_total",
] as const;
export type RunSpanField = (typeof RUN_SPAN_FIELDS)[number];

/** The child `consort.gate` span fields (one per performed action). */
export const GATE_SPAN_FIELDS = [
  "trace_id",
  "parent_span_id",
  "span_id",
  "name",
  "gate",
  "ordinal",
  "start_ts",
  "end_ts",
  "duration_ms",
  "outcome",
] as const;
export type GateSpanField = (typeof GATE_SPAN_FIELDS)[number];

// ── Closed enums the constrained fields draw from ──────────────────
export const OS_VALUES = ["darwin", "linux", "win32", "other"] as const;
export type OsValue = (typeof OS_VALUES)[number];
export const ARCH_VALUES = ["arm64", "x64", "other"] as const;
export type ArchValue = (typeof ARCH_VALUES)[number];
export const SHELL_VALUES = ["zsh", "bash", "fish", "powershell", "unknown"] as const;
export type ShellValue = (typeof SHELL_VALUES)[number];
export const RUN_OUTCOMES = ["completed", "aborted", "error"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];
export const GATE_OUTCOMES = ["pass", "fail", "skip", "abort"] as const;
export type GateOutcome = (typeof GATE_OUTCOMES)[number];
export const COMMANDS = ["plan", "design", "build", "deploy"] as const;
export type TelemetryCommand = (typeof COMMANDS)[number];

/** The two span names (constants, never free text). */
export const RUN_SPAN_NAME = "consort.run" as const;
export const GATE_SPAN_NAME = "consort.gate" as const;

// ── The FROZEN gate enum: the real WorkflowAction `kind` values ────
//
// Keyed off the WorkflowAction union in
// consort/orchestrator/workflow/workflow-vocabulary.ts. This list is the SET
// AS FOUND, not invented: telemetry-allowlist-reachability.test.ts greps the
// source union and fails the build if a `kind` appears there that is missing
// here (a new action must be classified) or if an entry here no longer exists
// in the union (a stale entry). Do NOT hand-add speculative kinds.
export const GATE_KINDS = [
  "invoke-role",
  "project-architect-notes",
  "surface-gate",
  "approve-gate",
  "design-complete",
  "approve-plan-gate",
  "planning-complete",
  "dispatch",
  "cut-experiment",
  "deploy-verify-heal",
  "await-acceptance",
  "accept",
  "complete",
  "feature-complete",
  "deploy",
  "approve-deploy-gate",
  "deploy-complete",
  "prepare-pr",
  "wait-ci",
  "approve-promote-gate",
  "merge",
  "raise-to-hil",
  "revise-route",
  "done",
] as const;
export type GateKind = (typeof GATE_KINDS)[number];

const RESOURCE_KEY_SET = new Set<string>(RESOURCE_ATTR_KEYS);
export const isAllowedResourceKey = (k: string): k is ResourceAttrKey => RESOURCE_KEY_SET.has(k);

const GATE_KIND_SET = new Set<string>(GATE_KINDS);
/** True when `k` is one of the frozen WorkflowAction kinds. */
export const isKnownGateKind = (k: string): k is GateKind => GATE_KIND_SET.has(k);

/**
 * Keep ONLY the allowlisted keys of `obj`, dropping every other key. The runtime
 * tooth against a leaked field: whatever a span/resource object happens to carry,
 * only the listed fields survive to the wire. Pure (returns a fresh object).
 */
export function pickAllowed<T extends object>(obj: T, allowed: readonly string[]): Partial<T> {
  const set = new Set<string>(allowed);
  const src = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    if (set.has(k)) out[k] = src[k];
  }
  return out as Partial<T>;
}
