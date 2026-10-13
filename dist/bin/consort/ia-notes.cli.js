#!/usr/bin/env node

// bin/consort/ia-notes.cli.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname } from "path";

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
var storyIaCoverageJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "ia-coverage.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}

// bin/consort/ia-notes.cli.ts
function parse(argv) {
  const out = { feature: "", story: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature" && i + 1 < argv.length) out.feature = argv[++i];
    else if (a === "--story" && i + 1 < argv.length) out.story = argv[++i];
    else if (a === "--tdd-dir" && i + 1 < argv.length) out.consortDir = argv[++i];
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `consort-ia-notes \u2013 record a story's IA coverage marker (its surfaces are named in ia.md)

Usage:
  consort-ia-notes --feature <F> --story <S> [--tdd-dir <path>]
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
if (!p.feature || !p.story) {
  process.stderr.write("consort-ia-notes: --feature and --story are required\n");
  process.exit(2);
}
var consortDir = p.consortDir ?? resolveConsortDir();
var file = storyIaCoverageJson(consortDir, p.feature, p.story);
mkdirSync2(dirname(file), { recursive: true });
writeFileSync2(file, JSON.stringify({ story: p.story, reconciled_at: (/* @__PURE__ */ new Date()).toISOString() }, null, 2) + "\n");
process.stdout.write(`ia-notes: recorded IA coverage for ${p.feature}/${p.story}
`);
process.exit(0);
