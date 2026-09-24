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
  | "schema-unsatisfiable-ref";

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
};

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

        // delete-teardown: a destructive delete inside a teardown hook block.
        if (teardownDepth > 0 && /DELETE\s+FROM|deleteMany\(|\.delete\(\s*\{|TRUNCATE/i.test(text)) {
          push("delete-teardown", rel, line, text);
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

        // schema-unsatisfiable-ref: a raw-SQL table ref no migration creates.
        if (knownTables.size > 0) {
          for (const m of text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+["'`]?(\w+)["'`]?/g)) {
            const ref = m[1].toLowerCase();
            if (!/^(select|where|set|values|lateral|only|unnest|generate_series|dual)$/.test(ref) && !knownTables.has(ref)) {
              push("schema-unsatisfiable-ref", rel, line, text, `table '${ref}' not created by any migration; known: ${[...knownTables].slice(0, 8).join(", ")}`);
            }
          }
        }
      });
    }
  }

  if (violations.length === 0) return { clean: true, violations: [] };
  const list = violations.map((v) => `  [${v.smell}] ${v.file}:${v.line}  ${v.text}\n      fix: ${v.detail}`).join("\n");
  const remediation =
    `TEST-AUTHORING-SMELL: the test file(s) below carry authoring defects from the issue #199 catalog. ` +
    `The APP code is not the defect – do NOT route a Driver code repair; the test's AUTHOR fixes these in the test ` +
    `(a flaky strict-mode collision / TDZ / unsatisfiable table ref cannot be greened by changing the app):\n${list}`;
  return { clean: false, violations, remediation };
}
