// Live integration test for the SCM workflow CLIs (phase B/C+).
//
// Exercises the happy path of the SCM state machine end-to-end against
// a real Lakebase project + real GitHub repo + real self-hosted runner.
// The runner runs the scaffolded pr.yml + merge.yml workflows so wait-ci
// and merge --wait-migrate see real workflow runs, not mocks.
//
// Functions / CLIs exercised:
//
//   - lakebase-scm-claim-feature-branch   (scm-claim-feature.ts;
//                                         exercises createPairedBranch +
//                                         waitForBranchReady via pollUntilDefined)
//   - lakebase-scm-prepare-pr             (scm-prepare-pr.ts)
//   - lakebase-scm-wait-ci                (scm-wait-ci.ts; exercises pollUntil
//                                         on PR check-runs)
//   - lakebase-scm-merge --wait-migrate   (scm-merge.ts; exercises pollUntil
//                                         on listWorkflowRuns for the
//                                         downstream migrate workflow)
//
// HAPPY PATH (passing code)
//   scaffold-complete -> feature-claimed -> pr-ready -> ci-green -> merged
//   Asserts every state-file invariant (pr_url, ci_run_url, ci_green_at,
//   merged_at, migrate_run_url, migrate_completed_at) and proves the
//   alembic migration committed in the PR is applied on both the ci-pr-N
//   Lakebase branch (during wait-ci) and staging (during merge --wait-migrate).
//
// Gating:
//   LAKEBASE_TEST_E2E_GITHUB=1      must be set; skip otherwise.
//   DATABRICKS_HOST (or ~/.databrickscfg) must be present.
//   GitHub auth must be resolvable by resolveGitHubToken (one of
//   GITHUB_TOKEN env / VS Code session / `gh auth login`).
//   The host must be able to reach github.com from the self-hosted
//   runner subprocess (the substrate-managed runner polls github.com
//   directly).
//
// Teardown contract (mirrors detect-language-via-self-hosted-runner):
//   - On PASS: deregister runner, delete GitHub repo, delete Lakebase
//     project, rm local project dir.
//   - On FAIL: leave everything intact + print recovery commands.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getCurrentUser, deleteRepo } from "@databricks-solutions/lakebase-scm-utils/github";
import { createProject } from "../../scripts/lakebase/create-project.js";
import { deleteLakebaseProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { removeRunner } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import {
  readWorkflowState,
  type ScmWorkflowState,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { queryBranchSchema } from "@databricks-solutions/lakebase-scm-utils/lakebase";

const E2E = process.env.LAKEBASE_TEST_E2E_GITHUB === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const HAS_DATABRICKS =
  DATABRICKS_HOST !== "" ||
  fs.existsSync(path.join(os.homedir(), ".databrickscfg"));
const RUN_SUITE = E2E && HAS_DATABRICKS;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI_DIR = path.join(REPO_ROOT, "dist", "scripts", "lakebase");
const CLAIM_CLI = path.join(CLI_DIR, "scm-claim-feature.cli.js");
const PREPARE_CLI = path.join(CLI_DIR, "scm-prepare-pr.cli.js");
const WAIT_CI_CLI = path.join(CLI_DIR, "scm-wait-ci.cli.js");
const MERGE_CLI = path.join(CLI_DIR, "scm-merge.cli.js");

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "inherit" });
}

function gitCommit(cwd: string, owner: string, message: string): void {
  git(cwd, [
    "-c",
    `user.email=integration-test@${owner}.local`,
    "-c",
    `user.name=${owner}`,
    "commit",
    "-q",
    "-m",
    message,
  ]);
}

