#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// consort/architecture/test-smell-clean.ts
var import_node_fs = require("fs");
var import_node_path2 = require("path");

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
var artifactRootsRegexAlternation = () => ALL_ARTIFACT_ROOTS.map((r2) => r2.replace(/[.]/g, "\\.")).join("|");
function resolveConsortDir(projectDir = process.cwd()) {
  const next = (0, import_node_path.join)(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = (0, import_node_path.join)(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var architectureJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "architecture.json");
var storiesDir = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => (0, import_node_path.join)(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyTestListJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "test-list-per-story.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}

// consort/architecture/test-smell-clean.ts
var ARTIFACT_ROOTS_RE = artifactRootsRegexAlternation();
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
    const abs = (0, import_node_path2.join)(dir, e);
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
    const abs = (0, import_node_path2.join)(projectDir, md);
    if (!(0, import_node_fs.existsSync)(abs)) continue;
    for (const file of walk(abs, (p2) => [".py", ".sql", ".js", ".ts"].includes((0, import_node_path2.extname)(p2)))) {
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
  "broad-integrity-except": "a bare `except IntegrityError`/`except Exception` swallow catches the UMBRELLA (unique + check + FK violations) with no discrimination and masks the real failure \u2013 a wrong table/column name then reads as the expected conflict. Catch the specific subclass (UniqueViolation / CheckViolation / NotNullViolation), or discriminate explicitly: assert on the exception's message or isinstance against the subclass (a broad catch WITH a discriminating assert is fine and is not flagged)",
  "schema-unsatisfiable-ref": "the test references a table NO migration creates, so it is unsatisfiable (UndefinedTable on every run) \u2013 fix the table name (see the known tables below) or add the migration; never paper it over with a broad except",
  "whole-table-aggregate": "an ABSOLUTE whole-table COUNT/SUM with no seed-scope and no delta passes on the isolated branch but FAILS once other stories' rows share the DB (the aggregate-isolation rule: own the state). Scope BOTH the seed AND the assertion to the test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA (count_after - count_before == seeded), never an absolute whole-table total",
  "migration-marker-presence": "a downgrade/upgrade test without @pytest.mark.migration runs on the SHARED verify DB and drops/alters its live schema for every other test. Add @pytest.mark.migration so the verify harness routes it to its OWN ephemeral branch (single-step downgrade -1 + upgrade head, never downgrade base)",
  "reversible-invariant-round-trip": "a migration_reversible persistence invariant is covered by a FORWARD-ONLY test (no downgrade), which does not exercise reversibility \u2013 and on an already-migrated shared branch a forward-only seed-then-migrate is unsatisfiable. Re-author as an explicit round-trip (downgrade \u2192 seed/migrate \u2192 upgrade \u2192 assert), or retag the reversible invariant's coverage to the round-trip test that performs it",
  "pytest-bdd-parse-conversion": "a parse()/parsers.parse() step pattern uses a Python str.format conversion flag (!r / !s / !a); the `parse` library backing pytest-bdd supports the format SPEC ({name:type}) but NOT conversions, so the step text never matches the feature and the step raises StepDefinitionNotFoundError \u2013 the app can never green it. Drop the conversion and quote the value in the pattern instead (e.g. parse('\u2026 \"{name}\"') to match a quoted feature value, or parse('\u2026 {name}') for a bare token), matching how the .feature file writes it",
  "dropped-column-dangling-reference": "a contract migration DROPPED this column, but app/seed code still references it \u2013 the migration succeeds yet the app then emits SQL for a column the DB no longer has and crashes at runtime ('column does not exist'), a path a green test suite can miss (the F6/S2 seed_dev.py class, hard rule 9: contract-incompleteness). Remove or re-point the reference to the surviving columns; NEVER re-add the column to the model or edit the migration/tests to hide it"
};
function forwardMigrationRegion(body) {
  const m = body.match(/def\s+upgrade\s*\([^)]*\)\s*(?:->[^:]+)?:([\s\S]*?)(?:\ndef\s+\w+\s*\(|$)/);
  return m ? m[1] : body;
}
function collectDroppedColumns(projectDir, migrationDirs) {
  const files = [];
  for (const md of migrationDirs) {
    const abs = (0, import_node_path2.join)(projectDir, md);
    if (!(0, import_node_fs.existsSync)(abs)) continue;
    for (const f of walk(abs, (p2) => [".py", ".sql"].includes((0, import_node_path2.extname)(p2)))) files.push(f);
  }
  files.sort();
  const GENERIC = /* @__PURE__ */ new Set(["id", "name", "type", "value", "data", "status", "key", "code", "text"]);
  const last = /* @__PURE__ */ new Map();
  for (const f of files) {
    let body;
    try {
      body = (0, import_node_fs.readFileSync)(f, "utf8");
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
  const dropped = /* @__PURE__ */ new Set();
  for (const [col, ev] of last) {
    if (ev === "drop" && col.length >= 4 && !GENERIC.has(col.toLowerCase())) dropped.add(col);
  }
  return dropped;
}
function liveReferenceLines(body, col) {
  const re = new RegExp(`\\b${col}\\b`);
  const lines = body.split("\n");
  const out = [];
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
    if (re.test(line)) out.push(i + 1);
  }
  return out;
}
function checkDroppedColumnDanglingRef(projectDir, migrationDirs) {
  const dropped = collectDroppedColumns(projectDir, migrationDirs);
  if (dropped.size === 0) return [];
  const out = [];
  const migAbs = migrationDirs.map((d) => (0, import_node_path2.join)(projectDir, d));
  const SRC_EXCLUDE = new RegExp(`(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|dist|build|${ARTIFACT_ROOTS_RE}|client|tests?|__tests__|e2e)(/|$)`);
  const isSrc = (p2) => /\.(py|sql)$/.test(p2) && !migAbs.some((m) => p2.startsWith(m));
  const srcFiles = walk(projectDir, (p2) => isSrc(p2) && !SRC_EXCLUDE.test(p2));
  for (const f of srcFiles) {
    let body;
    try {
      body = (0, import_node_fs.readFileSync)(f, "utf8");
    } catch {
      continue;
    }
    const rel = (0, import_node_path2.relative)(projectDir, f);
    for (const col of dropped) {
      if (!body.includes(col)) continue;
      for (const line of liveReferenceLines(body, col)) {
        out.push({
          smell: "dropped-column-dangling-reference",
          file: rel,
          line,
          text: `live reference to dropped column '${col}'`,
          detail: SMELL_FIX["dropped-column-dangling-reference"]
        });
      }
    }
  }
  return out;
}
function checkReversibleInvariantRoundTrip(projectDir) {
  const tdd = resolveConsortDir(projectDir);
  const featsDir = featuresDir(tdd);
  const out = [];
  if (!(0, import_node_fs.existsSync)(featsDir)) return out;
  for (const feature of (0, import_node_fs.readdirSync)(featsDir)) {
    const archPath = architectureJson(tdd, feature);
    if (!(0, import_node_fs.existsSync)(archPath)) continue;
    let arch;
    try {
      arch = JSON.parse((0, import_node_fs.readFileSync)(archPath, "utf8"));
    } catch {
      continue;
    }
    const reversible = (arch.persistence_invariants ?? []).filter(
      (pi) => typeof pi?.id === "string" && typeof pi?.type === "string" && /reversib/i.test(pi.type)
    );
    if (reversible.length === 0) continue;
    const itemSources = [(0, import_node_path2.join)(featureDir(tdd, feature), "test-list.json")];
    const stDir = storiesDir(tdd, feature);
    if ((0, import_node_fs.existsSync)(stDir)) {
      for (const s of (0, import_node_fs.readdirSync)(stDir)) {
        const p2 = storyTestListJson(tdd, feature, s);
        if ((0, import_node_fs.existsSync)(p2)) itemSources.push(p2);
      }
    }
    const items = [];
    for (const src of itemSources) {
      try {
        const tl = JSON.parse((0, import_node_fs.readFileSync)(src, "utf8"));
        items.push(...tl.items ?? []);
      } catch {
      }
    }
    for (const pi of reversible) {
      const covering = items.filter((it) => it.invariant_id === pi.id);
      const hasRoundTrip = covering.some(
        (it) => /downgrade[\s\S]{0,80}upgrade|upgrade[\s\S]{0,80}downgrade|round.?trip/i.test(it.description ?? "")
      );
      if (!hasRoundTrip) {
        out.push({
          smell: "reversible-invariant-round-trip",
          file: (0, import_node_path2.relative)(projectDir, featureDir(tdd, feature)),
          line: 1,
          text: `invariant ${pi.id} (migration_reversible) covered only by forward-only test(s)`,
          detail: SMELL_FIX["reversible-invariant-round-trip"]
        });
      }
    }
  }
  return out;
}
function checkTestSmells(args) {
  const testDirs = args.testDirs ?? DEFAULT_TEST_DIRS;
  const knownTables = collectKnownTables(args.projectDir, args.migrationDirs ?? DEFAULT_MIGRATION_DIRS);
  const violations = [];
  const push = (smell, file, line, text, extra) => violations.push({ smell, file, line, text: text.trim().slice(0, 200), detail: SMELL_FIX[smell] + (extra ? ` (${extra})` : "") });
  for (const td of testDirs) {
    const abs = (0, import_node_path2.join)(args.projectDir, td);
    if (!(0, import_node_fs.existsSync)(abs)) continue;
    for (const file of walk(abs, (p2) => TEST_FILE.test(p2))) {
      let lines;
      try {
        lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n");
      } catch {
        continue;
      }
      const rel = (0, import_node_path2.relative)(args.projectDir, file);
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
        if (isPy) {
          const m = text.match(/^\s*except\s*(IntegrityError|Exception)\b(?:\s+as\s+(\w+))?/);
          if (m) {
            const varName = m[2];
            const discriminated = varName !== void 0 && lines.slice(i + 1, i + 8).some((l) => new RegExp(`\\b${varName}\\b`).test(l) && /assert|isinstance|str\(|print|log|raise/.test(l));
            if (!discriminated) {
              push("broad-integrity-except", rel, line, text);
            }
          }
        }
        if (isPy && /\bparse(?:rs)?\.(?:parse|re)\s*\(/.test(text) && /\{[^{}]*![rsa][^{}]*\}/.test(text)) {
          const conv = text.match(/\{[^{}]*(![rsa])[^{}]*\}/);
          push("pytest-bdd-parse-conversion", rel, line, text, `${conv ? conv[1] : "!r"} conversion in a parse() step pattern`);
        }
        if (/COUNT\s*\(\s*\*\)|SELECT\s+COUNT/i.test(text)) {
          const region = lines.slice(Math.max(0, i - 40), i + 14).join("\n");
          const absoluteCount = /==\s*\d+|assert(?:Equals|Equal|That)?\s*\(?\s*\d+\s*\)|toBe\(\s*\d+|equals the (seeded|expected|recorded) count/i.test(region);
          const scopedOrDelta = /uuid|randomUUID|unique|WHERE|where|filter|delta|count_before|probe_before|before_seed|subtract|minus/i.test(region);
          if (absoluteCount && !scopedOrDelta) {
            push("whole-table-aggregate", rel, line, text, "absolute whole-table count with no seed-scope and no delta");
          }
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
      if (isPy && /command\.downgrade|alembic\s+downgrade|\.downgrade\(|downgrade\s+-1|run_downgrade/i.test(body) && !/pytest\.mark\.migration|mark\.migration/.test(body)) {
        push("migration-marker-presence", rel, 1, "(file)", "a downgrade test without @pytest.mark.migration (drops schema on the shared verify DB)");
      }
    }
  }
  violations.push(...checkReversibleInvariantRoundTrip(args.projectDir));
  violations.push(...checkDroppedColumnDanglingRef(args.projectDir, args.migrationDirs ?? DEFAULT_MIGRATION_DIRS));
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
