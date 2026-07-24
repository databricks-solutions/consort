// Live integration test for the SCM workflow side-path CLIs
// (phase C).
//
// The "happy linear pipeline" (claim -> prepare-pr -> wait-ci -> merge)
// is covered by scm-workflow-e2e-live.test.ts. This file covers the
// side-path CLIs that handle reset / repair / recovery:
//
//   - lakebase-scm-abandon-feature     (drop a claimed feature back to
//                                      scaffold-complete: Lakebase
//                                      branch deleted, git branch
//                                      deleted, state cleared)
//   - lakebase-scm-adopt-state         (rebuild workflow-state.json from
//                                      on-disk reality when the state
//                                      file is missing or stale)
//   - lakebase-scm-recover-orphans     (find feature/* git branches with
//                                      no Lakebase pair and remove them)
//   - lakebase-scm-doctor --fix        (introduce env-branch-drift,
//                                      assert doctor flags it, then
//                                      assert --fix clears it)
//
// All four scenarios share one createProject setup (runner registered
// + scaffold complete) and run sequentially. Each scenario starts and
// ends at scaffold-complete so subsequent scenarios have a clean
// precondition.
//
// Gating + teardown contract is identical to
// scm-workflow-e2e-live.test.ts: LAKEBASE_TEST_E2E_GITHUB=1 required,
// teardown on all-pass, preserve on any-fail.

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

const E2E = process.env.LAKEBASE_TEST_E2E_GITHUB === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const HAS_DATABRICKS =
  DATABRICKS_HOST !== "" ||
  fs.existsSync(path.join(os.homedir(), ".databrickscfg"));
const RUN_SUITE = E2E && HAS_DATABRICKS;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI_DIR = path.join(REPO_ROOT, "dist", "scripts", "lakebase");
const CLAIM_CLI = path.join(CLI_DIR, "scm-claim-feature.cli.js");
const ABANDON_CLI = path.join(CLI_DIR, "scm-abandon-feature.cli.js");
const ADOPT_CLI = path.join(CLI_DIR, "scm-adopt-state.cli.js");
const RECOVER_CLI = path.join(CLI_DIR, "scm-recover-orphans.cli.js");
const DOCTOR_CLI = path.join(CLI_DIR, "scm-doctor.cli.js");
const STATE_CLI = path.join(CLI_DIR, "scm-state.cli.js");

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

