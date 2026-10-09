// phase 2a: per-story pipeline state + single-lane FIFO ready queue.
// Hermetic (in-memory + tmpdir); no live Lakebase.

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  initPipeline,
  setStoryStatus,
  enqueueReady,
  dispatchNext,
  completeActive,
  readPipeline,
  writePipeline,
  updatePipeline,
  surfaceForGate,
  approveStoryGate,
  withdrawStoryGate,
  getStoryGate,
  cutStoryExperiment,
  awaitAcceptance,
  acceptStory,
  discardStory,
  reviseStory,
  getStoryAcceptance,
  syncBreakdownToPipeline,
} from "../../consort/pipeline/story-pipeline";
import { getValidator } from "../../consort/orchestrator/validators/schema-loader";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});
function mkTdd(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "feip7565-"));
  tmpDirs.push(d);
  return d;
}

describe("story-pipeline: lock-guarded writes don't drop a concurrently-approved gate (lost-update fix)", () => {
  const AT = "2026-10-08T00:00:00.000Z";
  // Seed a feature with S3 surfaced for its spec gate, persisted to disk.
  function seedS3Surfaced(consortDir: string): void {
    const p = initPipeline("F1");
    setStoryStatus(p, "S3", "designing");
    surfaceForGate(p, "S3");
    writePipeline(consortDir, p); // creates features/F1/ so the pipeline lock can be placed
  }

  it("a stale writer going through updatePipeline re-reads fresh, so an approved gate survives", () => {
    const dir = mkTdd();
    seedS3Surfaced(dir);
    // Approve S3 through the lock-guarded choke point.
    updatePipeline(dir, "F1", (pp) => approveStoryGate(pp, "S3", { approver: "po@example", at: AT }));
    expect(readPipeline(dir, "F1").stories["S3"].gate!.status).toBe("approved");

    // A different actor (which read the pipeline BEFORE the approval) now mutates an UNRELATED story
    // via updatePipeline — it re-reads fresh inside the lock, so it cannot clobber S3's approval.
    updatePipeline(dir, "F1", (pp) => setStoryStatus(pp, "S2", "building"));

    const after = readPipeline(dir, "F1");
    expect(after.stories["S3"].gate!.status).toBe("approved");
    expect(after.stories["S3"].gate!.history.length).toBe(1); // approval intact, not reset to a fresh open gate
    expect(after.stories["S2"].status).toBe("building"); // the unrelated mutation still applied
  });

  it("CONTRAST: a RAW writePipeline from a stale copy clobbers the approval (why every writer must use updatePipeline)", () => {
    const dir = mkTdd();
    seedS3Surfaced(dir);
    const stale = readPipeline(dir, "F1"); // captured BEFORE approval: S3 gate still open
    updatePipeline(dir, "F1", (pp) => approveStoryGate(pp, "S3", { approver: "po@example", at: AT }));
    expect(readPipeline(dir, "F1").stories["S3"].gate!.status).toBe("approved");

    writePipeline(dir, stale); // the un-converted, stale whole-file overwrite — reproduces the bug
    expect(readPipeline(dir, "F1").stories["S3"].gate!.status).toBe("open");
  });

  it("fails fast on a NESTED updatePipeline (no silent lost update, no deadlock)", () => {
    const dir = mkTdd();
    writePipeline(dir, initPipeline("F1")); // create features/F1/ so the lock can be placed
    expect(() =>
      updatePipeline(dir, "F1", () => {
        // A mutator that itself calls updatePipeline while already holding the lock would, if allowed,
        // have THIS inner write silently clobbered by the outer frame's write. Must throw instead.
        updatePipeline(dir, "F1", (q) => setStoryStatus(q, "S1", "designing"));
      }),
    ).toThrow(/re-entrant lock/);
  });
});

