// Cycle recording is an ORCHESTRATION concern: the deterministic driver calls
// beginNextPendingCycle (after the pure Navigator writes the test) and
// greenOpenCycle (after the pure Driver makes it pass). These stamp the SAME
// red_at / green_at the probe reads – the contract the live smoke broke when
// the Navigator hand-wrote a cycle with `status:"red"` (no red_at) and the
// driver re-dispatched it forever.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from "fs";
import { execSync } from "node:child_process";
import { tmpdir } from "os";
import { join } from "path";
import {
  beginNextPendingCycle,
  greenOpenCycle,
  storyTestProgress,
  pendingItemKind,
  firstReviewPendingAc,
  firstRefactorPendingAc,
  reviewAc,
  refactorAc,
  reviewPending,
  refactorPending,
  reviewStory,
  refactorStory,
  storyReviewState,
  resetStoryBuildState,
  type GreenVerifier,
} from "../../consort/pipeline/cycle-record.js";
import { readAgentLog } from "../../consort/logging/agent-log.js";
import { markRefactorVerifyAssessed } from "../../consort/smells/refactor-verify-assess.js";

// greenOpenCycle now runs an HONEST verify (deploy-during-build) before stamping
// green. These cycle-record unit tests inject a passing verifier so they exercise
// the recording path without a real app; the failing-verifier -> escalation path
// is covered in tdd-honest-green.test.ts.
const pass: GreenVerifier = async () => ({ passed: true, summary: "verify passed (test stub)" });

let tdd: string;
const F = "F1";
const S = "S1";

