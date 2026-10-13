#!/usr/bin/env node

// bin/consort/annotate-ac.cli.ts
import * as fs2 from "fs";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join(tdd, "features");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var acsDir = (tdd, f, s) => join(storyResolved(tdd, f, s), "acs");
var acJson = (tdd, f, s, ac) => join(acsDir(tdd, f, s), `${ac}.json`);
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
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
if (isCliEntry(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
export {
  mergeAcAnnotation,
  parseArgs,
  parseUiSeams
};
