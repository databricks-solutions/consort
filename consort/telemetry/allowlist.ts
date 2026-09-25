// The CLOSED telemetry attribute allowlist for schema "consort/v1".
//
// WHY THIS EXISTS (mirrors consort/logging/agent-log-events.ts): telemetry that
// can ship an ARBITRARY attribute is a privacy hazard – a stray path, branch
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
 *  numeric / structured-id – never free text. `level` reflects the ACTIVE level
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
  // Repair & loop dynamics – PROMOTED to L1: "is the ensemble thrashing" is a HEALTH
  // signal (L1's job), and these are aggregate run-level COUNTS – no per-turn detail, no
  // content. Tallied on every run now, not just at level 2.
  "red_green_cycles",
  "refactor_iterations",
  "revise_rounds",
  "selfheal_attempts",
  "hil_escalations",
] as const;

/** The ADDITIONAL Level-2 `consort.run` span fields (present only on a level-2
 *  run). All are counts (numbers) or a single boolean lever — never free text.
 *  Coarse project shape ("how big is the work", never WHAT the work is) + the ui_track
 *  lever. (The repair/loop dynamics moved to L1 above.) */
export const RUN_SPAN_FIELDS_L2 = [
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

/** The Level-1 child `consort.gate` span fields (one per performed action). `role` +
 *  `phase` are carried ONLY for an `invoke-role` action (undefined for every other gate
 *  kind); both are closed enums (no free text), so the DEFAULT (L1) telemetry can attribute
 *  duration to the specific role + phase – where the majority of a run's time goes – instead
 *  of lumping every role turn under `gate: "invoke-role"`. */
export const GATE_SPAN_FIELDS_L1 = [
  "trace_id",
  "parent_span_id",
  "span_id",
  "name",
  "gate",
  "role",
  "phase",
  "ordinal",
  "start_ts",
  "end_ts",
  "duration_ms",
  "outcome",
  // WHY, at the DEFAULT level (both closed CATEGORY enums, never free text): `fail_class` is
  // the categorized signature of a failed/aborted gate (the failure taxonomy); `revise_class`
  // is why a `revise-route` re-routed (turns the L1 `revise_rounds` count into a reason). These
  // are adoption-health signals ("why are runs failing / re-routing"), so they belong at L1.
  "fail_class",
  "revise_class",
] as const;

/** The ADDITIONAL Level-2 `consort.gate` span fields (none currently — `fail_class` was
 *  promoted to L1). Kept as the seam for future opt-in gate fields. */
export const GATE_SPAN_FIELDS_L2 = [] as const;

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
  // Phase (same closed PHASE_VALUES enum as the gate span): lets the L2 turn view be a clean
  // GROUP BY phase, role, model – build roles multiplex phases that model/effort alone can't tell.
  "phase",
  "model",
  "effort",
  "duration_ms",
  "retry_count",
  "token_bucket",
  // Cost split (each a coarse TOKEN_BUCKET_VALUES band): input = context read, output =
  // generation, cache_read = reuse – WHY a turn is expensive (read-heavy vs write-heavy).
  "token_bucket_input",
  "token_bucket_output",
  "token_bucket_cache_read",
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

/** Map a drive's ACTUAL process exit code to the run outcome – the SINGLE source of truth
 *  so `outcome` and `exit_code` can never disagree. `0` => completed; `3` => aborted (a
 *  HITL escalation); ANY other non-zero (`1` error, `2` a guard / empty-backlog /
 *  pending-input / CLI-effect failure, …) => error. The prior ad-hoc derivations only
 *  special-cased 3 and 1, so exit `2` fell through to "completed" – a failed run recorded
 *  as a success (seen on real installs). A non-zero exit is NEVER "completed". */
export function outcomeForExit(code: number): RunOutcome {
  if (code === 0) return "completed";
  if (code === 3) return "aborted";
  return "error";
}
export const GATE_OUTCOMES = ["pass", "fail", "skip", "abort"] as const;
export type GateOutcome = (typeof GATE_OUTCOMES)[number];
// The consort-drive phases. `sprint` is the `/consort:start` umbrella run (planning +
// each per-feature drive under ONE root run); `plan` / `design` / `build` / `deploy` are
// the per-phase feature-path runs (a Tier-2 bound maps to its slash command, a full
// feature run reports `build`). Plus `spike`, the throwaway-branch op run by
// `consort-spike` (outside the TDD loop – not a role drive, so it emits a root run with
// zero gate spans). Every user-invoked command must emit telemetry regardless of which
// bin serves it – so a dashboard can tell a whole-sprint run apart from a single phase.
export const COMMANDS = ["sprint", "plan", "design", "build", "deploy", "spike"] as const;
export type TelemetryCommand = (typeof COMMANDS)[number];

/** Map a feature's DERIVED phase (from `deriveFeaturePhase`: `"design"` | `"build"` |
 *  `"complete"` | null) to the telemetry command for a plain, unbounded `--feature`
 *  drive. `/design`, `/build`, and `/deploy` ALL invoke `consort-drive --feature <F>`
 *  with no phase flag (the drive derives the phase from disk), so the run's command must
 *  come from the feature's phase, not a hardcoded default – else a design or deploy drive
 *  mislabels as `build` and a dashboard cannot tell them apart. A fully-accepted
 *  (`"complete"`) feature drive runs the deploy phase, so it maps to `deploy`. An
 *  explicit bound (`--plan-only` / `--only`) still wins upstream; this is only the
 *  fallback when no bound is set. null/unknown falls back to `build` (the safe default). */
export function commandForFeaturePhase(phase: string | null | undefined): TelemetryCommand {
  switch (phase) {
    case "design":
      return "design";
    case "build":
      return "build";
    case "complete":
      return "deploy";
    default:
      return "build";
  }
}

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

/** The PHASE of a role invocation – WHAT KIND of turn it is – so the DEFAULT L1 gate span
 *  can split the two roles that dominate runtime (navigator: reflect/red/review/assess;
 *  driver: green/refactor) instead of one coarse "invoke-role". Derived from the action's
 *  buildMode/mode, else the role's base phase; "other" catches any unmapped mode so a new
 *  buildMode never ships as free text. */
export const PHASE_VALUES = [
  "breakdown",
  "spec",
  "architecture",
  "db-design",
  "test-strategy",
  "ux-design",
  "reflect",
  "red",
  "green",
  "review",
  "refactor",
  "refactor-superseded",
  "assess",
  "assess-refactor",
  "repair",
  "other",
] as const;
export type PhaseValue = (typeof PHASE_VALUES)[number];

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

/** The REVISE TAXONOMY: WHY a `revise-route` sent a gate's verdict back to its author (the
 *  categorized reason behind an L1 `revise_rounds` count). A closed enum – the recurring
 *  design-lane re-route causes + an `other` catch-all. Category ONLY, never the verdict text. */
export const REVISE_CLASSES = [
  "nfr-coverage-gap",
  "e2e-layer-misroute",
  "invariant-leg-missing",
  "ac-independence",
  "test-list-drift",
  "migration-reversibility",
  "other",
] as const;
export type ReviseClass = (typeof REVISE_CLASSES)[number];

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
  "approve-intake-gate",
  "approve-backlog-gate",
  "approve-plan-gate",
  "planning-complete",
  "dispatch",
  "cut-experiment",
  "deploy-verify-heal",
  "deploy-verify-reverify",
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
  "flag-testlist-nonconformance",
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

const PHASE_VALUE_SET = new Set<string>(PHASE_VALUES);
/** True when `p` is one of the closed phase values. */
export const isKnownPhase = (p: string): p is PhaseValue => PHASE_VALUE_SET.has(p);

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
