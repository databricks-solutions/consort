// FEIP-8023: driving a feature whose recorded SCM claim names a DIFFERENT
// feature (a prior feature shipped out-of-band, .lakebase/workflow-state.json
// never reconciled) must be refused loud – otherwise the drive derives the
// experiment's parent from the stale predecessor branch and commits build output
// onto the wrong branch.
//
// The DECISION is the pure `isForeignFeatureClaim` (behaviorally covered in
// scm-workflow-state.test.ts). This file guards the WIRING: that the feature
// drive path in drive.cli.ts consults it and refuses (returns 2) before running
// the driver. drive.cli.ts is a self-invoking bin that relies on the dist's
// __dirname shim, so it cannot be imported or run from source in-process; a
// static source assertion (the same approach as drive-bin-resolution.test.ts) is
// the proportionate wiring check without a full dist build.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const DRIVE_SRC = readFileSync(new URL("../../bin/consort/drive.cli.ts", import.meta.url), "utf8");
const DESIGN_CMD = readFileSync(
  new URL("../../templates/project/common/.claude/commands/design.md", import.meta.url),
  "utf8",
);
const DESIGN_PREHOOK = readFileSync(
  new URL("../../templates/project/common/.claude/commands/design.pre-hook.md", import.meta.url),
  "utf8",
);

