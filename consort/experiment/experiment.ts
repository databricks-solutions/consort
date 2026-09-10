import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "node:child_process";
import { createPairedBranch, deletePairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import type { BranchLookupOpts, LakebaseBranchInfo } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import {
  featuresDir,
  planningDir,
  sprintsDir,
  workflowStateJson,
  productOverviewMd,
  nfrsMd,
  designDir,
  architectureDir,
  ALL_ARTIFACT_ROOTS,
} from "../config/consort-paths.js";

/** The path prefixes the pre-fork dirty guard TOLERATES on a tracked-dirty tree:
 *  runtime-artifact dirs whose churn does not corrupt the experiment fork. Built
 *  from the artifact roots (the single source, `.consort`/`.sftdd`/`.tdd`) plus
 *  the paired-branch bookkeeping (`.lakebase/`, e.g. a re-pinned kit-ref /
 *  scm-utils-ref) and the agent scratch (`.claude/agent-memory/`). Mirrors
 *  scm-utils' RUNTIME_ARTIFACT_IGNORE (the fork guard) WITHOUT importing it, so a
 *  dirty `.lakebase/*-ref` never blocks a cut while a tracked SOURCE edit still does. */
const RUNTIME_ARTIFACT_PREFIXES: readonly string[] = [
  ...ALL_ARTIFACT_ROOTS.map((r) => `${r}/`),
  ".lakebase/",
  ".claude/agent-memory/",
];

function branchIdOf(info: LakebaseBranchInfo): string {
  const leaf = info.name.split("/").pop();
  if (!leaf) throw new Error(`could not derive branch_id from ${info.name}`);
  return leaf;
}

/** True iff `ancestor` is a git-ancestor of `descendant` (or they are equal) in
 *  the repo at `cwd`. `git merge-base --is-ancestor` exits 0 for yes, 1 for no.
 *  Any other failure (missing ref, not a repo) rethrows so a real problem is loud. */
function gitIsAncestor(cwd: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    return true;
  } catch (err) {
    const code = (err as { status?: number }).status;
    if (code === 1) return false;
    throw err;
  }
}

