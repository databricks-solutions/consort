// GIT<->DB fork-parent agreement guard (the S3-cut-from-wrong-parent halt): the git fork-parent
// must agree with the Lakebase fork tier on SCHEMA/CODE, else DB-touching tests run against a
// schema the committed code does not match and the driver burns its regression budget into an
// opaque HIL. The guard used a git-ANCESTRY proxy: HEAD must descend from the local parentBranch
// tip. That fired a FALSE POSITIVE when a legitimate reopen/re-author left a trivial runtime-artifact
// commit (a pipeline.json gate-status line / .consort corpus churn) ahead of the tier commit the fork
// lands on – no schema/code delta, so no split-brain possible, yet the cut aborted (and pushing the
// branch did not help: the git side forks from the tier commit, not origin). forkParentAgreementReason
// now checks the TRUE invariant – whether the divergence touches any SCHEMA/CODE file – reusing the
// SAME RUNTIME_ARTIFACT_PREFIXES set the pre-fork dirty guard trusts. A real schema/code divergence
// still hard-blocks; fail-closed if the divergence set can't be computed.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { cutExperiment, forkParentAgreementReason } from "../../consort/experiment/experiment.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function write(dir: string, rel: string, body: string): void {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}
function commitFile(dir: string, rel: string, body: string, msg: string): string {
  write(dir, rel, body);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", msg);
  return git(dir, "rev-parse", "HEAD");
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fork-parent-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.co");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  commitFile(dir, "README.md", "x\n", "init");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Build a feature branch whose TIER commit holds `server/models.py`, then advance its TIP by one
 *  more commit touching `tipFile`. Leave HEAD parked ON the tier commit (a fresh branch there) to
 *  mimic the post-fork state: HEAD = the tier the fork landed on, `feature/F1` ref = the tip ahead. */
function setUpTierBehindTip(tipRel: string, tipBody: string): { tier: string; tip: string } {
  git(dir, "checkout", "-q", "-b", "feature/F1");
  const tier = commitFile(dir, "server/models.py", "class Sku: pass\n", "tier: S1 schema");
  const tip = commitFile(dir, tipRel, tipBody, "tip: advance past tier");
  // Park HEAD on the tier commit as if the git fork landed there (behind the feature tip).
  git(dir, "checkout", "-q", "-b", "experiment-head", tier);
  return { tier, tip };
}

describe("forkParentAgreementReason (predicate)", () => {
  it("returns NULL when the tip is ahead only by a runtime-artifact commit (.consort/pipeline.json) — the false positive", () => {
    setUpTierBehindTip(".consort/features/F1/pipeline.json", JSON.stringify({ stories: { S2: { gate: "approved" } } }));
    expect(forkParentAgreementReason(dir, "feature/F1")).toBeNull();
  });

  it("returns a HALT reason naming the source file when the divergence touches SCHEMA/CODE", () => {
    setUpTierBehindTip("server/routes.py", "def list_skus(): ...\n");
    const reason = forkParentAgreementReason(dir, "feature/F1");
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/SCHEMA\/CODE/);
    expect(reason).toContain("server/routes.py");
  });

  it("returns NULL on the happy path: HEAD descends from the tip", () => {
    setUpTierBehindTip(".consort/features/F1/pipeline.json", "{}\n");
    git(dir, "checkout", "-q", "feature/F1"); // HEAD == tip
    expect(forkParentAgreementReason(dir, "feature/F1")).toBeNull();
  });

  it("returns NULL when the local parent ref is absent (nothing to compare against)", () => {
    setUpTierBehindTip("server/routes.py", "x\n");
    expect(forkParentAgreementReason(dir, "feature/does-not-exist")).toBeNull();
  });

  it("mixed divergence (runtime-artifact AND source) still halts on the source file", () => {
    git(dir, "checkout", "-q", "-b", "feature/F1");
    const tier = commitFile(dir, "server/models.py", "class Sku: pass\n", "tier");
    write(dir, ".consort/features/F1/pipeline.json", "{}\n");
    write(dir, "server/routes.py", "def h(): ...\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "tip: metadata + source");
    git(dir, "checkout", "-q", "-b", "experiment-head", tier);
    const reason = forkParentAgreementReason(dir, "feature/F1");
    expect(reason).toBeTruthy();
    expect(reason).toContain("server/routes.py");
  });
});

const cutArgs = () => ({
  instance: "inst-1",
  consortDir: join(dir, ".consort"),
  projectDir: dir,
  featureId: "F1-x",
  storyId: "S1-x",
  experimentSlug: "exp1",
  branch: "experiment/F1-x/S1-x/exp1",
  parentBranch: "feature/F1",
});
// A paired-cut fake that reports a healthy .env sync so the cut reaches the fork-parent guard.
const okPairedFake = {
  createPairedBranch: (async () => ({
    envSynced: true,
    warnings: [] as string[],
    branch: { name: "experiment/F1-x/S1-x/exp1" },
  })) as never,
  deletePairedBranch: (async () => {}) as never,
};

describe("cutExperiment wires the fork-parent agreement guard", () => {
  it("ABORTS the cut when the fork-parent diverges from the tier on SCHEMA/CODE", async () => {
    setUpTierBehindTip("server/routes.py", "def list_skus(): ...\n");
    await expect(cutExperiment(cutArgs(), okPairedFake)).rejects.toThrow(/SCHEMA\/CODE|does not descend/i);
  });

  it("PROCEEDS past the guard when the tip is ahead only by runtime-artifact metadata (the fix)", async () => {
    setUpTierBehindTip(".consort/features/F1/pipeline.json", JSON.stringify({ stories: { S2: { gate: "approved" } } }));
    const rec = await cutExperiment(cutArgs(), okPairedFake);
    expect(rec.experiment_slug).toBe("exp1");
    expect(rec.branch_id).toBe("exp1");
  });
});
