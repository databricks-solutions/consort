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

// bin/consort/annotate-ac.cli.ts
var annotate_ac_cli_exports = {};
__export(annotate_ac_cli_exports, {
  mergeAcAnnotation: () => mergeAcAnnotation,
  parseArgs: () => parseArgs,
  parseUiSeams: () => parseUiSeams
});
module.exports = __toCommonJS(annotate_ac_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// bin/consort/annotate-ac.cli.ts
var fs2 = __toESM(require("fs"), 1);
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
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
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
var acsDir = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "acs");
var acJson = (tdd, f, s, ac) => (0, import_node_path.join)(acsDir(tdd, f, s), `${ac}.json`);
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}

// bin/consort/annotate-ac.cli.ts
var LAYERS = ["API", "E2E", "Infra"];
var HELP = `consort-annotate-ac \u2013 safely add the Architect's layer + architectural_notes to an AC

Usage:
  consort-annotate-ac --feature <F> --story <S> --ac <AC> --layer <API|E2E|Infra> --notes "<text>" \\
    [--ui-seams "seam-a,seam-b"] [--consort-dir <dir>]

Reads acs/<AC>.json, merges { layer, architectural_notes[, ui_seams] } ON TOP of the
existing object (every prior field preserved), and writes valid JSON. Use this instead
of hand-editing the AC file, so a dropped brace can never corrupt it.

--ui-seams (E2E / client ACs): a comma-separated list of the ia.md data-testid seam
tokens this AC's UI must drive (e.g. "stock-cell-tracking,stock-not-tracked"). The
deterministic pre-reflect IA gate checks each is named in ia.md.
`;
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--story":
        out.story = argv[++i];
        break;
      case "--ac":
        out.ac = argv[++i];
        break;
      case "--layer":
        out.layer = argv[++i];
        break;
      case "--notes":
        out.notes = argv[++i];
        break;
      case "--ui-seams":
        out.uiSeams = argv[++i];
        break;
      case "--consort-dir":
      case "--tdd-dir":
        out.consortDir = argv[++i];
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
function mergeAcAnnotation(raw, fields) {
  const obj = JSON.parse(raw);
  if (fields.layer) obj.layer = fields.layer;
  obj.architectural_notes = fields.notes;
  if (fields.uiSeams !== void 0) obj.ui_seams = fields.uiSeams;
  return JSON.stringify(obj, null, 2) + "\n";
}
function parseUiSeams(raw) {
  if (raw === void 0) return void 0;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0))];
}
function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.feature || !args.story || !args.ac || !args.notes) {
    process.stderr.write(`Error: --feature, --story, --ac, and --notes are required.

${HELP}`);
    return 2;
  }
  if (args.layer && !LAYERS.includes(args.layer)) {
    process.stderr.write(`Error: --layer must be one of ${LAYERS.join(" / ")}. Got: ${args.layer}
`);
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir(process.cwd());
  const file = acJson(consortDir, args.feature, args.story, args.ac);
  if (!fs2.existsSync(file)) {
    process.stderr.write(
      `Error: AC file not found: ${file}
(check --feature / --story / --ac; the Spec Author writes acs/<AC>.json first).
`
    );
    return 2;
  }
  let merged;
  try {
    merged = mergeAcAnnotation(fs2.readFileSync(file, "utf8"), { layer: args.layer, notes: args.notes, uiSeams: parseUiSeams(args.uiSeams) });
  } catch (e) {
    process.stderr.write(
      `Error: ${file} is not valid JSON (${e instanceof Error ? e.message : String(e)}). Fix the existing file's syntax first (this tool preserves fields; it won't overwrite a corrupt AC blindly).
`
    );
    return 2;
  }
  fs2.writeFileSync(file, merged, "utf8");
  process.stderr.write(`annotated ${args.ac}${args.layer ? ` (layer ${args.layer})` : ""} \u2013 preserved all prior fields
`);
  return 0;
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  process.exit(main(process.argv.slice(2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  mergeAcAnnotation,
  parseArgs,
  parseUiSeams
});
