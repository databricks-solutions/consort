// Live integration test for lakebase-ci-resolve-branch.
//
// Drives the new standalone bin through every state-machine transition
// against a real Lakebase project. Single createProject in beforeAll,
// scenarios share the project, teardown on all-pass + preserve on
// any-fail (mirrors the kit's other scm-workflow live tests).
//
// Test plan + state machine reference: docs/tests/ci-resolve-branch-state-machine.md
//
// Gating:
//   LAKEBASE_TEST_E2E_GITHUB=1 must be set; skip otherwise.
//   DATABRICKS_HOST (or ~/.databrickscfg) must be present.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getCurrentUser, deleteRepo } from "@databricks-solutions/lakebase-scm-utils/github";
import { createProject } from "../../scripts/lakebase/create-project.js";
import { deleteLakebaseProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { removeRunner } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { deleteBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { getBranchByName } from "@databricks-solutions/lakebase-scm-utils/lakebase";

const E2E = process.env.LAKEBASE_TEST_E2E_GITHUB === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const HAS_DATABRICKS =
  DATABRICKS_HOST !== "" ||
  fs.existsSync(path.join(os.homedir(), ".databrickscfg"));
const RUN_SUITE = E2E && HAS_DATABRICKS;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CI_RESOLVE_CLI = path.join(
  REPO_ROOT,
  "dist",
  "scripts",
  "lakebase",
  "ci-resolve-branch.cli.js"
);

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function runCli(
  args: string[],
  extraEnv: Record<string, string> = {},
): SpawnSyncReturns<string> {
  return spawnSync("node", [CI_RESOLVE_CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function logCli(label: string, r: SpawnSyncReturns<string>): void {
  console.log(`  [${label}] exit=${r.status}`);
  if (r.stdout?.trim()) {
    console.log(
      `  [${label}] stdout:\n${r.stdout
        .split("\n")
        .slice(0, 25)
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
  if (r.stderr?.trim()) {
    console.log(
      `  [${label}] stderr:\n${r.stderr
        .split("\n")
        .slice(0, 25)
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
}

/**
 * Parse the `KEY='value'` lines the CLI emits in eval mode. Tolerant of
 * single-quoted values containing escaped quotes (the CLI emits '\'' for
 * literal apostrophes).
 */
function parseEvalLines(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/^([A-Z_]+)='(.*)'$/);
    if (m) {
      out[m[1]] = m[2].replace(/'\\''/g, "'");
    }
  }
  return out;
}

describe.skipIf(!RUN_SUITE)(
  "lakebase-ci-resolve-branch - live state machine",
  () => {
    let owner: string;
    let projectName: string;
    let fullRepoName: string;
    let projectDir: string;
    let parentDir: string;
    let ghEnvFile: string;
    const scenarioPassed: Record<string, boolean> = {
      created: false,
      exists: false,
      verified: false,
      mismatch_no_flag: false,
      recreated: false,
      trunk_mapping: false,
      lakebase_name_override: false,
    };

    beforeAll(async () => {
      owner = await getCurrentUser();
      projectName = `ci-resolve-verify-${timestamp()}`;
      fullRepoName = `${owner}/${projectName}`;
      parentDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `ci-resolve-${Date.now()}-`),
      );
      ghEnvFile = fs.mkdtempSync(
        path.join(os.tmpdir(), "github-env-"),
      ) + "/env";
      fs.writeFileSync(ghEnvFile, "");

      console.log("");
      console.log("[NOTICE] ci-resolve-branch live test will create:");
      console.log(`         lakebase project: ${projectName}`);
      console.log(`         github repo:      ${fullRepoName} (private)`);
      console.log(`         tempfile (GITHUB_ENV mode): ${ghEnvFile}`);
      console.log("");

      const setupStart = process.hrtime.bigint();
      const stage = (msg: string, detail?: string) => {
        const ms = Number((process.hrtime.bigint() - setupStart) / 1_000_000n);
        const tag = `+${(ms / 1000).toFixed(1)}s`;
        const tail = detail ? ` (${detail})` : "";
        console.log(`  [setup ${tag}] ${msg}${tail}`);
      };
      stage("createProject starting");
      const result = await createProject(
        {
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
        },
        stage,
      );
      projectDir = result.projectDir;
      stage("createProject succeeded", projectDir);
    }, 10 * 60_000);

    const env = () => ({
      LAKEBASE_PROJECT_ID: projectName,
      GITHUB_ENV: ghEnvFile,
    });

    it("L1: CREATED from staging when ci-pr-99 does not exist", async () => {
      // Truncate tempfile so we can assert exactly what THIS invocation wrote.
      fs.writeFileSync(ghEnvFile, "");
      const r = runCli(
        [
          "--git-branch",
          "ci-pr-99",
          "--create-from",
          "staging",
          "--ensure-endpoint",
          "--github-env",
        ],
        env(),
      );
      logCli("L1 ci-pr-99 CREATED", r);
      expect(r.status).toBe(0);

      const parsed = parseEvalLines(r.stdout);
      expect(parsed.LAKEBASE_BRANCH_STATUS).toBe("CREATED");
      expect(parsed.LAKEBASE_BRANCH_NAME).toBe("ci-pr-99");
      expect(parsed.LAKEBASE_BRANCH_SOURCE).toBe("staging");
      expect(parsed.LAKEBASE_BRANCH_PATH).toMatch(/\/branches\/ci-pr-99$/);
      // Stdout MUST omit secrets in --github-env mode.
      expect(parsed.LAKEBASE_PASSWORD).toBeUndefined();
      expect(parsed.DATABASE_URL).toBeUndefined();

      // Tempfile (GITHUB_ENV) MUST contain the secrets, heredoc-wrapped.
      const envText = fs.readFileSync(ghEnvFile, "utf8");
      expect(envText).toMatch(/^LAKEBASE_BRANCH_NAME=ci-pr-99$/m);
      expect(envText).toMatch(/^LAKEBASE_PASSWORD<<__LB_PW_EOF__$/m);
      expect(envText).toMatch(/^__LB_PW_EOF__$/m);
      expect(envText).toMatch(/^DATABASE_URL=postgresql:\/\//m);

      // Lakebase side: branch exists with the right source.
      const info = await getBranchByName("ci-pr-99", { instance: projectName });
      expect(info).toBeDefined();
      expect(info?.state).toBe("READY");
      expect(info?.sourceBranchId).toBe("staging");
      scenarioPassed.created = true;
    }, 6 * 60_000);

    it("L2: EXISTS re-run without --create-from", async () => {
      fs.writeFileSync(ghEnvFile, "");
      const r = runCli(
        [
          "--git-branch",
          "ci-pr-99",
          "--ensure-endpoint",
          "--github-env",
        ],
        env(),
      );
      logCli("L2 ci-pr-99 EXISTS", r);
      expect(r.status).toBe(0);
      const parsed = parseEvalLines(r.stdout);
      expect(parsed.LAKEBASE_BRANCH_STATUS).toBe("EXISTS");
      expect(parsed.LAKEBASE_BRANCH_NAME).toBe("ci-pr-99");
      // Source carried from L1.
      expect(parsed.LAKEBASE_BRANCH_SOURCE).toBe("staging");
      scenarioPassed.exists = true;
    }, 2 * 60_000);

    it("L3: VERIFIED when --create-from matches the recorded source", async () => {
      fs.writeFileSync(ghEnvFile, "");
      const r = runCli(
        [
          "--git-branch",
          "ci-pr-99",
          "--create-from",
          "staging",
          "--ensure-endpoint",
          "--github-env",
        ],
        env(),
      );
      logCli("L3 ci-pr-99 VERIFIED", r);
      expect(r.status).toBe(0);
      const parsed = parseEvalLines(r.stdout);
      expect(parsed.LAKEBASE_BRANCH_STATUS).toBe("VERIFIED");
      expect(parsed.LAKEBASE_BRANCH_SOURCE).toBe("staging");
      scenarioPassed.verified = true;
    }, 2 * 60_000);

    it("L4: mismatch without --recreate-on-source-mismatch exits non-zero", async () => {
      fs.writeFileSync(ghEnvFile, "");
      const r = runCli(
        [
          "--git-branch",
          "ci-pr-99",
          "--create-from",
          "main",
          "--ensure-endpoint",
        ],
        env(),
      );
      logCli("L4 ci-pr-99 mismatch (no flag)", r);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/staging/);
      // Branch remains intact.
      const info = await getBranchByName("ci-pr-99", { instance: projectName });
      expect(info?.sourceBranchId).toBe("staging");
      scenarioPassed.mismatch_no_flag = true;
    }, 2 * 60_000);

    it("L5: RECREATED from production via --recreate-on-source-mismatch", async () => {
      fs.writeFileSync(ghEnvFile, "");
      const r = runCli(
        [
          "--git-branch",
          "ci-pr-99",
          "--create-from",
          "main",
          "--recreate-on-source-mismatch",
          "--ensure-endpoint",
          "--github-env",
        ],
        env(),
      );
      logCli("L5 ci-pr-99 RECREATED", r);
      expect(r.status).toBe(0);
      const parsed = parseEvalLines(r.stdout);
      expect(parsed.LAKEBASE_BRANCH_STATUS).toBe("RECREATED");
      // Source after recreate should be the Lakebase default leaf
      // (production), which is what main maps to.
      expect(parsed.LAKEBASE_BRANCH_SOURCE).not.toBe("staging");
      expect(parsed.LAKEBASE_BRANCH_SOURCE.length).toBeGreaterThan(0);
      scenarioPassed.recreated = true;
    }, 6 * 60_000);

    it("L6: trunk mapping resolves main to the Lakebase default leaf", async () => {
      fs.writeFileSync(ghEnvFile, "");
      const r = runCli(
        ["--git-branch", "main", "--ensure-endpoint", "--github-env"],
        env(),
      );
      logCli("L6 main -> default leaf", r);
      expect(r.status).toBe(0);
      const parsed = parseEvalLines(r.stdout);
      expect(parsed.LAKEBASE_BRANCH_STATUS).toBe("EXISTS");
      // Default leaf is "production" in scaffolded projects.
      expect(parsed.LAKEBASE_BRANCH_NAME).toMatch(/^(production|main)$/);
      expect(parsed.LAKEBASE_HOST.length).toBeGreaterThan(0);
      scenarioPassed.trunk_mapping = true;
    }, 2 * 60_000);

    it("L8: --lakebase-name override skips git->leaf sanitization", async () => {
      fs.writeFileSync(ghEnvFile, "");
      const r = runCli(
        [
          "--lakebase-name",
          "ci-pr-special",
          "--create-from",
          "staging",
          "--ensure-endpoint",
          "--github-env",
        ],
        env(),
      );
      logCli("L8 ci-pr-special override", r);
      expect(r.status).toBe(0);
      const parsed = parseEvalLines(r.stdout);
      expect(parsed.LAKEBASE_BRANCH_STATUS).toBe("CREATED");
      expect(parsed.LAKEBASE_BRANCH_NAME).toBe("ci-pr-special");
      scenarioPassed.lakebase_name_override = true;
    }, 6 * 60_000);

    afterAll(async () => {
      const allPassed = Object.values(scenarioPassed).every((v) => v);
      console.log("");
      console.log(
        `[scenarios] ${JSON.stringify(scenarioPassed, null, 2)}`,
      );
      if (!allPassed) {
        console.log("[LEAVE-INTACT] Skipping teardown. Recovery:");
        console.log(`           gh repo delete ${fullRepoName} --yes`);
        console.log(
          `           databricks postgres delete-project projects/${projectName}`,
        );
        console.log(`           rm -rf ${parentDir} ${path.dirname(ghEnvFile)}`);
        return;
      }
      console.log("[TEARDOWN] All scenarios passed. Cleaning up.");

      // Delete the CI branches we created (defensive; project delete
      // also removes them, but explicit cleanup mirrors substrate use).
      for (const name of ["ci-pr-99", "ci-pr-special"]) {
        try {
          await deleteBranch({
            instance: projectName,
            branch: name,
            allowDefault: false,
          });
        } catch (e) {
          console.log(
            `  [teardown] delete ${name} failed: ${(e as Error).message}`,
          );
        }
      }

      try {
        await removeRunner({ fullRepoName, projectName });
      } catch (e) {
        console.log(
          `  [teardown] removeRunner failed: ${(e as Error).message}`,
        );
      }
      try {
        await deleteRepo(fullRepoName);
      } catch (e) {
        console.log(
          `  [teardown] repo delete failed: ${(e as Error).message}`,
        );
      }
      try {
        await deleteLakebaseProject({ projectId: projectName });
      } catch (e) {
        console.log(
          `  [teardown] lakebase delete failed: ${(e as Error).message}`,
        );
      }
      try {
        fs.rmSync(parentDir, { recursive: true, force: true });
        fs.rmSync(path.dirname(ghEnvFile), { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }, 5 * 60_000);
  },
);
