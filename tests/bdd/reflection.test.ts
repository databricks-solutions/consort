// Pre-build reflection gate (#3): the per-story verdict artifact + the
// deterministic gate that turns a failed verdict into the routed spec-level
// smell. Routing/bound/escalation itself is the existing revise-route machinery
// (tested elsewhere); here we prove the verdict I/O + the smell attribution +
// per-story isolation.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  writeReflectVerdict,
  readReflectVerdict,
  reflectionPassed,
  reflectionVerdictWritten,
  recordReflectionGate,
  clearReflectVerdict,
} from "../../consort/smells/reflection.js";

let tdd: string;
const F = "F1";
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "reflection-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

const smellsLog = (): {
  detected: Array<{ smell: string; story_id?: string; detail: string; resolution?: string; resolution_kind?: string }>;
} => {
  const p = join(tdd, "smells.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { detected: [] };
};

describe("reflect verdict I/O + reflectionPassed", () => {
  it("round-trips a verdict and reports passed only on passed:true", () => {
    expect(readReflectVerdict(tdd, F, "S1")).toBeUndefined();
    expect(reflectionPassed(tdd, F, "S1")).toBe(false); // absent -> not passed

    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: true, findings: [] });
    expect(readReflectVerdict(tdd, F, "S1")?.passed).toBe(true);
    expect(reflectionPassed(tdd, F, "S1")).toBe(true);

    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "spec-author", detail: "AC1 and AC2 contradict" }],
    });
    expect(reflectionPassed(tdd, F, "S1")).toBe(false);
  });
});

describe("recordReflectionGate: failed verdict -> routed spec-level smell(s)", () => {
  it("a passed verdict flags nothing", () => {
    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: true, findings: [] });
    expect(recordReflectionGate(tdd, F, "S1")).toEqual([]);
    expect(smellsLog().detected).toHaveLength(0);
  });

  it("an absent verdict flags nothing", () => {
    expect(recordReflectionGate(tdd, F, "S1")).toEqual([]);
  });

  it("a spec-author finding flags reflect-spec-defect scoped to the story", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "spec-author", detail: "AC1 and AC2 contradict" }],
    });
    const hits = recordReflectionGate(tdd, F, "S1");
    expect(hits.map((h) => h.smell)).toEqual(["reflect-spec-defect"]);
    const rows = smellsLog().detected;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ smell: "reflect-spec-defect", story_id: "S1" });
    expect(rows[0].detail).toContain("AC1 and AC2 contradict");
  });

  it("a test-strategist finding flags reflect-testlist-defect", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "test-strategist", detail: "AC3 has no covering test" }],
    });
    expect(recordReflectionGate(tdd, F, "S1").map((h) => h.smell)).toEqual(["reflect-testlist-defect"]);
  });

  it("an architect-reviewer finding flags reflect-architecture-defect (routes to the architect)", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "architect-reviewer", detail: "PI2 not_null on tracking_code, which the feature-request renders when absent" }],
    });
    expect(recordReflectionGate(tdd, F, "S1").map((h) => h.smell)).toEqual(["reflect-architecture-defect"]);
  });

  it("a ux-designer finding flags reflect-ia-defect (routes to the ux ia refinement)", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "ux-designer", detail: "AC1 (E2E) asserts a file-stock form that ia.md does not name" }],
    });
    expect(recordReflectionGate(tdd, F, "S1").map((h) => h.smell)).toEqual(["reflect-ia-defect"]);
  });

  it("mixed findings flag ONE smell per owner (both authors)", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [
        { owner: "spec-author", detail: "vacuous AC" },
        { owner: "test-strategist", detail: "missing fitness test" },
        { owner: "spec-author", detail: "layer conflict" },
      ],
    });
    const smells = recordReflectionGate(tdd, F, "S1").map((h) => h.smell).sort();
    expect(smells).toEqual(["reflect-spec-defect", "reflect-testlist-defect"]);
    // the spec-defect detail aggregates BOTH spec-author findings
    const spec = smellsLog().detected.find((d) => d.smell === "reflect-spec-defect");
    expect(spec?.detail).toContain("vacuous AC");
    expect(spec?.detail).toContain("layer conflict");
  });

  it("a failed verdict with NO attributed owner still blocks (defaults to spec-author)", () => {
    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: false, findings: [] });
    expect(recordReflectionGate(tdd, F, "S1").map((h) => h.smell)).toEqual(["reflect-spec-defect"]);
  });

  it("is per-story isolated: S2's defect does not touch S1", () => {
    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: true, findings: [] });
    writeReflectVerdict(tdd, F, "S2", {
      version: 1,
      passed: false,
      findings: [{ owner: "spec-author", detail: "S2 contradiction" }],
    });
    recordReflectionGate(tdd, F, "S1"); // passes -> nothing
    recordReflectionGate(tdd, F, "S2"); // fails -> one S2-scoped smell
    const rows = smellsLog().detected;
    expect(rows).toHaveLength(1);
    expect(rows[0].story_id).toBe("S2");
    // S1 still reads as passed, unaffected by S2.
    expect(reflectionPassed(tdd, F, "S1")).toBe(true);
  });
});

