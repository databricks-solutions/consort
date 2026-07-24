// SCM workflow prepare-pr (phase B+): feature-claimed -> pr-ready.
//
// Pushes the feature branch to origin, opens a PR via octokit (or
// updates the existing one if a re-run), syncs CI secrets, and writes
// the new pr-ready state row. Refuses on a dirty working tree or
// when the branch has no commits ahead of its parent.

import { exec } from "../util/exec.js";
import { getCurrentBranch } from "../git/inspect.js";
import { getAheadBehind, isDirty } from "../git/status.js";
import { getOwnerRepo } from "../git/remote.js";
import { createPullRequest, getPullRequest } from "../github/pr.js";
import { RUNTIME_ARTIFACT_IGNORE } from "./constants.js";
import {
  readWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
} from "./scm-workflow-state.js";

export class ScmPreparePrError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no-state-file"
      | "bad-precondition"
      | "dirty-working-tree"
      | "wrong-branch"
      | "no-commits-ahead"
      | "no-github-remote"
      | "push-failed"
      | "pr-failed",
  ) {
    super(message);
    this.name = "ScmPreparePrError";
  }
}

export interface PreparePrArgs {
  projectDir: string;
  /** PR title. Defaults to the feature id slug. */
  title?: string;
  /** PR body. Defaults to a stub referencing the feature id. */
  body?: string;
  /** Remote name. Default: "origin". */
  remote?: string;
  /** Skip the ahead-of-parent check (useful for empty-feature debug PRs). */
  allowNoCommits?: boolean;
  /** Skip the dirty-tree refusal. */
  force?: boolean;
  /** Clock injection for testability. */
  now?: () => Date;
  /**
   * Override the pushed PR URL discovery (mostly for tests). When set,
   * the helper skips push + create steps and just records the URL.
   * NOT a supported user-facing flag.
   */
  prUrlOverride?: string;
}

export interface PreparePrResult {
  state: ScmWorkflowState;
  prUrl: string;
  /** True iff createPullRequest was invoked (vs. reusing an existing open PR). */
  prCreated: boolean;
}

export async function preparePr(
  args: PreparePrArgs,
): Promise<PreparePrResult> {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmPreparePrError(
      `No SCM workflow state at ${args.projectDir}/.lakebase/workflow-state.json. Claim a feature first.`,
      "no-state-file",
    );
  }
  if (current.state !== "feature-claimed") {
    throw new ScmPreparePrError(
      `prepare-pr refuses state "${current.state}". Allowed predecessor: feature-claimed.`,
      "bad-precondition",
    );
  }
  if (!current.branch || !current.parent_branch || !current.feature_id) {
    throw new ScmPreparePrError(
      "feature-claimed row missing branch / parent_branch / feature_id; refusing to push.",
      "bad-precondition",
    );
  }

  // Sanity-check working tree.
  const headBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (headBranch !== current.branch) {
    throw new ScmPreparePrError(
      `HEAD is on "${headBranch}" but workflow state says "${current.branch}". Checkout the feature branch first.`,
      "wrong-branch",
    );
  }
  if (!args.force) {
    // Refuse on uncommitted CODE, but tolerate orchestration-metadata churn the
    // deterministic driver writes mid-run (.tdd/ agent log + phase pointer,
    // .lakebase/ workflow state). Those are not part of the PR's code, and the
    // driver legitimately dirties them on the very step that opens the PR; the
    // guard's intent is "do not PR uncommitted code", not "freeze workflow state".
    const dirty = await isDirty({ cwd: args.projectDir, ignore: [...RUNTIME_ARTIFACT_IGNORE] });
    if (dirty) {
      throw new ScmPreparePrError(
        "Working tree has uncommitted code changes; commit them before opening the PR (or pass --force).",
        "dirty-working-tree",
      );
    }
  }
  if (!args.allowNoCommits) {
    const ahead = await ensureAheadOfParent(
      args.projectDir,
      current.branch,
      current.parent_branch,
    );
    if (ahead === 0) {
      throw new ScmPreparePrError(
        `Branch "${current.branch}" has 0 commits ahead of "${current.parent_branch}". Make at least one commit (or pass --allow-no-commits).`,
        "no-commits-ahead",
      );
    }
  }

  const ownerRepo = await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new ScmPreparePrError(
      "No GitHub remote found at origin (or origin is not a github.com URL). Add one before running prepare-pr.",
      "no-github-remote",
    );
  }

  const now = (args.now ?? (() => new Date()))();
  let prUrl = args.prUrlOverride ?? "";
  let prCreated = false;

  if (!prUrl) {
    // Push the branch up. -u so the upstream is tracked for future
    // workflows (gh pr checks, push/pull without branch arg).
    try {
      await exec(
        `git push -u ${shellEscape(args.remote ?? "origin")} ${shellEscape(current.branch)}`,
        { cwd: args.projectDir, timeout: 60_000 },
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      throw new ScmPreparePrError(
        `git push failed: ${raw}${pushFailureHint(raw)}`,
        "push-failed",
      );
    }

    // If a PR is already open for this branch (re-run), reuse it.
    const existing = await getPullRequest(ownerRepo, current.branch);
    if (existing) {
      prUrl = existing.url;
    } else {
      try {
        prUrl = await createPullRequest({
          ownerRepo,
          headBranch: current.branch,
          baseBranch: current.parent_branch,
          title: args.title ?? `feat: ${current.feature_id}`,
          body:
            args.body ??
            defaultBody(current.feature_id, current.parent_branch),
        });
        prCreated = true;
      } catch (err) {
        throw new ScmPreparePrError(
          `Failed to create pull request: ${err instanceof Error ? err.message : String(err)}`,
          "pr-failed",
        );
      }
    }
  }

  const next: ScmWorkflowState = {
    ...current,
    state: "pr-ready",
    pr_url: prUrl,
    pushed_at: now.toISOString(),
  };
  writeWorkflowState(args.projectDir, next);

  return { state: next, prUrl, prCreated };
}