describe("story-pipeline: syncBreakdownToPipeline", () => {
  function writeStoryDir(consortDir: string, feature: string, story: string): void {
    const dir = path.join(consortDir, "features", feature, "stories", story);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify({ id: story }));
  }

  it("seeds the pipeline with every on-disk story dir as designing", () => {
    const consortDir = mkTdd();
    writePipeline(consortDir, initPipeline("F1"));
    writeStoryDir(consortDir, "F1", "S1");
    writeStoryDir(consortDir, "F1", "S2");

    const r = syncBreakdownToPipeline(consortDir, "F1");
    expect(r.added.sort()).toEqual(["S1", "S2"]);
    const p = readPipeline(consortDir, "F1");
    expect(p.stories.S1.status).toBe("designing");
    expect(p.stories.S2.status).toBe("designing");
  });

  it("is idempotent + leaves already-tracked stories untouched", () => {
    const consortDir = mkTdd();
    const p0 = initPipeline("F1");
    setStoryStatus(p0, "S1", "building"); // already past designing
    writePipeline(consortDir, p0);
    writeStoryDir(consortDir, "F1", "S1");
    writeStoryDir(consortDir, "F1", "S2");

    const r1 = syncBreakdownToPipeline(consortDir, "F1");
    expect(r1.added).toEqual(["S2"]); // S1 already tracked
    expect(readPipeline(consortDir, "F1").stories.S1.status).toBe("building"); // not reset

    const r2 = syncBreakdownToPipeline(consortDir, "F1");
    expect(r2.added).toEqual([]); // nothing new on a re-run
  });
});

describe("story-pipeline: init + status", () => {
  it("initializes empty (no stories, empty queue, idle lane)", () => {
    const p = initPipeline("F1-initial-domain");
    expect(p).toEqual({ version: 1, feature_id: "F1-initial-domain", stories: {}, build_queue: [], build_active: null });
  });

  it("setStoryStatus records the design-lane statuses", () => {
    const p = initPipeline("F1");
    setStoryStatus(p, "S1", "designing");
    setStoryStatus(p, "S1", "awaiting-gate");
    expect(p.stories.S1.status).toBe("awaiting-gate");
  });
});

describe("story-pipeline: ready queue + single build lane", () => {
  it("enqueueReady marks ready + queues FIFO, idempotent", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    enqueueReady(p, "S1"); // re-enqueue must not duplicate
    expect(p.build_queue).toEqual(["S1", "S2"]);
    expect(p.stories.S1.status).toBe("ready");
    expect(p.stories.S2.status).toBe("ready");
  });

  it("dispatchNext pulls the FIFO head into the single lane + marks building", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    expect(dispatchNext(p)).toBe("S1");
    expect(p.build_active).toBe("S1");
    expect(p.stories.S1.status).toBe("building");
    expect(p.build_queue).toEqual(["S2"]);
  });

  it("does NOT dispatch a second story while the lane is busy (single-lane invariant)", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    dispatchNext(p); // S1 building
    expect(dispatchNext(p)).toBeNull(); // busy
    expect(p.build_active).toBe("S1");
    expect(p.build_queue).toEqual(["S2"]); // S2 still queued, untouched
  });

  it("completeActive frees the lane, then the next ready story dispatches", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    dispatchNext(p); // S1 building
    expect(completeActive(p)).toBe("S1");
    expect(p.stories.S1.status).toBe("done");
    expect(p.build_active).toBeNull();
    expect(dispatchNext(p)).toBe("S2");
    expect(p.build_active).toBe("S2");
  });

  it("dispatch/complete are no-ops on an idle/empty pipeline", () => {
    const p = initPipeline("F1");
    expect(dispatchNext(p)).toBeNull();
    expect(completeActive(p)).toBeNull();
  });

  it("models design-ahead: S2 gates + queues while S1 is still building", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    dispatchNext(p); // S1 building
    // design lane finishes S2 and gates it while S1 builds:
    enqueueReady(p, "S2");
    expect(p.build_active).toBe("S1"); // S1 keeps building
    expect(p.build_queue).toEqual(["S2"]); // S2 waits
    completeActive(p); // S1 done
    expect(dispatchNext(p)).toBe("S2"); // lane pulls S2
  });
});

