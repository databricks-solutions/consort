// Parallel per-AC verify (#5) — the MERGE step (P3).
//
// After the fan-out, each succeeded AC lane has committed its RED->GREEN work onto
// its own git branch (ac-lane-<ac>). This folds those branches back onto the story
// experiment branch, in AC order, so the normal serial drive can resume on the
// merged whole (story-close REVIEW/deploy/accept).
//
// The lanes touch mostly-disjoint files (AC-scoped tests + the shared, reused
// migration). A real conflict — e.g. the round-trip AC editing AC1's migration
// file that another lane also touched — is NOT forced through: the merge aborts
// and the AC is reported CONFLICTED, so the caller re-runs it SEQUENTIALLY on the
// merged base (where the earlier lanes' changes are now present). That sequential
// fallback is the safety valve the concurrency rests on — it never merges a
// conflict blindly.
//
// Git-only (no Lakebase): each lane's DATABASE work lived on its throwaway COW
// branch and is discarded; only the committed CODE/TESTS merge. Injectable git so
// it is testable against a real throwaway repo.
//
// BLOCK MERGE for append-only test files (the common "conflict" that is not a real
// conflict): every AC lane APPENDS its own disjoint test functions to the SAME
// per-story Python test file (e.g. tests/test_<story>.py, tests/step_defs/*.py).
// Concurrent end-of-file appends collide as a git text conflict even though the
// additions are semantically disjoint. Git's built-in `union` driver was tried here
// and proved UNSAFE: diff3 aligns the identical per-test boilerplate (`import uuid`,
// `import sqlalchemy as sa`, blank lines, decorators) ACROSS different functions and
// interleaves only the divergent lines, stitching one test's header onto another
// test's body — a file that imports/parses but crosses functions (live: a body that
// referenced a symbol imported only in the sibling it was torn from -> NameError at
// the story-close verify -> HIL). The fix is to merge at TOP-LEVEL-BLOCK granularity,
// never line granularity: reconstruct the file as the base blocks plus each side's
// NEW top-level blocks (whole decorated def/class units), appended intact. This is
// only applied when NO base block was edited/removed on either side — a genuine
// shared edit is a real conflict and still routes to the sequential fallback. Any
// conflict involving a non-Python or non-test file also falls back (safe, never a
// corrupt merge). NON-test conflicts are untouched and route to sequential.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitPyBlocks, type PyBlock } from "./py-source.js";

/** Python test-file globs whose concurrent per-AC appends resolve via block-merge. */
const BLOCK_MERGE_TEST_GLOBS = [/^tests\/test_[^/]*\.py$/, /^tests\/step_defs\/.*\.py$/];

function isBlockMergeableTestFile(path: string): boolean {
  return BLOCK_MERGE_TEST_GLOBS.some((re) => re.test(path));
}

export interface AcLaneMergeInput {
  ac: string;
  /** The lane's git branch (holds its RED->GREEN commits). */
  gitBranch: string;
}

export interface AcLaneMergeResult {
  /** ACs whose lane branch merged cleanly (in attempt order). */
  merged: string[];
  /** ACs whose merge CONFLICTED — the caller re-runs each sequentially on the
   *  merged base. The lane branch is left intact for that re-run / inspection. */
  conflicted: { ac: string; reason: string }[];
}

export interface MergeAcLanesArgs {
  /** The experiment worktree, checked out on the story experiment branch (merge target). */
  projectDir: string;
  /** Succeeded lanes to fold back, in AC order. */
  lanes: AcLaneMergeInput[];
  /** Injectable git runner (default execFileSync). Returns stdout; throws on nonzero. */
  git?: (args: string[], cwd: string) => string;
}

/** Union two preambles line-wise, preserving `ours` order and appending any import/line
 *  from `theirs` not already present (imports are idempotent, so a line-union is safe). */
function unionPreamble(ours: string[], theirs: string[]): string[] {
  const seen = new Set(ours.map((l) => l.trim()));
  const out = [...ours];
  for (const l of theirs) {
    if (l.trim() === "" ) continue; // don't duplicate blank spacers
    if (!seen.has(l.trim())) {
      out.push(l);
      seen.add(l.trim());
    }
  }
  return out;
}

const norm = (lines: string[]) => lines.join("\n").replace(/\s+$/, "");

/**
 * Block-merge one conflicted Python test file from its three merge stages. Returns the
 * resolved file text, or null when the merge is NOT a safe pure-append (a base block
 * was edited or removed on a side) — in which case the caller must fall back to the
 * sequential re-run rather than risk a semantic merge.
 */
