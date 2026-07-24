// SCM workflow doctor (phase C+): read-only diagnostic that
// cross-checks .lakebase/workflow-state.json against the actual git +
// Lakebase + .env state and reports inconsistencies.
//
// Phase C ships --fix <id> for a curated set of findings (env-branch-
// drift, head-branch-drift, tier-topology-mismatch, orphan-current-
// branch). Each fix maps to one shell command, executed only when the
// finding is present in the current report; unsupported fix ids return
// an error rather than performing a related-but-different remediation.

import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import {
  getBranchByName,
  listBranches,
  DEFAULT_PROTECTED_TIER_NAMES,
  type LakebaseBranchInfo,
} from "./branch-utils.js";
import { getCurrentBranch } from "../git/inspect.js";
import { getOwnerRepo } from "../git/remote.js";
import { getActionsEnabled } from "../github/repo.js";
import { adoptScmState, inferTierTopology } from "./scm-adopt-state.js";
import { recoverOrphans } from "./scm-recover-orphans.js";
import { abandonFeatureBranch } from "./scm-abandon-feature.js";
import {
  readWorkflowState,
  type ScmWorkflowState,
  type TierTopology,
} from "./scm-workflow-state.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";
import { exec } from "../util/exec.js";
import {
  collapseMigrationHeads,
  listSchemaMigrations,
  schemaMigrationStatus,
  dbRevisionOrphaned,
  parseAlembicMissingRevision,
} from "./schema-migrate.js";
import { updateEnvConnection, readEnvVar } from "./env-file.js";

export type DoctorSeverity = "ok" | "warn" | "fail";

export interface DoctorFinding {
  id: string;
  severity: DoctorSeverity;
  message: string;
  /** One-line shell command the user can run to address this. */
  suggestion?: string;
}

export interface DoctorArgs {
  projectDir: string;
  /** Lakebase project id. Required to reach the Lakebase side. */
  instance?: string;
}

/** A stale experiment/spike paired branch (the SFTDD-side concept). Declared
 *  locally so SCM core does not import the sftdd module: the caller injects a
 *  finder via RunDoctorDeps. Shape mirrors sftdd/stale-branches.StaleBranchFinding. */
export interface StaleBranchFinding {
  kind: "experiment" | "spike";
  slug: string;
  feature_id?: string;
  story_id?: string;
  branch?: string;
  reason: string;
}

/** Injected dependencies so SCM-core doctor stays free of any SFTDD import
 *  (the split into lakebase-scm-utils). The SFTDD side (the CLI wiring, and later
 *  the kit's doctor wrapper) supplies the stale-branch finder; when absent, the
 *  stale-branch advisory is simply skipped. */
export interface RunDoctorDeps {
  findStaleBranches?: () => StaleBranchFinding[];
}

export interface DoctorReport {
  projectDir: string;
  workflowStatePresent: boolean;
  state?: ScmWorkflowState;
  inferredTierTopology?: TierTopology;
  findings: DoctorFinding[];
  /** Convenience aggregate. */
  worstSeverity: DoctorSeverity;
}

const FEATURE_PREFIX = "feature/";
// Protected tier leaf names (shared default; main/master are also covered so a
// trunk checkout is never misread as an orphan feature). DRY with branch-utils.
const TIER_LEAFS = DEFAULT_PROTECTED_TIER_NAMES;

function readEnv(projectDir: string): Map<string, string> {
  const envPath = path.join(projectDir, ".env");
  const out = new Map<string, string>();
  if (!fs.existsSync(envPath)) return out;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return out;
}

function leafOf(b: LakebaseBranchInfo): string {
  return b.name.split("/").pop() ?? b.name;
}

/** True iff `rel` (repo-relative) is git-tracked in projectDir. Best-effort: no
 *  git / not a repo -> false. */
function isGitTracked(projectDir: string, rel: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", rel], { cwd: projectDir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function worstOf(a: DoctorSeverity, b: DoctorSeverity): DoctorSeverity {
  const order: DoctorSeverity[] = ["ok", "warn", "fail"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))] as DoctorSeverity;
}