describe("story-pipeline: per-story spec gate (phase 2b)", () => {
  const AT = "2026-06-07T12:00:00.000Z";

  it("surfaceForGate moves the story to awaiting-gate + opens the gate", () => {
    const p = initPipeline("F1");
    setStoryStatus(p, "S1", "designing");
    surfaceForGate(p, "S1");
    expect(p.stories.S1.status).toBe("awaiting-gate");
    expect(p.stories.S1.gate).toEqual({ status: "open", history: [] });
  });

  it("getStoryGate returns a default-open record for an ungated story", () => {
    const p = initPipeline("F1");
    setStoryStatus(p, "S1", "designing");
    expect(getStoryGate(p, "S1")).toEqual({ status: "open", history: [] });
  });

  it("approveStoryGate records the approval, then marks ready + queues", () => {
    const p = initPipeline("F1");
    surfaceForGate(p, "S1");
    approveStoryGate(p, "S1", { approver: "po@example", at: AT, spec_hash: "abc123" });
    expect(p.stories.S1.status).toBe("ready");
    expect(p.build_queue).toEqual(["S1"]);
    const gate = getStoryGate(p, "S1");
    expect(gate.status).toBe("approved");
    expect(gate.approver).toBe("po@example");
    expect(gate.approved_at).toBe(AT);
    expect(gate.spec_hash).toBe("abc123");
    expect(gate.history).toEqual([
      { action: "approved", at: AT, approver: "po@example", spec_hash: "abc123" },
    ]);
  });

  it("approveStoryGate throws for an unknown story", () => {
    const p = initPipeline("F1");
    expect(() => approveStoryGate(p, "S9", { approver: "po", at: AT })).toThrow(/not in the pipeline/);
  });

  it("the gate survives dispatch + complete (status writes never clobber it)", () => {
    const p = initPipeline("F1");
    surfaceForGate(p, "S1");
    approveStoryGate(p, "S1", { approver: "po", at: AT });
    dispatchNext(p); // S1 building
    expect(p.stories.S1.status).toBe("building");
    expect(getStoryGate(p, "S1").status).toBe("approved");
    completeActive(p); // S1 done
    expect(p.stories.S1.status).toBe("done");
    expect(getStoryGate(p, "S1").status).toBe("approved");
  });

  it("withdrawStoryGate pulls a queued story back out + resets to awaiting-gate", () => {
    const p = initPipeline("F1");
    surfaceForGate(p, "S1");
    surfaceForGate(p, "S2");
    approveStoryGate(p, "S1", { approver: "po", at: AT });
    approveStoryGate(p, "S2", { approver: "po", at: AT });
    expect(p.build_queue).toEqual(["S1", "S2"]);
    withdrawStoryGate(p, "S2", { approver: "po", at: AT, reason: "spec gap found" });
    expect(p.build_queue).toEqual(["S1"]); // S2 removed
    expect(p.stories.S2.status).toBe("awaiting-gate");
    const gate = getStoryGate(p, "S2");
    expect(gate.status).toBe("withdrawn");
    expect(gate.withdrawal_reason).toBe("spec gap found");
    expect(gate.history.map((h) => h.action)).toEqual(["approved", "withdrawn"]);
  });

  it("withdrawStoryGate frees the lane when withdrawing the actively-building story", () => {
    const p = initPipeline("F1");
    surfaceForGate(p, "S1");
    approveStoryGate(p, "S1", { approver: "po", at: AT });
    dispatchNext(p); // S1 building, lane busy
    withdrawStoryGate(p, "S1", { approver: "po", at: AT, reason: "regression" });
    expect(p.build_active).toBeNull();
    expect(p.stories.S1.status).toBe("awaiting-gate");
  });

  it("withdrawStoryGate throws when the story has no gate", () => {
    const p = initPipeline("F1");
    setStoryStatus(p, "S1", "designing");
    expect(() => withdrawStoryGate(p, "S1", { approver: "po", at: AT, reason: "x" })).toThrow(/no gate/);
  });

  it("design-ahead with gates: S2 surfaces + approves while S1 builds", () => {
    const p = initPipeline("F1");
    surfaceForGate(p, "S1");
    approveStoryGate(p, "S1", { approver: "po", at: AT });
    dispatchNext(p); // S1 building
    // design lane finishes S2 and the PO approves its gate while S1 builds:
    surfaceForGate(p, "S2");
    approveStoryGate(p, "S2", { approver: "po", at: AT });
    expect(p.build_active).toBe("S1"); // S1 keeps building
    expect(p.build_queue).toEqual(["S2"]); // S2 gated + queued, waiting
    expect(getStoryGate(p, "S1").status).toBe("approved"); // S1 gate intact
    completeActive(p);
    expect(dispatchNext(p)).toBe("S2");
  });

  it("a gated pipeline write/read roundtrips + validates against the schema", () => {
    const tdd = mkTdd();
    const validate = getValidator("story-pipeline.schema.json");
    const p = initPipeline("F1-initial-domain");
    surfaceForGate(p, "S1-submit");
    approveStoryGate(p, "S1-submit", { approver: "po@example", at: AT, spec_hash: "deadbeef" });
    dispatchNext(p);
    surfaceForGate(p, "S2-owner"); // awaiting-gate, open
    expect(validate(p)).toBe(true);
    writePipeline(tdd, p);
    expect(readPipeline(tdd, "F1-initial-domain")).toEqual(p);
  });
});

