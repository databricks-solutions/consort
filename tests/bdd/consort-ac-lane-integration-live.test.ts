import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runParallelAcLanesLive } from "../../consort/experiment/ac-lane-live";

// LIVE integration (real git worktrees + real Lakebase COW lanes + real merge +
// real conflict->sequential fallback). driveScoped does a REAL commit in the given
// worktree (standing in for the agent RED->GREEN drive, which is proven live
// separately via the scope dry-run) so the fan-out -> merge -> fallback WIRING is
// exercised end-to-end against real infrastructure. Gated like the other live tests.
const LIVE = process.env.RUN_LIVE_AC_LANE === "1" && !!process.env.LAKEBASE_TEST_INSTANCE;
const liveDescribe = LIVE ? describe : describe.skip;

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "ac-integ-live-"));
  const git = (a: string[]) => execFileSync("git", a, { cwd: dir });
  git(["init", "-q", "-b", "experiment"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  writeFileSync(join(dir, "migration.py"), "v1\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
  return dir;
}

liveDescribe("runParallelAcLanesLive — LIVE integration (fan-out -> merge -> sequential fallback)", () => {
  const instance = process.env.LAKEBASE_TEST_INSTANCE!;
  const experimentBranch = process.env.LAKEBASE_TEST_BRANCH!;

  it("fans out AC2/AC3 as real lanes, merges the disjoint one, falls the conflicting one back to sequential", async () => {
    const repo = initRepo();
    const git = (a: string[]) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });
    let peak = 0;
    let inFlight = 0;

    // Real commit per AC in its given worktree. AC1 (serial) + AC2 edit migration.py
    // differently so AC3 (also editing it) genuinely CONFLICTS at merge -> fallback.
    const driveScoped = async (a: { ac: string; cwd: string; lakebaseBranch: string }) => {
      if (a.cwd !== repo) {
        inFlight++;
        peak = Math.max(peak, inFlight);
      }
      const g = (args: string[]) => execFileSync("git", args, { cwd: a.cwd });
      if (a.ac === "AC2-x" || a.ac === "AC3-x") {
        writeFileSync(join(a.cwd, "migration.py"), `v1\n+ ${a.ac}\n`);
      } else {
        writeFileSync(join(a.cwd, `code_${a.ac}.py`), `# ${a.ac}\n`);
      }
      g(["add", "-A"]);
      g(["commit", "-q", "-m", a.ac]);
      if (a.cwd !== repo) {
        await new Promise((r) => setTimeout(r, 800)); // overlap -> prove concurrency
        inFlight--;
      }
    };

    try {
      const result = await runParallelAcLanesLive({
        projectDir: repo,
        instance,
        featureId: "F-test",
        story: "S-test",
        experimentBranch,
        acOrder: ["AC1-x", "AC2-x", "AC3-x"],
        enabled: true,
        concurrency: 2,
        driveScoped,
      });

      expect(result.plan.mode).toBe("parallel");
      // Both lanes ran concurrently (real COW branches + worktrees).
      expect(result.peakInFlight).toBe(2);
      expect(peak).toBe(2);
      // Merge: AC2 (disjoint-ish, merged first, clean) landed; AC3 conflicted on migration.py.
      expect(result.merge!.merged).toContain("AC2-x");
      expect(result.merge!.conflicted.map((c) => c.ac)).toContain("AC3-x");
      // The conflicting AC fell back to a sequential re-run on the merged base.
      expect(result.sequentialFallback).toContain("AC3-x");
      // The experiment branch now carries AC1's + AC2's + the re-run AC3's work,
      // with a clean tree and no conflict markers.
      expect(git(["status", "--porcelain"]).trim()).toBe("");
      expect(readFileSync(join(repo, "migration.py"), "utf8")).toContain("AC3-x");
      expect(readFileSync(join(repo, "migration.py"), "utf8")).not.toContain("<<<<<<<");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 300_000);
});
