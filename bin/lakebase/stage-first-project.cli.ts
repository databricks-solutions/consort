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
// After copying, the CLI entry COMMITS exactly the staged paths to the current (base)
// branch (`commitStagedSeed`). The seed is copied into the work tree uncommitted; without
// this commit the first `/design <F>` refuses to fork a dirty staging tree and halts at
// Step 0 — the one-time setup friction every fresh seeded run used to hit. The commit is
// scoped to the exact staged paths (never `git add -A`) and is best-effort: a non-git dir
// or an idempotent re-stage with no diff is a no-op, not an error.
//
// Usage: lakebase-stage-first-project [--project-dir <dir>]   (default: cwd)

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
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

export interface SeedCommitResult {
  committed: boolean;
  branch?: string; // the branch committed onto (when committed)
  reason?: string; // why nothing was committed (when committed === false)
}

/**
 * Commit exactly the staged seed paths onto the current (base) branch so the first feature
 * fork sees a clean tree. stageFirstProject only COPIES the seed into the work tree; the
 * first `/design <F>` then refuses to fork a dirty staging tree and halts at Step 0. This
 * closes that one-time setup friction on the real path. Scoped to the exact paths (never
 * `git add -A`). Best-effort by design: a non-git dir, an empty seed, or an idempotent
 * re-stage with no diff is a no-op (committed === false) rather than an error.
 */
export function commitStagedSeed(projectDir: string, staged: string[]): SeedCommitResult {
  if (staged.length === 0) return { committed: false, reason: "nothing staged" };
  const git = (...a: string[]): string =>
    execFileSync("git", a, { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("rev-parse", "--is-inside-work-tree");
  } catch {
    return { committed: false, reason: "not a git work tree" };
  }
  try {
    git("add", "--", ...staged);
    // `git diff --cached --quiet` exits 0 (no throw) when nothing is staged — an idempotent
    // re-stage that produced no change. A non-zero exit (throw) means there ARE staged changes.
    try {
      git("diff", "--cached", "--quiet");
      return { committed: false, reason: "no changes to commit" };
    } catch {
      /* staged changes present — fall through to commit */
    }
    git("commit", "-m", "chore(seed): stage StockFlow first-project seed");
    let branch: string | undefined;
    try {
      branch = git("rev-parse", "--abbrev-ref", "HEAD").trim();
    } catch {
      /* detached or bare — branch is cosmetic, omit it */
    }
    return { committed: true, branch };
  } catch (err) {
    return { committed: false, reason: (err as Error).message };
  }
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
    const commit = commitStagedSeed(projectDir, r.staged);
    const commitLine = commit.committed
      ? `  committed the seed to ${commit.branch ?? "the current branch"} — the first feature fork sees a clean tree\n`
      : `  seed NOT committed (${commit.reason}); commit the staged paths before the first /design or it halts at Step 0\n`;
    process.stdout.write(
      `[stage-first-project] staged ${r.staged.length} files into ${r.consortDir}\n` +
        `  feature requests (${r.features.length}): ${r.features.join(", ")}\n` +
        commitLine +
        `Next: run /plan (the Spec Author proposes a sprint from the staged intake), ` +
        `or /design ${r.features[0]} to jump into the first feature.\n`,
    );
  } catch (err) {
    process.stderr.write(`[stage-first-project] failed: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
