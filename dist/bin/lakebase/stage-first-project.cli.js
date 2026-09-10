#!/usr/bin/env node

// bin/lakebase/stage-first-project.cli.ts
import * as fs2 from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
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
var productOverviewMd = (tdd) => join(tdd, "product-overview.md");
var nfrsMd = (tdd) => join(tdd, "nfrs.md");
var designDir = (tdd) => join(tdd, "design");
var designBriefMd = (tdd) => join(designDir(tdd), "design-brief.md");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureRequestMd = (tdd, f) => join(featureResolved(tdd, f), "feature-request.md");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}

// consort/gates/registered-breakdown.ts
import { join as join2 } from "path";
var registrationPath = (consortDir) => join2(consortDir, "registration.json");

// bin/lakebase/stage-first-project.cli.ts
function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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
if (isCliEntry(import.meta.url)) {
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
export {
  bundledSeedDir,
  stageFirstProject
};