function writeJson(file: string, obj: unknown): void {
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function cyclesFor(ac: string): Record<string, unknown>[] {
  const dir = join(tdd, "cycles", F, S, ac);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-cyc-"));
  // Minimal feature/story tree the recorders read.
  const acsDir = join(tdd, "features", F, "stories", S, "acs");
  mkdirSync(acsDir, { recursive: true });
  writeJson(join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "the API returns" });
  const items = [
    { id: "T1", description: "first thing fails", ac_id: "AC1", status: "pending" },
    { id: "T2", description: "second thing fails", ac_id: "AC1", status: "pending" },
  ];
  writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
  // The MASTER test-list (the single source markTestItemGreen updates; the
  // per-story list is re-derived from it).
  writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
  // A cut experiment (slug + branch.txt + outcomes.json) so cycles tie to its DB
  // and markGreen's runner contract can be satisfied via recordRunnerOutcome.
  const expDir = join(tdd, "experiments", F, S, "exp1");
  mkdirSync(expDir, { recursive: true });
  writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
  writeJson(join(expDir, "outcomes.json"), { status: "running" });
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("cycle-record: orchestration stamps RED/GREEN the probe can read", async () => {
  it("beginNextPendingCycle stamps red_at (NOT a freehand status) for the first pending test", async () => {
    const r = beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    expect(r.recorded).toBe(true);
    expect(r.testId).toBe("T1");
    const cycles = cyclesFor("AC1");
    expect(cycles.length).toBe(1);
    // The exact field the probe reads (testsWritten = some cycle with red_at).
    expect(cycles[0].red_at).toBeTruthy();
    expect(cycles[0].green_at).toBeFalsy();
    expect(cycles[0].test_id).toBe("T1");
    expect(cycles[0].layer).toBe("API"); // auto-derived from the AC file
    expect(cycles[0].experiment_slug).toBe("exp1");
  });

  it("greenOpenCycle threads the open cycle's LAYER into the verify (so run-tests.sh scopes the client E2E)", async () => {
    // The honest-GREEN verify runs the slow client Playwright E2E only when the cycle is E2E-layer
    // (else the deploy gate); greenOpenCycle must hand the verifier the open cycle's layer for that
    // gate to fire. The AC here is layer=API, so a non-E2E cycle -> the verify (and run-tests.sh via
    // CONSORT_CYCLE_LAYER) skips the E2E.
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    let seenLayer: string | undefined = "UNSET";
    const spy: GreenVerifier = async (a) => { seenLayer = a.cycleLayer; return { passed: true, summary: "ok" }; };
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: spy });
    expect(seenLayer).toBe("API");
  });

  it("greenOpenCycle threads storyHasClientTests=false for a pure backend story (no client/component/e2e item)", async () => {
    // The per-cycle GREEN skips the serving app + the client pass when the story has no client-kind
    // test. The beforeEach test-list items carry no `kind` => no client test => false.
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    let seen: boolean | undefined = undefined;
    const spy: GreenVerifier = async (a) => { seen = a.storyHasClientTests; return { passed: true, summary: "ok" }; };
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: spy });
    expect(seen).toBe(false);
  });

  it("greenOpenCycle threads storyHasClientTests=true when the story HAS a client-kind test", async () => {
    // Add a client-kind item: the story now needs the serving app + the client pass.
    const items = [
      { id: "T1", description: "first thing fails", ac_id: "AC1", status: "pending" },
      { id: "T2", description: "a client test", ac_id: "AC1", status: "pending", kind: "client" },
    ];
    writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    let seen: boolean | undefined = undefined;
    const spy: GreenVerifier = async (a) => { seen = a.storyHasClientTests; return { passed: true, summary: "ok" }; };
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: spy });
    expect(seen).toBe(true);
  });

  it("greenOpenCycle scopes the per-cycle verify to the CURRENT AC's tests (#2 impacted-test selection)", async () => {
    // Story spans AC1 (T1,T2) + AC2 (T3). The open cycle greens T1 (AC1), so the per-cycle verify runs
    // AC1's tests ONLY — the sibling AC2's T3 is excluded per cycle and runs at the unscoped story-close
    // REFACTOR + feature-deploy gates (where a cross-AC break is caught before accept).
    writeJson(join(tdd, "features", F, "stories", S, "acs", "AC2.json"), { id: "AC2", layer: "API", text: "also" });
    const items = [
      { id: "T1", description: "a", ac_id: "AC1", status: "pending" },
      { id: "T2", description: "b", ac_id: "AC1", status: "pending" },
      { id: "T3", description: "c", ac_id: "AC2", status: "pending" },
    ];
    writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); // T1 (AC1)
    let seen: string[] | undefined;
    const spy: GreenVerifier = async (a) => { seen = a.storyTestIds; return { passed: true, summary: "ok" }; };
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: spy });
    expect(seen).toEqual(["T1", "T2"]); // AC1 only; T3 (AC2) excluded per cycle
  });

  it("greenOpenCycle FALLS BACK to the full story scope when the open AC has no matching items (mis-tag safety)", async () => {
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); // T1 -> open cycle stamped ac_id AC1
    // Re-tag every item to AC2 (a mis-tag): acTestIdsFor(AC1) = [] must NOT shrink the verify to
    // nothing — it falls back to every story id. Rewrite both master + per-story so a re-derive can't
    // restore the AC1 tags.
    const items = [
      { id: "T1", description: "a", ac_id: "AC2", status: "pending" },
      { id: "T2", description: "b", ac_id: "AC2", status: "pending" },
    ];
    writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    let seen: string[] | undefined;
    const spy: GreenVerifier = async (a) => { seen = a.storyTestIds; return { passed: true, summary: "ok" }; };
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: spy });
    expect(seen).toEqual(["T1", "T2"]); // fell back to full story scope (not empty)
  });

  it("LAKEBASE_CONSORT_CYCLE_VERIFY_SCOPE=story opts back to the whole-story scope (the A/B lever)", async () => {
    writeJson(join(tdd, "features", F, "stories", S, "acs", "AC2.json"), { id: "AC2", layer: "API", text: "also" });
    const items = [
      { id: "T1", description: "a", ac_id: "AC1", status: "pending" },
      { id: "T2", description: "b", ac_id: "AC1", status: "pending" },
      { id: "T3", description: "c", ac_id: "AC2", status: "pending" },
    ];
    writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); // T1 (AC1)
    const prev = process.env.LAKEBASE_CONSORT_CYCLE_VERIFY_SCOPE;
    process.env.LAKEBASE_CONSORT_CYCLE_VERIFY_SCOPE = "story";
    let seen: string[] | undefined;
    const spy: GreenVerifier = async (a) => { seen = a.storyTestIds; return { passed: true, summary: "ok" }; };
    try {
      await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: spy });
    } finally {
      if (prev === undefined) delete process.env.LAKEBASE_CONSORT_CYCLE_VERIFY_SCOPE;
      else process.env.LAKEBASE_CONSORT_CYCLE_VERIFY_SCOPE = prev;
    }
    expect(seen).toEqual(["T1", "T2", "T3"]); // whole story (all ACs), not just AC1
  });

  it("greenOpenCycle records the run + stamps green_at on the open RED cycle", async () => {
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const g = await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    expect(g.recorded).toBe(true);
    expect(g.testId).toBe("T1");
    const cycles = cyclesFor("AC1");
    expect(cycles[0].green_at).toBeTruthy();
    // markGreen's runner contract was satisfied: an outcome was recorded.
    const outcomes = JSON.parse(readFileSync(join(tdd, "experiments", F, S, "exp1", "outcomes.json"), "utf8"));
    expect(outcomes.by_tag).toBeTruthy();
  });

  it("greenOpenCycle short-circuits an AUTH-EXPIRED verify straight to raise-to-hil (never assess)", async () => {
    // A verify that failed because the Databricks session is expired is NOT a
    // supersession/regression the Navigator can assess or the Driver can repair ,
    // routing it to an assess turn just spins. It must escalate IMMEDIATELY with
    // the reauth remediation, on the FIRST failure (no assess, no self-heal round).
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const authFail: GreenVerifier = async () => ({
      passed: false,
      summary:
        "Backend unreachable: A new access token could not be retrieved because the refresh token is invalid. To reauthenticate, run: databricks auth login",
    });
    const g = await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: authFail });
    expect(g.needsAssess).toBeFalsy();
    expect(g.escalated).toBe(true);
    expect(g.escalation?.source).toBe("auth-expired");
    expect(g.escalation?.reason).toMatch(/databricks auth login|refresh token/i);
  });

  it("resetStoryBuildState clears cycles + resets test-list statuses so a revised story re-drives", async () => {
    // Drive both tests GREEN so the story reads allGreen (the pre-revise state
    // that made a revised story re-deploy its stale build instead of rebuilding).
    await beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    expect(storyTestProgress(tdd, F, S).allGreen).toBe(true);
    // Mirror a really-built story: per-story test-list statuses are green too.
    const tlPath = join(tdd, "features", F, "stories", S, "test-list-per-story.json");
    const tl = JSON.parse(readFileSync(tlPath, "utf8")) as { items: Array<{ status: string }> };
    tl.items.forEach((i) => (i.status = "green"));
    writeFileSync(tlPath, JSON.stringify(tl, null, 2) + "\n");

    const r = resetStoryBuildState(tdd, F, S);
    expect(r.cyclesCleared).toBe(true);
    expect(r.testItemsReset).toBe(2);
    // Cycles gone -> every test-list item is pending again, story is NOT allGreen,
    // so the build lane re-drives RED/GREEN instead of skipping to deploy.
    const prog = storyTestProgress(tdd, F, S);
    expect(prog.pending.map((i) => i.id)).toEqual(["T1", "T2"]);
    expect(prog.allGreen).toBe(false);
    expect(cyclesFor("AC1")).toEqual([]);
    // Recorded state is honest again.
    const after = JSON.parse(readFileSync(tlPath, "utf8")) as { items: Array<{ status: string }> };
    expect(after.items.every((i) => i.status === "pending")).toBe(true);
    // Idempotent: a second call is a clean no-op.
    expect(resetStoryBuildState(tdd, F, S)).toEqual({ cyclesCleared: false, testItemsReset: 0 });
  });

  it("sequences one test at a time: begin -> green -> begin advances to the next pending", async () => {
    expect(beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }).testId).toBe("T1");
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    expect(beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }).testId).toBe("T2");
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    // Both tests have green cycles now – nothing pending.
    const after = beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    expect(after.recorded).toBe(false);
    expect(cyclesFor("AC1").length).toBe(2);
  });

  it("greenOpenCycle propagates green to the master test-list item + flips the AC to `passing`", async () => {
    // The await-acceptance stall: the cycle was green but the test-list items
    // stayed `pending` + the AC `draft`, so the Release Engineer refused to
    // deploy. Greening every test for an AC must mark the items green + the AC passing.
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass }); // T1
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass }); // T2
    const master = JSON.parse(readFileSync(join(tdd, "features", F, "test-list.json"), "utf8"));
    expect(master.items.every((i: { status: string }) => i.status === "green")).toBe(true);
    const perStory = JSON.parse(readFileSync(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), "utf8"));
    expect(perStory.items.every((i: { status: string }) => i.status === "green")).toBe(true);
    const ac1 = JSON.parse(readFileSync(join(tdd, "features", F, "stories", S, "acs", "AC1.json"), "utf8"));
    expect(ac1.status).toBe("passing"); // all of AC1's tests are green
  });

  it("per-AC REVIEW/REFACTOR: AC awaits review once all its tests are green; verdict drives refactor", async () => {
    // Green both of AC1's tests.
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    // AC1 now awaits the Navigator REVIEW.
    expect(firstReviewPendingAc(tdd, F, S)).toBe("AC1");
    // Navigator left a verdict requesting a refactor.
    writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract a helper" });
    const r = reviewAc(tdd, F, S, "AC1");
    expect(r.refactorRequested).toBe(true);
    expect(firstReviewPendingAc(tdd, F, S)).toBeNull(); // reviewed
    expect(firstRefactorPendingAc(tdd, F, S)).toBe("AC1"); // refactor pending
    await refactorAc(tdd, F, S, "AC1", { verify: pass });
    expect(firstRefactorPendingAc(tdd, F, S)).toBeNull(); // refactored – AC fully done
  });

  it("REVIEW + REFACTOR emit cycle.review + cycle.refactored to the central log (closes the RED->GREEN->REVIEW->REFACTOR trail)", async () => {
    // Regression: the per-AC review/refactor lane (reviewAc/refactorAc) wrote
    // review.json but emitted NO agent-log event, so a live run's central log
    // showed cycle.red + cycle.green per AC and then went silent through review
    // + refactor. Both transitions must emit their closed-vocabulary event.
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract a helper" });
    reviewAc(tdd, F, S, "AC1");
    await refactorAc(tdd, F, S, "AC1", { verify: pass });

    const log = readAgentLog({ consortDir: tdd });
    const review = log.find((e) => e.event === "cycle.review");
    expect(review, "expected a cycle.review event").toBeTruthy();
    expect(review!.role).toBe("navigator");
    expect((review!.metadata as { ac?: string })?.ac).toBe("AC1");
    expect((review!.metadata as { refactor?: boolean })?.refactor).toBe(true);

    const refactored = log.find((e) => e.event === "cycle.refactored");
    expect(refactored, "expected a cycle.refactored event").toBeTruthy();
    expect(refactored!.role).toBe("driver");
    expect((refactored!.metadata as { ac?: string })?.ac).toBe("AC1");
  });

  it("per-AC REVIEW with no refactor verdict (looks good) does not request a refactor", async () => {
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    const r = reviewAc(tdd, F, S, "AC1"); // no verdict file => looks good
    expect(r.refactorRequested).toBe(false);
    expect(firstRefactorPendingAc(tdd, F, S)).toBeNull();
  });

  it("greenOpenCycle throws when there is no open RED cycle (driver dispatched with nothing to green)", async () => {
    await expect(greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass })).rejects.toThrow(
      /no open RED cycle/,
    );
  });

  it("storyTestProgress: after only T1 is green, the loop must CONTINUE (T2 pending, not allGreen)", async () => {
    // The exact regression that stalled the live smoke: the build advanced to
    // await-acceptance after one test because "all RED cycles are green" was
    // true. With test-list-driven progress, T2 is still pending and allGreen is
    // false, so the Navigator is dispatched for T2 instead of awaiting acceptance.
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); // RED T1
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass }); // GREEN T1
    const p = storyTestProgress(tdd, F, S);
    expect(p.total).toBe(2);
    expect(p.openRed.length).toBe(0);
    expect(p.allGreen).toBe(false); // NOT done – T2 unbuilt
    expect(p.pending.map((i) => i.id)).toEqual(["T2"]);
  });

  it("pendingItemKind: reports the next pending item's kind (drives the born-green fitness guard)", async () => {
    // The seeded list has no `kind` on T1/T2 (a behavior AC test): undefined.
    expect(pendingItemKind(tdd, F, S)).toBeUndefined();
    // A fitness-kind item that is already done, then a pending fitness guard,
    // then a pending behavior test – pendingItemKind reads the FIRST pending.
    const perStory = join(tdd, "features", F, "stories", S, "test-list-per-story.json");
    writeJson(perStory, {
      feature_id: F,
      story_id: S,
      items: [
        { id: "TF", description: "service layer owns persistence", ac_id: "AC1", status: "pending", kind: "fitness" },
        { id: "T2", description: "second thing fails", ac_id: "AC1", status: "pending", kind: "behavior" },
      ],
    });
    expect(pendingItemKind(tdd, F, S)).toBe("fitness");
    // pending = "items with no cycle yet". Once TF has a cycle, the next pending
    // item is the behavior test, so the reported kind advances to "behavior".
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); // RED cycle for TF (the first pending)
    expect(pendingItemKind(tdd, F, S)).toBe("behavior");
  });
});

