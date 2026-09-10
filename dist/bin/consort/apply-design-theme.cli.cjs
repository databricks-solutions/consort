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

// consort/architecture/apply-theme.ts
var import_node_fs2 = require("fs");
var import_node_path3 = require("path");

// consort/architecture/design-adherence.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
function designGuideToCssVars(guide) {
  const vars = {};
  vars["--font-sans"] = guide.typography.font_family;
  if (guide.typography.font_mono !== void 0) {
    vars["--font-mono"] = guide.typography.font_mono;
  }
  for (const [k, v] of Object.entries(guide.typography.scale)) {
    vars[`--${k}`] = v;
  }
  for (const [k, v] of Object.entries(guide.typography.line_heights ?? {})) {
    vars[`--line-height-${k}`] = v;
  }
  for (const [k, v] of Object.entries(guide.typography.font_weights ?? {})) {
    vars[`--font-weight-${k}`] = v;
  }
  for (const group of Object.values(guide.colors)) {
    for (const [k, v] of Object.entries(group)) {
      vars[`--color-${k}`] = v;
    }
  }
  for (const map of [guide.spacing, guide.radius, guide.shadows, guide.breakpoints]) {
    if (!map) continue;
    for (const [k, v] of Object.entries(map)) {
      vars[`--${k}`] = v;
    }
  }
  return vars;
}
function renderThemeRootCss(guide) {
  const vars = designGuideToCssVars(guide);
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {
${lines.join("\n")}
}
`;
}

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path2 = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = (0, import_node_path2.join)(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = (0, import_node_path2.join)(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var designDir = (tdd) => (0, import_node_path2.join)(tdd, "design");
var designGuideJson = (tdd) => (0, import_node_path2.join)(designDir(tdd), "design-guide.json");

// consort/architecture/apply-theme.ts
var THEME_HEADER = `/*
 * DESIGN TOKENS \u2014 GENERATED from .consort/design/design-guide.json.
 * Do NOT hand-edit the :root block: edit the design guide and re-run
 *   ./scripts/lk consort-apply-design-theme
 * so what renders IS what the guide declares (the design-adherence gate reads
 * these :root vars back and compares them to the guide). The component classes
 * that consume these tokens live in global.css (UX-designer authored).
 */
`;
function buildThemeCss(guide) {
  return THEME_HEADER + renderThemeRootCss(guide);
}
function applyDesignGuideTheme(projectDir) {
  const guidePath = designGuideJson(resolveConsortDir(projectDir));
  if (!(0, import_node_fs2.existsSync)(guidePath)) {
    throw new Error(
      `apply-theme: no design guide at ${guidePath} \u2014 run the UX designer first (this is a UI project's design system).`
    );
  }
  const guide = JSON.parse((0, import_node_fs2.readFileSync)(guidePath, "utf8"));
  const themePath = (0, import_node_path3.join)(projectDir, "client", "src", "styles", "theme.css");
  const css = buildThemeCss(guide);
  (0, import_node_fs2.writeFileSync)(themePath, css);
  return { themePath, varCount: (css.match(/--[\w-]+:/g) ?? []).length };
}

// bin/consort/apply-design-theme.cli.ts
function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") out.project = argv[++i];
  }
  return out;
}
function main() {
  const a = parse(process.argv.slice(2));
  const projectDir = a.project ?? process.cwd();
  try {
    const { themePath, varCount } = applyDesignGuideTheme(projectDir);
    process.stdout.write(`apply-design-theme: wrote ${varCount} design tokens to ${themePath} (:root generated from design-guide.json).
`);
    return 0;
  } catch (err) {
    process.stderr.write(`apply-design-theme: ${err.message}
`);
    return 1;
  }
}
process.exit(main());
