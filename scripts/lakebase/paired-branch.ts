// Git-Lakebase paired branch operations.
//
// The substrate's reason for being is keeping a git branch and a Lakebase
// branch in lockstep. These four operations encapsulate the coordination:
//
//   createPairedBranch        – Lakebase branch + matching git branch + .env sync
//   deletePairedBranch        – Lakebase delete + git local + git remote (best-effort)
//   syncEnvToCurrentBranch    – read current git branch, mint fresh credential, update .env
//   checkoutPaired            – in-process equivalent of post-checkout.sh
//                               (trunk/staging/feature modes + parent fallback chain)
//
// Internal git ops use child_process directly. They're NOT exported as a
// generic git-wrapper API – the substrate's charter is Lakebase-aware
// workflow coordination, not a git CLI library. Agents that need raw git
// should shell out to `git` directly.

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { createBranch, waitForBranchReady } from "./branch-create.js";
import { deleteBranch } from "./branch-delete.js";
import { getBranchByName, isTier, listBranches, protectedTierNamesFromEnv } from "./branch-utils.js";
import type { LakebaseBranchInfo } from "./branch-utils.js";
import {
  endpointPath,
  ensureEndpoint,
  getCredential,
  getEndpoint,
} from "./branch-endpoint.js";
import { mintCredential } from "./get-connection.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";
import { isDirty } from "../git/status.js";
import { updateEnvConnection } from "./env-file.js";
import { ensureProfilePinned } from "./databricks-profile.js";
import { DEFAULT_DATABASE, POSTGRES_PORT, RUNTIME_ARTIFACT_IGNORE } from "./constants.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

// ─── Internal git helpers ───────────────────────────────────────

function gitCurrentBranch(cwd: string): string {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault,
  }).trim();
}

function gitHasLocalBranch(cwd: string, branch: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd,
      stdio: "ignore",
      timeout: KIT_TIMEOUTS.gitDefault,
    });
    return true;
  } catch {
    return false;
  }
}

function gitCheckoutNewBranch(cwd: string, branch: string, startPoint?: string): void {
  // A feature branch must fork from its PARENT tier, not whatever happens to be
  // checked out. `git checkout -b <branch>` (no start point) forks from HEAD, so
  // a feature cut while sitting on trunk diverges from the paired Lakebase branch
  // (which is parented on the tier) -> migration history + agent log mismatch.
  const argv = startPoint ? ["checkout", "-b", branch, startPoint] : ["checkout", "-b", branch];
  execFileSync("git", argv, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout,
  });
}

/** Fetch a single branch from `origin` (best-effort: a no-remote / offline repo
 *  is fine; the caller falls back to a local ref or HEAD). */
function gitFetchBranch(cwd: string, remote: string, branch: string): void {
  try {
    execFileSync("git", ["fetch", remote, branch], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.gitNetwork,
    });
  } catch {
    /* best-effort: no `origin`, offline, or no such remote branch */
  }
}

