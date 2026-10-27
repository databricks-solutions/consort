import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withAcLane, acLaneBranchNames } from "../../consort/experiment/ac-lane";
import { runAcLanes, planAcLanes } from "../../consort/experiment/ac-lane-coordinator";

// LIVE proof (real Lakebase + real git worktrees — NO injected seams). Gated so a
// normal run skips it; the live drive sets the env. Proves the #5 foundation:
// concurrent per-AC lanes, each an isolated COW child forked off the (non-root)
// experiment branch + its own git worktree, torn down after.
//
//   LAKEBASE_TEST_INSTANCE=f6-bed-01 LAKEBASE_TEST_BRANCH=feature-f6-... \
//   DATABRICKS_CONFIG_PROFILE=fevm-stockflow RUN_LIVE_AC_LANE=1 \
//     npx vitest run tests/bdd/consort-ac-lane-live.test.ts
const LIVE = process.env.RUN_LIVE_AC_LANE === "1" && !!process.env.LAKEBASE_TEST_INSTANCE;
const liveDescribe = LIVE ? describe : describe.skip;

/** A throwaway git repo with one commit, so `git worktree add` works without
 *  touching the real repo. */
function initTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "ac-lane-live-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "README"), "ac-lane live test\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

liveDescribe("withAcLane / runAcLanes — LIVE (real Lakebase COW child + real git worktree)", () => {
  const instance = process.env.LAKEBASE_TEST_INSTANCE!;
  const parentBranch = process.env.LAKEBASE_TEST_BRANCH!;

  it("fans out N concurrent isolated lanes off the experiment branch, then tears them down", async () => {
    const repo = initTempRepo();
    let inFlight = 0;
    let peak = 0;
    const seen: { ac: string; lakebaseBranch: string; cwd: string; isGitWorktree: boolean; cwdExistedDuringRun: boolean }[] = [];
    const cwds: string[] = [];

    const plan = planAcLanes({ acOrder: ["AC1", "AC2", "AC3"], enabled: true });
    expect(plan.mode).toBe("parallel");
    expect(plan.serialFirst).toBe("AC1");
    expect(plan.parallelLanes).toEqual(["AC2", "AC3"]);

    try {
      const result = await runAcLanes({
        plan,
        concurrency: 2,
        // AC1 "serial" is a no-op here — the fixture parent branch stands in for an
        // already-authored migration; this test proves the FAN-OUT, not AC authoring.
        driveSerial: async () => {},
        driveInLane: async (spec) => {
          const ac = spec.laneId;
          await withAcLane(
            { projectDir: repo, instance, laneId: ac, parentBranch, ttl: "900s" },
            async (ctx) => {
              inFlight++;
              peak = Math.max(peak, inFlight);
              const isWt = (() => {
                try {
                  return (
                    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ctx.cwd })
                      .toString()
                      .trim() === "true"
                  );
                } catch {
                  return false;
                }
              })();
              seen.push({
                ac,
                lakebaseBranch: ctx.lakebaseBranch,
                cwd: ctx.cwd,
                isGitWorktree: isWt,
                cwdExistedDuringRun: existsSync(ctx.cwd),
              });
              cwds.push(ctx.cwd);
              // Hold the lane open briefly so both lanes overlap (prove concurrency).
              await new Promise((r) => setTimeout(r, 1500));
              inFlight--;
            },
          );
        },
      });

      // All lanes succeeded.
      expect(result.outcomes.filter((o) => o.status === "succeeded").map((o) => o.ac).sort()).toEqual([
        "AC1",
        "AC2",
        "AC3",
      ]);
      // Concurrency actually happened (both parallel lanes in flight at once).
      expect(result.peakInFlight).toBe(2);
      expect(peak).toBe(2);
      // Isolation: each lane got its OWN worktree + its OWN COW Lakebase branch.
      expect(seen).toHaveLength(2);
      expect(new Set(seen.map((s) => s.cwd)).size).toBe(2);
      expect(new Set(seen.map((s) => s.lakebaseBranch)).size).toBe(2);
      for (const s of seen) {
        expect(s.isGitWorktree).toBe(true);
        expect(s.cwdExistedDuringRun).toBe(true);
        expect(s.lakebaseBranch).toBe(acLaneBranchNames(s.ac).lakebaseBranch);
      }
      // Teardown: the worktrees are gone after the lanes closed.
      for (const c of cwds) expect(existsSync(c)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 300_000);
});