describe("story-pipeline: per-story experiment + PO acceptance", () => {
  const AT = "2026-06-07T13:00:00.000Z";

  // Set up a story dispatched to the build lane, on its experiment branch.
  function building(): ReturnType<typeof initPipeline> {
    const p = initPipeline("F1");
    surfaceForGate(p, "S1");
    approveStoryGate(p, "S1", { approver: "po", at: AT });
    dispatchNext(p); // S1 building, build_active = S1
    cutStoryExperiment(p, "S1", {
      slug: "s1-exp",
      branch: "exp/F1/S1-exp",
      parent: "feature/F1",
      parent_sha: "abc1234",
      at: AT,
    });
    return p;
  }

  it("cutStoryExperiment records the active experiment ref on the dispatched story", () => {
    const p = building();
    expect(p.stories.S1.experiment).toEqual({
      slug: "s1-exp",
      branch: "exp/F1/S1-exp",
      parent: "feature/F1",
      parent_sha: "abc1234",
      n: 1,
      status: "active",
      cut_at: AT,
    });
  });

  it("cutStoryExperiment throws for an unknown story", () => {
    const p = initPipeline("F1");
    expect(() => cutStoryExperiment(p, "S9", { slug: "x", branch: "b", parent: "feature/F1" })).toThrow(/not in the pipeline/);
  });

  it("awaitAcceptance moves building -> awaiting-acceptance, keeping the lane occupied", () => {
    const p = building();
    awaitAcceptance(p, "S1");
    expect(p.stories.S1.status).toBe("awaiting-acceptance");
    expect(p.build_active).toBe("S1"); // lane stays occupied until the PO decides
    expect(getStoryAcceptance(p, "S1").decision).toBeNull();
  });

  it("acceptStory: merges the experiment, marks done, frees the lane", () => {
    const p = building();
    awaitAcceptance(p, "S1");
    acceptStory(p, "S1", { approver: "po", at: AT });
    expect(p.stories.S1.status).toBe("done");
    expect(p.stories.S1.experiment!.status).toBe("merged");
    expect(p.stories.S1.experiment!.closed_at).toBe(AT);
    expect(p.build_active).toBeNull(); // lane freed
    const acc = getStoryAcceptance(p, "S1");
    expect(acc.decision).toBe("accepted");
    expect(acc.history.map((h) => h.decision)).toEqual(["accepted"]);
  });

  it("discardStory: tears down the experiment, withdraws the spec gate, terminal discarded, frees the lane", () => {
    const p = building();
    awaitAcceptance(p, "S1");
    discardStory(p, "S1", { approver: "po", at: AT, reason: "PO does not want it" });
    expect(p.stories.S1.status).toBe("discarded");
    expect(p.stories.S1.experiment!.status).toBe("discarded");
    expect(getStoryGate(p, "S1").status).toBe("withdrawn");
    expect(getStoryGate(p, "S1").withdrawal_reason).toBe("PO does not want it");
    expect(getStoryAcceptance(p, "S1").decision).toBe("discarded");
    expect(p.build_active).toBeNull();
  });

  it("reviseStory: tears down the experiment, reopens the spec gate, back to designing, frees the lane", () => {
    const p = building();
    awaitAcceptance(p, "S1");
    reviseStory(p, "S1", { approver: "po", at: AT, reason: "close but needs rework" });
    expect(p.stories.S1.status).toBe("designing");
    expect(p.stories.S1.experiment!.status).toBe("discarded");
    expect(getStoryGate(p, "S1").status).toBe("open"); // reopened for a re-spec
    expect(getStoryAcceptance(p, "S1").decision).toBe("revise");
    expect(p.build_active).toBeNull();
  });

  it("accept/discard/revise throw for an unknown story", () => {
    const p = initPipeline("F1");
    expect(() => acceptStory(p, "S9", { approver: "po", at: AT })).toThrow(/not in the pipeline/);
    expect(() => discardStory(p, "S9", { approver: "po", at: AT, reason: "x" })).toThrow(/not in the pipeline/);
    expect(() => reviseStory(p, "S9", { approver: "po", at: AT, reason: "x" })).toThrow(/not in the pipeline/);
  });

  it("freeing the lane on a decision lets the next ready story dispatch", () => {
    const p = building();
    enqueueReady(p, "S2"); // S2 gated + queued while S1 builds
    awaitAcceptance(p, "S1");
    discardStory(p, "S1", { approver: "po", at: AT, reason: "no" });
    expect(dispatchNext(p)).toBe("S2"); // lane was freed, S2 dispatches
  });

  it("experiment + acceptance survive setStoryStatus, write/read roundtrip, and validate against the schema", () => {
    const tdd = mkTdd();
    const p = building();
    awaitAcceptance(p, "S1");
    acceptStory(p, "S1", { approver: "po@example", at: AT });
    setStoryStatus(p, "S1", "done"); // re-set status; experiment + acceptance must survive
    expect(p.stories.S1.experiment!.status).toBe("merged");
    expect(p.stories.S1.acceptance!.decision).toBe("accepted");
    expect(getValidator("story-pipeline.schema.json")(p)).toBe(true);
    writePipeline(tdd, p);
    expect(readPipeline(tdd, "F1")).toEqual(p);
  });
});