// Finding 9: the reflect gate must be idempotent + self-clearing, and a revise
// must invalidate the stale verdict, so a flagged defect converges (route to the
// owning author -> re-author -> recompute fresh -> pass) instead of looping the
// Navigator against a stale verdict until the generic stall guard bails, and so
// the smell log does not accumulate duplicate open entries.
describe("recordReflectionGate: idempotent + self-clearing (Finding 9)", () => {
  const S = "S1";
  const failVerdict = () =>
    writeReflectVerdict(tdd, F, S, {
      version: 1,
      passed: false,
      findings: [{ owner: "test-strategist", detail: "T1/AC1 routed to the wrong suite" }],
    });
  const openRows = () => smellsLog().detected.filter((d) => !d.resolution);

  it("re-running against the SAME failing verdict does NOT pile up duplicate open smells", () => {
    failVerdict();
    const first = recordReflectionGate(tdd, F, S);
    const second = recordReflectionGate(tdd, F, S);
    const third = recordReflectionGate(tdd, F, S);
    // The defect is still reported each pass (for logging), but only ONE open
    // smell exists – the accumulation the field hit (2+ identical entries) is gone.
    expect(first.map((h) => h.smell)).toEqual(["reflect-testlist-defect"]);
    expect(second.map((h) => h.smell)).toEqual(["reflect-testlist-defect"]);
    expect(third.map((h) => h.smell)).toEqual(["reflect-testlist-defect"]);
    expect(openRows()).toHaveLength(1);
  });

  it("a now-PASSING verdict CLEARS the open reflect smell(s) from an earlier failed pass", () => {
    failVerdict();
    recordReflectionGate(tdd, F, S);
    expect(openRows()).toHaveLength(1);
    // The Navigator re-evaluated the corrected test-list and it now passes.
    writeReflectVerdict(tdd, F, S, { version: 1, passed: true, findings: [] });
    expect(recordReflectionGate(tdd, F, S)).toEqual([]);
    // No open reflect smell lingers to block the gate; the entry is resolved.
    expect(openRows()).toHaveLength(0);
    const resolved = smellsLog().detected as Array<{ resolution?: string; resolution_kind?: string }>;
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolution_kind).toBe("cleared");
  });

  it("clearing on pass does not spend the revise budget (resolution_kind is 'cleared', not 'revised')", async () => {
    const { priorReviseCount } = await import("../../consort/smells/smells.js");
    failVerdict();
    recordReflectionGate(tdd, F, S);
    writeReflectVerdict(tdd, F, S, { version: 1, passed: true, findings: [] });
    recordReflectionGate(tdd, F, S);
    expect(priorReviseCount(tdd, "reflect-testlist-defect", S)).toBe(0);
  });
});

describe("clearReflectVerdict: invalidate the stale verdict on re-dispatch (Finding 9)", () => {
  it("deletes the verdict so a re-dispatched reflect turn recomputes fresh (no stale reuse)", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "test-strategist", detail: "stale finding" }],
    });
    expect(reflectionVerdictWritten(tdd, F, "S1")).toBe(true);
    clearReflectVerdict(tdd, F, "S1");
    // Both the "written" and "passed" probes now read false: the design lane
    // re-dispatches the Navigator, which recomputes against the corrected
    // artifacts instead of reusing the old passed:false verdict.
    expect(reflectionVerdictWritten(tdd, F, "S1")).toBe(false);
    expect(reflectionPassed(tdd, F, "S1")).toBe(false);
    expect(readReflectVerdict(tdd, F, "S1")).toBeUndefined();
  });

  it("is idempotent (no-op when no verdict exists)", () => {
    expect(() => clearReflectVerdict(tdd, F, "S9")).not.toThrow();
  });
});