export async function runDoctor(args: DoctorArgs, deps: RunDoctorDeps = {}): Promise<DoctorReport> {
  const projectDir = args.projectDir;
  const findings: DoctorFinding[] = [];
  const env = readEnv(projectDir);
  const instance = args.instance ?? env.get("LAKEBASE_PROJECT_ID");
  const state = readWorkflowState(projectDir);
  const workflowStatePresent = state !== null;

  // 0. Stale spikes + experiments, named distinctly. Hermetic (reads the
  // SFTDD records), so it runs even without a Lakebase instance. Provided by an
  // INJECTED finder (deps.findStaleBranches) so SCM core carries no sftdd import;
  // skipped when no finder is supplied.
  for (const stale of deps.findStaleBranches?.() ?? []) {
    const where = stale.feature_id ? ` ${stale.feature_id}/${stale.story_id}` : "";
    findings.push({
      id: `stale-${stale.kind}`,
      severity: "warn",
      message: `Stale ${stale.kind}${where} "${stale.slug}"${stale.branch ? ` (branch ${stale.branch})` : ""}: ${stale.reason}.`,
      suggestion:
        stale.kind === "experiment"
          ? `lakebase-sftdd-experiment discard --feature ${stale.feature_id} --story ${stale.story_id} --slug ${stale.slug} --instance <id> --approver <you> --reason "doctor: stale experiment"`
          : "lakebase-sftdd-spike teardown (or delete the spike's paired branch) once its learning has carried forward",
    });
  }

  // 1. workflow-state present?
  if (!workflowStatePresent) {
    findings.push({
      id: "no-state-file",
      severity: "fail",
      message:
        "No .lakebase/workflow-state.json. Either the project pre-dates the SCM workflow or scaffold did not seed it.",
      suggestion: "lakebase-scm-adopt-state",
    });
  }

  // 1b. GitHub Actions enabled? When Actions is disabled (often an ORG policy
  // on EMU repos, which a repo admin cannot override), the kit's CI workflows
  // (pr.yml / merge.yml) silently never run , no migrations, no tests, no
  // schema-diff comment , which looks like "CI ignored the kit workflow".
  // Surface it explicitly. Best-effort + GitHub-independent of the Lakebase
  // instance, so it runs before the no-instance early return. An undetermined
  // result (no token / repo invisible) is skipped, never reported as disabled.
  try {
    const ownerRepo = await getOwnerRepo(projectDir);
    if (ownerRepo) {
      const enabled = await getActionsEnabled(ownerRepo);
      if (enabled === false) {
        findings.push({
          id: "github-actions-disabled",
          severity: "warn",
          message:
            `GitHub Actions is disabled for ${ownerRepo}, so the kit's CI workflows ` +
            `(pr.yml / merge.yml) will never run , the PR branch's migrations, tests, ` +
            `and schema-diff comment are all skipped. This is commonly an org-level ` +
            `policy on EMU repos, which a repo admin cannot override.`,
          suggestion:
            "Have an org owner enable Actions for this repo (repo Settings -> Actions -> " +
            "General; if it says 'disabled by the organization', it must be enabled in the " +
            "org's Actions policy). Until then, run the workflow steps locally: " +
            "scripts/run-tests.sh against a Lakebase branch.",
        });
      }
    }
  } catch {
    // best-effort: no git remote / no token / offline -> skip silently.
  }

  // 1c. CI workflows follow .lakebase/kit-ref? The runtime substrate (scripts/lk)
  // resolves the kit from .lakebase/kit-ref, but a workflow scaffolded before
  // FEIP-8050 baked a LITERAL `#v<ver>` pin at every kit call site, so a kit-ref
  // bump never reached CI (every run executed the stale kit). Flag the old shape
  // so the human re-emits the kit-ref-aware workflow. Best-effort, file-only.
  for (const wf of ["pr.yml", "merge.yml"]) {
    try {
      const p = path.join(projectDir, ".github", "workflows", wf);
      if (!fs.existsSync(p)) continue;
      const body = fs.readFileSync(p, "utf8");
      // The anti-pattern: a hardcoded version tag right after the kit package ref.
      if (/lakebase-app-dev-kit#v\d/.test(body)) {
        findings.push({
          id: "ci-workflow-kit-pin",
          severity: "warn",
          message:
            `.github/workflows/${wf} hardcodes a kit version pin ` +
            `(github:databricks-solutions/lakebase-app-dev-kit#v<ver>) instead of ` +
            `resolving .lakebase/kit-ref at runtime, so bumping .lakebase/kit-ref does ` +
            `NOT change the kit CI actually runs (FEIP-8050, Finding 24).`,
          suggestion:
            "Re-emit the workflows from the current kit templates so they resolve " +
            "KIT_REF from .lakebase/kit-ref at CI time (updateWorkflows in " +
            "scripts/lakebase/workflow-drift.ts; lakebase-doctor reports this as " +
            "workflow-drift). Until then a kit-ref bump will not reach CI.",
        });
      }
    } catch {
      // best-effort: unreadable workflow -> skip silently.
    }
  }

  // 1d. Runtime SCM claim state git-tracked? .lakebase/workflow-state.json records
  // the per-working-tree feature claim, but being git-tracked means a branch
  // checkout / `git reset --hard origin/<tier>` restores a branch-COMMITTED (stale)
  // claim over the live one, forcing an abandon+reclaim dance (Finding 28 sibling
  // of the kit-ref revert). Flag it so a wrong-claim refusal after a checkout is
  // understood as this, not a real conflict. Best-effort, git-only.
  try {
    if (isGitTracked(projectDir, ".lakebase/workflow-state.json")) {
      findings.push({
        id: "scm-state-git-tracked",
        severity: "warn",
        message:
          ".lakebase/workflow-state.json (the per-working-tree SCM claim state) is git-tracked, so a branch " +
          "checkout or `git reset --hard origin/<tier>` can restore a stale committed claim over the live one " +
          "(the foreign-claim guard then refuses to drive until you abandon + reclaim).",
        suggestion:
          "If a wrong-feature-claim refusal follows a checkout, run lakebase-scm-adopt-state (or abandon + " +
          "reclaim) to re-establish the live claim. The kit-ref run pin (.lakebase/kit-ref.local) already " +
          "protects the kit version from the same checkout revert.",
      });
    }
  } catch {
    // best-effort: no git / not a repo -> skip silently.
  }

  // 2. .env reachability
  if (!env.has("LAKEBASE_PROJECT_ID")) {
    findings.push({
      id: "env-missing-project-id",
      severity: "fail",
      message:
        ".env does not contain LAKEBASE_PROJECT_ID. The post-checkout hook will exit early; workflow CLIs will need an explicit --instance.",
      suggestion: "Set LAKEBASE_PROJECT_ID=<your project id> in .env",
    });
  }
  if (!instance) {
    // Without an instance we cannot cross-check the Lakebase side.
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? undefined,
      findings,
    });
  }

  // 3. Reach Lakebase + infer tier topology
  let lakebaseBranches: LakebaseBranchInfo[] = [];
  try {
    lakebaseBranches = await listBranches({ instance });
  } catch (err) {
    findings.push({
      id: "lakebase-unreachable",
      severity: "fail",
      message: `Could not list Lakebase branches for instance ${instance}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: "databricks auth login (or check DATABRICKS_CONFIG_PROFILE).",
    });
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? undefined,
      findings,
    });
  }
  const inferredTopology = inferTierTopology(lakebaseBranches);
  if (state && state.tier_topology !== inferredTopology) {
    findings.push({
      id: "tier-topology-mismatch",
      severity: "warn",
      message: `workflow-state records tier_topology=${state.tier_topology}, but the Lakebase tier inventory suggests ${inferredTopology}.`,
      suggestion: "lakebase-scm-adopt-state --force",
    });
  }

  // 4. Cross-check workflow state with the world
  const headBranch = await getCurrentBranch({ cwd: projectDir });
  if (state && state.state === "feature-claimed") {
    if (state.branch && headBranch && headBranch !== state.branch) {
      findings.push({
        id: "head-branch-drift",
        severity: "warn",
        message: `workflow says feature-claimed for "${state.branch}", but HEAD is on "${headBranch}".`,
        suggestion: `git checkout '${state.branch}'`,
      });
    }
    if (state.branch) {
      const sanitized = sanitizeBranchName(state.branch);
      let pair: LakebaseBranchInfo | undefined;
      try {
        pair = await getBranchByName(sanitized, { instance });
      } catch {
        pair = undefined;
      }
      if (!pair) {
        findings.push({
          id: "lakebase-pair-missing",
          severity: "fail",
          message: `workflow says feature-claimed for "${state.branch}", but no Lakebase branch "${sanitized}" exists.`,
          suggestion: `lakebase-scm-abandon-feature  # reset state; re-claim if needed`,
        });
      } else if (state.lakebase_branch_uid && pair.uid !== state.lakebase_branch_uid) {
        findings.push({
          id: "lakebase-uid-drift",
          severity: "warn",
          message: `workflow records lakebase_branch_uid=${state.lakebase_branch_uid}, but the live branch reports ${pair.uid}.`,
          suggestion: "lakebase-scm-adopt-state --force",
        });
      }
    }
  }

  // 5. .env credentials match the current branch?
  if (state && state.state === "feature-claimed" && state.branch) {
    const envBranchId = env.get("LAKEBASE_BRANCH_ID");
    const sanitized = sanitizeBranchName(state.branch);
    if (envBranchId && envBranchId !== sanitized) {
      findings.push({
        id: "env-branch-drift",
        severity: "warn",
        message: `.env LAKEBASE_BRANCH_ID=${envBranchId} but workflow says ${sanitized}. The post-checkout hook may not have run since the last branch switch.`,
        suggestion: `git checkout '${state.branch}'  # re-fires post-checkout`,
      });
    }
  }

  // 6. Orphan git branches?
  // Conservative: only flag the current branch as orphan (a deep scan
  // is in lakebase-scm-recover-orphans). The doctor is read-only and
  // wants the report to be quick.
  if (
    headBranch &&
    !TIER_LEAFS.has(headBranch) &&
    headBranch.startsWith(FEATURE_PREFIX)
  ) {
    const sanitized = sanitizeBranchName(headBranch);
    const paired = lakebaseBranches.some((b) => leafOf(b) === sanitized);
    if (!paired) {
      findings.push({
        id: "orphan-current-branch",
        severity: "fail",
        message: `Current git branch "${headBranch}" has no Lakebase pair (post-checkout fallback retired in phase C).`,
        suggestion: `lakebase-scm-recover-orphans --claim --only-branch '${headBranch}'`,
      });
    }
  }

  // 7. Sanity for ci-green that hasn't been merged in a while
  // (No clock-vs-state heuristics in this first cut; deliberate.)

  // 8. Multiple migration heads (a sibling merge that skipped the collapse).
  // Best-effort + non-mutating (dry-run): only DAG tools (Alembic) can report
  // >1 head; flat-list tools no-op. Skip silently if the tool can't be
  // resolved or its CLI isn't installed here, that is not a determinable fault.
  try {
    const heads = await collapseMigrationHeads({ projectDir, dryRun: true });
    if (heads.headsBefore.length > 1) {
      findings.push({
        id: "multiple-migration-heads",
        severity: "fail",
        message: `Migrations have ${heads.headsBefore.length} heads (${heads.headsBefore.join(", ")}); a sibling-feature merge left them un-collapsed. \`upgrade head\` will refuse until they are unified.`,
        suggestion: "lakebase-sftdd-collapse-heads",
      });
    }
  } catch {
    // tool unresolved / CLI absent / no project: not a determinable fault.
  }

  // 9. DB ahead of code (FEIP-8039): the paired branch DB's applied revision has
  // NO local migration file , an aborted build migrated the branch and a later
  // `git reset --hard` removed the file (git-only recovery leaves the DB ahead),
  // and a re-cut feature reuses that same stale branch. `alembic current` ERRORS
  // on exactly this state ("Can't locate revision"), so recover the orphan rev
  // from that error; else compare the reported current rev to local files.
  // Best-effort + live (reads the branch DB); a missing CLI / unreachable branch
  // is not a determinable fault.
  if (instance && state?.branch) {
    try {
      const localIds = listSchemaMigrations({ projectDir }).map((m) => m.version);
      let orphanRev: string | null = null;
      try {
        const status = await schemaMigrationStatus({ instance, branch: state.branch, projectDir });
        if (dbRevisionOrphaned(status.current, localIds)) orphanRev = status.current ?? null;
      } catch (e) {
        orphanRev = parseAlembicMissingRevision(e instanceof Error ? e.message : String(e));
      }
      if (orphanRev) {
        findings.push({
          id: "db-ahead-of-code",
          severity: "fail",
          message:
            `The paired branch DB is AHEAD of code: applied revision '${orphanRev}' has no local migration file. ` +
            `An aborted build likely migrated this branch and a git reset removed the migration file; ` +
            `alembic accept/deploy/promote will fail "Can't locate revision".`,
          suggestion:
            "reset the paired branch DB to the code head (downgrade/stamp + drop reset-created tables), " +
            "or delete the branch and re-cut it clean from its tier",
        });
      }
    } catch {
      // tool unresolved / CLI absent / branch unreachable: not a determinable fault.
    }
  }

  return finalize({
    projectDir,
    workflowStatePresent,
    state: state ?? undefined,
    inferredTierTopology: inferredTopology,
    findings,
  });
}

