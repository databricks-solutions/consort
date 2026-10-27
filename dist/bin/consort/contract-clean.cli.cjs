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

// consort/architecture/contract-clean.ts
var import_node_fs2 = require("fs");
var import_node_path3 = require("path");

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
var artifactRootsRegexAlternation = () => ALL_ARTIFACT_ROOTS.map((r2) => r2.replace(/[.]/g, "\\.")).join("|");

// consort/architecture/migration-columns.ts
var import_node_fs = require("fs");
var import_node_path2 = require("path");
var DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
var MIGRATION_EXTS = /* @__PURE__ */ new Set([".py", ".sql", ".js", ".ts"]);
var SKIP_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__|dist|build)(\/|$)/;
var IDENT = `[A-Za-z_][A-Za-z0-9_]*`;
var TABLE_ARG = `(?:['"][^'"]+['"]|${IDENT})`;
var COL_ARG = `(?:['"](${IDENT})['"]|(${IDENT}))`;
var DROP_COLUMN_PY = new RegExp(`op\\.drop_column\\(\\s*${TABLE_ARG}\\s*,\\s*${COL_ARG}`, "g");
var ADD_COLUMN_PY = new RegExp(`op\\.add_column\\(\\s*${TABLE_ARG}\\s*,\\s*sa\\.Column\\(\\s*${COL_ARG}`, "g");
var SA_COLUMN_PY = new RegExp(`sa\\.Column\\(\\s*${COL_ARG}`, "g");
var MODULE_CONST = /(?:^|\n)[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*['"]([^'"]+)['"]/g;
var DROP_COLUMN_SQL = /drop\s+column\s+(?:if\s+exists\s+)?["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/gi;
var ADD_COLUMN_SQL = /add\s+column\s+(?:if\s+not\s+exists\s+)?["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/gi;
function walk(dir, out = []) {
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
      if (!SKIP_DIR.test(abs)) walk(abs, out);
    } else if (st.isFile() && MIGRATION_EXTS.has((0, import_node_path2.extname)(abs))) {
      out.push(abs);
    }
  }
  return out;
}
function forwardMigrationBody(src, ext) {
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
function moduleConsts(src) {
  const consts = /* @__PURE__ */ new Map();
  MODULE_CONST.lastIndex = 0;
  let m;
  while ((m = MODULE_CONST.exec(src)) !== null) consts.set(m[1], m[2]);
  return consts;
}
function eventsForFile(region, ext, consts) {
  const evs = [];
  const pushPy = (re, act) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(region)) !== null) {
      const col = m[1] ?? (m[2] ? consts.get(m[2]) : void 0);
      if (col) evs.push({ pos: m.index, col, act });
    }
  };
  const pushSql = (re, act) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(region)) !== null) evs.push({ pos: m.index, col: m[1], act });
  };
  if (ext === ".py") {
    pushPy(ADD_COLUMN_PY, "add");
    pushPy(SA_COLUMN_PY, "add");
    pushPy(DROP_COLUMN_PY, "drop");
    pushSql(DROP_COLUMN_SQL, "drop");
  } else {
    pushSql(ADD_COLUMN_SQL, "add");
    pushSql(DROP_COLUMN_SQL, "drop");
  }
  return evs.sort((a, b) => a.pos - b.pos);
}
function netColumnActions(projectDir, migrationDirs = DEFAULT_MIGRATION_DIRS) {
  const files = [];
  for (const md of migrationDirs) {
    const abs = (0, import_node_path2.join)(projectDir, md);
    if ((0, import_node_fs.existsSync)(abs)) walk(abs, files);
  }
  files.sort();
  const last = /* @__PURE__ */ new Map();
  for (const f of files) {
    let src;
    try {
      src = (0, import_node_fs.readFileSync)(f, "utf8");
    } catch {
      continue;
    }
    const ext = (0, import_node_path2.extname)(f);
    const consts = moduleConsts(src);
    for (const ev of eventsForFile(forwardMigrationBody(src, ext), ext, consts)) last.set(ev.col, ev.act);
  }
  return last;
}
function netDroppedColumns(projectDir, migrationDirs = DEFAULT_MIGRATION_DIRS) {
  return [...netColumnActions(projectDir, migrationDirs).entries()].filter(([, act]) => act === "drop").map(([col]) => col);
}

