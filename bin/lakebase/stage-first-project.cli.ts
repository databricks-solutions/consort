#!/usr/bin/env node
// lakebase-stage-first-project: copy the bundled StockFlow "first-project" example
// seed into a target project's .consort/, so a freshly created project can drive the
// worked example end to end instead of the operator authoring their own intake.
//
// The seed ships IN this package at examples/first-project/stockflow-seed/. This bin
// resolves it relative to its own location (no path-guessing by the caller) and copies:
//   intake/product-overview.md   -> .consort/product-overview.md
//   intake/nfrs.md               -> .consort/nfrs.md
//   intake/design-brief.md       -> .consort/design/design-brief.md
//   intake/assets/warehouse.png  -> .consort/design/assets/warehouse.png (alongside the brief)
//   design/design-guide.{json,md} + design/ia.md -> .consort/design/ (the UX Designer's establish
//     output, pre-authored so a seeded run SKIPS the establish turn)
//   client-styles/{theme.css,global.css} -> client/src/styles/ (the materialized design system)
//   feature-requests/<Fid>.md    -> .consort/features/<Fid>/feature-request.md (one per file)
//   registration.json            -> .consort/registration.json (pre-registration; guards the F1 breakdown)
//
// The feature-PROPOSALS are intentionally NOT staged: the Spec Author regenerates
// proposals during /plan. Idempotent (overwrites). Never throws a partial state: it
// creates parent dirs as it goes.
//
// Usage: lakebase-stage-first-project [--project-dir <dir>]   (default: cwd)

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import {
  resolveConsortDir,
  productOverviewMd,
  nfrsMd,
  designBriefMd,
  designGuideJson,
  iaMd,
  featureRequestMd,
} from "../../consort/config/consort-paths.js";
import { registrationPath } from "../../consort/gates/registered-breakdown.js";

/** The package root: examples/ ships beside dist/. dist/bin/lakebase/<this>.js -> ../../.. */
function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** The bundled seed dir (overridable for tests). */
export function bundledSeedDir(): string {
  return path.join(packageRoot(), "examples", "first-project", "stockflow-seed");
}

export interface StageResult {
  seedDir: string;
  consortDir: string;
  staged: string[]; // project-relative paths written
  features: string[]; // feature ids staged (F<n>-<slug>)
}

/**
 * Copy the bundled first-project seed into <projectDir>/.consort/. Returns what was
 * staged. Throws only if the seed itself is missing (a packaging fault) – the callers
 * (bin + start.md) surface that clearly rather than half-staging silently.
 */
export function stageFirstProject(opts: { projectDir?: string; seedDir?: string } = {}): StageResult {
  const projectDir = opts.projectDir ?? process.cwd();
  const seedDir = opts.seedDir ?? bundledSeedDir();
  if (!fs.existsSync(seedDir)) {
    throw new Error(`bundled first-project seed not found at ${seedDir} (packaging fault)`);
  }
  const consortDir = resolveConsortDir(projectDir);
  const rel = (p: string): string => path.relative(projectDir, p);
  const copy = (from: string, to: string): void => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  };
  const staged: string[] = [];

  // Intake (the design phase reads these; see consort/intake/intake.ts).
  const intake: Array<[string, string]> = [
    [path.join(seedDir, "intake", "product-overview.md"), productOverviewMd(consortDir)],
    [path.join(seedDir, "intake", "nfrs.md"), nfrsMd(consortDir)],
    [path.join(seedDir, "intake", "design-brief.md"), designBriefMd(consortDir)],
    // The brand icon ships alongside the brief; the build copies it into the client.
    [
      path.join(seedDir, "intake", "assets", "warehouse.png"),
      path.join(path.dirname(designBriefMd(consortDir)), "assets", "warehouse.png"),
    ],
  ];
  for (const [from, to] of intake) {
    copy(from, to);
    staged.push(rel(to));
  }

  // The UX Designer's project design system, pre-authored in the seed so a seeded run SKIPS the
  // establish turn (design-guide.json present -> designGuideReady -> uxDesignerPending false): the
  // canon docs into .consort/design/, the materialized CSS into client/src/styles/. ia.md is the
  // establish SKELETON (per-feature screens, no per-story AC refs) so the per-story IA refinement
  // still runs. The scaffold's own client/src/styles/STYLE_GUIDE.md is left as-is — it is a general
  // scaffold document, not an establish output. Each is optional (guarded) so a seed without the
  // design system still stages the rest.
  const designDir = path.dirname(designBriefMd(consortDir));
  const designSystem: Array<[string, string]> = [
    [path.join(seedDir, "design", "design-guide.json"), designGuideJson(consortDir)],
    [path.join(seedDir, "design", "design-guide.md"), path.join(designDir, "design-guide.md")],
    [path.join(seedDir, "design", "ia.md"), iaMd(consortDir)],
    [path.join(seedDir, "client-styles", "theme.css"), path.join(projectDir, "client", "src", "styles", "theme.css")],
    [path.join(seedDir, "client-styles", "global.css"), path.join(projectDir, "client", "src", "styles", "global.css")],
  ];
  for (const [from, to] of designSystem) {
    if (fs.existsSync(from)) {
      copy(from, to);
      staged.push(rel(to));
    }
  }

  // Pre-registration: the canonical F1 story+AC breakdown. Staged to
  // .consort/registration.json so the design-spec gate's registered-breakdown
  // guard halts fail-closed if the design lane derives a different breakdown
  // (the recurring app-shell/story-drift wild path). Optional in the seed.
  const regFrom = path.join(seedDir, "registration.json");
  if (fs.existsSync(regFrom)) {
    const regTo = registrationPath(consortDir);
    copy(regFrom, regTo);
    staged.push(rel(regTo));
  }

  // One feature-request.md per seed file, keyed by the filename (F<n>-<slug>).
  const frDir = path.join(seedDir, "feature-requests");
  const features: string[] = [];
  for (const file of fs.readdirSync(frDir).filter((f) => f.endsWith(".md")).sort()) {
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
      "Usage: lakebase-stage-first-project [--project-dir <dir>]\n" +
        "Copies the bundled StockFlow first-project example seed into <dir>/.consort/.\n",
    );
    process.exit(0);
  }
  let projectDir = process.cwd();
  const i = argv.indexOf("--project-dir");
  if (i >= 0 && argv[i + 1]) projectDir = argv[i + 1];
  try {
    const r = stageFirstProject({ projectDir });
    process.stdout.write(
      `[stage-first-project] staged ${r.staged.length} files into ${r.consortDir}\n` +
        `  feature requests (${r.features.length}): ${r.features.join(", ")}\n` +
        `Next: run /plan (the Spec Author proposes a sprint from the staged intake), ` +
        `or /design ${r.features[0]} to jump into the first feature.\n`,
    );
  } catch (err) {
    process.stderr.write(`[stage-first-project] failed: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
