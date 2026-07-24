// FEIP-8013: the ONE place a per-story experiment is merged into the feature
// branch + recorded as accepted. Both entry points route through here:
//   - `lakebase-sftdd-experiment merge` (explicit args; the recovery door), and
//   - `lakebase-sftdd-pipeline accept` (args resolved from the persisted
//     experiment record + scm-state; the normal PO-acceptance door).
//
// Before this, `pipeline accept` recorded ONLY the state (acceptStory) and the
// git-merge lived solely in the experiment CLI, invoked as the drive's accept
// EFFECT. Interactive, the acceptance gate stops BEFORE that effect and the human
// ran only `pipeline accept`, so the merge never fired and the accepted story's
// code stayed on the experiment branch (the next story then forked from a feature
// branch missing it). Making `pipeline accept` perform the merge, through this
// shared core, means following the gate's instruction lands the code.

import { mergeExperimentIntoFeature, type ExperimentBranchOps } from "./experiment-lifecycle.js";
import { deleteExperiment } from "./experiment.js";
import { readPipeline, writePipeline, acceptStory } from "./story-pipeline.js";
import { mergePaired } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { commitExperimentCode } from "./cycle-record.js";
import { applySchemaMigrations } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";

/** The real side-effectful substrate wiring for a merge (git merge, schema
 *  migrate, paired-branch teardown). The order + fail-closed logic live in
 *  experiment-lifecycle.ts; these are the leaves. Shared by every merge door. */
export const realExperimentOps: ExperimentBranchOps = {
  gitMerge: async ({ from, into, projectDir }) => {
    // Accept must carry the experiment's FULL work onto the feature branch. A
    // supersession/repair turn can edit code outside any green/refactor commit
    // point, leaving an uncommitted change on the experiment branch; mergePaired
    // then checks out `into` and git ABORTS on the dirty tree. Commit any pending
    // experiment CODE first (code-only policy: runtime .sftdd/.tdd/.lakebase state
    // stays uncommitted so it does not diverge from the feature branch). No-op on
    // a clean tree.
    await commitExperimentCode(projectDir, `accept: commit pending experiment work for ${from}`);
    await mergePaired({ cwd: projectDir, from, into });
  },
  runMigrations: async ({ instance, branch, projectDir }) => {
    await applySchemaMigrations({ instance, branch, projectDir });
  },
  teardown: async ({ sftddDir, projectDir, featureId, storyId, experimentSlug, instance }) => {
    await deleteExperiment({ instance, sftddDir, projectDir, featureId, storyId, experimentSlug, deleteBranchToo: true });
  },
};

export interface MergeAndAcceptArgs {
  sftddDir: string;
  projectDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  experimentBranch: string;
  featureBranch: string;
  instance: string;
  approver: string;
  at?: string;
}

/**
 * Merge the story's experiment into the feature branch (git + migrations +
 * teardown), then record the PO acceptance. Idempotent: if the experiment is
 * already recorded `merged` (a prior accept/merge ran, or a re-run), the merge is
 * SKIPPED and only the acceptance state is (re)ensured, so re-running is safe.
 * `ops` is injected (real substrate in the CLIs; a fake in tests).
 */
export async function mergeAndAcceptStory(
  args: MergeAndAcceptArgs,
  ops: ExperimentBranchOps = realExperimentOps,
): Promise<void> {
  const at = args.at ?? new Date().toISOString();
  const before = readPipeline(args.sftddDir, args.featureId);
  const alreadyMerged = before.stories[args.storyId]?.experiment?.status === "merged";
  if (!alreadyMerged) {
    await mergeExperimentIntoFeature(
      {
        sftddDir: args.sftddDir,
        featureId: args.featureId,
        storyId: args.storyId,
        experimentSlug: args.experimentSlug,
        featureBranch: args.featureBranch,
        experimentBranch: args.experimentBranch,
        instance: args.instance,
        projectDir: args.projectDir,
      },
      ops,
    );
  }
  // Re-read: mergeExperimentIntoFeature does not touch pipeline.json (its ops are
  // git/lakebase); acceptStory is what records merged + done + frees the lane.
  const p = readPipeline(args.sftddDir, args.featureId);
  acceptStory(p, args.storyId, { approver: args.approver, at });
  writePipeline(args.sftddDir, p);
}

/** Build the `lakebase-sftdd-experiment merge` argv for a PO acceptance from the
 *  resolved inputs. `pipeline accept` builds this and spawns the experiment CLI
 *  (the single door that touches the merge substrate), rather than calling the
 *  merge in-process (FEIP-8013 routing). */
export function experimentMergeArgv(
  featureId: string,
  storyId: string,
  resolved: { experimentSlug: string; experimentBranch: string; featureBranch: string; instance: string },
  opts: { approver: string; projectDir: string; sftddDir: string; at?: string },
): string[] {
  return [
    "merge",
    "--feature",
    featureId,
    "--story",
    storyId,
    "--slug",
    resolved.experimentSlug,
    "--experiment-branch",
    resolved.experimentBranch,
    "--feature-branch",
    resolved.featureBranch,
    "--instance",
    resolved.instance,
    "--approver",
    opts.approver,
    "--project-dir",
    opts.projectDir,
    "--tdd-dir",
    opts.sftddDir,
    ...(opts.at ? ["--at", opts.at] : []),
  ];
}

/** The resolved merge inputs for `pipeline accept`, or an attributed error. */
export type ResolvedAcceptArgs =
  | { ok: true; experimentSlug: string; experimentBranch: string; featureBranch: string; instance: string }
  | { ok: false; error: string };

/**
 * Resolve everything the merge needs for a PO acceptance from what is already
 * persisted, so the human (and the drive) need not assemble branch/slug/instance
 * by hand: the experiment's slug + branch + forked-from feature branch come from
 * the pipeline record (`cut-experiment` wrote them); the Lakebase instance comes
 * from an explicit override else the SCM workflow-state's `project_id`.
 */
export function resolveAcceptMergeArgs(
  sftddDir: string,
  projectDir: string,
  featureId: string,
  storyId: string,
  opts: { instance?: string } = {},
): ResolvedAcceptArgs {
  const pipeline = readPipeline(sftddDir, featureId);
  const exp = pipeline.stories[storyId]?.experiment;
  if (!exp) {
    return {
      ok: false,
      error: `no experiment is recorded for story ${storyId} (nothing to merge). Cut + build the story first, or use lakebase-sftdd-experiment merge with explicit args.`,
    };
  }
  const instance = opts.instance ?? readWorkflowState(projectDir)?.project_id;
  if (!instance) {
    return {
      ok: false,
      error: `could not resolve the Lakebase instance (no --instance and scm-state has no project_id under ${projectDir}). Pass --instance <id>.`,
    };
  }
  return { ok: true, experimentSlug: exp.slug, experimentBranch: exp.branch, featureBranch: exp.parent, instance };
}