// consort/architecture/contract-clean.ts
var ARTIFACT_ROOTS_RE = artifactRootsRegexAlternation();
var DEFAULT_MIGRATION_DIRS2 = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
var DEFAULT_CODE_DIRS = ["app", "src", "lib", "templates"];
var CODE_EXTS = /* @__PURE__ */ new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".jinja", ".jinja2", ".sql"]);
var EXCLUDE_DIR = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build|tests?|alembic|migrations)(/|$)`
);
var EXCLUDE_DIR_JUNK = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build)(/|$)`
);
function walk2(dir, keep, out = [], excludeDir = EXCLUDE_DIR) {
  let entries;
  try {
    entries = (0, import_node_fs2.readdirSync)(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = (0, import_node_path3.join)(dir, e);
    let st;
    try {
      st = (0, import_node_fs2.statSync)(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!excludeDir.test(abs)) walk2(abs, keep, out, excludeDir);
    } else if (st.isFile() && keep(abs)) {
      out.push(abs);
    }
  }
  return out;
}
function netDroppedSymbols(projectDir, migrationDirs = DEFAULT_MIGRATION_DIRS2) {
  return netDroppedColumns(projectDir, migrationDirs);
}
function symbolRefRegex(symbol) {
  return new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
}
function scanSymbolRefs(projectDir, dirs, dropped, excludeDir = EXCLUDE_DIR) {
  const matchers = dropped.map((s) => ({ symbol: s, re: symbolRefRegex(s) }));
  const hits = [];
  for (const cd of dirs) {
    const abs = (0, import_node_path3.join)(projectDir, cd);
    if (!(0, import_node_fs2.existsSync)(abs)) continue;
    for (const file of walk2(abs, (p2) => CODE_EXTS.has((0, import_node_path3.extname)(p2)), [], excludeDir)) {
      let lines;
      try {
        lines = (0, import_node_fs2.readFileSync)(file, "utf8").split("\n");
      } catch {
        continue;
      }
      lines.forEach((text, i) => {
        for (const { symbol, re } of matchers) {
          if (re.test(text)) {
            hits.push({ file: (0, import_node_path3.relative)(projectDir, file), line: i + 1, symbol, text: text.trim().slice(0, 200) });
          }
        }
      });
    }
  }
  return hits;
}
function checkContractClean(args) {
  const { projectDir } = args;
  const dropped = netDroppedSymbols(projectDir, args.migrationDirs);
  if (dropped.length === 0) return { clean: true, droppedSymbols: [], violations: [] };
  const violations = scanSymbolRefs(projectDir, args.codeDirs ?? DEFAULT_CODE_DIRS, dropped);
  if (violations.length === 0) return { clean: true, droppedSymbols: dropped, violations: [] };
  const list = violations.map((v) => `  ${v.file}:${v.line}  [${v.symbol}]  ${v.text}`).join("\n");
  const syms = [...new Set(violations.map((v) => v.symbol))].join(", ");
  const remediation = `CONTRACT-INCOMPLETENESS (software-design-principles hard rule 9): a migration DROPPED ${syms}, but the running code still references it, so the app emits SQL for a column the database no longer has and crashes ("${syms} does not exist") even though the migration succeeded. Remove or replace EVERY reference below in the SAME change \u2013 the ORM model field, every query/repository, every serializer/DTO, and every template/view \u2013 so the code matches the migrated schema. Do NOT edit the migration or any test to hide this; fix the production code:
${list}`;
  return { clean: false, droppedSymbols: dropped, violations, remediation };
}

// bin/consort/contract-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), migrations: [], code: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--code" && i + 1 < argv.length) out.code.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `consort-contract-clean \u2013 prove no code references a column a migration dropped

Usage:
  consort-contract-clean [--project-dir <path>] [--migrations <rel> ...] [--code <rel> ...] [--json]

Exit 0 = clean (no drops, or all dropped symbols gone from code); exit 1 = residual references (hard rule 9).
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var callArgs = { projectDir: p.projectDir };
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;
if (p.code.length > 0) callArgs.codeDirs = p.code;
var r = checkContractClean(callArgs);
if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}
`);
} else if (r.clean) {
  const what = r.droppedSymbols.length ? `dropped [${r.droppedSymbols.join(", ")}] no longer referenced in code` : "no migration column drops to check";
  process.stdout.write(`contract-clean: OK \u2013 ${what}
`);
} else {
  process.stderr.write(`contract-clean: FAILED \u2013 ${r.violations.length} residual reference(s).

${r.remediation}
`);
}
process.exit(r.clean ? 0 : 1);
