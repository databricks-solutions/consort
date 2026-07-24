// G9: end-to-end SCM-workflow live e2e for the gates state
// machine track (ADR-0004).
//
// Walks the F-AUDIT feature (per-branch migration audit log) through
// the canonical gate lifecycle against a freshly-provisioned Lakebase
// project + a throwaway GitHub repo. Each stage maps to a section of
// the ADR-0004 test plan.
//
// Stages exercised:
//   S0 project + GitHub repo + paired feature branch provisioning
//   S1-S3 gate approvals (spec, plan, test_list) via approveGate
//   S5 no-drift verification (clean + prettier-equivalent reformat)
//   S5b drift detection on a semantic edit
//   S6 cascade-withdraw (spec withdraw cascades to plan + test_list)
//   S7 re-approve all gates against the cleaned-up state
//   S9 PR open with gates-summary body + merge-paired cleanup
//   S10 teardown
//
// Not in scope here (filed for follow-up tickets):
//   S4 N>1 race + S8 concurrent driver/navigator approvals (need the
//     parallel-runner agent harness wired up)
//   S8b migration apply on the live feature Lakebase branch (covered
//     by tests/bdd/migrate-live*.test.ts in isolation)
//
// Gating (env vars):
//   LAKEBASE_TEST_E2E=1                must be set
//   DATABRICKS_HOST                    workspace URL
//   DATABRICKS_CONFIG_PROFILE          profile pointing at the workspace
//   LAKEBASE_TEST_GITHUB_OWNER         GitHub user/org for the throwaway repo
//   databricks CLI                     on PATH + authenticated
//   gh CLI                             on PATH + authenticated (scopes: repo,
//                                      workflow, delete_repo)
//
// Teardown: deletes Lakebase project + GitHub repo on success. On failure,
// preserves both for debugging; the project id + repo URL are printed.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  createLakebaseProject,
  deleteLakebaseProject,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { createPairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { approveGate } from "../../scripts/sftdd/approve-gate.js";
import { defaultGatesState, GATE_NAMES, readGates, writeGates } from "../../scripts/sftdd/gates.js";
import { verifyGateIntegrity } from "../../scripts/sftdd/verify-gate-integrity.js";
import { withdrawGate } from "../../scripts/sftdd/withdraw-gate.js";
import { createPullRequest, mergePairedPullRequest } from "@databricks-solutions/lakebase-scm-utils/github";

const E2E = process.env.LAKEBASE_TEST_E2E === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const DATABRICKS_PROFILE = process.env.DATABRICKS_CONFIG_PROFILE ?? "DEFAULT";
const GITHUB_OWNER = process.env.LAKEBASE_TEST_GITHUB_OWNER ?? "";

function hasCmd(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}
const DATABRICKS_AVAILABLE = E2E ? hasCmd("databricks") : false;
const GH_AVAILABLE = E2E ? hasCmd("gh") : false;
const RUN_SUITE =
  E2E && DATABRICKS_HOST && GITHUB_OWNER && DATABRICKS_AVAILABLE && GH_AVAILABLE;

const APPROVER = process.env.LAKEBASE_TEST_APPROVER_EMAIL ?? "approver@example.com";
const FEATURE_ID = "F-AUDIT";

function run(cmd: string, args: string[], cwd?: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(cmd, args, { encoding: "utf8", cwd, timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

describe.skipIf(!RUN_SUITE)(
  "gates state machine: end-to-end SCM workflow",
  () => {
    let projectId: string;
    let repoName: string;
    let ownerRepo: string;
    let workDir: string;
    let sftddDir: string;
    let featureDir: string;
    /**
     * Sanitized git branch name returned by createPairedBranch (lowercases,
     * replaces invalid chars with hyphens). The .tdd/ feature directory uses
     * the FEATURE_ID verbatim ("F-AUDIT"); the local git + remote branch use
     * the sanitized form ("f-audit"). They are independent identifiers.
     */
    let gitBranchName: string;
    let prNumber: number | undefined;
    let testPassed = false;

    const SPEC_MD = "# F-AUDIT: per-branch migration audit log\n\nCapture each migration apply on a Lakebase branch.\n";
    const SPEC_MD_PRETTIER = "# F-AUDIT: per-branch migration audit log   \r\n\r\n\r\nCapture each migration apply on a Lakebase branch.  \r\n";
    const FEATURE_JSON = '{"id":"F-AUDIT","name":"Audit log","status":"draft","tdd_mode":"N=1","stories":["S1"]}';
    const PLAN_JSON = '{"feature_id":"F-AUDIT","N":1,"mode":"N=1","strategies":[{"name":"audit","rationale":"single approach"}],"budget":{"concurrent_branches":1,"wall_clock_minutes":60,"agent_pairs":1},"rationale":"no opinion gaps"}';
    const TEST_LIST_JSON = '{"feature_id":"F-AUDIT","ordered_for":"design-momentum","items":[{"id":"T1","description":"audit row written on apply","ac_id":"AC1","status":"pending"}]}';

    beforeAll(async () => {
      const ts = Date.now();
      projectId = `lbscm-7366-${ts}`;
      repoName = `lbscm-7366-bdd-${ts}`;
      ownerRepo = `${GITHUB_OWNER}/${repoName}`;
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), `lbscm-7366-${ts}-`));
      sftddDir = path.join(workDir, ".tdd");
      featureDir = path.join(sftddDir, "features", FEATURE_ID);
      fs.mkdirSync(featureDir, { recursive: true });

      console.log(`  [S0] provisioning Lakebase project ${projectId} on ${DATABRICKS_HOST}`);
      await createLakebaseProject({ projectId, host: DATABRICKS_HOST });

      console.log(`  [S0] creating throwaway GitHub repo ${ownerRepo}`);
      const create = run("gh", [
        "repo",
        "create",
        ownerRepo,
        "--private",
        "--description",
        "Throwaway repo for gates e2e (auto-delete after test)",
        "--confirm",
      ]);
      if (create.status !== 0) {
        throw new Error(`gh repo create failed: ${create.stderr}`);
      }

      // Local git repo + initial commit on main, push, then a feature
      // branch that the test pushes again at S9.
      run("git", ["init", "-b", "main"], workDir);
      run("git", ["config", "user.email", "test@example.com"], workDir);
      run("git", ["config", "user.name", "BDD test"], workDir);
      fs.writeFileSync(path.join(workDir, "README.md"), "# bdd\n");
      run("git", ["add", "-A"], workDir);
      run("git", ["commit", "-m", "Initial commit"], workDir);
      run("git", ["remote", "add", "origin", `https://github.com/${ownerRepo}.git`], workDir);
      const push = run("git", ["push", "-u", "origin", "main"], workDir);
      if (push.status !== 0) {
        throw new Error(`Initial push failed: ${push.stderr}`);
      }

      console.log(`  [S0] creating paired feature branch ${FEATURE_ID}`);
      const paired = await createPairedBranch({
        instance: projectId,
        branch: FEATURE_ID,
        cwd: workDir,
        createGitBranch: true,
        syncEnv: false,
      });
      gitBranchName = paired.gitBranch;
      console.log(`  [S0] paired branch ready (lakebase=${paired.branch.name ?? FEATURE_ID}, git=${gitBranchName})`);
    }, 600_000);

    afterAll(async () => {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
      if (!testPassed) {
        console.warn(`  [teardown] preserving Lakebase project ${projectId} + GitHub repo ${ownerRepo} for debugging (test failed)`);
        console.warn(`  Manual cleanup: gh repo delete ${ownerRepo} --yes && databricks --profile ${DATABRICKS_PROFILE} postgres delete-project ${projectId}`);
        return;
      }
      try {
        await deleteLakebaseProject({ projectId, host: DATABRICKS_HOST });
        console.log(`  [teardown] deleted Lakebase project ${projectId}`);
      } catch (err) {
        console.warn(`  [teardown] FAILED to delete project ${projectId}: ${(err as Error).message}`);
      }
      const del = run("gh", ["repo", "delete", ownerRepo, "--yes"]);
      if (del.status !== 0) {
        console.warn(`  [teardown] FAILED to delete ${ownerRepo}: ${del.stderr}`);
      } else {
        console.log(`  [teardown] deleted GitHub repo ${ownerRepo}`);
      }
    }, 300_000);

    it("S1: approveGate(spec) writes gates.json + selection-log narrative", () => {
      fs.writeFileSync(path.join(featureDir, "feature-spec.md"), SPEC_MD);
      fs.writeFileSync(path.join(featureDir, "feature-spec.json"), FEATURE_JSON);
      const result = approveGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "feature-spec.md": SPEC_MD, "feature-spec.json": FEATURE_JSON },
        sftddDir,
      });
      expect(result.state.gates.spec.status).toBe("approved");
      expect(fs.existsSync(path.join(featureDir, "gates.json"))).toBe(true);
      expect(fs.existsSync(path.join(sftddDir, "selection-log.md"))).toBe(true);
    });

    it("S2: approveGate(plan) chains cleanly", () => {
      fs.writeFileSync(path.join(featureDir, "plan.json"), PLAN_JSON);
      const result = approveGate({
        featureId: FEATURE_ID,
        gate: "plan",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "plan.json": PLAN_JSON },
        sftddDir,
      });
      expect(result.state.gates.plan.status).toBe("approved");
      expect(result.state.gates.spec.status).toBe("approved");
    });

    it("S3: approveGate(test_list) closes the design phase gates", () => {
      fs.writeFileSync(path.join(featureDir, "test-list.json"), TEST_LIST_JSON);
      const result = approveGate({
        featureId: FEATURE_ID,
        gate: "test_list",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "test-list.json": TEST_LIST_JSON },
        sftddDir,
      });
      for (const name of GATE_NAMES) {
        if (name === "promote") {
          expect(result.state.gates[name].status).toBe("open");
        } else {
          expect(result.state.gates[name].status).toBe("approved");
        }
      }
    });

    it("S5: verifyGateIntegrity returns ok against clean + prettier-equivalent content", () => {
      const ok = verifyGateIntegrity({
        featureId: FEATURE_ID,
        gate: "spec",
        currentInputs: { "feature-spec.md": SPEC_MD, "feature-spec.json": FEATURE_JSON },
        sftddDir,
      });
      expect(ok.status).toBe("ok");

      const okAfterReformat = verifyGateIntegrity({
        featureId: FEATURE_ID,
        gate: "spec",
        currentInputs: { "feature-spec.md": SPEC_MD_PRETTIER, "feature-spec.json": FEATURE_JSON },
        sftddDir,
      });
      expect(okAfterReformat.status).toBe("ok");
    });

    it("S5b: verifyGateIntegrity flags drift on a semantic edit", () => {
      const v = verifyGateIntegrity({
        featureId: FEATURE_ID,
        gate: "spec",
        currentInputs: {
          "feature-spec.md": "# F-AUDIT: per-branch migration audit log\n\nDIFFERENT body\n",
          "feature-spec.json": FEATURE_JSON,
        },
        sftddDir,
      });
      expect(v.status).toBe("drift");
    });

    it("S6: withdrawGate(spec) cascades to plan + test_list", () => {
      const result = withdrawGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        reason: "scope rewrite",
        sftddDir,
      });
      expect(result.withdrawn_gates.sort()).toEqual(["plan", "spec", "test_list"]);
      const state = readGates(FEATURE_ID, { sftddDir });
      expect(state.gates.spec.status).toBe("withdrawn");
      expect(state.gates.plan.status).toBe("withdrawn");
      expect(state.gates.test_list.status).toBe("withdrawn");
      expect(state.gates.spec.withdrawal_reason).toBe("scope rewrite");
      expect(state.gates.plan.withdrawal_reason).toBe("cascade:spec");
    });

    it("S7: gates can be re-approved after cascade withdrawal (state.gates.* back to open before approval)", () => {
      // After S6 the gates are "withdrawn", not "open"; per ADR-0004 the
      // re-approval path requires explicit reset. The kit ships that reset
      // as a clean re-write of gates.json via writeGates from
      // defaultGatesState; the orchestrator does that on synthesis. Here
      // we exercise that the substrate permits the flow (rather than
      // testing the orchestrator wrapper).
      writeGates(defaultGatesState(FEATURE_ID), { sftddDir });

      approveGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "feature-spec.md": SPEC_MD, "feature-spec.json": FEATURE_JSON },
        sftddDir,
      });
      approveGate({
        featureId: FEATURE_ID,
        gate: "plan",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "plan.json": PLAN_JSON },
        sftddDir,
      });
      approveGate({
        featureId: FEATURE_ID,
        gate: "test_list",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "test-list.json": TEST_LIST_JSON },
        sftddDir,
      });
      const state = readGates(FEATURE_ID, { sftddDir });
      expect(state.gates.spec.status).toBe("approved");
      expect(state.gates.plan.status).toBe("approved");
      expect(state.gates.test_list.status).toBe("approved");
    });

    it("S9.1: lakebase-pr open emits a real PR URL with gates summary in the body", { timeout: 180_000 }, async () => {
      // Commit the .tdd/ tree + push the feature branch. The local git
      // branch is the sanitized name (createPairedBranch lowercases the
      // FEATURE_ID); we push that, not the raw FEATURE_ID.
      run("git", ["add", "-A"], workDir);
      run("git", ["commit", "-m", "F-AUDIT: spec + plan + test-list + gates"], workDir);
      const pushF = run("git", ["push", "-u", "origin", gitBranchName], workDir);
      if (pushF.status !== 0) {
        throw new Error(`git push failed (status ${pushF.status}):\n${pushF.stderr}`);
      }

      const state = readGates(FEATURE_ID, { sftddDir });
      const gatesSummary = GATE_NAMES.map((name) => {
        const g = state.gates[name];
        const hashes = g.artifact_hashes
          ? Object.entries(g.artifact_hashes).map(([k, v]) => `${k}:sha256:${v.slice(0, 12)}`).join(", ")
          : "(none)";
        return `- **${name}**: ${g.status} (${hashes})`;
      }).join("\n");

      const url = await createPullRequest({
        ownerRepo,
        headBranch: gitBranchName,
        title: `F-AUDIT: per-branch migration audit log`,
        body: `## Gates summary\n\n${gatesSummary}\n\n[e2e test PR]\n`,
        baseBranch: "main",
      });
      expect(url).toMatch(/https:\/\/github\.com\//);
      const m = url.match(/\/pull\/(\d+)/);
      expect(m).not.toBeNull();
      prNumber = Number(m![1]);
    });

    it("S9.2: mergePairedPullRequest closes the PR + cleans up the Lakebase feature branch", { timeout: 180_000 }, async () => {
      expect(prNumber).toBeDefined();
      const result = await mergePairedPullRequest({
        ownerRepo,
        pullNumber: prNumber!,
        lakebaseInstance: projectId,
        method: "squash",
        deleteRemoteBranch: true,
        deleteLakebaseBranch: true,
      });
      expect(result.message).toBeDefined();
      expect(result.lakebaseBranchDeleted).toBe(true);
      testPassed = true;
    });
  }
);