/** True iff `ref` resolves in this repo. */
function gitRefExists(cwd: string, ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.gitDefault,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The git start-point a feature branch must fork from: the PARENT tier's pushed
 * tip. Fetches `origin/<parentBranch>` and prefers it (the promoted state the
 * paired Lakebase branch was cut from); falls back to a local `<parentBranch>`
 * ref; returns undefined when neither resolves (no remote + no local parent),
 * in which case the caller forks from HEAD (legacy behavior, e.g. tier-less /
 * hermetic repos). Exported for hermetic testing.
 */
export function resolveFeatureStartPoint(cwd: string, parentBranch?: string): string | undefined {
  if (!parentBranch) return undefined;
  gitFetchBranch(cwd, "origin", parentBranch);
  if (gitRefExists(cwd, `origin/${parentBranch}`)) return `origin/${parentBranch}`;
  if (gitRefExists(cwd, parentBranch)) return parentBranch;
  return undefined;
}

/**
 * Refuse to fork a feature branch from a parent ref while the working tree is
 * dirty: `git checkout -b <branch> <parent>` silently carries non-conflicting
 * uncommitted changes onto the new branch. Same convention as
 * scm-abandon-feature. The kit never prompts (it is non-interactive); a human /
 * the extension stashes or commits and retries. No-op when startPoint is
 * undefined (forking from HEAD carries nothing new). Exported for testing.
 */
export async function assertCleanForFork(cwd: string, startPoint?: string): Promise<void> {
  if (!startPoint) return;
  // "Uncommitted CODE?" , tolerate the workflow-metadata churn the driver writes
  // mid-run (`.tdd/` log + state pointers, `.lakebase/` workflow state), matching
  // scm-prepare-pr. Only uncommitted edits to TRACKED source count: an untracked
  // file rides onto the fork but the build's allow-list commit never stages it, so
  // stray agent junk (e.g. a mis-quoted filename) must not block the cut.
  if (await isDirty({ cwd, ignore: [...RUNTIME_ARTIFACT_IGNORE], untracked: false })) {
    throw new Error(
      `Working tree has uncommitted changes; refusing to fork from ${startPoint} ` +
        `(they would be carried onto the new branch). Commit or stash first.`,
    );
  }
}

function gitCheckoutExistingBranch(cwd: string, branch: string): void {
  execFileSync("git", ["checkout", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout,
  });
}

function gitMergeBranch(cwd: string, branch: string): void {
  execFileSync("git", ["merge", "--no-edit", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault,
  });
}

function gitDeleteLocalBranch(cwd: string, branch: string, force = true): void {
  execFileSync("git", ["branch", force ? "-D" : "-d", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault,
  });
}

function gitHasRemoteBranch(cwd: string, remote: string, branch: string): boolean {
  try {
    const out = execFileSync(
      "git",
      ["ls-remote", "--exit-code", "--heads", remote, branch],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: KIT_TIMEOUTS.gitNetwork }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function gitDeleteRemoteBranch(cwd: string, remote: string, branch: string): void {
  execFileSync("git", ["push", remote, "--delete", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitPush,
  });
}

function readEnvVar(envPath: string, key: string): string | undefined {
  if (!fs.existsSync(envPath)) return undefined;
  const content = fs.readFileSync(envPath, "utf-8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return undefined;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function buildDsn(host: string, database: string, user: string, password: string): string {
  const u = new URL(`postgresql://${host}:${POSTGRES_PORT}/${encodeURIComponent(database)}`);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}

// ─── createPairedBranch ────────────────────────────────────────

export interface CreatePairedBranchArgs {
  instance: string;
  branch: string;
  /** Explicit Lakebase parent override. */
  parentBranch?: string;
  /** Project directory (must contain .git/; .env is updated if syncEnv=true). */
  cwd: string;
  /** Create+switch a git branch with the same sanitized name. Default: true. */
  createGitBranch?: boolean;
  /** Update .env to point at the new branch's endpoint. Default: true. */
  syncEnv?: boolean;
  /** Default: 120_000. Lakebase ready-state poll budget. */
  readyTimeoutMs?: number;
  /** Default: "databricks_postgres". */
  database?: string;
  /**
   * Lakebase-format TTL string ("<seconds>s", e.g. "2592000s" = 30 days)
   * for the Lakebase branch. Mutually exclusive with `noExpiry: true`.
   * When neither is set, createBranch's default (`no_expiry: true`)
   * applies - which is wrong for feature/test/uat/perf branches that
   * should expire. Per-tier-type wrappers in convention-branches.ts
   * (createFeaturePairedBranch / createTestPairedBranch / ...) plumb the
   * right convention TTL here.
   */
  ttl?: string;
  /**
   * When true, force `no_expiry: true` on the Lakebase branch. Use for
   * long-running tiers (production, staging). Mutually exclusive with
   * `ttl`. When neither is set, createBranch's default fires (no_expiry
   * true), but new callers should be explicit.
   */
  noExpiry?: boolean;
}

export interface CreatePairedBranchResult {
  branch: LakebaseBranchInfo;
  /** Sanitized git branch name (matches Lakebase branch name). */
  gitBranch: string;
  /** True iff the git branch was newly created in this call. */
  gitBranchCreated: boolean;
  /** True iff .env was updated with fresh credentials. */
  envSynced: boolean;
  /** Non-fatal issues collected during the run. */
  warnings: string[];
}

/**
 * Create a Lakebase branch + matching git branch + .env sync, in one call.
 *
 * Order:
 *   1. Create Lakebase branch (sanitized name)
 *   2. Wait for READY (so the endpoint exists when we sync .env)
 *   3. Create git branch with the same sanitized name (if createGitBranch)
 *   4. Mint credential + update .env (if syncEnv)
 *
 * Failures after step 1 are NOT rolled back – the Lakebase branch survives
 * and the caller can retry. Warnings collect non-fatal step failures.
 */
export async function createPairedBranch(
  args: CreatePairedBranchArgs
): Promise<CreatePairedBranchResult> {
  const warnings: string[] = [];
  const sanitized = sanitizeBranchName(args.branch);
  const createGitBranch = args.createGitBranch !== false;
  const syncEnv = args.syncEnv !== false;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;

  // Resolve the git fork-point + guard a dirty tree BEFORE creating the Lakebase
  // branch, so we never mint a Lakebase branch we then refuse to pair. The git
  // branch forks from the parent tier's pushed tip (origin/<parent>), matching
  // the Lakebase parent; a dirty tree is refused here, not silently carried.
  let gitStartPoint: string | undefined;
  if (createGitBranch && !gitHasLocalBranch(args.cwd, sanitized)) {
    gitStartPoint = resolveFeatureStartPoint(args.cwd, args.parentBranch);
    await assertCleanForFork(args.cwd, gitStartPoint);
  }

  // 1. Create Lakebase branch (idempotent if already exists with same name)
  // TTL semantics: callers that want a tier (no expiry) pass noExpiry: true;
  // callers that want a finite-lifetime convention branch pass ttl. If
  // neither is set, the underlying createBranch defaults to no_expiry: true
  // (legacy behavior); per-tier-type wrappers in convention-branches.ts are
  // the supported way to pick the right convention TTL.
  const branch = await createBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch,
    ttl: args.ttl,
    noExpiry: args.noExpiry,
  });

  // 2. Wait for READY (createBranch already polls, but make budget explicit)
  let ready = branch;
  if (branch.state !== "READY") {
    try {
      ready = await waitForBranchReady({
        instance: args.instance,
        branch: sanitized,
        timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait,
      });
    } catch (err) {
      warnings.push(
        `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 3. Create+switch git branch
  let gitBranchCreated = false;
  if (createGitBranch) {
    try {
      if (gitHasLocalBranch(args.cwd, sanitized)) {
        gitCheckoutExistingBranch(args.cwd, sanitized);
      } else {
        gitCheckoutNewBranch(args.cwd, sanitized, gitStartPoint);
        gitBranchCreated = true;
      }
    } catch (err) {
      warnings.push(
        `Failed to create/switch git branch "${sanitized}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 4. Sync .env with fresh credentials.
  //
  // Use ensureEndpoint (get-or-create + POLL until a host appears, or throw on
  // timeout) – NOT a bare getEndpoint. A freshly-cut Lakebase branch's endpoint
  // provisions asynchronously, so a single getEndpoint right after the cut races
  // the endpoint coming up: it returns undefined, we silently skip the .env sync,
  // and `envSynced` stays false. That left experiment branches with an empty
  // DATABASE_URL whose only symptom surfaced ~10 turns later at the build's
  // honest-GREEN verify (alembic could not connect). Waiting here closes the race
  // so the sync succeeds when the branch is genuinely READY.
  let envSynced = false;
  if (syncEnv && ready.state === "READY") {
    try {
      const ep = await ensureEndpoint({
        instance: args.instance,
        branch: sanitized,
        timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait,
      });
      // Mint here as a branch-auth READINESS probe (a fresh branch may not be
      // able to issue credentials yet); the token is NOT persisted , the .env
      // carries only metadata and the app mints its own token at runtime.
      const { email } = await mintCredential(endpointPath(args.instance, sanitized));
      const envPath = path.join(args.cwd, ".env");
      updateEnvConnection({
        envPath,
        projectId: args.instance,
        branchId: sanitized,
        username: email,
        endpointHost: ep.host,
      });
      await ensureProfilePinned({ envPath }).catch(() => undefined);
      envSynced = true;
    } catch (err) {
      warnings.push(
        `.env sync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    branch: ready,
    gitBranch: sanitized,
    gitBranchCreated,
    envSynced,
    warnings,
  };
}

// ─── deletePairedBranch ────────────────────────────────────────

export interface DeletePairedBranchArgs {
  instance: string;
  branch: string;
  /** Project directory (must contain .git/). */
  cwd: string;
  /** Delete the local git branch. Default: true. Skipped if branch is currently checked out. */
  deleteGitLocal?: boolean;
  /** Delete the remote git branch if it exists. Default: true. */
  deleteGitRemote?: boolean;
  /** Remote name. Default: "origin". */
  gitRemote?: string;
}

export interface DeletePairedBranchResult {
  lakebaseDeleted: boolean;
  gitLocalDeleted: boolean;
  gitRemoteDeleted: boolean;
  warnings: string[];
}

/**
 * Delete the Lakebase branch + matching git branch (local + remote).
 *
 * Best-effort: each side is attempted independently and failures land in
 * `warnings[]`. The function never throws – returns a status of each side.
 * Useful for the extension's "delete branch everywhere" command and for
 * agent-driven cleanup.
 */
export async function deletePairedBranch(
  args: DeletePairedBranchArgs
): Promise<DeletePairedBranchResult> {
  const warnings: string[] = [];
  const sanitized = sanitizeBranchName(args.branch);
  const deleteGitLocal = args.deleteGitLocal !== false;
  const deleteGitRemote = args.deleteGitRemote !== false;
  const gitRemote = args.gitRemote ?? "origin";

  // Lakebase delete
  let lakebaseDeleted = false;
  try {
    await deleteBranch({ instance: args.instance, branch: sanitized });
    lakebaseDeleted = true;
  } catch (err) {
    warnings.push(
      `Lakebase delete failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Git local delete (skip if current branch – would orphan HEAD)
  let gitLocalDeleted = false;
  if (deleteGitLocal) {
    try {
      const current = gitCurrentBranch(args.cwd);
      if (current === sanitized) {
        warnings.push(`Skipped local git delete: branch "${sanitized}" is currently checked out`);
      } else if (!gitHasLocalBranch(args.cwd, sanitized)) {
        // No-op – already not present
        gitLocalDeleted = true;
      } else {
        gitDeleteLocalBranch(args.cwd, sanitized, true);
        gitLocalDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Local git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Git remote delete
  let gitRemoteDeleted = false;
  if (deleteGitRemote) {
    try {
      if (gitHasRemoteBranch(args.cwd, gitRemote, sanitized)) {
        gitDeleteRemoteBranch(args.cwd, gitRemote, sanitized);
        gitRemoteDeleted = true;
      } else {
        // No-op – already not present
        gitRemoteDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Remote git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { lakebaseDeleted, gitLocalDeleted, gitRemoteDeleted, warnings };
}

// ─── syncEnvToCurrentBranch ────────────────────────────────────

export interface SyncEnvArgs {
  /** Project directory (must contain .env and .git/). */
  cwd: string;
  /** Override the Lakebase instance id. Default: read LAKEBASE_PROJECT_ID from .env. */
  instance?: string;
  /** Override the branch name. Default: use current git branch (sanitized). */
  branch?: string;
  /**
   * Override: when the current git branch equals this name, pair with the
   * project's default Lakebase branch (whose leaf may differ, e.g.
   * `production`). Mirrors `checkoutPaired`'s trunkAlias. Default: no
   * alias, falls back to `main`/`master` as trunk indicators.
   */
  trunkAlias?: string;
  /** Default: "databricks_postgres". */
  database?: string;
}

export interface SyncEnvResult {
  /** Sanitized branch name we synced to. */
  branchId: string;
  endpointHost: string;
  databaseUrl: string;
}

/**
 * Read current git branch (or honor the `branch` override), look up the
 * matching Lakebase branch's endpoint, mint a fresh credential, and update
 * .env. This is the in-process equivalent of templates/.../post-checkout.sh,
 * usable from any agent.
 *
 * Throws when:
 *   - .env doesn't exist or doesn't declare LAKEBASE_PROJECT_ID (and no
 *     `instance` override was passed)
 *   - the Lakebase branch's endpoint has no host yet (still provisioning)
 *   - credential minting fails (auth expired, etc.)
 */
export async function syncEnvToCurrentBranch(args: SyncEnvArgs): Promise<SyncEnvResult> {
  const envPath = path.join(args.cwd, ".env");
  const instance =
    args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance id (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  // When the git branch is the trunk (alias-matched or main/master),
  // the Lakebase branch we sync to is the project's default leaf, NOT
  // the sanitized git branch name. The Lakebase default is commonly
  // `production`; a fresh `git checkout main` against a default-named
  // `production` branch would 404 here otherwise. Mirrors checkoutPaired
  // (see "trunk" mode lookup in this file).
  const trunkAlias = args.trunkAlias?.trim();
  const isTrunk =
    (trunkAlias && rawBranch === trunkAlias) ||
    (!trunkAlias && (rawBranch === "main" || rawBranch === "master"));
  let sanitized: string;
  if (isTrunk) {
    const lakebaseBranches = await listBranches({ instance });
    const def = lakebaseBranches.find((b) => b.isDefault);
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    sanitized = def.name.split("/branches/").pop() ?? def.uid;
  } else {
    sanitized = sanitizeBranchName(rawBranch);
  }
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;

  const ep = await getEndpoint({ instance, branch: sanitized });
  if (!ep?.host) {
    throw new Error(
      `No endpoint host yet for branch "${sanitized}" in instance "${instance}" – branch may still be provisioning`
    );
  }
  // Mint a fresh credential for the RETURN dsn (an in-memory convenience for a
  // caller that connects right now); the .env gets metadata only, so nothing
  // persists a token , the app mints its own at runtime.
  const { token, email } = await getCredential({ instance, branch: sanitized });
  const dsn = buildDsn(ep.host, database, email, token);

  updateEnvConnection({
    envPath,
    projectId: instance,
    branchId: sanitized,
    username: email,
    endpointHost: ep.host,
  });
  // Pin the matching CLI profile so the hooks' post-source preflight works
  // for multi-workspace users. Best-effort: never let it break the sync.
  await ensureProfilePinned({ envPath }).catch(() => undefined);

  return { branchId: sanitized, endpointHost: ep.host, databaseUrl: dsn };
}

// ─── checkoutPaired ────────────────────────────────────────────

export type CheckoutMode = "trunk" | "tier" | "feature" | "feature-created";

export interface CheckoutPairedArgs {
  /** Project directory (must contain .env). */
  cwd: string;
  /** Target git branch. Default: read current via `git rev-parse --abbrev-ref HEAD`. */
  branch?: string;
  /** Lakebase instance. Default: read LAKEBASE_PROJECT_ID from .env. */
  instance?: string;
  /**
   * Override: when the current git branch equals this name, pair with the
   * project's default Lakebase branch. Mirrors LAKEBASE_TRUNK_BRANCH from
   * the post-checkout hook. Default: no alias – uses main/master.
   */
  trunkAlias?: string;
  /**
   * Pinned base branch for feature mode. Mirrors LAKEBASE_BASE_BRANCH. When
   * set, new feature branches always fork from this branch instead of using
   * the "branch I was just on" hint.
   */
  baseBranch?: string;
  /**
   * Previous Lakebase branch (the value of LAKEBASE_BRANCH_ID in .env BEFORE
   * the git checkout). Used as the 2nd-precedence parent in feature mode.
   * When omitted, this is read from .env automatically.
   */
  previousBranch?: string;
  /** When the target feature branch doesn't exist on Lakebase, create it. Default: true. */
  autoCreate?: boolean;
  /** Default: "databricks_postgres". */
  database?: string;
  /** Lakebase branch ready-state poll budget. Default: 120_000. */
  readyTimeoutMs?: number;
}

export interface CheckoutPairedResult {
  /** Sanitized branch name on the Lakebase side. */
  branchId: string;
  /** Which mode resolved. */
  mode: CheckoutMode;
  /** The Lakebase branch we actually paired against (may differ from branchId
   *  in trunk/staging modes where the alias maps to a fixed Lakebase name). */
  matchedLakebaseBranch: string;
  /** Endpoint host the .env now points at. */
  endpointHost: string;
  /** Full DSN written into .env. */
  databaseUrl: string;
  /** True iff .env was rewritten. */
  envUpdated: boolean;
  /** Non-fatal issues collected during the run. */
  warnings: string[];
}

/**
 * In-process equivalent of the bundled `post-checkout.sh` hook.
 *
 * Use when an agent is driving a paired project programmatically without
 * relying on the git hook to fire (e.g. an agent that doesn't shell out to
 * `git checkout`, or a recovery path when the hook isn't installed). For
 * developers running `git checkout` in a terminal, the hook handles this
 * automatically – calling checkoutPaired then is redundant.
 *
 * Mirrors the hook's three-mode logic and parent fallback chain. Tier
 * discovery is auto from the Lakebase branch list – no per-tier alias
 * is needed (this is the post-alpha.9 model, see):
 *
 *   1. **trunk** – current branch == `trunkAlias` (or main/master if no
 *      alias). Pairs .env with the project's default Lakebase branch.
 *   2. **tier** – current branch name matches a non-default Lakebase branch
 *      by exact branchId (any long-running tier the architect has cut:
 *      staging / uat / perf / dev / ...). Pairs .env with that branch;
 *      does NOT auto-create. Tiers must be bootstrapped deliberately via
 *      {@link createLongRunningBranch}.
 *   3. **feature** – anything else. Auto-creates a Lakebase branch with the
 *      same sanitized name, using parent precedence:
 *        a. `baseBranch` arg (pinned 3-tier base)
 *        b. `previousBranch` arg / LAKEBASE_BRANCH_ID from .env, if that
 *           branch still exists on Lakebase
 *        c. Project default branch
 *
 * After resolving the Lakebase branch, ensures its endpoint exists (creates
 * one with autoscaling 2-4 CU if missing), mints a fresh credential, and
 * rewrites the .env connection block. The git checkout itself is NOT
 * performed – caller is responsible for that side (either `git checkout`
 * before calling, or rely on the hook firing after `git checkout`).
 */
export async function checkoutPaired(args: CheckoutPairedArgs): Promise<CheckoutPairedResult> {
  const warnings: string[] = [];
  const envPath = path.join(args.cwd, ".env");

  // 1. Resolve instance
  const instance = args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }

  // 2. Resolve target branch
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  if (!rawBranch || rawBranch === "HEAD") {
    throw new Error(
      `Cannot resolve current git branch (detached HEAD or not a git repo at ${args.cwd})`
    );
  }
  const branchId = sanitizeBranchName(rawBranch);
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;

  // 3. Resolve "previous Lakebase branch" – caller arg wins over .env
  const previousBranch =
    args.previousBranch ?? readEnvVar(envPath, "LAKEBASE_BRANCH_ID") ?? "";

  // 4. Determine mode. One listBranches() call powers both the default-branch
  // resolution AND the tier check, mirroring the hook's "pull the branch
  // list once" pattern (post-checkout.sh:198-221). Auto-discovers any
  // long-running tier the architect has cut – no per-tier alias is needed.
  const trunkAlias = args.trunkAlias?.trim();
  let mode: CheckoutMode = "feature";
  let lakebaseBranch = branchId;

  const isTrunkAlias = trunkAlias && rawBranch === trunkAlias;
  const isMainOrMaster = !trunkAlias && (rawBranch === "main" || rawBranch === "master");

  const lakebaseBranches = await listBranches({ instance });
  // Match the hook's tier-discovery rule: a git branch maps to a tier when
  // its raw name (NOT the sanitized form) exactly matches a non-default
  // Lakebase branch. The hook compares against $BRANCH directly; we do the
  // same so a `feature/x` git branch never accidentally pairs with a tier
  // just because its sanitized form happens to collide.
  // A git branch maps to a tier only when it is long-running AND its name is in
  // the project's protected tier-name set (the fixed default hierarchy + any
  // LAKEBASE_TIER_NAMES / configured trunk/staging/base). A long-running branch
  // with an off-convention name falls through to feature mode (gets its own
  // paired feature branch), the same as before tiers existed.
  const tierMatch = isTier(rawBranch, lakebaseBranches, protectedTierNamesFromEnv());

  if (isTrunkAlias || isMainOrMaster) {
    mode = "trunk";
    const def = lakebaseBranches.find((b) => b.isDefault);
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    lakebaseBranch = def.name.split("/branches/").pop() ?? def.uid;
  } else if (tierMatch) {
    mode = "tier";
    // rawBranch is guaranteed by isTier() to match an existing non-default
    // Lakebase branch by exact branchId. No auto-create branch; tiers must
    // be cut deliberately via createLongRunningBranch.
    lakebaseBranch = rawBranch;
  } else {
    // Feature mode – find or create the Lakebase branch with parent fallback
    let existing = await getBranchByName(branchId, { instance });
    if (!existing) {
      if (args.autoCreate !== false) {
        const parentBranch = await resolveFeatureParent({
          instance,
          target: branchId,
          baseBranch: args.baseBranch,
          previousBranch,
        });
        const created = await createBranch({
          instance,
          branch: rawBranch,
          parentBranch,
        });
        if (created.state !== "READY") {
          try {
            await waitForBranchReady({
              instance,
              branch: branchId,
              timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait,
            });
          } catch (err) {
            warnings.push(
              `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        existing = await getBranchByName(branchId, { instance });
        mode = "feature-created";
      } else {
        throw new Error(
          `Lakebase branch "${branchId}" does not exist and autoCreate=false`
        );
      }
    }
    lakebaseBranch = branchId;
  }

  // 5. Ensure endpoint, mint a fresh credential for the RETURN dsn (in-memory
  // convenience), write METADATA-only .env (no token; the app mints at runtime).
  const ep = await ensureEndpoint({
    instance,
    branch: lakebaseBranch,
    timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait,
  });
  const { token, email } = await mintCredential(endpointPath(instance, lakebaseBranch));
  const dsn = buildDsn(ep.host, database, email, token);
  updateEnvConnection({
    envPath,
    projectId: instance,
    branchId: lakebaseBranch,
    username: email,
    endpointHost: ep.host,
  });
  await ensureProfilePinned({ envPath }).catch(() => undefined);

  return {
    branchId,
    mode,
    matchedLakebaseBranch: lakebaseBranch,
    endpointHost: ep.host,
    databaseUrl: dsn,
    envUpdated: true,
    warnings,
  };
}

/** Internal: 3-step parent resolution for feature mode. Mirrors post-checkout.sh. */
async function resolveFeatureParent(args: {
  instance: string;
  target: string;
  baseBranch?: string;
  previousBranch: string;
}): Promise<string | undefined> {
  // 1. Pinned base
  if (args.baseBranch) {
    return args.baseBranch;
  }
  // 2. Previous branch (if it still exists)
  if (args.previousBranch && args.previousBranch !== args.target) {
    const prev = await getBranchByName(args.previousBranch, { instance: args.instance });
    if (prev) {
      return args.previousBranch;
    }
  }
  // 3. Project default (handled by createBranch when parentBranch is undefined)
  return undefined;
}

// ─── mergePaired ───────────────────────────────────────────────

export interface MergePairedArgs {
  /** Project directory (must contain .git + .env). */
  cwd: string;
  /** Branch to merge FROM (e.g. an experiment branch). */
  from: string;
  /** Branch to merge INTO (e.g. the feature branch). */
  into: string;
  /** Lakebase instance. Default: read LAKEBASE_PROJECT_ID from .env. */
  instance?: string;
  /**
   * Re-sync .env to `into`'s Lakebase branch after switching to it (so a
   * subsequent migration run targets the merge TARGET's database, not the
   * source branch's). Default: true.
   */
  syncEnv?: boolean;
}

export interface MergePairedResult {
  merged: true;
  into: string;
  from: string;
  /** checkoutPaired result for `into`, when syncEnv. */
  checkout?: CheckoutPairedResult;
  warnings: string[];
}

/**
 * Merge one git branch into another inside a paired project: check out `into`,
 * re-sync .env to into's Lakebase branch (so downstream migrations hit the
 * right DB), then git-merge `from`. The paired counterpart to a bare
 * `git merge`: the per-story experiment accept path uses it so the .env ends
 * up pointed at the feature branch's database, never the experiment's. This is
 * Lakebase-aware workflow coordination (this module's charter), which is why
 * the orchestration layer calls it instead of shelling git itself.
 */
export async function mergePaired(args: MergePairedArgs): Promise<MergePairedResult> {
  const warnings: string[] = [];
  const syncEnv = args.syncEnv !== false;

  // Switch git to the merge target. checkoutPaired only resolves Lakebase +
  // .env; it does NOT perform the git checkout, so do that first.
  gitCheckoutExistingBranch(args.cwd, args.into);

  let checkout: CheckoutPairedResult | undefined;
  if (syncEnv) {
    checkout = await checkoutPaired({ cwd: args.cwd, branch: args.into, instance: args.instance });
    warnings.push(...checkout.warnings);
  }

  gitMergeBranch(args.cwd, args.from);
  return { merged: true, into: args.into, from: args.from, checkout, warnings };
}