function finalize(report: Omit<DoctorReport, "worstSeverity">): DoctorReport {
  let worst: DoctorSeverity = "ok";
  for (const f of report.findings) {
    worst = worstOf(worst, f.severity);
  }
  return { ...report, worstSeverity: worst };
}

export class ScmDoctorFixError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "finding-not-present"
      | "unsupported-finding"
      | "fix-failed",
  ) {
    super(message);
    this.name = "ScmDoctorFixError";
  }
}

/** Findings the doctor can auto-fix. Others require manual intervention. */
export const FIXABLE_FINDING_IDS = [
  "env-branch-drift",
  "head-branch-drift",
  "tier-topology-mismatch",
  "orphan-current-branch",
  "multiple-migration-heads",
  "db-ahead-of-code",
] as const;

export type FixableFindingId = (typeof FIXABLE_FINDING_IDS)[number];

export interface FixFindingArgs {
  projectDir: string;
  instance?: string;
  findingId: FixableFindingId;
  /** Use the supplied report instead of re-running runDoctor (for tests). */
  report?: DoctorReport;
}

export interface FixFindingResult {
  /** Finding that was acted on. */
  findingId: FixableFindingId;
  /** One-line summary of the remediation that ran. */
  action: string;
  /** Doctor report captured after the remediation. */
  postReport: DoctorReport;
}