describe("consort-drive wires the foreign-claim refusal (FEIP-8023)", () => {
  it("imports the isForeignFeatureClaim decision from the SCM workflow state module", () => {
    expect(DRIVE_SRC).toMatch(/import\s*\{[^}]*\bisForeignFeatureClaim\b[^}]*\}\s*from\s*["']@databricks-solutions\/lakebase-scm-utils\/lakebase/);
  });

  it("refuses the feature drive (returns 2) when the claim is foreign, before running the driver", () => {
    // The guard block: consult isForeignFeatureClaim on the drive's own project,
    // print a refusal, and bail non-zero.
    expect(DRIVE_SRC).toMatch(/isForeignFeatureClaim\s*\(/);
    // Anchor the guard to a refusal message + a non-zero return so it is not a
    // dead reference (the message and exit are the shipped behavior).
    const guardRegion = DRIVE_SRC.slice(DRIVE_SRC.indexOf("isForeignFeatureClaim("));
    expect(guardRegion).toMatch(/refusing to drive/i);
    expect(guardRegion).toMatch(/return 2;/);
    // Points the operator at the remedy, not a bare failure.
    expect(guardRegion).toMatch(/claim|reconcile|resume/i);
  });
});

// Companion to the foreign-claim guard: entering the feature lane with NO claim at all
// (consort-drive invoked directly, or a phase-bound `--only design`) leaves the working
// tree on the tier parent. The claim is an UN-SKIPPABLE precondition owned by the driver,
// so no matter how the lane is entered it CLAIMS the paired branch itself (rather than
// refusing + dead-ending). Same static-source wiring check (drive.cli.ts is a self-invoking bin).
describe("consort-drive AUTO-CLAIMS the feature branch when none is claimed (any entry path)", () => {
  it("runs lakebase-scm-claim-feature-branch itself rather than refusing", () => {
    expect(DRIVE_SRC).toMatch(/no feature branch claimed/i);
    const idx = DRIVE_SRC.indexOf("no feature branch claimed");
    const region = DRIVE_SRC.slice(idx, idx + 900);
    // It RUNS the claim (spawnCmd), not just names it in a refusal message.
    expect(region).toMatch(/spawnCmd\(/);
    expect(region).toMatch(/lakebase-scm-claim-feature-branch/);
    // return 2 appears only on the FAILURE path (claim errored / still unclaimed after), not the happy path.
    expect(region).toMatch(/return 2;/);
  });

  it("places the auto-claim after --dry-run and gates it on replay lanes (planning/replay stay unblocked)", () => {
    const idx = DRIVE_SRC.indexOf("no feature branch claimed");
    expect(idx).toBeGreaterThan(DRIVE_SRC.indexOf("if (args.dryRun)"));
    // The auto-claim block is gated on !inReplayLane (replay has no live branch).
    expect(DRIVE_SRC.slice(Math.max(0, idx - 400), idx)).toMatch(/inReplayLane/);
  });
});

// The incident: a feature was ALREADY claimed, so the auto-claim above was skipped — but
// nothing ever moved the working tree onto the claimed branch (the claim CLI only
// `git checkout -b`s on CREATE). HEAD stayed on the tier parent (staging), the whole design
// lane ran + committed its corpus there, and the experiment cut forked the still-stale
// feature branch → "story not in the pipeline" → HIL. The single owner must therefore ALSO
// check out the claimed branch, UNCONDITIONALLY — not only when it just claimed.
describe("consort-drive Step 0 ALSO checks out the claimed paired branch, unconditionally (one door)", () => {
  const idxClaim = DRIVE_SRC.indexOf("no feature branch claimed");

  it("reads the claimed branch from the SCM workflow state AFTER the auto-claim block", () => {
    const after = DRIVE_SRC.slice(idxClaim);
    expect(after).toMatch(/const scm = readWorkflowState\(cfg\.projectDir\);/);
    expect(after).toMatch(/const claimedBranch =[^\n]*scm\?\.branch/);
  });

  it("checks out that branch independently of the claim-when-absent block, so it holds when already claimed", () => {
    expect(DRIVE_SRC).toMatch(/spawnCmd\("git",\s*\["checkout",\s*claimedBranch\]/);
    // Ordering proves it is NOT nested in the `if (!claimed)` auto-claim: the fresh state
    // read and the checkout both come AFTER the auto-claim's own spawnCmd(lkShim, …).
    const idxAutoClaim = DRIVE_SRC.indexOf("lakebase-scm-claim-feature-branch", idxClaim);
    const idxScmRead = DRIVE_SRC.indexOf("const scm = readWorkflowState(cfg.projectDir);", idxClaim);
    const idxCheckout = DRIVE_SRC.indexOf('spawnCmd("git", ["checkout", claimedBranch]', idxClaim);
    expect(idxScmRead).toBeGreaterThan(idxAutoClaim);
    expect(idxCheckout).toBeGreaterThan(idxScmRead);
  });

  it("refuses loud (return 2) with a remedy if the checkout fails, and records the branch on cfg", () => {
    const idxCheckout = DRIVE_SRC.indexOf('spawnCmd("git", ["checkout", claimedBranch]', idxClaim);
    const region = DRIVE_SRC.slice(idxCheckout, idxCheckout + 700);
    expect(region).toMatch(/could not check out the claimed paired branch/i);
    expect(region).toMatch(/return 2;/);
    expect(DRIVE_SRC.slice(idxClaim)).toMatch(/cfg\.featureBranch = claimedBranch;/);
  });
});

// One door, in the docs too: the `/design` command + its pre-hook must DEFER the claim and
// checkout to the drive's Step 0, not re-implement them (the duplicated agent-markdown copies
// were a second door where off-branch `git checkout -b` drift crept in).
describe("the /design command docs defer the branch claim+checkout to the drive (no second door)", () => {
  it("design.md Step 0 says the drive owns claim+checkout and forbids the agent doing it", () => {
    expect(DESIGN_CMD).toMatch(/owned by the drive/i);
    expect(DESIGN_CMD).toMatch(/does NOT claim the branch or run `git checkout`/i);
    // It no longer instructs the agent to run the claim CLI itself as Step 0.
    const step0 = DESIGN_CMD.slice(DESIGN_CMD.indexOf("## Step 0"), DESIGN_CMD.indexOf("## Step 0.5"));
    expect(step0).not.toMatch(/the agent MUST claim/i);
  });

  it("the pre-hook no longer claims or checks out — it is an optional extension point only", () => {
    expect(DESIGN_PREHOOK).toMatch(/NOT done here/i);
    expect(DESIGN_PREHOOK).toMatch(/do NOT `git checkout`/i);
    // No live claim invocation remains in the default pre-hook.
    expect(DESIGN_PREHOOK).not.toMatch(/```bash[\s\S]*lakebase-scm-claim-feature-branch[\s\S]*```/);
  });
});

// Determinism: a feature drive MUST name its phase. A bare `consort-drive --feature F` with no --only
// is REFUSED (return 2) rather than silently running an unbounded design+build+deploy drive — so
// "invoke a design loop" can never non-deterministically become a build. The old lane_intents
// inheritance (a bare relaunch silently recovering a prior bound) is removed as itself an implicit mode.
describe("consort-drive REFUSES a bare feature drive with no phase bound", () => {
  it("returns 2 and names the phase when --feature has no --only (and no --plan-only)", () => {
    // The refuse is gated on a bound-less single-feature launch.
    expect(DRIVE_SRC).toMatch(/bound === undefined && !args\.planOnly && args\.feature/);
    const idx = DRIVE_SRC.indexOf("bound === undefined && !args.planOnly && args.feature");
    const region = DRIVE_SRC.slice(idx, idx + 600);
    // It refuses (non-zero) with a message naming the phases + the slash commands.
    expect(region).toMatch(/must name its phase/i);
    expect(region).toMatch(/--only design\|build\|deploy/);
    expect(region).toMatch(/\/design, \/build, \/deploy/);
    expect(region).toMatch(/return 2;/);
  });

  it("no longer inherits a bound from a durable lane_intents map (the implicit mode is gone)", () => {
    expect(DRIVE_SRC).not.toMatch(/lane_intents/);
  });
});
