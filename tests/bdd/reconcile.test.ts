// Feature-complete symmetric cross-story reconciliation gate (consort/smells/reconcile.ts): the
// Navigator's feature-scoped reconcile turn writes a verdict whose findings each name the OWNING story;
// recordReconcileGate flags that story's per-owner reflect smell (reopening it via the revise-route),
// and reconcilePassed gates design-complete on NO blocking cross-story defect.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  writeReconcileVerdict,
  readReconcileVerdict,
  clearReconcileVerdict,
  reconcilePassed,
  recordReconcileGate,
} from "../../consort/smells/reconcile.js";
import { readSmellsLog } from "../../consort/smells/smells.js";

const F = "F1";
const tmpDirs: string[] = [];
function mk(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-"));
  tmpDirs.push(d);
  return d;
}
const openSmells = (dir: string) => readSmellsLog(dir).detected.filter((d) => !d.resolution);
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

describe("reconcile verdict round-trip + reconcilePassed", () => {
  it("passed:true (no findings) ⇒ reconcilePassed true", () => {
    const dir = mk();
    writeReconcileVerdict(dir, F, { version: 1, passed: true, findings: [] });
    expect(readReconcileVerdict(dir, F)?.passed).toBe(true);
    expect(reconcilePassed(dir, F)).toBe(true);
  });

  it("absent verdict ⇒ not passed (the lane runs the reconcile turn)", () => {
    expect(reconcilePassed(mk(), F)).toBe(false);
  });

  it("a BLOCKING finding ⇒ not passed; advisory-only ⇒ passed (no re-invoke loop)", () => {
    const dir = mk();
    writeReconcileVerdict(dir, F, { version: 1, passed: false, findings: [{ owner: "spec-author", story: "S1", detail: "x", severity: "blocking" }] });
    expect(reconcilePassed(dir, F)).toBe(false);
    writeReconcileVerdict(dir, F, { version: 1, passed: false, findings: [{ owner: "spec-author", story: "S1", detail: "nit", severity: "advisory" }] });
    expect(reconcilePassed(dir, F)).toBe(true);
  });

  it("clearReconcileVerdict removes it (so a revise re-runs the pass)", () => {
    const dir = mk();
    writeReconcileVerdict(dir, F, { version: 1, passed: true, findings: [] });
    clearReconcileVerdict(dir, F);
    expect(readReconcileVerdict(dir, F)).toBeUndefined();
  });
});

describe("recordReconcileGate", () => {
  it("flags each blocking finding's per-owner reflect smell SCOPED to its OWNING story", () => {
    const dir = mk();
    writeReconcileVerdict(dir, F, {
      version: 1,
      passed: false,
      findings: [
        { owner: "spec-author", story: "S1-file", detail: "S1 AC contradicts S3's gated AC", ac_ids: ["AC3-x"], severity: "blocking" },
        { owner: "architect-reviewer", story: "S2-table", detail: "invariant anchored to the wrong story", severity: "blocking" },
      ],
    });
    const hits = recordReconcileGate(dir, F);
    expect(hits).toHaveLength(2);
    const byStory = Object.fromEntries(hits.map((h) => [h.story_id, h.smell]));
    expect(byStory["S1-file"]).toBe("reflect-spec-defect");
    expect(byStory["S2-table"]).toBe("reflect-architecture-defect");
    // the owning story's smell carries the flagged ac_ids for the scoped re-author
    expect(hits.find((h) => h.story_id === "S1-file")?.ac_ids).toEqual(["AC3-x"]);
    expect(openSmells(dir)).toHaveLength(2);
  });

  it("a passing verdict flags nothing + drains lingering reflect smells", () => {
    const dir = mk();
    // a blocking verdict first (opens a smell), then a passing re-run clears it
    writeReconcileVerdict(dir, F, { version: 1, passed: false, findings: [{ owner: "spec-author", story: "S1", detail: "x", severity: "blocking" }] });
    recordReconcileGate(dir, F);
    expect(openSmells(dir)).toHaveLength(1);
    writeReconcileVerdict(dir, F, { version: 1, passed: true, findings: [] });
    expect(recordReconcileGate(dir, F)).toEqual([]);
    expect(openSmells(dir)).toHaveLength(0);
  });

  it("is idempotent: a re-run against the same blocking verdict does not duplicate the open smell", () => {
    const dir = mk();
    writeReconcileVerdict(dir, F, { version: 1, passed: false, findings: [{ owner: "test-strategist", story: "S2", detail: "overlap", severity: "blocking" }] });
    recordReconcileGate(dir, F);
    recordReconcileGate(dir, F);
    expect(openSmells(dir)).toHaveLength(1);
  });
});