/**
 * Apply a targeted remediation for one finding. Refuses if the
 * finding isn't present in the current report (so the user can't
 * accidentally run a `--fix` against a stale plan). Refuses on
 * unsupported finding ids.
 */
export async function fixFinding(
  args: FixFindingArgs,
): Promise<FixFindingResult> {
  if (!FIXABLE_FINDING_IDS.includes(args.findingId)) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not supported by --fix. Supported: ${FIXABLE_FINDING_IDS.join(", ")}.`,
      "unsupported-finding",
    );
  }
  const report =
    args.report ??
    (await runDoctor({ projectDir: args.projectDir, instance: args.instance }));
  const present = report.findings.find((f) => f.id === args.findingId);
  if (!present) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not present in the current report. Re-run lakebase-scm-doctor to see what needs fixing.`,
      "finding-not-present",
    );
  }

  let action = "";
  try {
    switch (args.findingId) {
      case "env-branch-drift": {
        // Rewrite .env's LAKEBASE_BRANCH_ID line directly. Earlier
        // versions of this fix ran `git checkout <state.branch>` and
        // expected the post-checkout hook to resync .env, but that
        // path has two failure modes that left users stuck:
        //   1. If git's HEAD was already on state.branch, the
        //      checkout was a no-op for HEAD-change purposes and the
        //      post-checkout hook (which gates on a real branch
        //      switch in some setups) silently did nothing.
        //   2. post-checkout bails early on databricks CLI auth
        //      failure, leaving .env untouched even when the
        //      workflow-state.json knew the right branch.
        // The drift this finding flags is purely about the
        // LAKEBASE_BRANCH_ID line; updateEnvConnection rewrites just
        // the connection block (preserving every other line) and
        // doesn't depend on the post-checkout chain. Credentials
        // (DATABASE_URL / DB_USERNAME / DB_PASSWORD / LAKEBASE_HOST)
        // are left empty here; the next post-checkout (or a manual
        // mint) refreshes them. The BRANCH_ID is the load-bearing
        // value -- everything else can be re-derived.
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed",
          );
        }
        const sanitized = sanitizeBranchName(branch);
        // Metadata-only rewrite: preserve the existing project id + host so the
        // app can still mint at runtime; the username/token are re-derived by the
        // next post-checkout (or the app's own mint). No token is written here.
        const envFile = path.join(args.projectDir, ".env");
        updateEnvConnection({
          envPath: envFile,
          projectId: readEnvVar(envFile, "LAKEBASE_PROJECT_ID") ?? "",
          branchId: sanitized,
          username: readEnvVar(envFile, "DB_USERNAME") ?? "",
          endpointHost: readEnvVar(envFile, "LAKEBASE_HOST"),
        });
        action = `rewrote .env LAKEBASE_BRANCH_ID=${sanitized} (metadata only; the app mints its token at runtime)`;
        break;
      }
      case "head-branch-drift": {
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed",
          );
        }
        await exec(`git checkout ${shellEscape(branch)}`, {
          cwd: args.projectDir,
          timeout: 15_000,
        });
        action = `git checkout ${branch} (re-fires post-checkout to resync HEAD)`;
        break;
      }
      case "tier-topology-mismatch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed",
          );
        }
        await adoptScmState({
          projectDir: args.projectDir,
          instance,
          force: true,
        });
        action = `adopted state with --force to re-infer tier_topology`;
        break;
      }
      case "orphan-current-branch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed",
          );
        }
        const headBranch = await getCurrentBranch({ cwd: args.projectDir });
        if (!headBranch) {
          throw new ScmDoctorFixError(
            "Cannot fix: detached HEAD or no current branch.",
            "fix-failed",
          );
        }
        await recoverOrphans({
          projectDir: args.projectDir,
          instance,
          claim: true,
          onlyBranch: headBranch,
        });
        action = `recovered orphan ${headBranch} via createFeaturePairedBranch`;
        break;
      }
      case "multiple-migration-heads": {
        const r = await collapseMigrationHeads({ projectDir: args.projectDir });
        if (r.status !== "ok" || !r.mergeRevision) {
          throw new ScmDoctorFixError(
            `Expected to create a merge revision but got status="${r.status}".`,
            "fix-failed",
          );
        }
        action = `collapsed ${r.headsBefore.length} heads into merge revision ${r.mergeRevision} (commit it)`;
        break;
      }
      case "db-ahead-of-code": {
        // FEIP-8039: the paired branch DB is ahead of code (a phantom revision +
        // orphan table from an aborted build the git reset could not undo). The
        // robust reset is to ABANDON the feature (delete the polluted branch +
        // reset workflow state to scaffold-complete) so the next claim re-forks a
        // clean branch from the tier. force: the working tree may be mid-flight;
        // the branch's committed code is on the feature PR / not lost by design.
        const r = await abandonFeatureBranch({ projectDir: args.projectDir, instance: args.instance, force: true });
        action =
          `abandoned the feature (deleted the polluted paired branch${r.lakebaseDeleted ? "" : " , Lakebase delete reported not-deleted"}) ` +
          `and reset state to '${r.state.state}'; re-claim to re-fork a clean branch from the tier`;
        break;
      }
    }
  } catch (err) {
    if (err instanceof ScmDoctorFixError) throw err;
    throw new ScmDoctorFixError(
      `Remediation failed: ${err instanceof Error ? err.message : String(err)}`,
      "fix-failed",
    );
  }

  const postReport = await runDoctor({
    projectDir: args.projectDir,
    instance: args.instance,
  });
  return { findingId: args.findingId, action, postReport };
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