describe("story-pipeline: persistence + schema", () => {
  it("write/read roundtrips through .tdd/features/<F>/pipeline.json", () => {
    const tdd = mkTdd();
    const p = initPipeline("F1-initial-domain");
    enqueueReady(p, "S1");
    dispatchNext(p);
    writePipeline(tdd, p);
    expect(fs.existsSync(path.join(tdd, "features", "F1-initial-domain", "pipeline.json"))).toBe(true);
    expect(readPipeline(tdd, "F1-initial-domain")).toEqual(p);
  });

  it("readPipeline returns an empty pipeline when absent", () => {
    expect(readPipeline(mkTdd(), "F9-x")).toEqual(initPipeline("F9-x"));
  });

  it("a produced pipeline validates against story-pipeline.schema.json", () => {
    const validate = getValidator("story-pipeline.schema.json");
    const p = initPipeline("F1-initial-domain");
    enqueueReady(p, "S1-submit");
    enqueueReady(p, "S2-owner");
    dispatchNext(p);
    expect(validate(p)).toBe(true);
  });
});

describe("writePipeline keeps the per-feature pipeline.json TRACKED (durable ledger — never untracks it)", () => {
  const git = (dir: string, args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });

  it("leaves a committed pipeline.json tracked on write (regression guard: a prior self-heal untracked it, losing the ledger across sessions)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-track-"));
    tmpDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@e.com"]);
    git(root, ["config", "user.name", "t"]);
    const consortDir = path.join(root, ".consort");
    fs.mkdirSync(consortDir, { recursive: true });

    // The durable ledger is tracked by design (persists across sessions / clones / checkouts).
    writePipeline(consortDir, initPipeline("F1"));
    const rel = path.relative(root, path.join(consortDir, "features", "F1", "pipeline.json"));
    git(root, ["add", rel]);
    git(root, ["commit", "-m", "ledger committed"]);
    const tracked = () => execFileSync("git", ["ls-files", "--", rel], { cwd: root, encoding: "utf8" }).trim();
    expect(tracked()).not.toBe(""); // tracked

    // A subsequent write must NOT untrack it, and must NOT gitignore it — it stays a tracked ledger.
    writePipeline(consortDir, setStoryStatus(initPipeline("F1"), "S1", "designing"));
    expect(tracked()).not.toBe(""); // STILL tracked after the write
    const gi = fs.existsSync(path.join(root, ".gitignore")) ? fs.readFileSync(path.join(root, ".gitignore"), "utf8") : "";
    expect(gi).not.toContain("pipeline.json"); // write never adds a gitignore entry
  });

  it("writes the ledger without throwing outside a git repo", () => {
    const consortDir = path.join(mkTdd(), ".consort");
    fs.mkdirSync(consortDir, { recursive: true });
    expect(() => writePipeline(consortDir, initPipeline("F1"))).not.toThrow();
    expect(fs.existsSync(path.join(consortDir, "features", "F1", "pipeline.json"))).toBe(true);
  });
});
