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

// bin/consort/layering-clean.cli.ts
var import_node_fs2 = require("fs");

// consort/architecture/layering-clean.ts
var import_node_fs = require("fs");
var import_node_path2 = require("path");

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];

// consort/architecture/layering-clean.ts
var SOURCE_SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  ".git",
  "build",
  "dist",
  ...ALL_ARTIFACT_ROOTS,
  ".lakebase",
  "alembic",
  "migrations",
  "tests",
  "test",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache"
]);
function isTestFile(name) {
  return /^test_.*\.py$/.test(name) || /_test\.py$/.test(name) || name === "conftest.py";
}
function sourcePyFilesRec(dir, out) {
  let entries;
  try {
    entries = (0, import_node_fs.readdirSync)(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SOURCE_SKIP_DIRS.has(e.name)) sourcePyFilesRec((0, import_node_path2.join)(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith(".py") && !isTestFile(e.name)) {
      out.push((0, import_node_path2.join)(dir, e.name));
    }
  }
}
var DUP_CLASS_REMEDIATION = "The same class is defined in more than one module. Keep ONE canonical definition (usually the package that owns the layer) and delete the duplicate; re-export from the package __init__ if a stable import path is needed. Duplicate ORM model classes also risk a double table registration. See the `layering-violation` smell + DRY (one source of truth).";
var TOP_LEVEL_CLASS = /^class\s+([A-Za-z_]\w*)\s*[:(]/;
function checkDuplicateClasses(projectDir, roots = ["app", "src"]) {
  const files = [];
  for (const r of roots) {
    const abs = (0, import_node_path2.join)(projectDir, r);
    if (!(0, import_node_fs.existsSync)(abs)) continue;
    try {
      if ((0, import_node_fs.statSync)(abs).isDirectory()) sourcePyFilesRec(abs, files);
      else if (abs.endsWith(".py") && !isTestFile(r)) files.push(abs);
    } catch {
    }
  }
  const defs = /* @__PURE__ */ new Map();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    for (const line of (0, import_node_fs.readFileSync)(file, "utf8").split("\n")) {
      const m = TOP_LEVEL_CLASS.exec(line);
      if (!m) continue;
      const set = defs.get(m[1]) ?? /* @__PURE__ */ new Set();
      set.add(shown);
      defs.set(m[1], set);
    }
  }
  const violations = [];
  for (const [name, modules] of [...defs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (modules.size > 1) {
      violations.push(
        `class ${name} is defined in ${modules.size} modules: ${[...modules].sort().join(", ")} (keep one canonical definition, delete the duplicate)`
      );
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: DUP_CLASS_REMEDIATION };
}
var SESSION_OP = /\b(?:db|session|_session|self\._?session)\s*\.\s*(query|add|add_all|commit|delete|merge|flush|execute|refresh|scalars|scalar)\s*\(/;
var REMEDIATION = "The boundary/routes layer calls the DB session directly (a fat controller). Extract a service (business logic) + a repository (the ONLY layer that touches the ORM/session); the route handler validates input + delegates to the service. See the `layering-violation` smell + @architectural-design-principles layered-architecture.";
var DEFAULT_BOUNDARY = ["app/main.py", "app/routes"];
var DEFAULT_REPOSITORY = ["app/repositories", "app/repository.py"];
function pyFilesFor(projectDir, rel) {
  const abs = (0, import_node_path2.join)(projectDir, rel);
  if (!(0, import_node_fs.existsSync)(abs)) return [];
  let isDir = false;
  try {
    isDir = (0, import_node_fs.statSync)(abs).isDirectory();
  } catch {
    return [];
  }
  if (!isDir) return rel.endsWith(".py") ? [abs] : [];
  const out = [];
  for (const f of (0, import_node_fs.readdirSync)(abs)) {
    if (f.endsWith(".py") && f !== "__init__.py") out.push((0, import_node_path2.join)(abs, f));
  }
  return out;
}
function repositoryExists(projectDir, repositoryModules) {
  return repositoryModules.some((rel) => (0, import_node_fs.existsSync)((0, import_node_path2.join)(projectDir, rel)));
}
function relTo(projectDir, file) {
  return file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\/+/, "") : file;
}
function dottedPrefix(module2) {
  return module2.replace(/\.py$/, "").replace(/^\/+|\/+$/g, "").replace(/\//g, ".");
}
function layerSourceFiles(projectDir, module2) {
  const base = module2.replace(/\/+$/, "");
  const out = [];
  const abs = (0, import_node_path2.join)(projectDir, base);
  const tryFile = (p2) => {
    try {
      if ((0, import_node_fs.existsSync)(p2) && !(0, import_node_fs.statSync)(p2).isDirectory()) out.push(p2);
    } catch {
    }
  };
  if ((0, import_node_fs.existsSync)(abs)) {
    let isDir = false;
    try {
      isDir = (0, import_node_fs.statSync)(abs).isDirectory();
    } catch {
    }
    if (isDir) sourcePyFilesRec(abs, out);
    else if (abs.endsWith(".py")) out.push(abs);
    else tryFile((0, import_node_path2.join)(projectDir, `${base}.py`));
  } else {
    tryFile((0, import_node_path2.join)(projectDir, `${base}.py`));
  }
  return out;
}
function resolveRelativeImport(fileAbs, projectDir, dots, tail) {
  const rel = relTo(projectDir, fileAbs);
  const parts = rel.split("/");
  parts.pop();
  const up = dots - 1;
  if (up > parts.length) return null;
  const basePkg = parts.slice(0, parts.length - up);
  const tailParts = tail ? tail.split(".").filter(Boolean) : [];
  const full = [...basePkg, ...tailParts].join(".");
  return full || null;
}
function importedModule(line, fileAbs, projectDir) {
  const from = /^\s*from\s+(\.*)([\w.]*)\s+import\b/.exec(line);
  if (from) {
    const dots = from[1].length;
    const tail = from[2] ?? "";
    if (dots === 0) return tail || null;
    return resolveRelativeImport(fileAbs, projectDir, dots, tail);
  }
  const imp = /^\s*import\s+([\w.]+)/.exec(line);
  return imp ? imp[1] : null;
}
function underPrefix(mod, prefix) {
  return mod === prefix || mod.startsWith(`${prefix}.`);
}
function checkLayeringClean(args) {
  if (!args.serviceBacked) {
    return { clean: true, scanned: [], violations: [] };
  }
  const boundary2 = args.boundaryModules?.length ? args.boundaryModules : DEFAULT_BOUNDARY;
  const repository2 = args.repositoryModules?.length ? args.repositoryModules : DEFAULT_REPOSITORY;
  const scanned = [];
  const violations = [];
  for (const rel of boundary2) {
    for (const file of pyFilesFor(args.projectDir, rel)) {
      scanned.push(file.startsWith(args.projectDir) ? file.slice(args.projectDir.length).replace(/^\//, "") : file);
      const lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (SESSION_OP.test(line)) {
          const shown = file.startsWith(args.projectDir) ? file.slice(args.projectDir.length).replace(/^\//, "") : file;
          violations.push(`${shown}:${i + 1}  ${line.trim()}`);
        }
      });
    }
  }
  if (scanned.length > 0 && !repositoryExists(args.projectDir, repository2)) {
    violations.push(`no repository module found (expected one of: ${repository2.join(", ")})`);
  }
  if (violations.length > 0) {
    return { clean: false, scanned, violations, remediation: REMEDIATION };
  }
  return { clean: true, scanned, violations: [] };
}
var IMPORT_LAYERING_REMEDIATION = "A layer imports another layer it is not allowed to depend on. Dependencies must point inward, per the architect's layers[].may_import (boundary -> service -> repository -> models). Route the dependency through the allowed inner layer (the boundary calls the service, the service calls the repository) instead of reaching across or around it. See the `layering-violation` smell + @architectural-design-principles layered-architecture.";
function checkImportLayering(projectDir, layers) {
  const decls = layers.filter((l) => typeof l.role === "string" && typeof l.module === "string" && l.module.length > 0).map((l) => ({ role: l.role, module: l.module, allowed: new Set(l.may_import ?? []), prefix: dottedPrefix(l.module) }));
  const scanned = [];
  const violations = [];
  for (const layer of decls) {
    const forbidden = decls.filter((k) => k.prefix !== layer.prefix && k.role !== layer.role && !layer.allowed.has(k.role));
    if (forbidden.length === 0) continue;
    for (const file of layerSourceFiles(projectDir, layer.module)) {
      const shown = relTo(projectDir, file);
      scanned.push(shown);
      const lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/#\s*noqa/i.test(line)) return;
        const mod = importedModule(line, file, projectDir);
        if (!mod) return;
        const hit = forbidden.find((t) => underPrefix(mod, t.prefix));
        if (hit) violations.push(`${shown}:${i + 1}  ${line.trim()}  (${layer.role} may not import ${hit.role})`);
      });
    }
  }
  return violations.length === 0 ? { ok: true, scanned, violations: [] } : { ok: false, scanned, violations, remediation: IMPORT_LAYERING_REMEDIATION };
}
var ORM_CONTAINMENT_EXEMPT_ROLES = /* @__PURE__ */ new Set(["repository", "infrastructure"]);
var ORM_CONTAINMENT_REMEDIATION = "A layer other than the repository calls the persistence session/ORM directly. Only the repository layer may touch the ORM session; move the persistence call into the repository and have this layer delegate to it. See the `layering-violation` smell + @architectural-design-principles layered-architecture.";
function checkOrmContainment(projectDir, layers, sessionOp = SESSION_OP) {
  const hasRepository = layers.some((l) => l.role === "repository");
  if (!hasRepository) return { ok: true, scanned: [], violations: [] };
  const scanned = [];
  const violations = [];
  for (const layer of layers) {
    if (typeof layer.module !== "string" || !layer.module || ORM_CONTAINMENT_EXEMPT_ROLES.has(layer.role)) continue;
    for (const file of layerSourceFiles(projectDir, layer.module)) {
      const shown = relTo(projectDir, file);
      scanned.push(shown);
      const lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (sessionOp.test(line)) {
          violations.push(`${shown}:${i + 1}  ${line.trim()}  (${layer.role} layer must not touch the ORM session)`);
        }
      });
    }
  }
  return violations.length === 0 ? { ok: true, scanned, violations: [] } : { ok: false, scanned, violations, remediation: ORM_CONTAINMENT_REMEDIATION };
}
function layeringConfigFromArchitecture(architectureJson) {
  let parsed;
  try {
    parsed = JSON.parse(architectureJson);
  } catch {
    return { serviceBacked: false, boundaryModules: [], repositoryModules: [], allModules: [] };
  }
  const layers = parsed.layers ?? [];
  const modulesByRole = (role) => layers.filter((l) => l.role === role && typeof l.module === "string").map((l) => l.module);
  const allModules2 = layers.filter((l) => typeof l.role === "string" && typeof l.module === "string").map((l) => ({
    role: l.role,
    module: l.module,
    ...Array.isArray(l.may_import) ? { may_import: l.may_import.filter((r) => typeof r === "string") } : {}
  }));
  const boundaryLayer = layers.find((l) => l.role === "boundary" && typeof l.renders_via === "string");
  return {
    serviceBacked: parsed.service_backed === true,
    boundaryModules: modulesByRole("boundary"),
    repositoryModules: modulesByRole("repository"),
    allModules: allModules2,
    ...boundaryLayer?.renders_via ? { rendersVia: boundaryLayer.renders_via } : {}
  };
}
function checkModulePlacement(projectDir, allModules2) {
  const violations = [];
  const kindOf = (abs) => {
    if (!(0, import_node_fs.existsSync)(abs)) return "missing";
    try {
      return (0, import_node_fs.statSync)(abs).isDirectory() ? "dir" : "file";
    } catch {
      return "missing";
    }
  };
  for (const { role, module: module2 } of allModules2) {
    const base = module2.replace(/\/$/, "");
    const wantDir = module2.endsWith("/");
    const wantFile = module2.endsWith(".py");
    const here = kindOf((0, import_node_path2.join)(projectDir, base));
    if (wantDir) {
      if (here === "dir") {
        if (kindOf((0, import_node_path2.join)(projectDir, `${base}.py`)) === "file") {
          violations.push(`declared ${role} layer "${module2}" is a package, but a stale flat ${base}.py also exists alongside it (an orphan from a flat->package migration, shadowed + duplicating this layer); delete ${base}.py so only the package defines this layer`);
        }
        continue;
      }
      if (kindOf((0, import_node_path2.join)(projectDir, `${base}.py`)) === "file") {
        violations.push(`declared ${role} layer "${module2}" is a package directory but the build created a flat file ${base}.py (organize this layer under ${module2})`);
      } else {
        violations.push(`declared ${role} layer module "${module2}" not found (the build placed this layer's code elsewhere)`);
      }
    } else if (wantFile) {
      if (here === "file") continue;
      if (here === "dir") violations.push(`declared ${role} layer module "${module2}" is a file but a directory exists there`);
      else violations.push(`declared ${role} layer module "${module2}" not found (the build placed this layer's code elsewhere)`);
    } else {
      if (here !== "missing" || kindOf((0, import_node_path2.join)(projectDir, `${base}.py`)) === "file") continue;
      violations.push(`declared ${role} layer module "${module2}" not found (the build placed this layer's code elsewhere)`);
    }
  }
  return { ok: violations.length === 0, violations };
}
var INLINE_HTML = /<!DOCTYPE\b|<html[\s>]|HTMLResponse\s*\(\s*(?:content\s*=\s*)?["'`]\s*<|return\s+f?["'`]{1,3}\s*<(?:html|!DOCTYPE)/i;
var TEMPLATE_SEAM = /\b(?:Jinja2Templates|TemplateResponse|render_template|templates\.TemplateResponse)\b/;
var INLINE_RENDER_REMEDIATION = "The boundary renders HTML inline instead of through a templating framework. Render via the declared framework (e.g. Jinja2 TemplateResponse + a templates/ dir) with stable data-testid seams; the route returns a rendered template, never an inline HTML string. See the design-guide `UI Framework` section + @ui-ux-design-principles/testable-ui.";
function checkInlineRendering(projectDir, boundaryModules, rendersVia2) {
  const boundary2 = boundaryModules.length ? boundaryModules : DEFAULT_BOUNDARY;
  const violations = [];
  for (const rel of boundary2) {
    for (const file of pyFilesFor(projectDir, rel)) {
      const src = (0, import_node_fs.readFileSync)(file, "utf8");
      const hasInline = INLINE_HTML.test(src);
      const hasSeam = TEMPLATE_SEAM.test(src);
      if (hasInline && !hasSeam) {
        const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
        violations.push(`${shown}: boundary emits inline HTML with no templating seam (use ${rendersVia2 ?? "the declared templating framework"})`);
      }
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: INLINE_RENDER_REMEDIATION };
}
function nontrivial(line) {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("#") && t !== "}" && t !== "{" && t !== "return" && t !== "pass";
}
function checkCodeBudget(projectDir, sourcePaths, opts = {}) {
  const maxFn = opts.maxFunctionLines ?? 60;
  const dupWin = opts.dupWindow ?? 6;
  const violations = [];
  const files = [];
  for (const rel of sourcePaths) files.push(...pyFilesFor(projectDir, rel));
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    const lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)def\s+(\w+)/.exec(lines[i]);
      if (!m) continue;
      const indent = m[1].length;
      let body = 0;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") continue;
        const ind = /^(\s*)/.exec(lines[j])[1].length;
        if (ind <= indent) break;
        body++;
      }
      if (body > maxFn) violations.push(`${shown}:${i + 1}  def ${m[2]} is ${body} lines (> ${maxFn}); extract helpers (clean-code / single responsibility)`);
    }
  }
  const seen = /* @__PURE__ */ new Map();
  const reported = /* @__PURE__ */ new Set();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    const lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n").map((l) => l.trim()).filter(nontrivial);
    for (let i = 0; i + dupWin <= lines.length; i++) {
      const key = lines.slice(i, i + dupWin).join("");
      if (key.length < dupWin * 3) continue;
      const first = seen.get(key);
      if (first === void 0) {
        seen.set(key, shown);
      } else if (!reported.has(key)) {
        reported.add(key);
        violations.push(`duplicated ${dupWin}-line block in ${first} and ${shown} (DRY: extract one shared helper)`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// bin/consort/layering-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), boundary: [], repository: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--architecture" && i + 1 < argv.length) out.architecture = argv[++i];
    else if (a === "--boundary" && i + 1 < argv.length) out.boundary.push(argv[++i]);
    else if (a === "--repository" && i + 1 < argv.length) out.repository.push(argv[++i]);
    else if (a === "--service-backed") out.serviceBacked = true;
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `consort-layering-clean \u2013 prove the boundary/routes layer does not touch persistence

Usage:
  consort-layering-clean [--project-dir <path>] [--architecture <path>] \\
                              [--boundary <rel> ...] [--repository <rel> ...] \\
                              [--service-backed] [--json]

service_backed + module paths are read from --architecture when given; flags override.
Exit 0 = clean / exempt; exit 1 = boundary calls the DB session directly or no repository.
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var serviceBacked = p.serviceBacked ?? false;
var boundary = p.boundary;
var repository = p.repository;
var allModules = [];
var rendersVia;
if (p.architecture) {
  let archJson = "";
  try {
    archJson = (0, import_node_fs2.readFileSync)(p.architecture, "utf8");
  } catch {
    process.stderr.write(`layering-clean: cannot read architecture file ${p.architecture}
`);
    process.exit(1);
  }
  const cfg = layeringConfigFromArchitecture(archJson);
  if (p.serviceBacked === void 0) serviceBacked = cfg.serviceBacked;
  if (boundary.length === 0) boundary = cfg.boundaryModules;
  if (repository.length === 0) repository = cfg.repositoryModules;
  allModules = cfg.allModules;
  rendersVia = cfg.rendersVia;
}
var callArgs = { projectDir: p.projectDir, serviceBacked };
if (boundary.length > 0) callArgs.boundaryModules = boundary;
if (repository.length > 0) callArgs.repositoryModules = repository;
var layering = checkLayeringClean(callArgs);
var importLayering = serviceBacked && allModules.length ? checkImportLayering(p.projectDir, allModules) : { ok: true, violations: [], remediation: void 0 };
var ormContainment = serviceBacked && allModules.length ? checkOrmContainment(p.projectDir, allModules) : { ok: true, violations: [], remediation: void 0 };
var placement = serviceBacked && allModules.length ? checkModulePlacement(p.projectDir, allModules) : { ok: true, violations: [] };
var rendering = serviceBacked ? checkInlineRendering(p.projectDir, boundary, rendersVia) : { ok: true, violations: [] };
var budgetPaths = allModules.length ? allModules.map((m) => m.module) : ["app"];
var budget = checkCodeBudget(p.projectDir, budgetPaths);
var duplicates = checkDuplicateClasses(p.projectDir);
var groups = [
  { label: "layering (boundary vs persistence)", ok: layering.clean, violations: layering.violations, remediation: layering.remediation },
  { label: "import layering (dependencies point inward per may_import)", ok: importLayering.ok, violations: importLayering.violations, remediation: importLayering.remediation },
  { label: "ORM containment (only the repository touches the session)", ok: ormContainment.ok, violations: ormContainment.violations, remediation: ormContainment.remediation },
  { label: "module placement (layers at declared paths)", ok: placement.ok, violations: placement.violations },
  { label: "rendering (templating, not inline HTML)", ok: rendering.ok, violations: rendering.violations, remediation: rendering.remediation },
  { label: "DRY + complexity budget", ok: budget.ok, violations: budget.violations },
  { label: "no duplicate class definitions", ok: duplicates.ok, violations: duplicates.violations, remediation: duplicates.remediation }
];
var ok = groups.every((g) => g.ok);
if (p.json) {
  process.stdout.write(`${JSON.stringify({ ok, scanned: layering.scanned, groups })}
`);
} else if (ok) {
  const what = serviceBacked ? layering.scanned.length ? `layered + rendered + within budget (boundary scanned: ${layering.scanned.join(", ")})` : "no boundary modules to scan" : "feature is not service-backed (layering not required)";
  process.stdout.write(`layering-clean: OK \u2013 ${what}
`);
} else {
  const blocks = groups.filter((g) => !g.ok).map((g) => `  [${g.label}]
${g.violations.map((v) => `    ${v}`).join("\n")}${g.remediation ? `
    -> ${g.remediation}` : ""}`).join("\n\n");
  process.stderr.write(`layering-clean: FAILED \u2013 architecture-quality checks did not pass.

${blocks}
`);
}
process.exit(ok ? 0 : 1);
