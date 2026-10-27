// ONE source of truth for parsing a project's migrations into the net set of
// add/drop COLUMN operations. Both deterministic contract checks read schema deltas
// straight from the migration files (never the live DB — the migration's own
// add/drop statements ARE the delta), and they MUST agree on what a migration did:
//   - contract-clean's `netDroppedSymbols` (the in-cycle supersession pre-flag + the
//     orchestrator's supersededTests union), and
//   - test-smell-clean's `collectDroppedColumns` (the deploy-verify dropped-column
//     self-heal classifier).
// They previously carried SEPARATE, DIVERGENT regexes: contract-clean required the
// drop_column TABLE argument to be a string literal, so a migration using the standard
// `TABLE = "stock_records"; op.drop_column(TABLE, "col")` idiom was invisible to it
// while test-smell (which used `[^,]*` for the table arg) saw it — a one-source-of-truth
// bug that silently no-op'd the supersession machinery and sent cross-story superseded
// tests terminal to HIL. This module is that single parser; both callers delegate here.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

export const DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];

/** Migration file types understood: alembic (.py), raw SQL (.sql), knex/umzug (.js/.ts). */
const MIGRATION_EXTS = new Set([".py", ".sql", ".js", ".ts"]);
const SKIP_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__|dist|build)(\/|$)/;

// The TABLE argument of an alembic op may be a string literal ('stock_records') OR a
// bare identifier bound to a module constant (`TABLE = "stock_records"`); accept either.
// Both the TABLE and the COLUMN argument may be a quoted literal ('tracking_code') OR a
// bare identifier bound to a module constant (`TABLE = "stock_records"; COLUMN = "tracking_code";
// op.drop_column(TABLE, COLUMN)`) — a standard alembic idiom the scaffolded migrations use. The
// column matchers capture TWO alternatives: group[literal] OR group[identifier]; an identifier is
// resolved to its string value via the file's module-level constants (resolveCol). This adds no
// false positives — an identifier that is not a known string const resolves to nothing and is skipped.
const IDENT = `[A-Za-z_][A-Za-z0-9_]*`;
const TABLE_ARG = `(?:['"][^'"]+['"]|${IDENT})`;
const COL_ARG = `(?:['"](${IDENT})['"]|(${IDENT}))`;
const DROP_COLUMN_PY = new RegExp(`op\\.drop_column\\(\\s*${TABLE_ARG}\\s*,\\s*${COL_ARG}`, "g");
const ADD_COLUMN_PY = new RegExp(`op\\.add_column\\(\\s*${TABLE_ARG}\\s*,\\s*sa\\.Column\\(\\s*${COL_ARG}`, "g");
// A bare sa.Column('x', ...) inside create_table / op.create_table also ADDS the column.
const SA_COLUMN_PY = new RegExp(`sa\\.Column\\(\\s*${COL_ARG}`, "g");
// Module-level string constants (NAME = "value") used to resolve a constant TABLE/COLUMN arg.
const MODULE_CONST = /(?:^|\n)[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*['"]([^'"]+)['"]/g;
// raw SQL (flyway / knex .raw / op.execute): ALTER TABLE t DROP COLUMN col / ADD COLUMN col.
// "drop column" (with whitespace) deliberately does NOT match the alembic `op.drop_column`
// identifier (underscore), so running these on .py catches only genuine raw-SQL ops.
const DROP_COLUMN_SQL = /drop\s+column\s+(?:if\s+exists\s+)?["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/gi;
const ADD_COLUMN_SQL = /add\s+column\s+(?:if\s+not\s+exists\s+)?["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/gi;

function walk(dir: string, out: string[] = []): string[] {
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
      if (!SKIP_DIR.test(abs)) walk(abs, out);
    } else if (st.isFile() && MIGRATION_EXTS.has(extname(abs))) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * The FORWARD (upgrade / up) half of a migration file, excluding the down/rollback
 * half. A normal REVERSIBLE migration adds a column in upgrade() and drops it in
 * downgrade() (or vice versa); counting the reverse half would misread that rollback
 * as a contract DROP (or re-add) and invert the schema state. Only the forward
 * direction defines the live schema.
 *   - alembic (.py): the `def upgrade(...)` body, up to the next top-level `def`.
 *   - knex / umzug (.js/.ts): the `up` function, up to the `down` half.
 *   - raw SQL (.sql): the whole file (forward-only by convention).
 */
function forwardMigrationBody(src: string, ext: string): string {
  if (ext === ".py") {
    const m = src.match(/def\s+upgrade\s*\([^)]*\)\s*(?:->[^:]+)?:([\s\S]*?)(?:\ndef\s+\w+\s*\(|$)/);
    return m ? m[1] : src;
  }
  if (ext === ".js" || ext === ".ts") {
    const up = /(exports\.up\b|async\s+function\s+up\b|\bup\s*[:=])/.exec(src);
    if (!up) return src;
    const after = src.slice(up.index + up[0].length);
    const rel = after.search(/(exports\.down\b|async\s+function\s+down\b|\bdown\s*[:=])/);
    return rel === -1 ? after : after.slice(0, rel);
  }
  return src;
}

interface ColEvent {
  pos: number;
  col: string;
  act: "add" | "drop";
}

/** Module-level string constants (NAME = "value"), for resolving a constant column arg. */
export function moduleConsts(src: string): Map<string, string> {
  const consts = new Map<string, string>();
  MODULE_CONST.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MODULE_CONST.exec(src)) !== null) consts.set(m[1], m[2]);
  return consts;
}

function eventsForFile(region: string, ext: string, consts: Map<string, string>): ColEvent[] {
  const evs: ColEvent[] = [];
  // PY column matchers capture [1]=quoted-literal, [2]=bare-identifier; resolve an identifier
  // to its module-constant string value (COLUMN = "tracking_code"), else skip (unknown ident).
  const pushPy = (re: RegExp, act: "add" | "drop") => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(region)) !== null) {
      const col = m[1] ?? (m[2] ? consts.get(m[2]) : undefined);
      if (col) evs.push({ pos: m.index, col, act });
    }
  };
  // SQL matchers capture the literal column name directly (group 1).
  const pushSql = (re: RegExp, act: "add" | "drop") => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(region)) !== null) evs.push({ pos: m.index, col: m[1], act });
  };
  if (ext === ".py") {
    pushPy(ADD_COLUMN_PY, "add");
    pushPy(SA_COLUMN_PY, "add");
    pushPy(DROP_COLUMN_PY, "drop");
    // a py migration may also drop via op.execute("... DROP COLUMN x")
    pushSql(DROP_COLUMN_SQL, "drop");
  } else {
    pushSql(ADD_COLUMN_SQL, "add");
    pushSql(DROP_COLUMN_SQL, "drop");
  }
  return evs.sort((a, b) => a.pos - b.pos);
}