async function ensureAheadOfParent(
  cwd: string,
  branch: string,
  parent: string,
): Promise<number> {
  // Try comparing local branch vs. local parent; if parent isn't present
  // locally, fall back to origin/<parent>. Avoids tripping on a fresh
  // clone where only the feature branch is checked out.
  try {
    const out = (
      await exec(
        `git rev-list --count ${shellEscape(`${parent}..${branch}`)}`,
        { cwd, timeout: 10_000 },
      )
    ).trim();
    return Number.parseInt(out, 10) || 0;
  } catch {
    try {
      const out = (
        await exec(
          `git rev-list --count ${shellEscape(`origin/${parent}..${branch}`)}`,
          { cwd, timeout: 10_000 },
        )
      ).trim();
      return Number.parseInt(out, 10) || 0;
    } catch {
      // If both fail, treat as "unknown ahead" and fall through to the
      // existing ahead/behind primitive which uses upstream.
      const ab = await getAheadBehind({ cwd });
      return ab.ahead;
    }
  }
}

/**
 * Append actionable guidance to a `git push` failure when the message looks
 * like an auth / access problem. The highest-confusion case: pushing to a
 * PRIVATE repo while authenticated as a GitHub account that cannot see it.
 * GitHub deliberately returns "Repository not found" (not a 403) so it does
 * not leak the repo's existence, which reads like a wrong-URL error when it is
 * actually a wrong-account error. Returns "" for unrelated push failures.
 */
export function pushFailureHint(rawMessage: string): string {
  const looksLikeAccess =
    /repository not found|not found|\b403\b|\b401\b|permission denied|access denied|could not read (?:username|password)|authentication failed|fatal: could not read/i.test(
      rawMessage,
    );
  if (!looksLikeAccess) return "";
  return [
    "",
    "",
    "  The remote rejected the push. For a PRIVATE repo this usually means git",
    "  authenticated as a GitHub account WITHOUT access - GitHub returns",
    '  "Repository not found" rather than a permission error, so it looks like a',
    "  wrong URL when it is really the wrong account. Check `gh auth status`; if",
    "  the repo lives under an org only one of your accounts can see, make that",
    "  account active (`gh auth switch --user <account>`) or fix the `origin`",
    "  remote, then re-run prepare-pr.",
  ].join("\n");
}

function defaultBody(featureId: string, parentBranch: string): string {
  return [
    `Feature: \`${featureId}\``,
    "",
    `Forks from \`${parentBranch}\`.`,
    "",
    "PR opened by `lakebase-scm-prepare-pr` (phase B+).",
  ].join("\n");
}

function shellEscape(s: string): string {
  // Single-quote escape; the values are git refs / remote names so we
  // don't need to interpret anything fancy.
  return `'${s.replace(/'/g, "'\\''")}'`;
}
