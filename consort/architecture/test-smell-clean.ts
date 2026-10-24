// Deterministic test-authoring smell check (issue #199). Autonomous test-authoring
// repeatedly ships the SAME catalog of test-file defects: loose Playwright locators
// that substring-match other cells or random-UUID digits (flaky strict-mode
// collisions), a vi.mock factory closing over a top-level const (TDZ ReferenceError,
// the suite silently reports 0 tests), a framenavigated reload-detector that flags
// legitimate History-API nav, DELETE-based teardowns that break on append-only /
// ON DELETE RESTRICT tables (and cross-contaminate sibling stories), an umbrella
// `except IntegrityError` that masks the REAL failure, and raw-SQL table refs no
// migration creates (unsatisfiable: UndefinedTable on every run).
//
// The app code is correct in every case – the TEST is the defect – and the honest
// verify cannot be trusted to catch these (a strict-mode collision is data-dependent;
// a TDZ suite reports "0 tests" which can read as no-RED). So this guard scans the
// test files DETERMINISTICALLY and fails the cycle with per-smell fixes routed to the
// test's AUTHOR (the Navigator), never to a Driver code repair. Mirrors the
// migration-history-clean / migration-app-clean / layering-clean gates: a finding is
// a precise file:line list + the fix; a guard error is advisory, never a false fail.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import {
  resolveConsortDir,
  featuresDir,
  featureDir,
  architectureJson,
  storiesDir,
  storyTestListJson,
  artifactRootsRegexAlternation,
} from "../../consort/config/consort-paths.js";

// The workflow-bookkeeping roots (.consort + legacy) as a regex fragment, from the
// single source of truth in consort-paths – never hardcoded here (consort-paths-guard).
const ARTIFACT_ROOTS_RE = artifactRootsRegexAlternation();

export interface TestSmellArgs {
  /** Project working-tree root. */
  projectDir: string;
  /** Test roots to scan (relative to projectDir). Default: the two canonical roots. */
  testDirs?: string[];
  /** Migration dirs for the schema table set (relative). Default: common locations. */
  migrationDirs?: string[];
}

export type TestSmellName =
  | "loose-locator"
  | "vi-mock-tdz"
  | "framenavigated-reload-detector"
  | "delete-teardown"
  | "broad-integrity-except"
  | "schema-unsatisfiable-ref"
  | "whole-table-aggregate"
  | "fixed-key-e2e"
  | "migration-marker-presence"
  | "relative-migration-revision"
  | "reversible-invariant-round-trip"
  | "pytest-bdd-parse-conversion"
  | "dropped-column-dangling-reference"
  | "component-test-mock"
  | "dsn-inline-credentials"
  | "unpinned-schema-diff-baseline";

/** Test-smell classes that CANNOT be closed by a surgical Driver repair (narrow a catch,
 *  drop a teardown): they require RE-AUTHORING the test's mechanics, which a Driver
 *  code-repair cannot do. Two are migration-reversibility shapes (explicit `down_revision`,
 *  a round-trip); one is a topology-dependent schema-diff assertion (pin a fixed baseline).
 *  A green-failure carrying one of these escalates to the test's AUTHOR (HIL) on the first
 *  failure instead of burning bounded assess->repair rounds that can never green it (the churn
 *  observed when a reversible-invariant-round-trip smell looped driver-repair). They
 *  need the test RE-AUTHORED (pin the migration's own down_revision; restructure into a
 *  round-trip; pin the schema-diff `--against` baseline) — a mechanical edit cannot do it.
 *  The rest of the issue #199 catalog
 *  (loose-locator, delete-teardown, broad-integrity-except, vi-mock-tdz, fixed-key-e2e,
 *  whole-table-aggregate, AND migration-marker-presence) IS surgically Driver-fixable and
 *  stays on the assess->repair path: adding `@pytest.mark.migration` to the schema-mutating
 *  scenarios is a mechanical marker edit that greens the verify (it routes the test to its
 *  own ephemeral branch), so it must NOT HIL-stop the drive. */
export const AUTHOR_LAYER_TEST_SMELLS: ReadonlySet<TestSmellName> = new Set<TestSmellName>([
  "relative-migration-revision",
  "reversible-invariant-round-trip",
  // A schema-diff assertion that depends on branch topology (no pinned --against baseline) can never
  // be greened by a code repair — the verify branch's parent is already migrated, so the diff is
  // empty regardless of the product. It needs the test RE-AUTHORED (pin a fixed baseline, or assert
  // the migration's own before/after on an isolated branch), so it escalates to the AUTHOR on the
  // first failure instead of burning assess->repair rounds (the F6/S3 T44 class).
  "unpinned-schema-diff-baseline",
]);

export interface TestSmellViolation {
  smell: TestSmellName;
  /** Project-relative file path. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** The offending source line (trimmed). */
  text: string;
  /** The specific fix for THIS occurrence. */
  detail: string;
}

export interface TestSmellCleanResult {
  clean: boolean;
  violations: TestSmellViolation[];
  /** A precise, Navigator-actionable fix list, or undefined when clean. */
  remediation?: string;
}

const DEFAULT_TEST_DIRS = ["tests", "client/tests"];
const DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
const EXCLUDE_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__|dist)(\/|$)/;
const TEST_FILE = /\.(spec|test)\.(ts|tsx|js|jsx|mjs)$|\.py$/;

function walk(dir: string, keep: (abs: string) => boolean, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!EXCLUDE_DIR.test(abs)) walk(abs, keep, out);
    } else if (st.isFile() && keep(abs)) {
      out.push(abs);
    }
  }
  return out;
}

