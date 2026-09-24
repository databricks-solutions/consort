#!/usr/bin/env node
"use strict";

// consort/architecture/test-smell-clean.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
var DEFAULT_TEST_DIRS = ["tests", "client/tests"];
var DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
var EXCLUDE_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__|dist)(\/|$)/;
var TEST_FILE = /\.(spec|test)\.(ts|tsx|js|jsx|mjs)$|\.py$/;
function walk(dir, keep, out = []) {
  let entries;
  try {
    entries = (0, import_node_fs.readdirSync)(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = (0, import_node_path.join)(dir, e);
    let st;
    try {
      st = (0, import_node_fs.statSync)(abs);
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
function collectKnownTables(projectDir, migrationDirs) {
  const tables = /* @__PURE__ */ new Set();
  const patterns = [
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)/gi,
    // SQL
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`]?(\w+)/gi,
    // SQL
    /op\.create_table\(\s*["'](\w+)["']/gi,
    // Alembic
    /createTable\(\s*["'](\w+)["']/gi
    // Knex
  ];
  for (const md of migrationDirs) {
    const abs = (0, import_node_path.join)(projectDir, md);
    if (!(0, import_node_fs.existsSync)(abs)) continue;
    for (const file of walk(abs, (p2) => [".py", ".sql", ".js", ".ts"].includes((0, import_node_path.extname)(p2)))) {
      let body;
      try {
        body = (0, import_node_fs.readFileSync)(file, "utf8");
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
var SMELL_FIX = {
  "loose-locator": "scope the locator to a UNIQUE KEY (a row by its sku/id, e.g. getByRole('row', { name: sku })) and match exactly ({ exact: true } or a word-boundary/anchored regex) \u2013 a bare short literal or broad alternation substring-matches other cells and random-UUID digits, a flaky strict-mode collision that only shows at full-suite verify",
  "vi-mock-tdz": "vi.mock factories hoist ABOVE top-level consts (TDZ ReferenceError, the suite then reports 0 tests) \u2013 build shared fixture data INSIDE the factory, or wrap it in vi.hoisted(() => {...})",
  "framenavigated-reload-detector": "framenavigated fires for History-API (React Router) navigation too \u2013 assert the navigation STATE (page.url() / rendered content), never the event",
  "delete-teardown": "a DELETE-based teardown breaks on append-only triggers and ON DELETE RESTRICT FKs, and can wipe a sibling story's seed \u2013 rely on per-run uuid keys for isolation (no cleanup); only delete rows the test itself created, scoped by those keys",
  "broad-integrity-except": "`except IntegrityError` catches the UMBRELLA (unique + check + FK violations) and masks the real failure \u2013 a wrong table/column name then reads as the expected conflict. Catch the specific subclass (UniqueViolation / CheckViolation) or assert on the error message",
  "schema-unsatisfiable-ref": "the test references a table NO migration creates, so it is unsatisfiable (UndefinedTable on every run) \u2013 fix the table name (see the known tables below) or add the migration; never paper it over with a broad except"
};
function checkTestSmells(args) {
  const testDirs = args.testDirs ?? DEFAULT_TEST_DIRS;
  const knownTables = collectKnownTables(args.projectDir, args.migrationDirs ?? DEFAULT_MIGRATION_DIRS);
  const violations = [];
  const push = (smell, file, line, text, extra) => violations.push({ smell, file, line, text: text.trim().slice(0, 200), detail: SMELL_FIX[smell] + (extra ? ` (${extra})` : "") });
  for (const td of testDirs) {
    const abs = (0, import_node_path.join)(args.projectDir, td);
    if (!(0, import_node_fs.existsSync)(abs)) continue;
    for (const file of walk(abs, (p2) => TEST_FILE.test(p2))) {
      let lines;
      try {
        lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n");
      } catch {
        continue;
      }
      const rel = (0, import_node_path.relative)(args.projectDir, file);
      const body = lines.join("\n");
      const isJs = /\.(ts|tsx|js|jsx|mjs)$/.test(file);
      const isPy = file.endsWith(".py");
      if (isJs && body.includes("vi.mock(") && !body.includes("vi.hoisted")) {
        const constBefore = body.match(/^const\s+(\w+)\s*=[\s\S]{0,400}?vi\.mock\(/m);
        if (constBefore && new RegExp(`\\b${constBefore[1]}\\b`).test(body.slice(body.indexOf("vi.mock(")))) {
          const idx = lines.findIndex((l) => l.includes("vi.mock("));
          push("vi-mock-tdz", rel, idx + 1, lines[idx] ?? "vi.mock(", `const '${constBefore[1]}' is referenced by the factory`);
        }
      }
      let teardownDepth = 0;
      lines.forEach((text, i) => {
        const line = i + 1;
        if (/^\s*(afterEach|afterAll|teardown|tearDown|def\s+tear\w*|def\s+cleanup)\b/.test(text)) teardownDepth = 1;
        else if (/^\s*(it|test|describe|beforeEach|beforeAll|def\s+\w+)\b/.test(text)) teardownDepth = 0;
        if (isJs) {
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
        if (teardownDepth > 0 && /DELETE\s+FROM|deleteMany\(|\.delete\(\s*\{|TRUNCATE/i.test(text)) {
          push("delete-teardown", rel, line, text);
        }
        if (isPy && /^\s*except\s*(IntegrityError|Exception)\b/.test(text)) {
          push("broad-integrity-except", rel, line, text);
        }
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
  const list = violations.map((v) => `  [${v.smell}] ${v.file}:${v.line}  ${v.text}
      fix: ${v.detail}`).join("\n");
  const remediation = `TEST-AUTHORING-SMELL: the test file(s) below carry authoring defects from the issue #199 catalog. The APP code is not the defect \u2013 do NOT route a Driver code repair; the test's AUTHOR fixes these in the test (a flaky strict-mode collision / TDZ / unsatisfiable table ref cannot be greened by changing the app):
${list}`;
  return { clean: false, violations, remediation };
}

// bin/consort/test-smell-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), tests: [], migrations: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--tests" && i + 1 < argv.length) out.tests.push(argv[++i]);
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `consort-test-smell-clean: prove the test files carry no issue #199 authoring smells

Usage:
  consort-test-smell-clean [--project-dir <path>] [--tests <rel> ...] [--migrations <rel> ...] [--json]

Exit 0 = clean; exit 1 = smells found (the test is the defect, not the app).
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var callArgs = { projectDir: p.projectDir };
if (p.tests.length > 0) callArgs.testDirs = p.tests;
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;
var r = checkTestSmells(callArgs);
if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}
`);
} else if (r.clean) {
  process.stdout.write(`test-smell-clean: OK (no issue #199 authoring smells)
`);
} else {
  process.stderr.write(`test-smell-clean: FAILED (${r.violations.length} authoring smell(s)).

${r.remediation}
`);
}
process.exit(r.clean ? 0 : 1);
