// BDD coverage for the design-reflect convergence bound (issue #201):
//  - findings carry severity; the gate blocks ONLY on blocking findings, so a
//    verdict of pure marginal nitpicks never spends a revise lap;
//  - an unrecorded severity (a verdict from an older kit) is fail-safe BLOCKING;
//  - the revise budget counts LAPS (one per co-heal pass), not resolved entries;
//  - writeSmellsLog preserves the lap counter across appends.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  recordReflectionGate,
  writeReflectVerdict,
  type ReflectVerdict,
} from "../../consort/smells/reflection.js";
import {
  bumpReflectReviseCount,
  priorReflectReviseCount,
  readSmellsLog,
  resolveOpenReflectSmellsForStory,
  writeSmellsLog,
  REFLECT_REVISE_CAP,
} from "../../consort/smells/smells.js";

const tmpDirs: string[] = [];
function mkConsort(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reflect-convergence-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

const F = "F1";
const S = "S3";

function verdict(findings: ReflectVerdict["findings"]): ReflectVerdict {
  return { version: 1, passed: false, findings };
}

describe("recordReflectionGate: severity split (issue #201)", () => {
  it("a verdict of PURE ADVISORY findings passes the gate (no smell, no revise spent)", () => {
    const consortDir = mkConsort();
    writeReflectVerdict(consortDir, F, S, verdict([
      { owner: "test-strategist", detail: "could add a boundary-case test", severity: "advisory" },
      { owner: "spec-author", detail: "AC could be worded more tightly", severity: "advisory" },
    ]));
    const hits = recordReflectionGate(consortDir, F, S);
    expect(hits).toEqual([]);
    expect(readSmellsLog(consortDir).detected).toHaveLength(0);
  });

  it("a MIXED verdict blocks on the BLOCKING owner only (advisories stay out of the smell)", () => {
    const consortDir = mkConsort();
    writeReflectVerdict(consortDir, F, S, verdict([
      { owner: "spec-author", detail: "AC3 contradicts gated sibling AC1 on the actor field", severity: "blocking" },
      { owner: "spec-author", detail: "AC2 could be worded more tightly", severity: "advisory" },
      { owner: "test-strategist", detail: "nice-to-have boundary test", severity: "advisory" },
    ]));
    const hits = recordReflectionGate(consortDir, F, S);
    expect(hits).toHaveLength(1);
    expect(hits[0].smell).toBe("reflect-spec-defect");
    expect(hits[0].detail).toMatch(/actor field/);
    expect(hits[0].detail).not.toMatch(/worded more tightly/);
  });

  it("an UNRECORDED severity (a verdict from an older kit) is fail-safe BLOCKING", () => {
    const consortDir = mkConsort();
    writeReflectVerdict(consortDir, F, S, verdict([
      { owner: "test-strategist", detail: "legacy finding with no severity recorded" } as ReflectVerdict["findings"][number],
    ]));
    const hits = recordReflectionGate(consortDir, F, S);
    expect(hits).toHaveLength(1);
    expect(hits[0].smell).toBe("reflect-testlist-defect");
  });
});

describe("the revise budget counts LAPS, not resolved entries", () => {
  it("one co-heal pass over MULTIPLE smells costs exactly ONE lap", () => {
    const consortDir = mkConsort();
    // Two open reflect smells (both owners), resolved in a single co-heal pass.
    writeReflectVerdict(consortDir, F, S, verdict([
      { owner: "spec-author", detail: "spec defect", severity: "blocking" },
      { owner: "test-strategist", detail: "test-list defect", severity: "blocking" },
    ]));
    recordReflectionGate(consortDir, F, S);
    expect(readSmellsLog(consortDir).detected).toHaveLength(2);

    // Production order (revise.ts): bump FIRST (seeds from PRE-lap revised entries),
    // then resolve the open smells – so one pass costs exactly one lap.
    bumpReflectReviseCount(consortDir, S);
    resolveOpenReflectSmellsForStory(consortDir, S, "revised: full design re-run", "sha1");

    expect(priorReflectReviseCount(consortDir, S)).toBe(1);
  });

  it("a pre-counter log falls back to the legacy entry count, then SEEDS from it on first bump", () => {
    const consortDir = mkConsort();
    // Legacy: three resolved-as-revised entries from before the counter existed.
    writeSmellsLog(consortDir, [{ smell: "reflect-spec-defect", cycle_ids: [], detail: "x", story_id: S }]);
    resolveOpenReflectSmellsForStory(consortDir, S, "revised: lap 1");
    writeSmellsLog(consortDir, [{ smell: "reflect-testlist-defect", cycle_ids: [], detail: "y", story_id: S }]);
    writeSmellsLog(consortDir, [{ smell: "reflect-testlist-defect", cycle_ids: [], detail: "z", story_id: S }]);
    resolveOpenReflectSmellsForStory(consortDir, S, "revised: lap 2");
    // No bumps (counter absent) -> the entry figure (3) still bounds.
    expect(priorReflectReviseCount(consortDir, S)).toBe(3);
    // First bump SEEDS from the legacy figure, then increments: history preserved.
    bumpReflectReviseCount(consortDir, S);
    expect(priorReflectReviseCount(consortDir, S)).toBe(4);
  });

  it("REFLECT_REVISE_CAP laps is the hard bound the probe reads", () => {
    const consortDir = mkConsort();
    writeSmellsLog(consortDir, [{ smell: "reflect-spec-defect", cycle_ids: [], detail: "x", story_id: S }]);
    for (let i = 0; i < REFLECT_REVISE_CAP; i++) bumpReflectReviseCount(consortDir, S);
    expect(priorReflectReviseCount(consortDir, S)).toBe(REFLECT_REVISE_CAP);
  });

  it("writeSmellsLog PRESERVES the lap counter across an append", () => {
    const consortDir = mkConsort();
    writeSmellsLog(consortDir, [{ smell: "reflect-spec-defect", cycle_ids: [], detail: "x", story_id: S }]);
    bumpReflectReviseCount(consortDir, S);
    writeSmellsLog(consortDir, [{ smell: "reflect-testlist-defect", cycle_ids: [], detail: "y", story_id: S }]);
    expect(readSmellsLog(consortDir).reflect_revise_count?.[S]).toBe(1);
  });
});
