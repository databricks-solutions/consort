// Parallel per-AC verify (#5) — the lane ISOLATION primitive.
//
// To run independent ACs of one contract story CONCURRENTLY, each lane needs a
// fully isolated runtime so two lanes never collide on the three shared things
// the serial drive relies on (see the seam map): the git WORKING TREE, the
// Lakebase DB branch, and the app PORT. This module provides that isolation by
// composing primitives that already exist:
//
//   - DB isolation: a per-lane COW Lakebase branch forked directly off the story
//     EXPERIMENT BRANCH (createBranch({parentBranch}), lakebase-scm-utils) — the
//     same cheap child fork withEphemeralVerifyBranch uses, held for the lane's
//     whole duration (its per-cycle verifies still fork their own ephemeral
//     children off THIS lane branch). NOTE: a Lakebase SNAPSHOT cannot be used as
//     the base — "not allowed to snapshot non-root branch" (the experiment branch
//     is a non-root child; live-confirmed on f6-bed-01). A plain COW child off the
//     experiment branch is an equally-stable base (nothing writes the experiment
//     branch during the parallel phase — each lane writes only its own child).
//   - Working-tree isolation: a git WORKTREE checked out to a per-lane branch,
//     so each lane edits its own tree + .consort/ and commits to its own branch;
//     the merge step (P3) folds the lanes back. (The runner already keys turn
//     transcript state by cwd, so distinct worktrees don't cross-talk.)
//   - Port isolation: NOT handled here — resolveServeBaseUrl already relocates
//     off a busy port (move-not-kill), so concurrent lanes self-allocate.
//
// Everything is injectable so the tests stay hermetic (no real git / Lakebase).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBranch, deleteBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { ARTIFACT_ROOT } from "../config/consort-paths.js";

export interface AcLaneArgs {
  /** The story's experiment worktree (the repo whose HEAD the lane branches from). */
  projectDir: string;
  /** Lakebase project id. */
  instance: string;
  /** Stable lane identifier (the AC id) — makes the git branch + Lakebase branch
   *  names unique so concurrent lanes never collide. */
  laneId: string;
  /** The story EXPERIMENT BRANCH to COW-fork the lane's database off (it carries
   *  AC1's committed contract migration). A plain child fork, not a snapshot —
   *  snapshotting a non-root branch is refused by Lakebase. */
  parentBranch: string;
  /** The git ref the lane worktree is created at (the story experiment branch's
   *  HEAD after AC1). The lane commits onto its own branch off this. */
  baseRef?: string;
  /** Lakebase TTL backstop for the lane branch ("<seconds>s"); teardown deletes
   *  it in finally, this only reaps a crashed lane. */
  ttl?: string;
  // ── injection seams (hermetic tests) ──────────────────────────────────────
  addWorktree?: (a: { projectDir: string; path: string; branch: string; baseRef: string }) => void;
  removeWorktree?: (a: { projectDir: string; path: string; branch: string }) => void;
  createLaneBranch?: (a: { instance: string; branch: string; parentBranch: string; ttl: string }) => Promise<void>;
  deleteLaneBranch?: (a: { instance: string; branch: string }) => Promise<void>;
}

export interface AcLaneContext {
  /** The lane's isolated git worktree path — the cwd the serial loop runs in. */
  cwd: string;
  /** The lane's git branch (holds the lane's commits until the merge step). */
  gitBranch: string;
  /** The lane's COW Lakebase branch (LAKEBASE_BRANCH_ID for the lane's verifies). */
  lakebaseBranch: string;
}

/** 1-hour backstop: covers the slowest single AC lane; `finally` is the primary teardown. */
export const AC_LANE_TTL = "3600s";