export function blockMergePyTestFile(base: string, ours: string, theirs: string): string | null {
  const b = splitPyBlocks(base);
  const o = splitPyBlocks(ours);
  const t = splitPyBlocks(theirs);
  const baseByKey = new Map(b.blocks.map((x) => [x.key, x]));
  const oByKey = new Map(o.blocks.map((x) => [x.key, x]));
  const tByKey = new Map(t.blocks.map((x) => [x.key, x]));

  // SAFETY INVARIANT: every base block must survive UNCHANGED on both sides. If a side
  // edited or deleted a base block, that is a genuine edit — refuse the block-merge.
  for (const bb of b.blocks) {
    const ob = oByKey.get(bb.key);
    const tb = tByKey.get(bb.key);
    if (!ob || !tb) return null; // base block deleted on a side
    if (norm(ob.lines) !== norm(bb.lines) || norm(tb.lines) !== norm(bb.lines)) return null; // base block edited
  }

  // Assemble: base blocks in base order, then each side's NEW blocks (ours then theirs),
  // deduped by key so a test authored identically on both sides lands once.
  const outBlocks: PyBlock[] = [...b.blocks];
  const placed = new Set(b.blocks.map((x) => x.key));
  for (const side of [o.blocks, t.blocks]) {
    for (const blk of side) {
      if (placed.has(blk.key)) continue;
      outBlocks.push(blk);
      placed.add(blk.key);
    }
  }

  const preamble = unionPreamble(o.preamble.length ? o.preamble : b.preamble, t.preamble);
  const outLines = [...preamble];
  for (const blk of outBlocks) outLines.push(...blk.lines);
  // Normalize to a single trailing newline.
  return outLines.join("\n").replace(/\n*$/, "\n");
}

/**
 * Merge each succeeded lane branch onto the experiment branch in order. A clean
 * merge is recorded + the lane branch deleted; a conflicting merge is first offered
 * to the block-merge resolver (for disjoint per-AC appends to a shared Python test
 * file); if that cannot safely resolve EVERY conflicted path, the merge is aborted
 * (leaving the experiment branch untouched) and the AC reported conflicted for a
 * sequential re-run. Order matters: an earlier lane's merge becomes the base the next
 * lane merges onto, so a later conflict reflects a genuine overlap.
 */
export function mergeAcLanes(args: MergeAcLanesArgs): AcLaneMergeResult {
  const git =
    args.git ??
    ((a: string[], cwd: string) => execFileSync("git", a, { cwd, encoding: "utf8" }));
  const merged: string[] = [];
  const conflicted: { ac: string; reason: string }[] = [];

  const showStage = (stage: number, path: string): string => {
    try {
      return git(["show", `:${stage}:${path}`], args.projectDir);
    } catch {
      return ""; // stage absent (e.g. added-by-both has no base stage) -> treat as empty
    }
  };

  for (const lane of args.lanes) {
    try {
      git(["merge", "--no-edit", "--no-ff", lane.gitBranch], args.projectDir);
      merged.push(lane.ac);
      try {
        git(["branch", "-D", lane.gitBranch], args.projectDir);
      } catch {
        /* best-effort: a lingering branch is harmless; the merge already landed */
      }
    } catch (e) {
      // Conflict. Try to resolve it as disjoint per-AC appends to shared Python test
      // file(s) via a top-level-block merge. Only proceed if EVERY conflicted path is a
      // block-mergeable test file AND each resolves safely (no base block was edited).
      let resolvedAllConflicts = false;
      try {
        const conflictedPaths = git(["diff", "--name-only", "--diff-filter=U"], args.projectDir)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (conflictedPaths.length > 0 && conflictedPaths.every(isBlockMergeableTestFile)) {
          const resolutions: { path: string; text: string }[] = [];
          let ok = true;
          for (const p of conflictedPaths) {
            const text = blockMergePyTestFile(showStage(1, p), showStage(2, p), showStage(3, p));
            if (text === null) {
              ok = false;
              break;
            }
            resolutions.push({ path: p, text });
          }
          if (ok) {
            for (const r of resolutions) {
              writeFileSync(join(args.projectDir, r.path), r.text, "utf8");
              git(["add", "--", r.path], args.projectDir);
            }
            git(["commit", "--no-edit"], args.projectDir);
            resolvedAllConflicts = true;
          }
        }
      } catch {
        resolvedAllConflicts = false; // any failure -> abort + sequential fallback below
      }

      if (resolvedAllConflicts) {
        merged.push(lane.ac);
        try {
          git(["branch", "-D", lane.gitBranch], args.projectDir);
        } catch {
          /* best-effort */
        }
      } else {
        // Abort so the experiment branch is left exactly as it was, and route this AC
        // to the sequential fallback.
        try {
          git(["merge", "--abort"], args.projectDir);
        } catch {
          /* if there was nothing to abort, the tree is already clean */
        }
        conflicted.push({ ac: lane.ac, reason: e instanceof Error ? e.message.split("\n")[0] : String(e) });
      }
    }
  }
  return { merged, conflicted };
}
