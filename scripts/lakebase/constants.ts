// Shared substrate constants – single source of truth for repeated literals.
//
// These are deliberate defaults that the Lakebase service + the kit's
// documented conventions converge on. They're "hardcoded" in the sense
// that the value itself doesn't change at runtime, but every callsite
// reads from here so a future deviation requires touching one place,
// not the eight files that previously inlined the literal.
//
// Every API that consumes one of these MUST accept an override per-call
// (matching the kit's existing convention). The constant only fixes the
// default.

/**
 * TCP port Lakebase serves Postgres on. Used in DSN building and in
 * direct pg.Client connect calls (schema introspection, etc.). Lakebase
 * does not expose a per-endpoint port override; the service is fixed
 * to 5432 by design. If that ever changes, this is the one place to
 * update.
 */
export const POSTGRES_PORT = 5432;

/**
 * Default Lakebase database name. The service provisions a single
 * database per branch with this fixed name. Callers override via the
 * per-call `database` arg or the PGDATABASE env var (in the standard
 * pg-tooling order: explicit arg → PGDATABASE → DEFAULT_DATABASE).
 */
export const DEFAULT_DATABASE = "databricks_postgres";

/**
 * Runtime artifact + metadata directories the SCM working-tree guards tolerate
 * as uncommitted "not code" (the fork-clean check and the open-PR dirty check).
 * These are the kit's own runtime dirs , SCM workflow state (`.lakebase/`), the
 * SFTDD orchestration churn (`.sftdd/`, legacy `.tdd/`), and per-agent memory ,
 * not project source. Passed as the `isDirty({ ignore })` list. Centralized here
 * so the SCM guards reference ONE named constant instead of inlining the runtime
 * dir names at each callsite; the extracted lakebase-scm-utils package owns this
 * default and callers may extend it per-call.
 */
export const RUNTIME_ARTIFACT_IGNORE = [
  ".sftdd/",
  ".tdd/",
  ".lakebase/",
  ".claude/agent-memory/",
] as const;

/**
 * Default Lakebase endpoint name on a branch. The service currently
 * provisions exactly one endpoint named "primary" per branch; callers
 * that want a different identifier pass `endpointName` explicitly.
 * If Lakebase ever exposes multi-endpoint branches the constant stays
 * "primary" (the default behavior) and callers opt into the new name.
 */
export const DEFAULT_ENDPOINT = "primary";
