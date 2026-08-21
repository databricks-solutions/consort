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
/** The DEFAULT telemetry level. Level 1 (consort-drive only): one trace per run,
 *  root + per-action spans. Ships ON by default (opt-out). Level 2 is a SEPARATE,
 *  EXPLICIT opt-in (OFF by default) — see resolveTelemetryLevel in home-config. */
export const TELEMETRY_LEVEL = 1 as const;
/** The valid telemetry levels. L1 answers "is it healthy / adopted"; L2 adds the
 *  failure taxonomy, per-turn timing, and loop dynamics that answer "why does it
 *  fail / where is the bottleneck". L2 is higher-volume and opt-in only. */
export const TELEMETRY_LEVELS = [1, 2] as const;
export type TelemetryLevel = (typeof TELEMETRY_LEVELS)[number];

/** The Resource attributes shipped once per trace. All are enum / boolean /
 *  numeric / structured-id , never free text. `level` reflects the ACTIVE level
 *  (1 by default, 2 only when the operator opts in); its key never changes. */
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

/** The Level-1 root `consort.run` span fields (one per runDriver invocation). */
export const RUN_SPAN_FIELDS_L1 = [
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

/** The ADDITIONAL Level-2 `consort.run` span fields (present only on a level-2
 *  run). All are counts (numbers) or a single boolean lever — never free text.
 *  Repair & loop dynamics + coarse project shape, i.e. "is the ensemble
 *  thrashing" and "how big is the work", never WHAT the work is. */
export const RUN_SPAN_FIELDS_L2 = [
  // Repair & loop dynamics (counts).
  "red_green_cycles",
  "refactor_iterations",
  "revise_rounds",
  "selfheal_attempts",
  "hil_escalations",
  // Project shape (counts, not content), each suffixed `_count` so it reads as a
  // count and never collides with a `.consort` layout path segment. The gate COUNT
  // is already carried by the L1 `gates_total`, so it is not duplicated here.
  "feature_count",
  "story_count",
  "ac_count",
  "test_count",
  // Config/levers: whether the UX-adherence track is engaged (boolean).
  "ui_track",
] as const;

/** The root `consort.run` span fields (L1 + the opt-in L2 additions). */
export const RUN_SPAN_FIELDS = [...RUN_SPAN_FIELDS_L1, ...RUN_SPAN_FIELDS_L2] as const;
export type RunSpanField = (typeof RUN_SPAN_FIELDS)[number];

/** The Level-1 child `consort.gate` span fields (one per performed action). */
export const GATE_SPAN_FIELDS_L1 = [
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

/** The ADDITIONAL Level-2 `consort.gate` span fields. `fail_class` is a nullable
 *  CATEGORY enum (the failure taxonomy) — the categorized signature of an
 *  abort/escalation, NEVER the error text. */
export const GATE_SPAN_FIELDS_L2 = ["fail_class"] as const;

/** The child `consort.gate` span fields (L1 + the opt-in L2 additions). */
export const GATE_SPAN_FIELDS = [...GATE_SPAN_FIELDS_L1, ...GATE_SPAN_FIELDS_L2] as const;
export type GateSpanField = (typeof GATE_SPAN_FIELDS)[number];

/** The Level-2-only `consort.turn` span fields (one per role invocation). Answers
 *  "who is slow / expensive / flaky". Every constrained field is a closed enum;
 *  the rest are counts / durations / structured ids — never free text. */
export const TURN_SPAN_FIELDS = [
  "trace_id",
  "parent_span_id",
  "span_id",
  "name",
  "role",
  "model",
  "effort",
  "duration_ms",
  "retry_count",
  "token_bucket",
] as const;
export type TurnSpanField = (typeof TURN_SPAN_FIELDS)[number];

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

// ── Closed enums the LEVEL-2 constrained fields draw from ───────────
//
// The role ensemble (matches the `role` literals in the WorkflowAction union:
// spec-author | architect-reviewer | dba | ux-designer | test-strategist |
// navigator | driver | product-owner). Used on the `consort.turn` span. */
export const ROLE_VALUES = [
  "spec-author",
  "architect-reviewer",
  "dba",
  "ux-designer",
  "test-strategist",
  "navigator",
  "driver",
  "product-owner",
] as const;
export type RoleValue = (typeof ROLE_VALUES)[number];

/** The model FAMILY a turn ran on (coarse bucket, never the exact model id). */
export const MODEL_VALUES = ["opus", "sonnet", "haiku", "fable", "other"] as const;
export type ModelValue = (typeof MODEL_VALUES)[number];

/** The reasoning-effort lever for a turn. */
export const EFFORT_VALUES = ["low", "medium", "high", "unknown"] as const;
export type EffortValue = (typeof EFFORT_VALUES)[number];

/** A COARSE token-usage bucket for a turn (never a raw token count). */
export const TOKEN_BUCKET_VALUES = ["xs", "s", "m", "l", "xl"] as const;
export type TokenBucketValue = (typeof TOKEN_BUCKET_VALUES)[number];

/** The FAILURE TAXONOMY: the categorized class of an abort/escalation. A closed
 *  enum of signatures (the RUNBOOK §10 seed set + an `other` catch-all). This is
 *  the category ONLY — never the error message, path, or any free text. */
export const FAIL_CLASSES = [
  "merge-etimedout",
  "npm-proxy-hang",
  "alembic-multi-head",
  "review-blocked-protocol",
  "deploy-verify-halt",
  "ux-adherence-hil",
  "other",
] as const;
export type FailClass = (typeof FAIL_CLASSES)[number];

/** The three span names (constants, never free text). */
export const RUN_SPAN_NAME = "consort.run" as const;
export const GATE_SPAN_NAME = "consort.gate" as const;
export const TURN_SPAN_NAME = "consort.turn" as const;

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

const ROLE_VALUE_SET = new Set<string>(ROLE_VALUES);
/** True when `r` is one of the role ensemble members. */
export const isKnownRole = (r: string): r is RoleValue => ROLE_VALUE_SET.has(r);

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
