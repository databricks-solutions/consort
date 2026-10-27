import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withAcLane } from "../../consort/experiment/ac-lane";

// The P3 git merge folds a lane's CODE/TESTS back, but the orchestrator derives coverage
// (storyTestProgress) from the per-story CYCLE RECORDS under .consort/cycles — gitignored, living only
// in the lane's throwaway worktree. withAcLane must fold those records into the main bed before teardown,
// or the post-merge story-close RE-DRIVES every fanned-out AC serially (negating the fan-out end-to-end;
// observed live as a ~34-cycle serial re-drive taking hours). Hermetic via the injection seams.

describe("withAcLane — folds lane cycle records into the main bed (no re-drive)", () => {
  it("copies the lane's .consort/cycles back, keeping the serial-first AC's existing records", async () => {
    const main = mkdtempSync(join(tmpdir(), "ac-fold-main-"));
    // Serial-first AC1's record is already in the main bed — it must be KEPT, not clobbered.
    const ac1 = join(main, ".consort", "cycles", "F6", "S3", "AC1");
    mkdirSync(ac1, { recursive: true });
    writeFileSync(join(ac1, "cycle-001.json"), JSON.stringify({ test_id: "T36", green_at: "x" }));

    try {
      const result = await withAcLane(
        {
          projectDir: main,
          instance: "inst",
          laneId: "AC2",
          parentBranch: "exp",
          // Stub git worktree creation: the lane writes AC2's cycle record into its own worktree.
          addWorktree: ({ path }) => {
            const ac2 = join(path, ".consort", "cycles", "F6", "S3", "AC2");
            mkdirSync(ac2, { recursive: true });
            writeFileSync(join(ac2, "cycle-001.json"), JSON.stringify({ test_id: "T45", green_at: "y" }));
          },
          removeWorktree: () => {},
          createLaneBranch: async () => {},
          deleteLaneBranch: async () => {},
        },
        async () => "lane-ok",
      );

      expect(result).toBe("lane-ok");
      // AC2's lane cycle record was folded into the main bed (so the orchestrator sees AC2 as covered).
      const foldedAc2 = join(main, ".consort", "cycles", "F6", "S3", "AC2", "cycle-001.json");
      expect(existsSync(foldedAc2)).toBe(true);
      expect(JSON.parse(readFileSync(foldedAc2, "utf8")).test_id).toBe("T45");
      // The serial-first AC1's pre-existing record survived the fold (merge without clobber).
      expect(existsSync(join(ac1, "cycle-001.json"))).toBe(true);
      expect(JSON.parse(readFileSync(join(ac1, "cycle-001.json"), "utf8")).test_id).toBe("T36");
    } finally {
      rmSync(main, { recursive: true, force: true });
    }
  });
});
