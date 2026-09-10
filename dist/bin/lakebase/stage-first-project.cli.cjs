#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// bin/lakebase/stage-first-project.cli.ts
var stage_first_project_cli_exports = {};
__export(stage_first_project_cli_exports, {
  bundledSeedDir: () => bundledSeedDir,
  stageFirstProject: () => stageFirstProject
});
module.exports = __toCommonJS(stage_first_project_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// bin/lakebase/stage-first-project.cli.ts
var fs2 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var import_node_url = require("url");
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
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
var productOverviewMd = (tdd) => (0, import_node_path.join)(tdd, "product-overview.md");
var nfrsMd = (tdd) => (0, import_node_path.join)(tdd, "nfrs.md");
var designDir = (tdd) => (0, import_node_path.join)(tdd, "design");
var designBriefMd = (tdd) => (0, import_node_path.join)(designDir(tdd), "design-brief.md");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureRequestMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-request.md");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}

// consort/gates/registered-breakdown.ts
var import_path = require("path");
var registrationPath = (consortDir) => (0, import_path.join)(consortDir, "registration.json");

// bin/lakebase/stage-first-project.cli.ts
function packageRoot() {
  return path.resolve(path.dirname((0, import_node_url.fileURLToPath)(importMetaUrl)), "../../..");
}
function bundledSeedDir() {
  return path.join(packageRoot(), "examples", "first-project", "stockflow-seed");
}
function stageFirstProject(opts = {}) {
  const projectDir = opts.projectDir ?? process.cwd();
  const seedDir = opts.seedDir ?? bundledSeedDir();
  if (!fs2.existsSync(seedDir)) {
    throw new Error(`bundled first-project seed not found at ${seedDir} (packaging fault)`);
  }
  const consortDir = resolveConsortDir(projectDir);
  const rel = (p) => path.relative(projectDir, p);
  const copy = (from, to) => {
    fs2.mkdirSync(path.dirname(to), { recursive: true });
    fs2.copyFileSync(from, to);
  };
  const staged = [];
  const intake = [
    [path.join(seedDir, "intake", "product-overview.md"), productOverviewMd(consortDir)],
    [path.join(seedDir, "intake", "nfrs.md"), nfrsMd(consortDir)],
    [path.join(seedDir, "intake", "design-brief.md"), designBriefMd(consortDir)],
    // The brand icon ships alongside the brief; the build copies it into the client.
    [
      path.join(seedDir, "intake", "assets", "warehouse.png"),
      path.join(path.dirname(designBriefMd(consortDir)), "assets", "warehouse.png")
    ]
  ];
  for (const [from, to] of intake) {
    copy(from, to);
    staged.push(rel(to));
  }
  const regFrom = path.join(seedDir, "registration.json");
  if (fs2.existsSync(regFrom)) {
    const regTo = registrationPath(consortDir);
    copy(regFrom, regTo);
    staged.push(rel(regTo));
  }
  const frDir = path.join(seedDir, "feature-requests");
  const features = [];
  for (const file of fs2.readdirSync(frDir).filter((f) => f.endsWith(".md")).sort()) {
    const featureId = file.replace(/\.md$/, "");
    const to = featureRequestMd(consortDir, featureId);
    copy(path.join(frDir, file), to);
    staged.push(rel(to));
    features.push(featureId);
  }
  return { seedDir, consortDir, staged, features };
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(
      "Usage: lakebase-stage-first-project [--project-dir <dir>]\nCopies the bundled StockFlow first-project example seed into <dir>/.consort/.\n"
    );
    process.exit(0);
  }
  let projectDir = process.cwd();
  const i = argv.indexOf("--project-dir");
  if (i >= 0 && argv[i + 1]) projectDir = argv[i + 1];
  try {
    const r = stageFirstProject({ projectDir });
    process.stdout.write(
      `[stage-first-project] staged ${r.staged.length} files into ${r.consortDir}
  feature requests (${r.features.length}): ${r.features.join(", ")}
Next: run /plan (the Spec Author proposes a sprint from the staged intake), or /design ${r.features[0]} to jump into the first feature.
`
    );
  } catch (err) {
    process.stderr.write(`[stage-first-project] failed: ${err.message}
`);
    process.exit(1);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  bundledSeedDir,
  stageFirstProject
});