function runCli(
  binPath: string,
  args: string[],
  cwd: string,
): SpawnSyncReturns<string> {
  return spawnSync("node", [binPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function logCli(label: string, result: SpawnSyncReturns<string>): void {
  console.log(`  [${label}] exit=${result.status}`);
  if (result.stdout?.trim()) {
    console.log(
      `  [${label}] stdout:\n${result.stdout
        .split("\n")
        .slice(0, 30)
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
  if (result.stderr?.trim()) {
    console.log(
      `  [${label}] stderr:\n${result.stderr
        .split("\n")
        .slice(0, 30)
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
}

function readState(projectDir: string): ScmWorkflowState {
  const s = readWorkflowState(projectDir);
  if (!s) throw new Error(`No workflow-state.json at ${projectDir}/.lakebase/`);
  return s;
}

/**
 * Extract the PR number from a github.com pull URL.
 *   "https://github.com/owner/repo/pull/42" -> 42
 * Throws on malformed input so the caller can fail loudly.
 */
function pullNumber(prUrl: string): number {
  const m = prUrl.match(/\/pull\/(\d+)$/);
  if (!m) throw new Error(`Cannot parse PR number from ${prUrl}`);
  return Number(m[1]);
}

/**
 * Assert that a Lakebase branch's public schema contains a table with
 * the given name. Used to prove that an alembic / flyway / knex
 * migration committed in the PR actually applied on the right branch
 * (ci-pr-N during wait-ci; staging after merge --wait-migrate).
 */
async function assertTableExists(args: {
  instance: string;
  branch: string;
  table: string;
}): Promise<void> {
  const schema = await queryBranchSchema({
    instance: args.instance,
    branch: args.branch,
  });
  const tableNames = schema.map((t) => t.name);
  if (!tableNames.includes(args.table)) {
    throw new Error(
      `expected table "${args.table}" on Lakebase branch "${args.branch}" of project "${args.instance}", ` +
        `but only found: [${tableNames.join(", ")}]`,
    );
  }
}

describe.skipIf(!RUN_SUITE)(
  "SCM workflow CLIs - live e2e",
  () => {
    let owner: string;
    let projectName: string;
    let repoSlug: string;
    let fullRepoName: string;
    let projectDir: string;
    let parentDir: string;
    let happyPathPassed = false;

    beforeAll(async () => {
      owner = await getCurrentUser();

      projectName = `scm-workflow-verify-${timestamp()}`;
      repoSlug = projectName;
      fullRepoName = `${owner}/${repoSlug}`;
      parentDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `scm-workflow-e2e-${Date.now()}-`),
      );

      console.log("");
      console.log("[NOTICE] SCM workflow live e2e will create:");
      console.log(`         lakebase project: ${projectName}`);
      console.log(`         github repo:      ${fullRepoName} (private)`);
      console.log(`         self-hosted runner: ~/.lakebase/runners/${projectName}/`);
      console.log(`         local project dir: ${parentDir}/${projectName}`);
      console.log("");
      console.log("         Recovery if the test is killed mid-run:");
      console.log(`           gh repo delete ${fullRepoName} --yes`);
      console.log(
        `           databricks postgres delete-project projects/${projectName}`,
      );
      console.log("");

      // Stage-tagged progress for setup visibility. Without this the
      // test appears hung in createProject for minutes with no signal.
      const setupStart = process.hrtime.bigint();
      const stage = (msg: string, detail?: string) => {
        const ms = Number((process.hrtime.bigint() - setupStart) / 1_000_000n);
        const tag = `+${(ms / 1000).toFixed(1)}s`;
        const tail = detail ? ` (${detail})` : "";
        console.log(`  [setup ${tag}] ${msg}${tail}`);
      };
      stage("createProject starting");
      const result = await createProject({
        projectName,
        parentDir,
        databricksHost:
          DATABRICKS_HOST ||
          (process.env.LAKEBASE_TEST_HOST ?? "https://workspace.invalid"),
        githubOwner: owner,
        createGithubRepo: true,
        privateRepo: true,
        language: "python",
        runnerType: "self-hosted",
        tiers: 2,
        enableSftdd: false,
        enableE2e: false,
        enableInfra: false,
        skipCommands: true,
      }, stage);
      projectDir = result.projectDir;
      stage("createProject succeeded");
      console.log(`  [setup] createProject succeeded:`);
      console.log(`    projectDir=${projectDir}`);
      console.log(`    githubRepoUrl=${result.githubRepoUrl}`);
      console.log(`    lakebaseProjectId=${result.lakebaseProjectId}`);
      console.log(`    lakebaseDefaultBranch=${result.lakebaseDefaultBranch}`);
      if (result.warnings.length > 0) {
        console.log(`    warnings=${JSON.stringify(result.warnings)}`);
      }

      const initialState = readState(projectDir);
      expect(initialState.state).toBe("scaffold-complete");
      expect(initialState.tier_topology).toBe(2);
      expect(initialState.project_id).toBe(projectName);
    }, 10 * 60_000);

    it(
      "happy path: passing code -> claim -> prepare-pr -> wait-ci (green) -> merge --wait-migrate (success)",
      async () => {
        const featureId = "F1-happy-path";

        // ─── 1. CLAIM ────────────────────────────────────────────
        console.log("  [happy/1] lakebase-scm-claim-feature-branch");
        const claim = runCli(
          CLAIM_CLI,
          [featureId, "--project-dir", projectDir],
          projectDir,
        );
        logCli("claim", claim);
        expect(claim.status).toBe(0);

        const stateAfterClaim = readState(projectDir);
        expect(stateAfterClaim.state).toBe("feature-claimed");
        expect(stateAfterClaim.feature_id).toBe(featureId.toLowerCase());
        expect(stateAfterClaim.branch).toMatch(/^feature[-/]/);
        expect(stateAfterClaim.parent_branch).toBe("staging");
        expect(stateAfterClaim.lakebase_branch_uid).toBeTruthy();
        expect(stateAfterClaim.claimed_at).toBeTruthy();

        // ─── 2. ADD A REAL ALEMBIC MIGRATION ─────────────────────
        // The PR must carry actual code that exercises the migration
        // tool through the PR + merge cycle, not just a README touch.
        // pr.yml's "Run migrations" step calls alembic upgrade head
        // against the ci-pr-N Lakebase branch; merge.yml then re-runs
        // it against the parent branch (staging). Both transitions
        // are proven by querying the Lakebase schema afterwards.
        const markerTable = `live_e2e_marker_alembic_${Date.now()}`;
        const migrationFile = path.join(
          projectDir,
          "alembic",
          "versions",
          "100_live_e2e_marker.py",
        );
        fs.writeFileSync(
          migrationFile,
          [
            `"""Live e2e marker (alembic).`,
            ``,
            `Revision ID: 100`,
            `Revises: 001`,
            `"""`,
            `from typing import Sequence, Union`,
            ``,
            `import sqlalchemy as sa`,
            `from alembic import op`,
            ``,
            `revision: str = "100"`,
            `down_revision: Union[str, None] = "001"`,
            `branch_labels: Union[str, Sequence[str], None] = None`,
            `depends_on: Union[str, Sequence[str], None] = None`,
            ``,
            ``,
            `def upgrade() -> None:`,
            `    op.create_table(`,
            `        "${markerTable}",`,
            `        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),`,
            `        sa.Column("note", sa.String(length=128), nullable=False),`,
            `    )`,
            ``,
            ``,
            `def downgrade() -> None:`,
            `    op.drop_table("${markerTable}")`,
            ``,
          ].join("\n"),
        );
        // git add -A: the migration file PLUS the modified
        // .lakebase/workflow-state.json (claim updated it; substrate
        // CLIs don't auto-commit state-file changes). prepare-pr
        // requires a clean tree; both must land in this commit.
        git(projectDir, ["add", "-A"]);
        gitCommit(
          projectDir,
          owner,
          `live test: happy path SCM workflow e2e + alembic migration (${featureId})`,
        );
        console.log(
          `  [happy/2] committed alembic migration creating table ${markerTable}`,
        );

        // ─── 3. PREPARE-PR ───────────────────────────────────────
        console.log("  [happy/3] lakebase-scm-prepare-pr");
        const prepare = runCli(
          PREPARE_CLI,
          [
            "--project-dir",
            projectDir,
            "--title",
            "live e2e: happy path",
            "--body",
            "Live integration test for the SCM workflow CLI happy path.",
          ],
          projectDir,
        );
        logCli("prepare-pr", prepare);
        expect(prepare.status).toBe(0);

        const stateAfterPrepare = readState(projectDir);
        expect(stateAfterPrepare.state).toBe("pr-ready");
        expect(stateAfterPrepare.pr_url).toMatch(
          /^https:\/\/github\.com\/.+\/pull\/\d+$/,
        );
        expect(stateAfterPrepare.pushed_at).toBeTruthy();

        // ─── 4. WAIT-CI (must go green) ──────────────────────────
        console.log("  [happy/4] lakebase-scm-wait-ci (expecting green)");
        const waitCi = runCli(
          WAIT_CI_CLI,
          ["--project-dir", projectDir],
          projectDir,
        );
        logCli("wait-ci", waitCi);
        expect(waitCi.status).toBe(0);

        const stateAfterCi = readState(projectDir);
        expect(stateAfterCi.state).toBe("ci-green");
        expect(stateAfterCi.ci_run_url).toBeTruthy();
        expect(stateAfterCi.ci_green_at).toBeTruthy();

        // ─── 4a. MIGRATION ROUND-TRIP: ci-pr-N Lakebase branch ───
        //         must have the marker table after pr.yml's "Run
        //         migrations" step. This proves alembic was actually
        //         invoked against the right paired branch, not just
        //         that the workflow run reported success.
        const ciPrBranch = `ci-pr-${pullNumber(stateAfterCi.pr_url!)}`;
        console.log(
          `  [happy/4a] querying Lakebase schema on ${ciPrBranch} for ${markerTable}`,
        );
        await assertTableExists({
          instance: projectName,
          branch: ciPrBranch,
          table: markerTable,
        });

        // ─── 5. MERGE --wait-migrate (must succeed) ──────────────
        console.log("  [happy/5] lakebase-scm-merge --wait-migrate");
        const merge = runCli(
          MERGE_CLI,
          ["--project-dir", projectDir, "--method", "squash"],
          projectDir,
        );
        logCli("merge", merge);
        expect(merge.status).toBe(0);

        const stateAfterMerge = readState(projectDir);
        expect(stateAfterMerge.state).toBe("merged");
        expect(stateAfterMerge.merged_at).toBeTruthy();
        expect(stateAfterMerge.migrate_run_url).toMatch(
          /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/,
        );
        expect(stateAfterMerge.migrate_completed_at).toBeTruthy();

        // ─── 5a. MIGRATION ROUND-TRIP ON THE PARENT BRANCH ───────
        //         merge.yml runs alembic against the parent branch
        //         (staging) after the merge commit lands. Assert the
        //         marker table now exists on staging too. This is
        //         the actual proof that "merge --wait-migrate
        //         applies the PR's migrations to the parent Lakebase
        //         pair."
        console.log(
          `  [happy/5a] querying Lakebase schema on staging for ${markerTable}`,
        );
        await assertTableExists({
          instance: projectName,
          branch: "staging",
          table: markerTable,
        });

        happyPathPassed = true;
      },
      30 * 60_000, // 30-min budget; CI runs + migrate workflow take real time
    );

    afterAll(async () => {
      if (!happyPathPassed) {
        console.log("");
        console.log(
          `[LEAVE-INTACT] Skipping teardown (happy=${happyPathPassed}).`,
        );
        console.log("         To clean up manually:");
        console.log(`           gh repo delete ${fullRepoName} --yes`);
        console.log(
          `           databricks postgres delete-project projects/${projectName}`,
        );
        console.log(
          `           node -e 'import("@databricks-solutions/lakebase-app-dev-kit/lakebase").then(m =>` +
            ` m.removeRunner({fullRepoName: "${fullRepoName}", projectName: "${projectName}"}))'`,
        );
        console.log(`           rm -rf ${parentDir}`);
        return;
      }
      console.log("");
      console.log("[TEARDOWN] Happy path passed. Cleaning up.");

      try {
        await removeRunner({ fullRepoName, projectName });
        console.log("  [teardown] runner deregistered");
      } catch (e) {
        console.log(
          `  [teardown] removeRunner failed: ${(e as Error).message}`,
        );
      }

      try {
        await deleteRepo(fullRepoName);
        console.log("  [teardown] github repo deleted");
      } catch (e) {
        console.log(
          `  [teardown] repo delete failed: ${(e as Error).message}`,
        );
      }

      try {
        await deleteLakebaseProject({ projectId: projectName });
        console.log("  [teardown] lakebase project deleted");
      } catch (e) {
        console.log(
          `  [teardown] lakebase delete failed: ${(e as Error).message}`,
        );
      }

      try {
        fs.rmSync(parentDir, { recursive: true, force: true });
        console.log("  [teardown] local project dir removed");
      } catch {
        /* best-effort */
      }
    }, 5 * 60_000);
  },
);
