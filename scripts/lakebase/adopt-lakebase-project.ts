// Brownfield Lakebase project adoption. Sibling to `adoptTdd`.
//
// `createProject` is the greenfield orchestrator: it creates the GitHub
// repo, clones it, runs `git init`, creates the Lakebase project,
// scaffolds the file tree, syncs CI secrets, sets up the runner,
// commits, and pushes. That whole flow refuses to run against an
// existing directory (`if (fs.existsSync(projectDir)) throw`).
//
// `adoptLakebaseProject` is the half of that flow that an existing
// git repo needs: create the Lakebase project, resolve the default
// branch id, drop the kit's scaffold into the project (drift-aware:
// existing files are preserved unless `force` is set), and write the
// connection-pair to `.env`. It SKIPS every GitHub-side step (repo
// creation, clone, CI secrets sync, runner setup, initial commit,
// push). It SKIPS the language-specific project scaffold (Spring
// Initializr / static templates) because a brownfield repo already
// has its own source tree.
//
// Use cases:
//   - lakebase-scm-extension's "Set Up Lakebase for This Workspace"
//     command, when a user opens a folder with no LAKEBASE_PROJECT_ID
//     and clicks the onboarding button.
//   - A CLI bin (future) for the same flow from a plain shell.

import * as cp from "node:child_process";
import { ARTIFACT_ROOT } from "../sftdd/sftdd-paths.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { createLakebaseProject, getDefaultBranchId } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { deployEnv, deployEnvExample } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { adoptTdd } from "./adopt-sftdd.js";
import { enableE2eForProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { enableInfraForProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";

export interface AdoptLakebaseProjectArgs {
  /** Existing git repo to onboard. */
  projectDir: string;
  /**
   * Lakebase project id (becomes the database project's identifier
   * and the value stored in `.env` as `LAKEBASE_PROJECT_ID`).
   */
  projectName: string;
  /** Databricks workspace URL the project should live under. */
  databricksHost: string;
  /**
   * Whether to also lay down `.tdd/` (delegates to `adoptTdd`).
   * Default: false (brownfield onboarding is incremental; TDD adoption
   * is a separate, opt-in decision).
   */
  enableSftdd?: boolean;
  /**
   * Whether to wire `[E2E]` Playwright support (delegates to
   * `enableE2eForProject`). Requires a `package.json` at projectDir.
   * Default: false.
   */
  enableE2e?: boolean;
  /**
   * Whether to wire `[Infra]` runner support (delegates to
   * `enableInfraForProject`). Default: false.
   */
  enableInfra?: boolean;
  /**
   * Treat existing `.env` as authoritative: refuse to overwrite when
   * its `LAKEBASE_PROJECT_ID` differs from `projectName`. Default:
   * true. Set to false only when intentionally rebinding a project
   * (the caller carries the "are you sure" prompt).
   */
  preserveExistingEnv?: boolean;
  /**
   * Skip writing `.env` entirely. The Lakebase project still gets
   * created and the default branch is still returned; only the local
   * file write is suppressed. Useful when the caller wants to write
   * `.env` itself with project-specific extras.
   */
  skipEnv?: boolean;
  /**
   * Report what would change without writing anything. Lakebase
   * project creation is NOT dry-run-able via this flag; only the
   * file-writing portion is suppressed. Default: false.
   */
  dryRun?: boolean;
}

export interface AdoptLakebaseProjectResult {
  /** Lakebase project id created (or already existing). */
  lakebaseProjectId: string;
  /** Default branch the Lakebase project exposes (often "production"). */
  defaultBranch: string;
  /** Paths written to disk this run, relative to projectDir. */
  filesWritten: string[];
  /** Non-fatal warnings the orchestrator accumulated. */
  warnings: string[];
}

/**
 * Onboard an existing git repo to Lakebase. Creates the Lakebase
 * database project, resolves the default branch, and writes the
 * connection-pair to `.env` (preserving any extra keys the project
 * already declared).
 *
 * Pre-flights:
 *   - projectDir must exist
 *   - projectDir/.git must exist (the project must be a git repo)
 *   - if `.env` already declares LAKEBASE_PROJECT_ID and
 *     `preserveExistingEnv: true` (default), refuses when the value
 *     differs from `projectName`.
 *
 * Side effects:
 *   - Calls `databricks postgres create-project` via the Databricks
 *     CLI (server-side state).
 *   - Writes `<projectDir>/.env.example` and `<projectDir>/.env`.
 *
 * Does NOT:
 *   - run `git init`, create a GitHub repo, or push anything
 *   - install git hooks or scaffold the workflow YAMLs (use
 *     `scaffoldStaticAll` separately when the brownfield project
 *     wants those)
 *   - run any migration / language-specific scaffold
 */
export async function adoptLakebaseProject(
  args: AdoptLakebaseProjectArgs
): Promise<AdoptLakebaseProjectResult> {
  const warnings: string[] = [];
  const filesWritten: string[] = [];
  const dryRun = args.dryRun === true;
  const preserveExistingEnv = args.preserveExistingEnv !== false;

  if (!fs.existsSync(args.projectDir)) {
    throw new Error(`adoptLakebaseProject: project directory does not exist: ${args.projectDir}`);
  }
  if (!fs.existsSync(path.join(args.projectDir, ".git"))) {
    throw new Error(
      `adoptLakebaseProject: ${args.projectDir} is not a git repo. Run \`git init\` first, or pass an existing repo path.`
    );
  }

  if (preserveExistingEnv) {
    assertEnvCompatibility(args.projectDir, args.projectName);
  }

  // Step 1: create the Lakebase project (server-side). When the
  // project already exists, surface the error so the caller can
  // decide between "reuse the existing one" and "abort" – the kit
  // does not silently adopt a project it didn't create.
  const host = args.databricksHost.replace(/\/+$/, "");
  await createLakebaseProject({ projectId: args.projectName, host });

  // Step 2: resolve the default branch id (the Lakebase server
  // creates one automatically; we surface it so callers can echo it
  // back to the user).
  const defaultBranch = await getDefaultBranchId({ projectId: args.projectName, host });
  if (!defaultBranch) {
    warnings.push(
      "Lakebase project created but default branch id is not yet ready. " +
        "Re-run lakebase-doctor in a moment to confirm; the post-checkout hook will refresh .env when it sees a branch."
    );
  }

  // Step 3: write .env (and .env.example) so the next extension
  // activation sees LAKEBASE_PROJECT_ID and lights up. Skip the
  // language-scaffold + workflow drops; those belong to greenfield
  // create-project, not brownfield adoption.
  if (!args.skipEnv) {
    if (!dryRun) {
      await deployEnvExample(args.projectDir, {
        databricksHost: host,
        lakebaseProjectId: args.projectName,
      });
      await deployEnv(args.projectDir, {
        databricksHost: host,
        lakebaseProjectId: args.projectName,
      });
    }
    filesWritten.push(".env", ".env.example");
  }

  // Step 4 (opt-in): optional TDD adoption.
  if (args.enableSftdd) {
    if (!dryRun) {
      const result = adoptTdd({ projectDir: args.projectDir });
      for (const rel of result.added) {
        filesWritten.push(path.join(ARTIFACT_ROOT, rel));
      }
    } else {
      warnings.push("dryRun: skipped enableSftdd. Re-run without --dry-run to drop the .sftdd/ scaffold.");
    }
  }

  // Step 5 (opt-in): optional E2E runner wire-up. Requires
  // package.json at projectDir; the helper is a no-op otherwise.
  if (args.enableE2e) {
    if (!dryRun) {
      const result = enableE2eForProject({ projectDir: args.projectDir });
      for (const rel of result.templatesWritten) {
        filesWritten.push(rel);
      }
    } else {
      warnings.push("dryRun: skipped enableE2e. Re-run without --dry-run to wire Playwright.");
    }
  }

  // Step 6 (opt-in): optional Infra runner wire-up.
  if (args.enableInfra) {
    if (!dryRun) {
      enableInfraForProject({ projectDir: args.projectDir });
      filesWritten.push("scripts/run-tests.sh");
    } else {
      warnings.push("dryRun: skipped enableInfra. Re-run without --dry-run to wire the infra runner.");
    }
  }

  return {
    lakebaseProjectId: args.projectName,
    defaultBranch,
    filesWritten,
    warnings,
  };
}

function assertEnvCompatibility(projectDir: string, expectedProjectId: string): void {
  const envPath = path.join(projectDir, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^LAKEBASE_PROJECT_ID\s*=\s*(.+?)\s*$/m);
  if (!match) return;
  const existing = match[1].trim().replace(/^['"]|['"]$/g, "");
  if (existing && existing !== expectedProjectId) {
    throw new Error(
      `adoptLakebaseProject: .env already declares LAKEBASE_PROJECT_ID=${existing}, ` +
        `which differs from the requested project name "${expectedProjectId}". ` +
        `Rebinding is destructive: pass { preserveExistingEnv: false } if you are sure.`
    );
  }
}

/**
 * Pre-flight checker exposed so callers (CLI bin, VS Code command)
 * can validate the brownfield environment before running the
 * orchestrator and surface a precise error message. Returns the same
 * set of preconditions adoptLakebaseProject enforces; throws on the
 * first failure.
 */
export function assertAdoptionPreflight(args: {
  projectDir: string;
  expectedProjectName?: string;
}): void {
  if (!fs.existsSync(args.projectDir)) {
    throw new Error(`assertAdoptionPreflight: project directory does not exist: ${args.projectDir}`);
  }
  if (!fs.existsSync(path.join(args.projectDir, ".git"))) {
    throw new Error(
      `assertAdoptionPreflight: ${args.projectDir} is not a git repo.`
    );
  }
  if (args.expectedProjectName) {
    assertEnvCompatibility(args.projectDir, args.expectedProjectName);
  }
}

/**
 * Helper for tests: build a minimal "real" project structure in a
 * tmpdir (git repo + optional package.json). Exported so the
 * BDD harness can reuse it; consumers should not call this in
 * production.
 */
export function _testMakeBrownfieldFixture(opts: {
  dir: string;
  packageJson?: Record<string, unknown>;
}): void {
  fs.mkdirSync(opts.dir, { recursive: true });
  cp.execSync("git init --quiet", { cwd: opts.dir, stdio: "pipe" });
  if (opts.packageJson) {
    fs.writeFileSync(
      path.join(opts.dir, "package.json"),
      JSON.stringify(opts.packageJson, null, 2) + "\n"
    );
  }
}