/** Sanitize a lane id into a branch-name-safe token. */
function cleanLaneId(laneId: string): string {
  return laneId.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

/** The lane's git branch + Lakebase branch names (shared token so they correlate). */
export function acLaneBranchNames(laneId: string): { gitBranch: string; lakebaseBranch: string } {
  const token = cleanLaneId(laneId);
  return { gitBranch: `ac-lane-${token}`, lakebaseBranch: `ac-lane-${token}` };
}

/**
 * Provision an isolated lane for one AC, hand its context to `run`, and ALWAYS
 * tear the lane down afterwards (remove the worktree + delete both branches;
 * best-effort, the Lakebase TTL is the backstop). `run` executes the existing
 * serial build loop for this AC inside `ctx.cwd` against `ctx.lakebaseBranch`.
 * Returns `run`'s result. A throw in `run` still tears the lane down.
 */
export async function withAcLane<T>(
  args: AcLaneArgs,
  run: (ctx: AcLaneContext) => Promise<T> | T,
): Promise<T> {
  const ttl = args.ttl ?? AC_LANE_TTL;
  const baseRef = args.baseRef ?? "HEAD";
  const { gitBranch, lakebaseBranch } = acLaneBranchNames(args.laneId);

  const addWorktree =
    args.addWorktree ??
    ((a) => {
      // -B resets the lane branch if a prior crashed lane left it; the worktree
      // is a fresh checkout of baseRef so the lane starts from AC1's state.
      execFileSync("git", ["worktree", "add", "-B", a.branch, a.path, a.baseRef], {
        cwd: a.projectDir,
        stdio: "ignore",
      });
    });
  const removeWorktree =
    args.removeWorktree ??
    ((a) => {
      try {
        execFileSync("git", ["worktree", "remove", "--force", a.path], { cwd: a.projectDir, stdio: "ignore" });
      } catch {
        /* a leftover worktree dir is pruned by `git worktree prune`; never fail teardown */
      }
    });
  const createLaneBranch =
    args.createLaneBranch ??
    (async (a) => {
      await createBranch({ instance: a.instance, branch: a.branch, parentBranch: a.parentBranch, ttl: a.ttl });
    });
  const deleteLaneBranch =
    args.deleteLaneBranch ??
    (async (a) => {
      await deleteBranch({ instance: a.instance, branch: a.branch });
    });

  const worktreePath = mkdtempSync(join(tmpdir(), `ac-lane-${cleanLaneId(args.laneId)}-`));
  let worktreeAdded = false;
  let laneBranchCreated = false;
  try {
    addWorktree({ projectDir: args.projectDir, path: worktreePath, branch: gitBranch, baseRef });
    worktreeAdded = true;
    // PROVISION the lane worktree with the gitignored LOCAL state the scoped drive needs. `git
    // worktree add` only checks out TRACKED files, but `consort-drive --only build` reads
    // .lakebase/workflow-state.json (the SCM claim, Step 0) + .env (the branch DSN) from its cwd —
    // both gitignored, so a bare lane worktree dies instantly ("no-state-file ... could not claim")
    // and every lane fails straight to the sequential fallback (no parallelism). Copy them in.
    for (const rel of [".lakebase", ".env"]) {
      const src = join(args.projectDir, rel);
      if (existsSync(src)) {
        try { cpSync(src, join(worktreePath, rel), { recursive: true }); } catch { /* best-effort provision */ }
      }
    }
    await createLaneBranch({ instance: args.instance, branch: lakebaseBranch, parentBranch: args.parentBranch, ttl });
    laneBranchCreated = true;
    const result = await run({ cwd: worktreePath, gitBranch, lakebaseBranch });
    // FOLD the lane's CYCLE RECORDS back into the main bed before teardown. The P3 git merge folds the
    // lane's CODE/TESTS, but the orchestrator derives "built/covered" (storyTestProgress) from the
    // per-story CYCLE RECORDS under .consort/cycles — which are GITIGNORED and live only in this lane's
    // throwaway worktree. Without folding them back, the main bed sees the fanned-out AC as UNCOVERED,
    // so the post-merge STORY-CLOSE RE-DRIVES every fanned-out AC's tests SERIALLY (RED->GREEN) — which
    // negates the fan-out's parallelism end-to-end (live: S3 story-close re-drove ~34 cycles, hours).
    // Copy the lane's cycle records into the main .consort/cycles, merging without clobbering (the
    // serial-first AC's records already there are kept). Best-effort: a copy failure never fails the lane.
    try {
      const laneCycles = join(worktreePath, ARTIFACT_ROOT, "cycles");
      if (existsSync(laneCycles)) {
        cpSync(laneCycles, join(args.projectDir, ARTIFACT_ROOT, "cycles"), { recursive: true, force: false, errorOnExist: false });
      }
    } catch {
      /* best-effort: if the fold fails the story-close re-drives (slow) but stays correct */
    }
    return result;
  } finally {
    if (laneBranchCreated) {
      try {
        await deleteLaneBranch({ instance: args.instance, branch: lakebaseBranch });
      } catch {
        /* best-effort; the Lakebase TTL reaps a leaked lane branch */
      }
    }
    if (worktreeAdded) removeWorktree({ projectDir: args.projectDir, path: worktreePath, branch: gitBranch });
    if (existsSync(worktreePath)) {
      try {
        rmSync(worktreePath, { recursive: true, force: true });
      } catch {
        /* the worktree remove already unlinked it in the common case */
      }
    }
  }
}