/** Resolve a git ref to its commit sha in the repo at `cwd` (empty on failure). */
function gitRevParse(cwd: string, ref: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
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
export function experimentsRoot(consortDir: string, featureId: string, storyId: string): string {
  return join(consortDir, "experiments", featureId, storyId);
}

export function experimentDir(consortDir: string, featureId: string, storyId: string, slug: string): string {
  return join(experimentsRoot(consortDir, featureId, storyId), slug);
}

export interface CutExperimentArgs extends BranchLookupOpts {
  consortDir: string;
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
  const { consortDir, projectDir, featureId, storyId, experimentSlug, branch, parentBranch, ttl, notes, resetStaleBranch, ...lookup } = args;
  const create = deps.createPairedBranch ?? createPairedBranch;
  const dropBranch = deps.deletePairedBranch ?? deletePairedBranch;
  // Persist the design/spec CORPUS on the CURRENT (feature) branch BEFORE forking. The build lane
  // writes per-cycle status into .consort/features/ (test-list + AC status) – committed corpus per
  // the scaffold template – but commitExperimentCode EXCLUDES .consort (to avoid experiment-branch
  // divergence that breaks accept's checkout), so the interactive path otherwise leaves that corpus
  // uncommitted and re-dirties the tree at the NEXT cut. Committing it here – pre-fork, on the
  // feature branch – persists the corpus AND cleans the tree, with NO experiment-branch divergence
  // (the fork below inherits the committed corpus). Only the committed-corpus paths are staged; the
  // TRANSIENT run-state (cycles/, experiments/, pipeline.json, next.json, logs) is gitignored and
  // intentionally left out. Best-effort: a non-repo (hermetic tests) or nothing-to-commit is fine.
  try {
    const corpusPaths = [
      featuresDir(consortDir),
      planningDir(consortDir),
      sprintsDir(consortDir),
      workflowStateJson(consortDir),
      productOverviewMd(consortDir),
      nfrsMd(consortDir),
      designDir(consortDir),
      architectureDir(consortDir),
      // The UX Designer's MATERIALIZED design system: theme.css (:root tokens generated
      // from the guide) + global.css (its component classes). These are design-lane output
      // like the design corpus, but they live in client/src/ as TRACKED code — so left
      // uncommitted they trip the fail-closed tracked-source guard below and refuse the fork
      // ("experiment cut needs a clean tree"). Commit them here, pre-fork, so the build lane
      // inherits the design system and the tree is clean. Absent on a non-UI project (filtered).
      join(projectDir, "client", "src", "styles", "theme.css"),
      join(projectDir, "client", "src", "styles", "global.css"),
    ].filter((p) => existsSync(p));
    if (corpusPaths.length > 0) {
      execFileSync("git", ["add", "--", ...corpusPaths], { cwd: projectDir });
      const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--", ...corpusPaths], { cwd: projectDir, encoding: "utf8" }).trim();
      if (staged) {
        execFileSync("git", ["commit", "--no-verify", "-m", `design corpus: ${featureId}/${storyId} (pre-experiment persist)`, "--", ...corpusPaths], { cwd: projectDir });
      }
    }
  } catch {
    /* not a git repo (hermetic tests) or nothing to commit – the dirty check + fork below still run */
  }
  // FAIL-CLOSED on uncommitted TRACKED changes OUTSIDE .consort/ – the harmful case: a tracked-source
  // edit silently rides onto the experiment fork (git checkout -b carries it), leaving the tree
  // building on the feature branch's uncommitted state (the "cut refused but the Navigator ran anyway"
  // PROTOCOL VIOLATION). But TOLERATE untracked files (a new design artifact, an unrelated tool's
  // config like .isaac/) and .consort/ workflow-metadata churn (next.json, workflow-state.json, the
  // design corpus mid-authoring): those do not corrupt the fork – this mirrors createPairedBranch's
  // own tracked-source-only guard, so the normal design->build handoff is NOT blocked by a blanket
  // dirty check. Refuse BEFORE any mutation/record so experimentCut stays false and the lane halts.
  let dirtyTracked = "";
  try {
    dirtyTracked = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: projectDir, encoding: "utf8" })
      .split("\n")
      .filter((l) => l.trim().length > 0 && !RUNTIME_ARTIFACT_PREFIXES.some((pfx) => l.slice(3).startsWith(pfx)))
      .join("\n")
      .trim();
  } catch {
    // Not a git repo / git unavailable: can't assess here, and the paired cut's own git operations
    // surface any real problem. Don't block on an inability to check (keeps hermetic tests that mock
    // the fork without a real repo working).
    dirtyTracked = "";
  }
  if (dirtyTracked) {
    throw new Error(
      `cannot cut experiment "${experimentSlug}" for ${storyId}: there are uncommitted changes to tracked ` +
        `source files, which would silently ride onto the experiment fork and leave it building on the ` +
        `feature branch's uncommitted state. Commit or stash them first. Changed paths:\n${dirtyTracked}`,
    );
  }
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
  // GIT<->DB fork-parent agreement guard (the S3-cut-from-wrong-parent halt): the
  // Lakebase branch is forked from parentBranch's tier (the accepted feature state);
  // the git branch MUST fork from the SAME commit (the local parentBranch tip). The
  // paired-cut's git side resolves its start-point preferring `origin/<parentBranch>`,
  // so a stale remote (behind the LOCAL feature tip that carries the just-accepted
  // merges) makes the git experiment fork from an OLDER commit than the Lakebase
  // fork tier – a two-way split-brain: the committed alembic head + models are a
  // prior story's, while the DB already has the later story's schema. Every
  // DB-touching test then fails ("column does not exist" / unknown alembic head) and
  // the driver CANNOT fix it in code, so it burns the whole regression-fix budget and
  // halts to HIL ~3 self-heal rounds later with an opaque failure. Assert agreement
  // HERE, at the cut, so a mis-fork is caught immediately + correctly attributed
  // (same immediate-attribution intent as the envSynced guard above). Skipped when
  // there is no parentBranch (forking from the default tier) or the local parent ref
  // is absent (nothing to compare against).
  if (parentBranch) {
    const localParentTip = gitRevParse(projectDir, parentBranch);
    if (localParentTip && !gitIsAncestor(projectDir, localParentTip, "HEAD")) {
      const head = gitRevParse(projectDir, "HEAD");
      throw new Error(
        `Experiment cut for "${branch}" forked the git branch from a commit that does NOT descend from the ` +
          `local "${parentBranch}" tip (${localParentTip.slice(0, 8)}); HEAD is ${head.slice(0, 8)}. The Lakebase ` +
          `branch was forked from "${parentBranch}"'s tier, so git and the database now disagree on the parent ` +
          `state (typically a stale origin/${parentBranch} used as the git fork start-point). Every DB-touching ` +
          `test would fail against a schema the committed code does not match. Push "${parentBranch}" (or fetch) ` +
          `so origin matches the local tip, then re-cut; aborting now so this is caught at the cut, not ~3 ` +
          `self-heal rounds later at HIL.`,
      );
    }
  }
  const branchId = branchIdOf(paired.branch);

  const dir = experimentDir(consortDir, featureId, storyId, experimentSlug);
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
export function listExperimentStories(consortDir: string, featureId: string): string[] {
  const root = join(consortDir, "experiments", featureId);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => statSync(join(root, d)).isDirectory())
    .sort();
}

export function listExperiments(consortDir: string, featureId: string, storyId: string): ExperimentRecord[] {
  const root = experimentsRoot(consortDir, featureId, storyId);
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
  consortDir: string,
  featureId: string,
  storyId: string,
  slug: string
): ExperimentOutcomes | null {
  const file = join(experimentDir(consortDir, featureId, storyId, slug), "outcomes.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeOutcomes(
  consortDir: string,
  featureId: string,
  storyId: string,
  slug: string,
  outcomes: ExperimentOutcomes
): void {
  const file = join(experimentDir(consortDir, featureId, storyId, slug), "outcomes.json");
  writeFileSync(file, JSON.stringify(outcomes, null, 2) + "\n");
}

export interface DeleteExperimentArgs extends BranchLookupOpts {
  consortDir: string;
  /** Project root (.git). Required when deleteBranchToo: the teardown is PAIRED. */
  projectDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  /** Delete the Lakebase branch + git branch as well. Default false; HITL-gated. */
  deleteBranchToo?: boolean;
}

export async function deleteExperiment(args: DeleteExperimentArgs): Promise<void> {
  const { consortDir, projectDir, featureId, storyId, experimentSlug, deleteBranchToo, ...lookup } = args;
  const dir = experimentDir(consortDir, featureId, storyId, experimentSlug);
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