function gitOutput(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
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

describe.skipIf(!RUN_SUITE)(
  "SCM workflow side-path CLIs - live e2e (phase C)",
  () => {
    let owner: string;
    let projectName: string;
    let repoSlug: string;
    let fullRepoName: string;
    let projectDir: string;
    let parentDir: string;
    const scenarioPassed: Record<string, boolean> = {
      abandon: false,
      adopt: false,
      recover: false,
      doctor: false,
    };

    beforeAll(async () => {
      owner = await getCurrentUser();

      projectName = `scm-side-paths-verify-${timestamp()}`;
      repoSlug = projectName;
      fullRepoName = `${owner}/${repoSlug}`;
      parentDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `scm-side-paths-${Date.now()}-`),
      );

      console.log("");
      console.log("[NOTICE] SCM side-paths live e2e will create:");
      console.log(`         lakebase project: ${projectName}`);
      console.log(`         github repo:      ${fullRepoName} (private)`);
      console.log(`         self-hosted runner: ~/.lakebase/runners/${projectName}/`);
      console.log(`         local project dir: ${parentDir}/${projectName}`);
      console.log("");

      // Stage-tagged progress: every createProject substep prints its
      // elapsed-since-setup-start offset, so a slow stage is visible
      // immediately instead of presenting as a multi-minute hang.
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
      stage("createProject succeeded", projectDir);

      const initialState = readState(projectDir);
      expect(initialState.state).toBe("scaffold-complete");
    }, 10 * 60_000);

    it(
      "abandon: claim -> abandon -> state drops to scaffold-complete, git branch deleted",
      async () => {
        const featureId = "F-abandon";

        // Setup: claim a feature.
        const claim = runCli(
          CLAIM_CLI,
          [featureId, "--project-dir", projectDir],
          projectDir,
        );
        logCli("claim", claim);
        expect(claim.status).toBe(0);

        const claimed = readState(projectDir);
        expect(claimed.state).toBe("feature-claimed");
        const featureBranch = claimed.branch!;
        // Verify the git branch exists.
        const branchesBeforeAbandon = gitOutput(projectDir, ["branch", "--list"]);
        expect(branchesBeforeAbandon).toMatch(new RegExp(`\\b${featureBranch}\\b`));

        // Action: abandon. claim modifies .lakebase/workflow-state.json
        // (tracked), so the working tree is dirty immediately after.
        // The substrate's --force flag is the documented escape for
        // "claimed-but-not-committed -> abandon" (the only thing the
        // delete loses is the state-file edit, not user code). A
        // typical user flow that includes intervening commits would
        // not need --force; here we exercise the bare CLI path.
        const abandon = runCli(
          ABANDON_CLI,
          ["--project-dir", projectDir, "--force"],
          projectDir,
        );
        logCli("abandon", abandon);
        expect(abandon.status).toBe(0);

        // Assert state regressed.
        const after = readState(projectDir);
        expect(after.state).toBe("scaffold-complete");
        // feature_id / branch / lakebase_branch_uid should be cleared.
        expect(after.feature_id).toBeFalsy();
        expect(after.branch).toBeFalsy();
        expect(after.lakebase_branch_uid).toBeFalsy();

        // Assert local git branch removed.
        const branchesAfterAbandon = gitOutput(projectDir, ["branch", "--list"]);
        expect(branchesAfterAbandon).not.toMatch(new RegExp(`\\b${featureBranch}\\b`));

        scenarioPassed.abandon = true;
      },
      5 * 60_000,
    );

    it(
      "adopt-state: workflow-state.json missing -> adopt rebuilds it from on-disk reality",
      async () => {
        // Setup: adopt-state can only seed from a tier branch (main /
        // staging / etc.), not from a feature/* branch. Switch to
        // main first; the previous test left HEAD on
        // feature-f-abandon's now-deleted parent, so we may be in
        // detached state.
        git(projectDir, ["checkout", "main"]);

        const stateFile = path.join(
          projectDir,
          ".lakebase",
          "workflow-state.json",
        );
        const beforeBlob = fs.readFileSync(stateFile, "utf8");
        fs.rmSync(stateFile);
        expect(fs.existsSync(stateFile)).toBe(false);

        try {
          // Action: adopt-state. Reads project_id from .env / Lakebase
          // reality and writes a fresh scaffold-complete state file.
          const adopt = runCli(
            ADOPT_CLI,
            ["--project-dir", projectDir],
            projectDir,
          );
          logCli("adopt", adopt);
          expect(adopt.status).toBe(0);

          // Assert the file was rebuilt with the expected invariants.
          expect(fs.existsSync(stateFile)).toBe(true);
          const rebuilt = readState(projectDir);
          expect(rebuilt.state).toBe("scaffold-complete");
          expect(rebuilt.tier_topology).toBe(2);
          expect(rebuilt.project_id).toBe(projectName);

          // Sanity: lakebase-scm-state CLI agrees (round-trip).
          const stateRead = runCli(
            STATE_CLI,
            ["--project-dir", projectDir, "--json"],
            projectDir,
          );
          expect(stateRead.status).toBe(0);
          const parsed = JSON.parse(stateRead.stdout);
          expect(parsed.found).toBe(true);
          expect(parsed.state.state).toBe("scaffold-complete");

          scenarioPassed.adopt = true;
        } finally {
          // Always restore the original blob so subsequent tests
          // start from the canonical scaffold state, regardless of
          // whether an assertion above threw.
          fs.writeFileSync(stateFile, beforeBlob);
        }
      },
      5 * 60_000,
    );

    it(
      "recover-orphans: dangling feature git branch is reported; --claim retroactively pairs it",
      async () => {
        // Setup: create a "feature-orphan-live-test" via plain git
        // that has no Lakebase pair (claim was bypassed). This
        // simulates a developer who shelled out to `git checkout -b
        // feature-X` directly instead of using the substrate.
        // recover-orphans is the substrate's tool for detecting +
        // remediating that drift.
        const orphanBranch = "feature-orphan-live-test";
        git(projectDir, ["checkout", "-b", orphanBranch]);
        // Make a trivial commit so the branch is non-empty.
        fs.writeFileSync(
          path.join(projectDir, ".orphan-marker"),
          "this branch is orphaned by design (live test)\n",
        );
        git(projectDir, ["add", ".orphan-marker"]);
        git(projectDir, [
          "-c",
          `user.email=integration-test@${owner}.local`,
          "-c",
          `user.name=${owner}`,
          "commit",
          "-q",
          "-m",
          "orphan branch commit for recover-orphans live test",
        ]);
        // Switch back to main so the orphan can be considered.
        git(projectDir, ["checkout", "main"]);

        const branchesBefore = gitOutput(projectDir, ["branch", "--list"]);
        expect(branchesBefore).toMatch(new RegExp(`\\b${orphanBranch}\\b`));

        // First, the REPORT mode (default, non-destructive). The CLI
        // contract: stdout (or JSON) lists every non-tier git branch
        // that has no Lakebase pair. The orphan we just created must
        // appear in that list.
        const reportRun = runCli(
          RECOVER_CLI,
          ["--project-dir", projectDir, "--json"],
          projectDir,
        );
        logCli("recover-orphans (report)", reportRun);
        expect(reportRun.status).toBe(0);
        // The CLI's JSON shape is { ok, result: { orphans, skipped,
        // claimed, tierTopology } }; each orphan has fields
        // { gitBranch, sanitized, reason, isCurrent }.
        const report = JSON.parse(reportRun.stdout);
        const orphanList: Array<{ gitBranch: string }> =
          report.result?.orphans ?? [];
        const reportedNames = orphanList.map((o) => o.gitBranch);
        expect(reportedNames).toContain(orphanBranch);

        // Now the RECOVERY action: --claim retroactively pairs the
        // orphan via the substrate. After --claim, the orphan should
        // no longer be in the report (it has a Lakebase pair now).
        // --only-branch limits the action to our test orphan so we
        // don't pair every dangling branch the project may have.
        const claimRun = runCli(
          RECOVER_CLI,
          [
            "--project-dir",
            projectDir,
            "--claim",
            "--only-branch",
            orphanBranch,
            "--json",
          ],
          projectDir,
        );
        logCli("recover-orphans (--claim)", claimRun);
        expect(claimRun.status).toBe(0);

        const recheckRun = runCli(
          RECOVER_CLI,
          ["--project-dir", projectDir, "--json"],
          projectDir,
        );
        const recheck = JSON.parse(recheckRun.stdout);
        const recheckOrphans: Array<{ gitBranch: string }> =
          recheck.result?.orphans ?? [];
        const recheckNames = recheckOrphans.map((o) => o.gitBranch);
        expect(recheckNames).not.toContain(orphanBranch);

        scenarioPassed.recover = true;
      },
      5 * 60_000,
    );

    it(
      "doctor --fix env-branch-drift: introduce drift -> doctor flags -> --fix clears",
      async () => {
        // Defensive setup: prior tests in this describe (recover-orphans
        // with --claim) may have left workflow state at feature-claimed
        // for an unrelated branch. The substrate's claim refuses if
        // state is already feature-claimed for a different feature, so
        // abandon --force first to reset to scaffold-complete before
        // we claim our own.
        const stateBefore = readState(projectDir);
        if (
          stateBefore.state !== "scaffold-complete" &&
          stateBefore.state !== "merged"
        ) {
          console.log(
            `  [doctor/0] state=${stateBefore.state}; abandoning to reset before claim`,
          );
          runCli(
            ABANDON_CLI,
            ["--project-dir", projectDir, "--force"],
            projectDir,
          );
        }

        // Setup: claim a feature so .env is populated with the
        // feature branch's LAKEBASE_BRANCH_ID.
        const featureId = "F-doctor-drift";
        const claim = runCli(
          CLAIM_CLI,
          [featureId, "--project-dir", projectDir],
          projectDir,
        );
        logCli("claim", claim);
        expect(claim.status).toBe(0);
        const state = readState(projectDir);
        expect(state.state).toBe("feature-claimed");

        // Introduce drift: edit .env to point LAKEBASE_BRANCH_ID at a
        // wrong value. doctor's check #5 should flag env-branch-drift.
        const envPath = path.join(projectDir, ".env");
        const envBefore = fs.readFileSync(envPath, "utf8");
        const envDrifted = envBefore.replace(
          /^LAKEBASE_BRANCH_ID=.*$/m,
          "LAKEBASE_BRANCH_ID=wrong-branch-id-for-drift-test",
        );
        expect(envDrifted).not.toBe(envBefore);
        fs.writeFileSync(envPath, envDrifted);

        // Doctor should now report env-branch-drift.
        const doctor = runCli(
          DOCTOR_CLI,
          ["--project-dir", projectDir, "--json"],
          projectDir,
        );
        logCli("doctor", doctor);
        // Exit 1 = warn-level findings present (env-branch-drift is severity=warn).
        expect([0, 1]).toContain(doctor.status);
        const report = JSON.parse(doctor.stdout);
        const drift = (report.findings ?? []).find(
          (f: { id: string }) => f.id === "env-branch-drift",
        );
        expect(drift).toBeTruthy();

        // doctor --fix env-branch-drift: git checkout <feature-branch>
        // re-fires post-checkout which resyncs .env.
        const fix = runCli(
          DOCTOR_CLI,
          [
            "--project-dir",
            projectDir,
            "--fix",
            "env-branch-drift",
            "--json",
          ],
          projectDir,
        );
        logCli("doctor --fix", fix);
        expect(fix.status).toBe(0);

        // After fix: .env's LAKEBASE_BRANCH_ID matches state.branch.
        const envFixed = fs.readFileSync(envPath, "utf8");
        const featureBranch = state.branch!;
        expect(envFixed).toMatch(
          new RegExp(`^LAKEBASE_BRANCH_ID=${featureBranch}\\b`, "m"),
        );

        // doctor should no longer report env-branch-drift.
        const recheck = runCli(
          DOCTOR_CLI,
          ["--project-dir", projectDir, "--json"],
          projectDir,
        );
        const recheckReport = JSON.parse(recheck.stdout);
        const driftAfter = (recheckReport.findings ?? []).find(
          (f: { id: string }) => f.id === "env-branch-drift",
        );
        expect(driftAfter).toBeUndefined();

        // Tidy: abandon so subsequent describe runs (if any) start
        // clean. --force in case the state file or working tree is
        // dirty from the doctor --fix that ran git checkout above.
        runCli(
          ABANDON_CLI,
          ["--project-dir", projectDir, "--force"],
          projectDir,
        );

        scenarioPassed.doctor = true;
      },
      5 * 60_000,
    );

    afterAll(async () => {
      const allPassed = Object.values(scenarioPassed).every((v) => v);
      if (!allPassed) {
        console.log("");
        console.log(
          `[LEAVE-INTACT] Skipping teardown (scenarios: ${JSON.stringify(scenarioPassed)}).`,
        );
        console.log("         To clean up manually:");
        console.log(`           gh repo delete ${fullRepoName} --yes`);
        console.log(
          `           databricks postgres delete-project projects/${projectName}`,
        );
        console.log(`           rm -rf ${parentDir}`);
        return;
      }
      console.log("");
      console.log("[TEARDOWN] All side-path scenarios passed. Cleaning up.");

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