/** Every table the project's migrations create or alter (the satisfiable-schema set). */
function collectKnownTables(projectDir: string, migrationDirs: string[]): Set<string> {
  const tables = new Set<string>();
  const patterns = [
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)/gi, // SQL
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`]?(\w+)/gi, // SQL
    /op\.create_table\(\s*["'](\w+)["']/gi, // Alembic
    /createTable\(\s*["'](\w+)["']/gi, // Knex
  ];
  for (const md of migrationDirs) {
    const abs = join(projectDir, md);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs, (p) => [".py", ".sql", ".js", ".ts"].includes(extname(p)))) {
      let body: string;
      try {
        body = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const re of patterns) {
        for (const m of body.matchAll(re)) tables.add(m[1].toLowerCase());
      }
    }
  }
  return tables;
}

const SMELL_FIX: Record<TestSmellName, string> = {
  "loose-locator":
    "scope the locator to a UNIQUE KEY (a row by its sku/id, e.g. getByRole('row', { name: sku })) and match exactly ({ exact: true } or a word-boundary/anchored regex) – a bare short literal or broad alternation substring-matches other cells and random-UUID digits, a flaky strict-mode collision that only shows at full-suite verify",
  "vi-mock-tdz":
    "vi.mock factories hoist ABOVE top-level consts (TDZ ReferenceError, the suite then reports 0 tests) – build shared fixture data INSIDE the factory, or wrap it in vi.hoisted(() => {...})",
  "framenavigated-reload-detector":
    "framenavigated fires for History-API (React Router) navigation too – assert the navigation STATE (page.url() / rendered content), never the event",
  "delete-teardown":
    "a DELETE-based teardown breaks on append-only triggers and ON DELETE RESTRICT FKs, and can wipe a sibling story's seed – rely on per-run uuid keys for isolation (no cleanup); only delete rows the test itself created, scoped by those keys",
  "broad-integrity-except":
    "a bare `except IntegrityError`/`except Exception` swallow catches the UMBRELLA (unique + check + FK violations) with no discrimination and masks the real failure – a wrong table/column name then reads as the expected conflict. Catch the specific subclass (UniqueViolation / CheckViolation / NotNullViolation), or discriminate explicitly: assert on the exception's message or isinstance against the subclass (a broad catch WITH a discriminating assert is fine and is not flagged)",
  "schema-unsatisfiable-ref":
    "the test references a table NO migration creates, so it is unsatisfiable (UndefinedTable on every run) – fix the table name (see the known tables below) or add the migration; never paper it over with a broad except",
  "whole-table-aggregate":
    "an ABSOLUTE whole-table COUNT/SUM with no seed-scope and no delta passes on the isolated branch but FAILS once other stories' rows share the DB (the aggregate-isolation rule: own the state). Scope BOTH the seed AND the assertion to the test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA (count_after - count_before == seeded), never an absolute whole-table total",
  "fixed-key-e2e":
    "this Playwright e2e spec CREATES a record (fills a form + submits) but seeds no per-run-unique key, so it uses a HARDCODED business key (SKU/code/name). The e2e verify runs against the SHARED feature branch, which already holds the row a prior run/sibling story created with that same key — so the second run hits a unique-violation (or asserts a stale duplicate) and the row goes perma-red, costing a reflect/assess lap on a correct app. Derive a per-run-unique key (e.g. `const sku = 'SKU-' + crypto.randomUUID().slice(0, 8)`) and use that SAME value in both the create fill and the assertion locator, so each run owns its own row",
  "migration-marker-presence":
    "a downgrade/upgrade test without @pytest.mark.migration runs on the SHARED verify DB and drops/alters its live schema for every other test. Add @pytest.mark.migration so the verify harness routes it to its OWN ephemeral branch (single-step downgrade -1 + upgrade head, never downgrade base)",
  "relative-migration-revision":
    "a reversibility test asserts a NAMED column is absent after a RELATIVE `downgrade -1` (and/or restores with `upgrade head`) – this assumes THAT column's migration is the current head, so the moment a later feature stacks a migration on top, `-1` reverses the WRONG migration and the column-absence assertion can never pass again (the F6/S1-broke-F1/S3 par_level class). Pin the migration's OWN revision instead: downgrade to its down_revision and upgrade to its revision, so the round-trip validates THIS migration independent of any later head",
  "reversible-invariant-round-trip":
    "a migration_reversible persistence invariant is covered by a FORWARD-ONLY test (no downgrade), which does not exercise reversibility – and on an already-migrated shared branch a forward-only seed-then-migrate is unsatisfiable. Re-author as an explicit round-trip (downgrade → seed/migrate → upgrade → assert), or retag the reversible invariant's coverage to the round-trip test that performs it",
  "pytest-bdd-parse-conversion":
    "a parse()/parsers.parse() step pattern uses a Python str.format conversion flag (!r / !s / !a); the `parse` library backing pytest-bdd supports the format SPEC ({name:type}) but NOT conversions, so the step text never matches the feature and the step raises StepDefinitionNotFoundError – the app can never green it. Drop the conversion and quote the value in the pattern instead (e.g. parse('… \"{name}\"') to match a quoted feature value, or parse('… {name}') for a bare token), matching how the .feature file writes it",
  "dropped-column-dangling-reference":
    "a contract migration DROPPED this column, but app/seed code still references it – the migration succeeds yet the app then emits SQL for a column the DB no longer has and crashes at runtime ('column does not exist'), a path a green test suite can miss (the F6/S2 seed_dev.py class, hard rule 9: contract-incompleteness). Remove or re-point the reference to the surviving columns; NEVER re-add the column to the model or edit the migration/tests to hide it",
  "component-test-mock":
    "a client COMPONENT test (client/**/*.test.tsx) MOCKS the data path (a stubbed/spied/assigned global `fetch`, MSW, or a `vi.mock` of the app's api/service/http module). Kit principle: NEVER mock when a real counterpart exists — a component that talks to the backend in production must talk to the REAL backend in test. The vitest harness boots a real backend (vitest.globalSetup.ts) and the fetch shim (tests/setup.ts) routes `/api` to it, so render the component and let its real `/api` calls hit the live service against the paired-branch DB; assert on what comes back. Remove the mock. (A clock — vi.useFakeTimers — or a genuinely third-party module with no real counterpart stays allowed.)",
  "dsn-inline-credentials":
    "a DSN literal in this test carries INLINE credentials (scheme://user:pass@host). Even a deliberately fake example — a postgresql:// URL with a someuser:pw@ credential segment (host dbhost.invalid) — matches the corporate postgres-connection-string secret-scanner and BLOCKS the merge commit on every Databricks machine — not a real leak, but the git hook cannot tell. A config/example DSN needs no credentials for host/port/database assertions: drop them (postgresql://dbhost.invalid:5432/somedb asserts the same host/port/db), or assemble a credentialed DSN from parts at runtime if a test genuinely needs one. Real DB connections come from DATABASE_URL / a fixture, never a source literal.",
  "unpinned-schema-diff-baseline":
    "this test runs the parent-aware `lakebase-schema-diff` with NO --against/--comparison-branch, so the CLI resolves the comparison branch from metadata = the branch's OWN parent (sourceBranchId). Under the build-lane verify the test runs on an ephemeral CHILD of the experiment branch, whose parent is ALREADY migrated to head — the parent-aware diff is EMPTY, so an assertion that it lists a column added/removed can never pass by ANY product change (the outcome depends on branch topology, not code: the F6/S3 T44 class). Pin a FIXED baseline: pass `--against <pre-migration branch>` (the feature base / main), OR assert the migration's OWN before/after on an isolated @pytest.mark.migration branch (downgrade to its down_revision, capture schema, upgrade head, compare). A diff invocation WITH --against is fine and is not flagged.",
};

/** The upgrade()-path body of an alembic migration (forward operations only) –
 *  the downgrade() reverse must NOT count toward the forward schema state (a
 *  contract migration's downgrade re-adds the column it drops). SQL/other files
 *  return the whole body. */
function forwardMigrationRegion(body: string): string {
  // Allow a return annotation (`def upgrade() -> None:`). Capture the upgrade body
  // only, up to the next top-level def (downgrade) – the downgrade REVERSES the
  // forward migration (a contract's downgrade re-adds what it dropped, an expand's
  // downgrade drops what it added), so counting it would invert the schema state.
  const m = body.match(/def\s+upgrade\s*\([^)]*\)\s*(?:->[^:]+)?:([\s\S]*?)(?:\ndef\s+\w+\s*\(|$)/);
  return m ? m[1] : body;
}

/** Columns whose NET-LATEST forward migration operation is a drop (created/added
 *  earlier, dropped later and never re-added), keyed by column name. Migrations
 *  are ordered by filename (the kit's timestamp-prefixed names sort chronologically). */
function collectDroppedColumns(projectDir: string, migrationDirs: string[]): Set<string> {
  const files: string[] = [];
  for (const md of migrationDirs) {
    const abs = join(projectDir, md);
    if (!existsSync(abs)) continue;
    for (const f of walk(abs, (p) => [".py", ".sql"].includes(extname(p)))) files.push(f);
  }
  files.sort();
  const GENERIC = new Set(["id", "name", "type", "value", "data", "status", "key", "code", "text"]);
  const last = new Map<string, "add" | "drop">();
  for (const f of files) {
    let body: string;
    try {
      body = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const region = f.endsWith(".py") ? forwardMigrationRegion(body) : body;
    for (const line of region.split("\n")) {
      for (const m of line.matchAll(/sa\.Column\(\s*["'](\w+)["']/g)) last.set(m[1], "add");
      for (const m of line.matchAll(/add_column\([^,]*,\s*sa\.Column\(\s*["'](\w+)["']/g)) last.set(m[1], "add");
      for (const m of line.matchAll(/ADD\s+COLUMN\s+["'`]?(\w+)/gi)) last.set(m[1].toLowerCase(), "add");
      for (const m of line.matchAll(/drop_column\([^,]*,\s*["'](\w+)["']/g)) last.set(m[1], "drop");
      for (const m of line.matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?["'`]?(\w+)/gi)) last.set(m[1].toLowerCase(), "drop");
    }
  }
  const dropped = new Set<string>();
  for (const [col, ev] of last) {
    if (ev === "drop" && col.length >= 4 && !GENERIC.has(col.toLowerCase())) dropped.add(col);
  }
  return dropped;
}

/** Lines in `body` where `col` appears as a LIVE reference – excluding `#`/`//`
 *  comments and triple-quoted docstring blocks (so an explanatory "the col was
 *  dropped" docstring is never mistaken for a live use, the grep error the live
 *  diagnosis made). Returns 1-based line numbers. */
/**
 * True iff a comment-stripped line references the dropped column in a way that actually reaches the
 * DB — the only shape that crashes at runtime after the column is gone. NOT every token that spells
 * the column name: a write-only request-model field annotation (`col: str | None = None`), a function
 * parameter annotation, or a plain argument (`split_col(_clean(col))`) never emits SQL for the column
 * and must not be flagged (the F6/S3 contract-drop false positives). The DB-facing shapes:
 *   (a) attribute access `Model.col` / `row.col`  — an ORM column read/write in a query;
 *   (b) an ORM column DECLARATION still mapping the dropped column (`col = Column(...)` /
 *       `mapped_column(...)` / `col: Mapped[...]`) — the ROOT cause when the model wasn't updated;
 *   (c) raw SQL naming the column (a quoted string carrying a SELECT/INSERT/UPDATE/DELETE verb).
 * Errs toward UNDER-flagging (the kit's no-false-positive-gate stance): a reference that fits none of
 * these is assumed harmless rather than flagged on a bare name match.
 */
function isDbColumnRef(codeLine: string, col: string): boolean {
  if (!new RegExp(`\\b${col}\\b`).test(codeLine)) return false;
  if (new RegExp(`\\.\\s*${col}\\b`).test(codeLine)) return true; // (a) attribute access
  if (/\b(?:Column|mapped_column)\s*\(|\bMapped\s*\[/.test(codeLine)) return true; // (b) ORM column decl
  if (/["'`]/.test(codeLine) && /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(codeLine)) return true; // (c) raw SQL
  return false;
}

function liveReferenceLines(body: string, col: string): number[] {
  const lines = body.split("\n");
  const out: number[] = [];
  let inDoc = false;
  let docQuote = "";
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (inDoc) {
      if (line.includes(docQuote)) inDoc = false;
      continue;
    }
    const tq = line.match(/"""|'''/);
    if (tq) {
      const q = tq[0];
      const after = line.slice(line.indexOf(q) + 3);
      if (!after.includes(q)) {
        line = line.slice(0, line.indexOf(q));
        inDoc = true;
        docQuote = q;
      }
    }
    const hash = line.indexOf("#");
    if (hash >= 0) line = line.slice(0, hash);
    const slash = line.indexOf("//");
    if (slash >= 0) line = line.slice(0, slash);
    if (isDbColumnRef(line, col)) out.push(i + 1);
  }
  return out;
}

/** Each line with its comment + docstring content BLANKED, so a raw-SQL matcher (schema-unsatisfiable-ref)
 *  scans only executable code — never prose. A `#`/`//` line comment is truncated; a triple-quoted
 *  Python docstring block is blanked for its whole span. Mirrors liveReferenceLines' comment logic.
 *  (The false positive this fixes: a conftest docstring "Append a per-test TABLE snapshot …" tripped
 *  the `TABLE\s+(\w+)` matcher on the English word "TABLE", flagging a nonexistent `snapshot` table.) */
function blankCommentsAndDocstrings(lines: string[]): string[] {
  const out: string[] = [];
  let inDoc = false;
  let docQuote = "";
  for (let line of lines) {
    if (inDoc) {
      if (line.includes(docQuote)) {
        inDoc = false;
        line = line.slice(line.indexOf(docQuote) + 3); // code after the closing quote stays
      } else {
        out.push("");
        continue;
      }
    }
    // Blank any COMPLETE single-line triple-quoted string (a one-line docstring or inline literal)
    // so prose inside it is never read as SQL — a `"""…BEFORE UPDATE trigger…"""` one-liner tripped
    // `UPDATE\s+(\w+)` on the word after UPDATE. Only an UNCLOSED `"""` falls through to the
    // multi-line span handling below (the previous logic blanked ONLY the multi-line case).
    line = line.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, " ");
    const tq = line.match(/"""|'''/);
    if (tq) {
      const q = tq[0];
      const after = line.slice(line.indexOf(q) + 3);
      if (!after.includes(q)) {
        line = line.slice(0, line.indexOf(q)); // keep code before the opening quote
        inDoc = true;
        docQuote = q;
      }
    }
    const hash = line.indexOf("#");
    if (hash >= 0) line = line.slice(0, hash);
    const slash = line.indexOf("//");
    if (slash >= 0) line = line.slice(0, slash);
    out.push(line);
  }
  return out;
}

/** A column a contract migration dropped, still referenced by LIVE app/seed code:
 *  the migration succeeds but the app emits SQL for a missing column and crashes
 *  at runtime – a path a green test suite can miss (the F6/S2 seed_dev.py class). */
function checkDroppedColumnDanglingRef(projectDir: string, migrationDirs: string[]): TestSmellViolation[] {
  const dropped = collectDroppedColumns(projectDir, migrationDirs);
  if (dropped.size === 0) return [];
  const out: TestSmellViolation[] = [];
  const migAbs = migrationDirs.map((d) => join(projectDir, d));
  const SRC_EXCLUDE = new RegExp(`(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|dist|build|${ARTIFACT_ROOTS_RE}|client|tests?|__tests__|e2e)(/|$)`);
  // DB-facing code only (.py + raw .sql): the failure mode is the app emitting SQL
  // for a missing column and crashing. A client .ts/.tsx never talks to the DB, so
  // a stale field name there is a DIFFERENT (lower-severity) class, not this one.
  const isSrc = (p: string) => /\.(py|sql)$/.test(p) && !migAbs.some((m) => p.startsWith(m));
  const srcFiles = walk(projectDir, (p) => isSrc(p) && !SRC_EXCLUDE.test(p));
  for (const f of srcFiles) {
    let body: string;
    try {
      body = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const rel = relative(projectDir, f);
    for (const col of dropped) {
      if (!body.includes(col)) continue;
      for (const line of liveReferenceLines(body, col)) {
        out.push({
          smell: "dropped-column-dangling-reference",
          file: rel,
          line,
          text: `live reference to dropped column '${col}'`,
          detail: SMELL_FIX["dropped-column-dangling-reference"],
        });
      }
    }
  }
  return out;
}

/** A migration_reversible persistence invariant (architecture.json) must be
 *  covered by a test whose description performs a downgrade+upgrade round-trip; a
 *  forward-only apply does not exercise reversibility (and on an already-migrated
 *  shared branch a forward-only seed-then-migrate is unsatisfiable). Deterministic
 *  from the invariant's declared type vs the covering item's description. */
function checkReversibleInvariantRoundTrip(projectDir: string): TestSmellViolation[] {
  const tdd = resolveConsortDir(projectDir);
  const featsDir = featuresDir(tdd);
  const out: TestSmellViolation[] = [];
  if (!existsSync(featsDir)) return out;
  for (const feature of readdirSync(featsDir)) {
    const archPath = architectureJson(tdd, feature);
    if (!existsSync(archPath)) continue;
    let arch: { persistence_invariants?: Array<{ id?: string; type?: string }> };
    try {
      arch = JSON.parse(readFileSync(archPath, "utf8"));
    } catch {
      continue;
    }
    const reversible = (arch.persistence_invariants ?? []).filter(
      (pi): pi is { id: string; type: string } =>
        typeof pi?.id === "string" && typeof pi?.type === "string" && /reversib/i.test(pi.type),
    );
    if (reversible.length === 0) continue;
    const itemSources = [join(featureDir(tdd, feature), "test-list.json")];
    const stDir = storiesDir(tdd, feature);
    if (existsSync(stDir)) {
      for (const s of readdirSync(stDir)) {
        const p = storyTestListJson(tdd, feature, s);
        if (existsSync(p)) itemSources.push(p);
      }
    }
    const items: Array<{ id?: string; invariant_id?: string; description?: string }> = [];
    for (const src of itemSources) {
      try {
        const tl = JSON.parse(readFileSync(src, "utf8")) as { items?: Array<{ id?: string; invariant_id?: string; description?: string }> };
        items.push(...(tl.items ?? []));
      } catch {
        /* skip a malformed list */
      }
    }
    for (const pi of reversible) {
      const covering = items.filter((it) => it.invariant_id === pi.id);
      // A migration_reversible test round-trips iff its description names BOTH
      // directions (downgrade AND upgrade), in ANY order/distance, or says "round-trip".
      // The prior proximity window (downgrade[\s\S]{0,80}upgrade) FALSE-NEGATIVED a
      // genuine round-trip whenever a descriptive clause pushed the two verbs >80 chars
      // apart (e.g. "a single-step downgrade … removes the par_level column …; a
      // subsequent upgrade re-adds …"), flagging it "forward-only" and bouncing a
      // correct test to the HIL. Naming both directions IS the round-trip signal.
      const hasRoundTrip = covering.some((it) => {
        const d = it.description ?? "";
        // Match the verb STEMS, not the exact words, so gerund/past-tense forms count:
        // "Downgrading to its own down_revision then upgrading head" IS a round-trip even
        // though the bare words "downgrade"/"upgrade"/"round-trip" never appear. The prior
        // exact-word regex (\bdowngrade\b / \bupgrade\b) false-negatived that genuine T9
        // round-trip and bounced a correct test to the HIL.
        return (/\bround.?trip\b/i.test(d)) || (/\bdowngrad\w*/i.test(d) && /\bupgrad\w*/i.test(d));
      });
      // ONLY flag a COVERED-but-forward-only invariant — this smell is about round-trip QUALITY, not
      // coverage. An UNCOVERED reversible invariant (covering.length === 0) is a coverage concern
      // owned by checkPersistenceCoverage, which is story-anchored (an invariant whose migration is a
      // LATER story's is covered THERE, not flagged during an earlier story's build). Firing here on
      // covering=[] falsely halted S1's build for PI6, whose SC5 index migration belongs to S2 and is
      // un-buildable in S1. Require a covering item so this stays a quality check, not a premature
      // cross-story coverage halt.
      if (covering.length > 0 && !hasRoundTrip) {
        out.push({
          smell: "reversible-invariant-round-trip",
          file: relative(projectDir, featureDir(tdd, feature)),
          line: 1,
          text: `invariant ${pi.id} (migration_reversible) covered only by forward-only test(s)`,
          detail: SMELL_FIX["reversible-invariant-round-trip"],
        });
      }
    }
  }
  return out;
}

/** Scan the project's test files for the authoring-smell catalog. */
export function checkTestSmells(args: TestSmellArgs): TestSmellCleanResult {
  const testDirs = args.testDirs ?? DEFAULT_TEST_DIRS;
  const knownTables = collectKnownTables(args.projectDir, args.migrationDirs ?? DEFAULT_MIGRATION_DIRS);
  const violations: TestSmellViolation[] = [];

  const push = (smell: TestSmellName, file: string, line: number, text: string, extra?: string) =>
    violations.push({ smell, file, line, text: text.trim().slice(0, 200), detail: SMELL_FIX[smell] + (extra ? ` (${extra})` : "") });

  for (const td of testDirs) {
    const abs = join(args.projectDir, td);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs, (p) => TEST_FILE.test(p))) {
      let lines: string[];
      try {
        lines = readFileSync(file, "utf8").split("\n");
      } catch {
        continue;
      }
      const rel = relative(args.projectDir, file);
      const body = lines.join("\n");
      const isJs = /\.(ts|tsx|js|jsx|mjs)$/.test(file);
      const isPy = file.endsWith(".py");
      // A client COMPONENT test (`.test.tsx` under client/, NOT an e2e `.spec.ts`) — the no-mock rule
      // applies to these: they must hit the real backend over `/api`, not a stubbed data path.
      const isComponentTest = isJs && /\.test\.(ts|tsx|js|jsx|mjs)$/.test(file) && file.replace(/\\/g, "/").includes("/client/");

      // vi-mock-tdz: a vi.mock factory closing over a same-file top-level const with
      // no vi.hoisted anywhere in the file. File-level check (once per file).
      if (isJs && body.includes("vi.mock(") && !body.includes("vi.hoisted")) {
        const constBefore = body.match(/^const\s+(\w+)\s*=[\s\S]{0,400}?vi\.mock\(/m);
        if (constBefore && new RegExp(`\\b${constBefore[1]}\\b`).test(body.slice(body.indexOf("vi.mock(")))) {
          const idx = lines.findIndex((l) => l.includes("vi.mock("));
          push("vi-mock-tdz", rel, idx + 1, lines[idx] ?? "vi.mock(", `const '${constBefore[1]}' is referenced by the factory`);
        }
      }

      // Teardown context tracking for delete-teardown (approximate block scope).
      let teardownDepth = 0;
      // Comment/docstring-blanked lines for the raw-SQL (schema-unsatisfiable-ref) scan, so prose
      // like a docstring's "TABLE snapshot" never reads as a SQL table reference.
      const codeLines = blankCommentsAndDocstrings(lines);
      lines.forEach((text, i) => {
        const line = i + 1;
        if (/^\s*(afterEach|afterAll|teardown|tearDown|def\s+tear\w*|def\s+cleanup)\b/.test(text)) teardownDepth = 1;
        else if (/^\s*(it|test|describe|beforeEach|beforeAll|def\s+\w+)\b/.test(text)) teardownDepth = 0;

        // loose-locator (JS Playwright): bare short literal without exact, or a
        // broad unanchored alternation of common words.
        if (isJs) {
          // Bare NUMERIC (or <=3-char) literal without exact/scoping: the T20/T25
          // class ("5"/"7" substring-matching other cells or UUID digits). A plain
          // word label ("Save") is lower-risk and left to the prose canon.
          const bare = text.match(/getBy(Text|Role)\(\s*["'`]([^"'`]{1,12})["'`]\s*\)/);
          if (bare && (/^\d[\d.,%$]*$/.test(bare[2]) || bare[2].length <= 3)) {
            push("loose-locator", rel, line, text, `bare ${bare[1]}("${bare[2]}") with no exact/scoping`);
          }
          const broadRe = text.match(/getBy(Text|Role)\(\s*\/([^/]*\|[^/]*)\/[a-z]*\s*\)/);
          if (broadRe && /not found|error|404|invalid|success|delete|update/i.test(broadRe[2]) && !/\^|\$|\\b/.test(broadRe[2])) {
            push("loose-locator", rel, line, text, `unanchored alternation /${broadRe[2]}/ substring-matches UUID digits + unrelated cells`);
          }
          if (/\.on\(\s*["']framenavigated["']/.test(text)) {
            push("framenavigated-reload-detector", rel, line, text);
          }
        }

        // component-test-mock (JS client component test): the data path is mocked — a stubbed/
        // spied/assigned global fetch, MSW, or a vi.mock of the app's api/service/http module.
        // The kit principle forbids mocking when a real backend is available (the vitest harness
        // boots one). A clock mock / a genuinely third-party vi.mock stays allowed.
        if (isComponentTest) {
          if (
            /vi\.stubGlobal\(\s*["']fetch["']/.test(text) ||
            /vi\.spyOn\([^)]*,\s*["']fetch["']\s*\)/.test(text) ||
            /(?:globalThis|global|window)\.fetch\s*=/.test(text)
          ) {
            push("component-test-mock", rel, line, text, "stubs the global fetch");
          } else if (/from\s+["']msw["']/.test(text) || /\bsetupServer\(/.test(text)) {
            push("component-test-mock", rel, line, text, "MSW network mock");
          } else if (/vi\.mock\(\s*["'][^"']*(?:\/api\b|\bapi\/|service|\/http\b|repository|fetch)[^"']*["']/i.test(text)) {
            push("component-test-mock", rel, line, text, "vi.mock of the app's data/API module");
          }
        }

        // delete-teardown: a destructive delete inside a teardown hook block.
        if (teardownDepth > 0 && /DELETE\s+FROM|deleteMany\(|\.delete\(\s*\{|TRUNCATE/i.test(text)) {
          push("delete-teardown", rel, line, text);
        }

        // dsn-inline-credentials: a DSN literal carrying inline credentials (scheme://user:pass@host).
        // Scanned on the RAW line (not comment-blanked) because the corporate secret-scanner reads the
        // whole file, comments included — even a fake example (a postgresql:// URL with a someuser:pw@
        // segment, host dbhost.invalid) trips the postgres-connection-string rule and blocks the merge
        // commit. A credential-less DSN
        // (postgresql://dbhost.invalid:5432/somedb) does NOT match: the `:…@` credential segment is
        // required. Real connections come from env/fixtures, so a source literal only ever needs the
        // host/port/db an example asserts.
        if (/\b(?:postgres(?:ql)?|mysql|mongodb|redis|amqp)(?:\+\w+)?:\/\/[^\s/@"'`]*:[^\s/@"'`]*@/.test(text)) {
          push("dsn-inline-credentials", rel, line, text, "inline user:pass@ in a DSN literal");
        }

        // broad-integrity-except (Python): the umbrella catch – but ONLY when it
        // is a bare swallow. An `except (IntegrityError|Exception) as <name>` whose
        // block DISCRIMINATES on <name> (an assert on its message, or an isinstance
        // check against the specific subclass) is a narrowing pattern, not a smell:
        // a wrong table (UndefinedTable) cannot pass that assertion. Flag the bare
        // swallows (`except ... : pass`, or a bound name never asserted on), which
        // are the ones that actually mask the real failure.
        if (isPy) {
          const m = text.match(/^\s*except\s*(IntegrityError|Exception)\b(?:\s+as\s+(\w+))?/);
          if (m) {
            const varName = m[2];
            const discriminated =
              varName !== undefined &&
              lines
                .slice(i + 1, i + 8)
                .some((l) => new RegExp(`\\b${varName}\\b`).test(l) && /assert|isinstance|str\(|print|log|raise/.test(l));
            if (!discriminated) {
              push("broad-integrity-except", rel, line, text);
            }
          }
        }

        // pytest-bdd-parse-conversion (Python): a parsers.parse()/parse() step
        // pattern using a Python str.format CONVERSION flag ({name!r}/{name!s}/
        // {name!a}). The `parse` library that backs pytest-bdd supports the format
        // SPEC ({name:type}) but NOT the !r/!s/!a conversions, so the step text
        // never matches the feature -> StepDefinitionNotFoundError. The step can
        // never bind, so the app can never green it (the F6/S2 T19/T20 class).
        if (isPy && /\bparse(?:rs)?\.(?:parse|re)\s*\(/.test(text) && /\{[^{}]*![rsa][^{}]*\}/.test(text)) {
          const conv = text.match(/\{[^{}]*(![rsa])[^{}]*\}/);
          push("pytest-bdd-parse-conversion", rel, line, text, `${conv ? conv[1] : "!r"} conversion in a parse() step pattern`);
        }

        // whole-table-aggregate: an ABSOLUTE whole-table COUNT/SUM with no seed-scope
        // (uuid/unique-key/WHERE filter) and no delta (before/after subtraction). An
        // absolute whole-table total passes on an isolated branch and fails once other
        // stories' rows share the DB (the F6/S1 aggregate-isolation class).
        if (/COUNT\s*\(\s*\*\)|SELECT\s+COUNT/i.test(text)) {
          const region = lines.slice(Math.max(0, i - 40), i + 14).join("\n");
          const absoluteCount = /==\s*\d+|assert(?:Equals|Equal|That)?\s*\(?\s*\d+\s*\)|toBe\(\s*\d+|equals the (seeded|expected|recorded) count/i.test(region);
          const scopedOrDelta = /uuid|randomUUID|unique|WHERE|where|filter|delta|count_before|probe_before|before_seed|subtract|minus/i.test(region);
          if (absoluteCount && !scopedOrDelta) {
            push("whole-table-aggregate", rel, line, text, "absolute whole-table count with no seed-scope and no delta");
          }
        }

        // schema-unsatisfiable-ref: a raw-SQL table ref no migration creates. Scan the
        // comment/docstring-blanked line so prose (e.g. a docstring's "TABLE snapshot") is not read
        // as SQL — the false positive that halted this build on the per-test-capture conftest.
        if (knownTables.size > 0) {
          // DML keywords take a bare table (`FROM foo`), but `TABLE foo` requires a DDL verb
          // (CREATE/ALTER/DROP/TRUNCATE TABLE foo) — the bare `TABLE <word>` alternative matched the
          // English word "TABLE" in prose ("per-test TABLE snapshot"), the false positive this fixes.
          for (const m of codeLines[i].matchAll(
            /\b(?:FROM|JOIN|INTO|UPDATE)\s+["'`]?(\w+)["'`]?|\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?["'`]?(\w+)/g,
          )) {
            const ref = (m[1] ?? m[2]).toLowerCase();
            // Postgres SYSTEM CATALOGS (information_schema.*, pg_catalog.*, the pg_* tables) are
            // always present and NEVER created by a migration — a schema-inspection test that reads
            // information_schema to PROVE a column was dropped (the contract story's whole point) is
            // correct, not unsatisfiable. `FROM information_schema.columns` captures ref
            // "information_schema"; `FROM pg_catalog.pg_tables` captures "pg_catalog"; an unqualified
            // `FROM pg_class` captures "pg_class". Exempt all three shapes.
            const systemCatalog = ref === "information_schema" || ref.startsWith("pg_");
            // Alembic's migration-version bookkeeping table (`alembic_version`) is created by Alembic
            // itself, NOT by an app migration, and is present on every migrated branch — so a test that
            // reads it to assert the current head revision (the natural check for a contract /
            // reversibility story) is correct, not unsatisfiable. (`alembic_version` is Alembic's
            // default; a custom version_table is rare and would be a knownTables entry anyway.)
            const migrationBookkeeping = ref === "alembic_version";
            // `on`/`of` are never table names: they're TRIGGER-TIMING captures — `CREATE TRIGGER t
            // BEFORE UPDATE ON <table>` and `AFTER UPDATE OF <col> ON <table>` make `UPDATE\s+(\w+)`
            // grab "on"/"of", not a real table. Skip them so trigger DDL isn't flagged unsatisfiable.
            if (!/^(select|where|set|values|lateral|only|unnest|generate_series|dual|on|of)$/.test(ref) && !systemCatalog && !migrationBookkeeping && !knownTables.has(ref)) {
              push("schema-unsatisfiable-ref", rel, line, text, `table '${ref}' not created by any migration; known: ${[...knownTables].slice(0, 8).join(", ")}`);
            }
          }
        }
      });

      // migration-marker-presence (file level, Python): a schema-MUTATING migration
      // test (downgrade and/or upgrade) without @pytest.mark.migration – without the
      // isolation tag it runs on the SHARED verify DB and drops/alters its live
      // schema for every other test in the suite (the F6/S1 T14 class). The marker
      // routes it to its own ephemeral branch.
      if (isPy && /command\.downgrade|alembic\s+downgrade|\.downgrade\(|downgrade\s+-1|run_downgrade/i.test(body) && !/pytest\.mark\.migration|mark\.migration/.test(body)) {
        push("migration-marker-presence", rel, 1, "(file)", "a downgrade test without @pytest.mark.migration (drops schema on the shared verify DB)");
      }

      // relative-migration-revision (file level, Python): a reversibility test that
      // asserts a NAMED column is absent after a RELATIVE downgrade (`downgrade -N`)
      // assumes THAT column's migration is the current head. A later feature stacking
      // a migration on top shifts what `-N` reverses, so `<col> not in cols` can never
      // pass again (the F6/S1 additive migration broke F1/S3's par_level `-1` round-trip).
      // Pin the migration's OWN revision instead of relative -N/head. Requires BOTH
      // signals so a legitimately-pinned round-trip (downgrade "<rev>") is never flagged.
      const relativeDowngrade = /(?:["']downgrade["']\s*,\s*|alembic\s+downgrade\s+|downgrade\s+)["']?-\d+["']?/i.test(body);
      const namedColumnAbsent = /["'`]\w+["'`]\s+not\s+in\s+\w*col/i.test(body);
      if (isPy && relativeDowngrade && namedColumnAbsent) {
        const col = body.match(/["'`](\w+)["'`]\s+not\s+in\s+\w*col/i);
        push(
          "relative-migration-revision",
          rel,
          1,
          "(file)",
          `asserts ${col ? `'${col[1]}'` : "a named column"} absent after a relative 'downgrade -N' – pin the migration's own revision (down_revision + revision), not -N/head`,
        );
      }

      // unpinned-schema-diff-baseline (file level): a verify/build test that shells out to the
      // parent-aware `lakebase-schema-diff` (CLI or MCP) WITHOUT a pinned --against/--comparison-branch.
      // With no baseline the CLI resolves the comparison branch from metadata = the branch's OWN parent
      // (sourceBranchId). Under the build-lane verify the test runs on an ephemeral CHILD of the
      // experiment branch, whose parent is ALREADY migrated to head, so the parent-aware diff is EMPTY
      // and an assertion that it lists a column added/removed can never pass by any product change — the
      // outcome depends on branch topology, not code (the F6/S3 T44 class). Requires the diff invocation
      // WITHOUT a pinned baseline so a correctly-pinned (`--against <ref>`) diff is never flagged.
      const invokesSchemaDiff = /lakebase-schema-diff|lakebase_schema_diff/.test(body);
      const pinsSchemaDiffBaseline = /--against\b|--comparison-branch\b|comparisonBranch\b/.test(body);
      if (invokesSchemaDiff && !pinsSchemaDiffBaseline) {
        push(
          "unpinned-schema-diff-baseline",
          rel,
          1,
          "(file)",
          "runs lakebase-schema-diff with no --against baseline (the verify branch's parent is already migrated → empty diff)",
        );
      }

      // fixed-key-e2e (file level, Playwright e2e spec): a spec that CREATES a record (fills a form +
      // clicks a create/add/file/save/submit control) but contains NO per-run uniqueness source anywhere,
      // so it necessarily uses a HARDCODED business key. The e2e verify runs on the SHARED feature branch,
      // which already holds the row a prior run/sibling seeded with that same key — the second run hits a
      // unique-violation (or asserts a stale duplicate) and the row goes perma-red on a correct app. Scoped
      // strictly to real e2e specs (jsdom component tests mock the backend, so no DB collision). Requires
      // BOTH the fill AND the submit control so a read-only navigation spec is never flagged.
      const isE2eSpec = isJs && /(^|\/)e2e\/[^/]*\.spec\.(ts|tsx|js|jsx|mjs)$/.test(file.replace(/\\/g, "/"));
      if (isE2eSpec) {
        const hasFill = /\.fill\s*\(/.test(body);
        const hasSubmit =
          /getByRole\(\s*["']button["'][\s\S]{0,80}?\b(create|add|new|file|save|submit|register|record)\b/i.test(body) ||
          /getByText\(\s*["'`\/][^)]{0,40}\b(create|add|new|file|save|submit|register)\b/i.test(body);
        const uniquenessSource = /randomUUID|crypto\b|Date\.now|\buuid\b|performance\.now|Math\.random|nanoid|new Date\(|getTime\(/i.test(body);
        if (hasFill && hasSubmit && !uniquenessSource) {
          push("fixed-key-e2e", rel, 1, "(file)", "a create-flow e2e spec with no per-run-unique key seed (crypto.randomUUID)");
        }
      }
    }
  }

  // reversible-invariant-round-trip (project artifacts): a migration_reversible
  // persistence invariant must be covered by a test whose description performs a
  // downgrade+upgrade round-trip; a forward-only apply does not exercise
  // reversibility (the F6/S1 T9 class: a reversible PI tagged to a forward-only,
  // unsatisfiable-on-a-migrated-branch test).
  violations.push(...checkReversibleInvariantRoundTrip(args.projectDir));

  // dropped-column-dangling-reference: a contract migration dropped a column but
  // live app/seed code still references it – the migration succeeds, then the app
  // crashes at runtime on a path a green test suite can miss (F6/S2 seed_dev.py,
  // hard rule 9). Deterministic from migrations + a comment-excluding source scan.
  violations.push(...checkDroppedColumnDanglingRef(args.projectDir, args.migrationDirs ?? DEFAULT_MIGRATION_DIRS));

  if (violations.length === 0) return { clean: true, violations: [] };
  const list = violations.map((v) => `  [${v.smell}] ${v.file}:${v.line}  ${v.text}\n      fix: ${v.detail}`).join("\n");
  const remediation =
    `TEST-AUTHORING-SMELL: the test file(s) below carry authoring defects from the issue #199 catalog. ` +
    `The APP code is not the defect – do NOT route a Driver code repair; the test's AUTHOR fixes these in the test ` +
    `(a flaky strict-mode collision / TDZ / unsatisfiable table ref cannot be greened by changing the app):\n${list}`;
  return { clean: false, violations, remediation };
}