/**
 * The net last add/drop action per column across all migrations. Migrations are read
 * in filename order (the kit's timestamp-prefixed names sort chronologically, a good
 * proxy for revision order); within one migration, ops apply in textual order. A
 * column whose LAST action is a drop was contract-dropped; one re-added by a later
 * migration nets back to "add".
 */
export function netColumnActions(projectDir: string, migrationDirs: string[] = DEFAULT_MIGRATION_DIRS): Map<string, "add" | "drop"> {
  const files: string[] = [];
  for (const md of migrationDirs) {
    const abs = join(projectDir, md);
    if (existsSync(abs)) walk(abs, files);
  }
  files.sort();
  const last = new Map<string, "add" | "drop">();
  for (const f of files) {
    let src: string;
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const ext = extname(f);
    // Module consts come from the WHOLE file (top-level), the forward region from upgrade() only.
    const consts = moduleConsts(src);
    for (const ev of eventsForFile(forwardMigrationBody(src, ext), ext, consts)) last.set(ev.col, ev.act);
  }
  return last;
}

/** Columns whose net-latest forward migration action is a drop (added earlier, dropped
 *  later and never re-added). The single detector both contract checks share. */
export function netDroppedColumns(projectDir: string, migrationDirs: string[] = DEFAULT_MIGRATION_DIRS): string[] {
  return [...netColumnActions(projectDir, migrationDirs).entries()]
    .filter(([, act]) => act === "drop")
    .map(([col]) => col);
}