// Each GREEN and each completed REFACTOR commits the working tree on the
// experiment branch, so accept's git-merge carries real commits up to the
// feature branch and the promote phase's prepare-pr finds a clean tree. The
// live smoke surfaced the gap: the build wrote code but never committed it, so
// promote's prepare-pr aborted with dirty-working-tree.
describe("cycle-record: GREEN + REFACTOR each commit on the experiment branch", () => {
  let proj: string;
  let ptdd: string;
  const gitlog = (): string => execSync("git log --oneline", { cwd: proj }).toString();
  // CODE cleanliness: the build commits code only, leaving .tdd/.lakebase churn
  // uncommitted by design (committing it would break accept's branch checkout).
  const codeDirty = (): string =>
    execSync("git status --porcelain -- . ':(exclude).tdd' ':(exclude).lakebase'", { cwd: proj }).toString().trim();

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "tdd-commit-proj-"));
    ptdd = join(proj, ".tdd");
    const acsDir = join(ptdd, "features", F, "stories", S, "acs");
    mkdirSync(acsDir, { recursive: true });
    writeJson(join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "the API returns" });
    const items = [{ id: "T1", description: "first thing fails", ac_id: "AC1", status: "pending" }];
    writeJson(join(ptdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    writeJson(join(ptdd, "features", F, "test-list.json"), { feature_id: F, items });
    const expDir = join(ptdd, "experiments", F, S, "exp1");
    mkdirSync(expDir, { recursive: true });
    writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
    writeJson(join(expDir, "outcomes.json"), { status: "running" });
    // A real git repo on the experiment branch with a seed commit.
    execSync("git init -q", { cwd: proj });
    execSync("git config user.email t@example.com && git config user.name tester", { cwd: proj });
    execSync("git checkout -q -b experiment-s1-exp1", { cwd: proj });
    writeFileSync(join(proj, "README.md"), "seed\n");
    execSync("git add -A && git commit -q -m seed", { cwd: proj });
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
  });

  it("greenOpenCycle commits the green increment + leaves a clean tree", async () => {
    beginNextPendingCycle({ consortDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n"); // the Driver's production code
    await greenOpenCycle({ consortDir: ptdd, featureId: F, story: S, verify: pass });
    expect(gitlog()).toMatch(/green: T1 \(AC1\)/);
    expect(codeDirty()).toBe(""); // code committed => prepare-pr would pass
    // .tdd is intentionally NOT committed by the build (avoids the accept-checkout divergence).
    expect(execSync("git status --porcelain", { cwd: proj }).toString()).toMatch(/\.tdd\//);
  });

  it("commits the project-level .tdd/design corpus (so the next feature inherits it) but NOT the churny .tdd state", async () => {
    // The persistence bug: F1 authored design/design-guide.json but the build's
    // code-only commit excluded ALL of .tdd, so the design guide never rode F1's
    // PR to the parent tier. F2 forked from the tier WITHOUT it, designGuideReady
    // was false, and the UX designer re-authored the whole design system. The
    // fix force-includes the STABLE design corpus while still excluding the
    // churny state that would diverge from the feature branch.
    const designDir = join(ptdd, "design");
    mkdirSync(designDir, { recursive: true });
    writeJson(join(designDir, "design-guide.json"), { tokens: { color: { primary: "#111" } } });
    writeFileSync(join(designDir, "design-guide.md"), "# Design Guide\n");
    writeFileSync(join(designDir, "ia.md"), "# Information Architecture\n");
    // Churny per-run state that must stay OUT of the commit (committing it would
    // diverge from the feature branch and break accept's `git checkout`).
    writeJson(join(ptdd, "workflow-state.json"), { phase: "build" });

    beginNextPendingCycle({ consortDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n");
    await greenOpenCycle({ consortDir: ptdd, featureId: F, story: S, verify: pass });

    const tracked = execSync("git ls-files", { cwd: proj }).toString();
    // The design corpus IS committed (rides the PR to the parent tier). It was
    // created AFTER the seed commit, so its presence proves commitCycleWork
    // force-included it past the broad `.tdd` exclude.
    expect(tracked).toMatch(/\.tdd\/design\/design-guide\.json/);
    expect(tracked).toMatch(/\.tdd\/design\/design-guide\.md/);
    expect(tracked).toMatch(/\.tdd\/design\/ia\.md/);
    // The churny state (also created after the seed) is NOT committed: it stays
    // uncommitted so its copy never diverges from the feature branch.
    expect(tracked).not.toMatch(/\.tdd\/workflow-state\.json/);
    expect(execSync("git status --porcelain", { cwd: proj }).toString()).toMatch(/\.tdd\/workflow-state\.json/);
  });

  it("refactorAc commits the behavior-preserving refactor as its own commit", async () => {
    beginNextPendingCycle({ consortDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n");
    await greenOpenCycle({ consortDir: ptdd, featureId: F, story: S, verify: pass });
    writeJson(join(ptdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract helper" });
    reviewAc(ptdd, F, S, "AC1");
    writeFileSync(join(proj, "app.py"), "x = 2  # extracted helper\n");
    await refactorAc(ptdd, F, S, "AC1", { verify: pass });
    expect(gitlog()).toMatch(/refactor: AC1/);
    expect(codeDirty()).toBe("");
  });
});

// ── Story-level review/refactor ("story" loop granularity, the default) ───────
// The Navigator REVIEWs the whole story in one turn (reviewStory) and the Driver
// REFACTORs it in one turn (refactorStory); the transition is recorded once at
// the story's cycles root (cycles/<F>/<S>/review.json), not per AC.
describe("cycle-record: story-level review/refactor (story granularity)", async () => {
  function greenWholeStory(): Promise<unknown> {
    // Green every pending test in the story (T1 + T2, both under AC1).
    return (async () => {
      beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
      await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
      beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
      await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });
    })();
  }

  it("reviewPending is true once the WHOLE story is green, false before", async () => {
    expect(reviewPending(tdd, F, S)).toBe(false); // nothing green yet
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass }); // only T1
    expect(reviewPending(tdd, F, S)).toBe(false); // T2 still pending
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass }); // T2
    expect(reviewPending(tdd, F, S)).toBe(true); // whole story green -> review pending
  });

  it("reviewStory with no verdict marks reviewed (looks good): reviewPending clears, no refactor", async () => {
    await greenWholeStory();
    const r = reviewStory(tdd, F, S);
    expect(r.reviewed).toBe(true);
    expect(r.refactorRequested).toBe(false);
    expect(reviewPending(tdd, F, S)).toBe(false);
    expect(refactorPending(tdd, F, S)).toBe(false);
    // Recorded once at the story root, NOT under an AC dir.
    const state = storyReviewState(tdd, F, S);
    expect(state.reviewed).toBe(true);
    expect(state.refactored).toBe(false);
  });

  it("a refactor:true verdict routes one story REFACTOR, then refactorStory clears it", async () => {
    await greenWholeStory();
    writeJson(join(tdd, "cycles", F, S, "review-verdict.json"), { refactor: true, notes: "extract a shared helper" });
    const r = reviewStory(tdd, F, S);
    expect(r.refactorRequested).toBe(true);
    expect(refactorPending(tdd, F, S)).toBe(true);
    const res = await refactorStory(tdd, F, S, { verify: pass });
    expect(res.refactored).toBe(true);
    expect(refactorPending(tdd, F, S)).toBe(false); // refactored -> no longer pending
  });

  it("a FAILED post-refactor verify routes the FIRST failure to a bounded supersession assess, then escalates", async () => {
    await greenWholeStory();
    writeJson(join(tdd, "cycles", F, S, "review-verdict.json"), { refactor: true, notes: "risky change" });
    reviewStory(tdd, F, S);
    const fail: GreenVerifier = async () => ({ passed: false, summary: "a prior-story test regressed" });
    // First failure: a refactor break may be a PRIOR test this story supersedes,
    // so it routes to a bounded Navigator assess (marker written) rather than the
    // terminal HIL. refactored_at stays unstamped (still pending).
    const first = await refactorStory(tdd, F, S, { verify: fail });
    expect(first.refactored).toBe(false);
    expect(first.needsAssess).toBe(true);
    expect(first.escalated).toBeFalsy();
    expect(refactorPending(tdd, F, S)).toBe(true);
    // Simulate the assess having run (the Navigator vetoed / one shot spent), then
    // a repeat failure now escalates to the HIL (the one-shot bound).
    markRefactorVerifyAssessed(tdd, F, S);
    const second = await refactorStory(tdd, F, S, { verify: fail });
    expect(second.refactored).toBe(false);
    expect(second.escalated).toBe(true);
    expect(refactorPending(tdd, F, S)).toBe(true);
  });
});
