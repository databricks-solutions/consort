import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { createPairedBranch, deletePairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import type { BranchLookupOpts, LakebaseBranchInfo } from "@databricks-solutions/lakebase-scm-utils/lakebase";

function branchIdOf(info: LakebaseBranchInfo): string {
  const leaf = info.name.split("/").pop();
  if (!leaf) throw new Error(`could not derive branch_id from ${info.name}`);
  return leaf;
}

// Tag flavors mirror the AC layer values from the spec format. The Driver's
// tag-to-runner map keys off these: [API] → vitest, [E2E] →
// Playwright, [Infra] → migration / schema-diff smoke. The substrate keeps
// the names lowercase here; the spec format capitalises them ("API" / "E2E"
// / "Infra") for display.
export type ExperimentTag = "api" | "e2e" | "infra";

/** Title-case form (matches the AC schema enum). */
export type AcLayer = "API" | "E2E" | "Infra";

export interface TagOutcome {
  passed: number;
  failed: number;
}

/**
 * Convert the AC schema's title-case `layer` to the lowercase tag the
 * substrate uses internally (outcomes.by_tag keys, smell detectors,
 * markGreen runner-contract guard). One-way: tags never get title-cased
 * back at substrate boundaries.
 */
export function acLayerToTag(layer: AcLayer): ExperimentTag {
  switch (layer) {
    case "API":
      return "api";
    case "E2E":
      return "e2e";
    case "Infra":
      return "infra";
  }
}

/**
 * Idempotently bump the per-tag run counter on an outcomes record, AND
 * mirror the change into the top-level `tests_passed` / `tests_failed`
 * totals so those stay accurate. Mutates the passed object and returns
 * it so callers can chain a writeOutcomes() call.
 *
 * The substrate doesn't enforce that `by_tag` summed across tags equals
 * the totals (untagged tests are valid, mid-cycle reports drift), but
 * every call through this helper keeps them aligned.
 */
export function recordTagRun(
  outcomes: ExperimentOutcomes,
  tag: ExperimentTag,
  passed: boolean
): ExperimentOutcomes {
  const byTag = (outcomes.by_tag ??= {});
  const slot = (byTag[tag] ??= { passed: 0, failed: 0 });
  if (passed) {
    slot.passed += 1;
    outcomes.tests_passed = (outcomes.tests_passed ?? 0) + 1;
  } else {
    slot.failed += 1;
    outcomes.tests_failed = (outcomes.tests_failed ?? 0) + 1;
  }
  return outcomes;
}

/** Total runs (pass + fail) recorded for a given tag in outcomes. */
export function tagRunCount(outcomes: ExperimentOutcomes, tag: ExperimentTag): number {
  const slot = outcomes.by_tag?.[tag];
  return slot ? slot.passed + slot.failed : 0;
}

export interface ExperimentCap {
  /** Stable reason code so renderers and the orchestrator can dispatch. */
  reason: "max_cycles" | "max_wall_clock_minutes";
  /** Cycle number the cap fired on (cycles past this one are not run). */
  at_cycle: number;
  /** Wall-clock minutes elapsed when the cap fired (informational). */
  at_minutes?: number;
  /** Cap threshold from the plan, copied here so the renderer needn't look it up. */
  cap_value: number;
}

export interface ExperimentOutcomes {
  tests_passed?: number;
  tests_failed?: number;
  schema_diff_summary?: string;
  code_diff_lines?: number;
  status: "running" | "succeeded" | "failed" | "abandoned";
  // Per-tag breakdown. Each tag is optional (a project may not exercise
  // every flavor). When present, `tests_passed` + `tests_failed` remain
  // authoritative totals; `by_tag` is a breakdown for downstream renderers
  // (comparison report, feature-status) and the per-tag smell detectors
  // (e.g. e2e-row-perma-red in). Sum across tags is not enforced
  // to match the totals – mid-cycle reporting and untagged tests are valid.
  by_tag?: Partial<Record<ExperimentTag, TagOutcome>>;
  /**
   * Per-experiment cap-hit record. Set by `recordExperimentCap` when
   * the orchestrator's `checkPerExperimentCap` fires. The comparison
   * report renders "capped" alongside pass/fail; the orchestrator
   * surfaces a remediation menu (continue / extend cap / abandon) to
   * the PO. Absent when the experiment ran within its caps.
   */
  capped?: ExperimentCap;
}

// Experiments are scoped to a STORY: the on-disk layout is
// .tdd/experiments/<feature>/<story>/<slug>/. These two helpers are the single
// source of truth for that path, so every reader/writer (here + archive +
// artifacts + cap) stays in lockstep.
export function experimentsRoot(sftddDir: string, featureId: string, storyId: string): string {
  return join(sftddDir, "experiments", featureId, storyId);
}

export function experimentDir(sftddDir: string, featureId: string, storyId: string, slug: string): string {
  return join(experimentsRoot(sftddDir, featureId, storyId), slug);
}

export interface CutExperimentArgs extends BranchLookupOpts {
  sftddDir: string;
  /** Project root (.git + .env). Required: the experiment branch is PAIRED. */
  projectDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  branch: string;
  parentBranch?: string;
  ttl?: string;
  notes?: string;
  /** A RE-cut after a discarded experiment: drop any pre-existing paired branch of
   *  this name BEFORE forking, so the rebuild forks clean off feature HEAD instead
   *  of reusing the branch that still carries the discarded build's schema
   *  (Finding 27). Mirrors the ci-pr --reset-stale-branch precedent. Best-effort:
   *  a missing branch is a no-op; the drop never blocks the fork. */
  resetStaleBranch?: boolean;
}

/** Injectable paired-branch substrate, so the drop-then-fork ordering is testable
 *  hermetically. Defaults to the real Lakebase-backed ops. */
export interface CutExperimentDeps {
  createPairedBranch?: typeof createPairedBranch;
  deletePairedBranch?: typeof deletePairedBranch;
}

export interface ExperimentRecord {
  feature_id: string;
  story_id: string;
  experiment_slug: string;
  branch_id: string;
  created_at: string;
  dir: string;
}

export async function cutExperiment(args: CutExperimentArgs, deps: CutExperimentDeps = {}): Promise<ExperimentRecord> {
  const { sftddDir, projectDir, featureId, storyId, experimentSlug, branch, parentBranch, ttl, notes, resetStaleBranch, ...lookup } = args;
  const create = deps.createPairedBranch ?? createPairedBranch;
  const dropBranch = deps.deletePairedBranch ?? deletePairedBranch;
  // Re-cut re-fork (Finding 27): a discarded experiment's paired branch of this
  // same deterministic name still carries its schema, so reusing it makes the
  // rebuild's migrations collide. Drop it first so the fork below is clean. The
  // git branch is torn down too (PAIRED). Best-effort: a missing branch or a
  // teardown hiccup must not block the fresh fork, which is the whole point.
  if (resetStaleBranch) {
    try {
      await dropBranch({ instance: lookup.instance, branch, cwd: projectDir });
    } catch {
      /* no stale branch to drop / teardown raced: proceed to fork clean */
    }
  }
  // PAIRED cut through the substrate: Lakebase branch + git branch + .env sync,
  // atomically. The experiment is a child of the feature branch (parentBranch),
  // so it forks Lakebase from the feature branch and git-branches off the
  // currently-checked-out feature branch. ttl when given (ephemeral spike),
  // else noExpiry (matches createFeaturePairedBranch's tier semantics).
  const paired = await create({
    instance: lookup.instance,
    branch,
    parentBranch,
    cwd: projectDir,
    createGitBranch: true,
    syncEnv: true,
    ...(ttl ? { ttl } : { noExpiry: true }),
  });
  // A paired experiment MUST have its .env populated with the branch's
  // DATABASE_URL: the build's honest-GREEN verify (alembic upgrade head + pytest)
  // runs against THIS branch's database. createPairedBranch's .env sync is
  // best-effort – it collects warnings instead of throwing – so a skipped sync
  // would otherwise surface ~10 turns later as an opaque alembic connect failure,
  // commonly mis-attributed to the post-checkout hook. Fail the cut here, with the
  // underlying warnings, so the miss is immediate and correctly attributed. The
  // Lakebase + git branches already exist (createPairedBranch does not roll back),
  // so a retry of the cut reuses them idempotently.
  if (!paired.envSynced) {
    throw new Error(
      `Experiment cut for "${branch}" did not populate .env with the branch's database connection` +
        (paired.warnings.length ? ` (${paired.warnings.join("; ")})` : "") +
        `. The build's honest-GREEN verify needs DATABASE_URL; aborting the cut so this is caught now, not at verify time.`,
    );
  }
  const branchId = branchIdOf(paired.branch);

  const dir = experimentDir(sftddDir, featureId, storyId, experimentSlug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branch.txt"), branchId);
  writeFileSync(
    join(dir, "notes.md"),
    notes ?? `# ${experimentSlug}\n\nExperiment cut from \`${parentBranch ?? "staging"}\`. Strategy + learning notes go here.\n`
  );
  const outcomes: ExperimentOutcomes = { status: "running" };
  writeFileSync(join(dir, "outcomes.json"), JSON.stringify(outcomes, null, 2) + "\n");
  writeFileSync(
    join(dir, "timeline.json"),
    JSON.stringify(
      { entries: [{ ts: new Date().toISOString(), kind: "cut", branch: branchId }] },
      null,
      2
    ) + "\n"
  );

  return {
    feature_id: featureId,
    story_id: storyId,
    experiment_slug: experimentSlug,
    branch_id: branchId,
    created_at: new Date().toISOString(),
    dir,
  };
}

/** Story ids that have an experiments subtree under a feature (each is a story dir). */
export function listExperimentStories(sftddDir: string, featureId: string): string[] {
  const root = join(sftddDir, "experiments", featureId);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => statSync(join(root, d)).isDirectory())
    .sort();
}

export function listExperiments(sftddDir: string, featureId: string, storyId: string): ExperimentRecord[] {
  const root = experimentsRoot(sftddDir, featureId, storyId);
  if (!existsSync(root)) return [];
  const out: ExperimentRecord[] = [];
  for (const slug of readdirSync(root)) {
    const dir = join(root, slug);
    if (!statSync(dir).isDirectory()) continue;
    const branchFile = join(dir, "branch.txt");
    if (!existsSync(branchFile)) continue;
    out.push({
      feature_id: featureId,
      story_id: storyId,
      experiment_slug: slug,
      branch_id: readFileSync(branchFile, "utf8").trim(),
      created_at: statSync(branchFile).birthtime.toISOString(),
      dir,
    });
  }
  return out;
}

export function readOutcomes(
  sftddDir: string,
  featureId: string,
  storyId: string,
  slug: string
): ExperimentOutcomes | null {
  const file = join(experimentDir(sftddDir, featureId, storyId, slug), "outcomes.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeOutcomes(
  sftddDir: string,
  featureId: string,
  storyId: string,
  slug: string,
  outcomes: ExperimentOutcomes
): void {
  const file = join(experimentDir(sftddDir, featureId, storyId, slug), "outcomes.json");
  writeFileSync(file, JSON.stringify(outcomes, null, 2) + "\n");
}

export interface DeleteExperimentArgs extends BranchLookupOpts {
  sftddDir: string;
  /** Project root (.git). Required when deleteBranchToo: the teardown is PAIRED. */
  projectDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  /** Delete the Lakebase branch + git branch as well. Default false; HITL-gated. */
  deleteBranchToo?: boolean;
}

export async function deleteExperiment(args: DeleteExperimentArgs): Promise<void> {
  const { sftddDir, projectDir, featureId, storyId, experimentSlug, deleteBranchToo, ...lookup } = args;
  const dir = experimentDir(sftddDir, featureId, storyId, experimentSlug);
  if (!existsSync(dir)) {
    throw new Error(`experiment ${featureId}/${storyId}/${experimentSlug} not found at ${dir}`);
  }
  if (deleteBranchToo) {
    const branchId = readFileSync(join(dir, "branch.txt"), "utf8").trim();
    // PAIRED teardown: Lakebase branch + git branch (local + remote). Best-effort.
    await deletePairedBranch({ instance: lookup.instance, branch: branchId, cwd: projectDir });
  }
  // The on-disk record is preserved by default so the experiment's notes + outcomes
  // remain available after the branch goes away.
}
