// G10: cross-cutting acceptance tests for the gates state
// machine track (ADR-0004).
//
// ADR-0004 test plan defines TWO acceptance tiers beyond the gate
// machine's own unit tests:
//
//   Stage 11 [product]: feature-specific behavioral checks against a
//     hypothetical F-AUDIT feature (per-branch migration audit log,
//     lakebase-audit CLI bin, etc.). DEFERRED in this PR because F-AUDIT
//     is a test-plan example, not actually built. When a real feature on
//     the gates substrate ships, that feature's own product tests cover
//     this tier. The gates substrate is feature-agnostic, so there is
//     nothing in scripts/sftdd/ to assert against here.
//
//   Stage 12 [cross-cutting]: structural assertions that the
//     machinery the orchestrator depends on actually fires. This file
//     ships those: smells detector firing on test-deletion attempts,
//     test-list coverage rules, gate-integrity wired correctly into a
//     test-list mutation attempt.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { approveGate } from "../../consort/gates/approve-gate";
import { resolveArtifactInputs } from "../../consort/gates/gate-conformance-guard";
import { verifyGateIntegrity } from "../../consort/gates/verify-gate-integrity";
import { withdrawGate } from "../../consort/gates/withdraw-gate";
import {
  beginCycle,
  flagSmells,
  type CycleScope,
} from "../../consort/pipeline/run-cycle";
import {
  detectTestDeletionAttempt,
  readSmellsLog,
  runDetectorsForScope,
  writeSmellsLog,
} from "../../consort/smells/smells";
import {
  readMasterTestList,
  writeMasterTestList,
  viewsForAllAcs,
  type TestList,
} from "../../consort/test-list/test-list";
import { flagTestListGateDriftIfAny } from "../../consort/pipeline/cycle-record";
import { featureResolved } from "../../consort/config/consort-paths";

let tdd: string;
const FEATURE_ID = "F1-checkout";
const APPROVER = "po@example.com";
const FIXED_NOW = () => new Date("2026-05-31T20:00:00Z");

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeAcDir(storyId: string, acId: string): void {
  const dir = join(tdd, "features", FEATURE_ID, "stories", storyId, "acs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${acId}.json`),
    JSON.stringify({ id: acId, given: "", when: "", then: "", status: "draft", story_id: storyId })
  );
}

function makeScope(): CycleScope {
  return {
    consortDir: tdd,
    feature_id: FEATURE_ID,
    story_id: "S1",
    ac_id: "AC1",
    experiment_slug: "checkout",
    branch_id: "f1-checkout",
  };
}

const BASELINE_TEST_LIST: TestList = {
  feature_id: FEATURE_ID,
  ordered_for: "design-momentum",
  items: [
    { id: "T1", description: "POST /orders returns 201 on valid cart", ac_id: "AC1", status: "pending" },
    { id: "T2", description: "POST /orders rejects empty cart with 400", ac_id: "AC1", status: "pending" },
  ],
};

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-gates-xcut-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("gates cross-cutting: smells detector wiring", () => {
  it("Navigator's flagSmells -> detectTestDeletionAttempt -> smells.json", () => {
    makeFeatureDir();
    const scope = makeScope();
    const cycle = beginCycle({
      ...scope,
      test_id: "T1",
      test_description: "POST /orders returns 201",
      navigator_plan: "exercise the API boundary",
    });
    flagSmells(scope, cycle.cycle_id, ["test-deletion-attempt"]);

    const hits = detectTestDeletionAttempt({
      scope,
      cycles: [
        {
          cycle_id: cycle.cycle_id,
          feature_id: FEATURE_ID,
          story_id: "S1",
          ac_id: "AC1",
          test_id: "T1",
          test_description: "POST /orders returns 201",
          smell_flags: ["test-deletion-attempt"],
        },
      ],
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].smell).toBe("test-deletion-attempt");

    writeSmellsLog(tdd, hits);
    const log = readSmellsLog(tdd);
    expect(log.detected.length).toBeGreaterThan(0);
    expect(log.detected[0].smell).toBe("test-deletion-attempt");
    expect(log.detected[0].cycle_ids).toContain(cycle.cycle_id);
  });

  it("runDetectorsForScope: no detectors fire on a clean cycle (no false positives)", () => {
    makeFeatureDir();
    const scope = makeScope();
    beginCycle({
      ...scope,
      test_id: "T1",
      test_description: "POST /orders returns 201",
      navigator_plan: "exercise the API boundary",
    });
    // A fresh cycle with no smell_flags should produce zero detector hits.
    const hits = runDetectorsForScope(tdd, scope);
    expect(hits).toEqual([]);
  });
});

describe("gates cross-cutting: test-list / AC coverage rules", () => {
  it("every TestListItem references an AC that exists in the feature tree", () => {
    makeFeatureDir();
    makeAcDir("S1", "AC1");
    writeMasterTestList(tdd, BASELINE_TEST_LIST);

    const list = readMasterTestList(tdd, FEATURE_ID);
    const knownAcIds = new Set(["AC1"]);
    for (const item of list.items) {
      expect(knownAcIds.has(item.ac_id)).toBe(true);
    }
  });

  it("viewsForAllAcs groups items per AC for the Test Strategist's per-AC views", () => {
    makeFeatureDir();
    makeAcDir("S1", "AC1");
    writeMasterTestList(tdd, BASELINE_TEST_LIST);
    const list = readMasterTestList(tdd, FEATURE_ID);
    const views = viewsForAllAcs(list);
    expect(Object.keys(views)).toEqual(["AC1"]);
    expect(views.AC1.items).toHaveLength(2);
  });

  it("test_list gate BLOCKS when a later story re-tests an invariant an earlier story covers (persistence passes, distinct fails)", () => {
    const fdir = makeFeatureDir();
    makeAcDir("S1-view-stock", "AC1");
    makeAcDir("S2-view-sku-detail", "AC2");
    // Architecture declares ONE invariant + is service-backed, so persistence
    // coverage runs (and passes, PI1 IS covered) BEFORE the distinct check fires.
    writeFileSync(
      join(fdir, "architecture.json"),
      JSON.stringify({
        feature_id: FEATURE_ID,
        nfrs: [],
        service_backed: true,
        layers: [{ role: "repository", module: "app/repositories" }],
        persistence_invariants: [{ id: "PI1-sku-location-unique", type: "unique", table: "stock", brief: "duplicate (sku, location) rejected" }],
      })
    );
    // S1's AC1 covers PI1; S2's AC2 re-covers the SAME PI1 (the redundant re-test).
    writeMasterTestList(tdd, {
      feature_id: FEATURE_ID,
      ordered_for: "design-momentum",
      items: [
        { id: "T1", description: "GET /stock lists records", ac_id: "AC1", status: "pending", kind: "behavior" },
        { id: "T2", description: "duplicate (sku, location) insert rejected against the branch", ac_id: "AC1", status: "pending", kind: "fitness", invariant_id: "PI1-sku-location-unique" },
        { id: "T3", description: "GET /sku/:id shows detail", ac_id: "AC2", status: "pending", kind: "behavior" },
        { id: "T4", description: "duplicate (sku, location) insert rejected against the branch", ac_id: "AC2", status: "pending", kind: "fitness", invariant_id: "PI1-sku-location-unique" },
      ],
    });

    const res = resolveArtifactInputs("test_list", fdir, undefined, tdd, FEATURE_ID);
    expect("reason" in res).toBe(true);
    if ("reason" in res) {
      expect(res.reason).toMatch(/invariant coverage not distinct/);
      expect(res.reason).toMatch(/PI1-sku-location-unique/);
      expect(res.reason).toMatch(/S2-view-sku-detail re-tests/);
    }
  });

  it("orphaned test (ac_id pointing at a non-existent AC) surfaces as a coverage gap", () => {
    makeFeatureDir();
    makeAcDir("S1", "AC1");
    const orphaned: TestList = {
      ...BASELINE_TEST_LIST,
      items: [
        { id: "T1", description: "real", ac_id: "AC1", status: "pending" },
        { id: "T9", description: "orphan", ac_id: "AC-DOES-NOT-EXIST", status: "pending" },
      ],
    };
    writeMasterTestList(tdd, orphaned);
    const list = readMasterTestList(tdd, FEATURE_ID);
    const knownAcIds = new Set(["AC1"]);
    const orphans = list.items.filter((it) => !knownAcIds.has(it.ac_id));
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe("T9");
  });
});

describe("gates cross-cutting: test_list gate integrity catches test mutations", () => {
  it("approveGate(test_list) -> mutation -> verifyGateIntegrity returns drift", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASELINE_TEST_LIST);

    const baselineJson = JSON.stringify(BASELINE_TEST_LIST);
    approveGate({
      featureId: FEATURE_ID,
      gate: "test_list",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "test-list.json": baselineJson },
      consortDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    // Simulate a test deletion: write the test list back with T2 removed.
    const mutated: TestList = {
      ...BASELINE_TEST_LIST,
      items: BASELINE_TEST_LIST.items.filter((it) => it.id !== "T2"),
    };
    writeMasterTestList(tdd, mutated);

    const v = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "test_list",
      currentInputs: { "test-list.json": JSON.stringify(mutated) },
      consortDir: tdd,
    });
    expect(v.status).toBe("drift");
    if (v.status !== "drift") return;
    expect(v.drifts.map((d) => d.artifact)).toContain("test-list.json");
  });

  it("orchestrator pattern: drift -> withdrawGate cascades + future approveGate refused on test_list (still withdrawn)", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASELINE_TEST_LIST);

    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "spec", "feature-spec.json": "{}" },
      consortDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    approveGate({
      featureId: FEATURE_ID,
      gate: "test_list",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "test-list.json": JSON.stringify(BASELINE_TEST_LIST) },
      consortDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    // Orchestrator sees drift on test_list -> withdraws test_list -> the
    // gate is then withdrawn and a subsequent approveGate on it throws
    // GateAlreadyClosedError (caller must re-issue against an open gate).
    withdrawGate({
      featureId: FEATURE_ID,
      gate: "test_list",
      approver: APPROVER,
      reason: "integrity drift: T2 removed",
      consortDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    expect(() =>
      approveGate({
        featureId: FEATURE_ID,
        gate: "test_list",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "test-list.json": JSON.stringify(BASELINE_TEST_LIST) },
        consortDir: tdd,
        now: FIXED_NOW,
        writeSelectionLog: false,
      })
    ).toThrow(/not open/);
  });
});

describe("gates cross-cutting: flagTestListGateDriftIfAny (RED-start gate-integrity backstop)", () => {
  // Seed the feature so resolveArtifactInputs('test_list') returns {inputs} (not {reason}):
  // AC1 must exist for the test-list items' ac_id refs to resolve.
  function seedApprovedTestList(): Record<string, string> {
    makeFeatureDir();
    makeAcDir("S1", "AC1");
    writeMasterTestList(tdd, BASELINE_TEST_LIST);
    const resolved = resolveArtifactInputs(
      "test_list",
      featureResolved(tdd, FEATURE_ID),
      undefined,
      tdd,
      FEATURE_ID
    );
    if (!("inputs" in resolved)) {
      throw new Error(`fixture: resolveArtifactInputs returned non-conformant: ${resolved.reason}`);
    }
    approveGate({
      featureId: FEATURE_ID,
      gate: "test_list",
      approver: APPROVER,
      hitlApproved: true,
      // Capture the SAME inputs the backstop later re-resolves, so the hashes match at approval.
      artifactInputs: resolved.inputs,
      consortDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    return resolved.inputs;
  }

  it("no-op on an unchanged, approved test_list (no drift smell)", () => {
    seedApprovedTestList();
    flagTestListGateDriftIfAny(tdd, FEATURE_ID, "S1");
    const log = readSmellsLog(tdd);
    expect(log.detected.some((d) => d.smell === "test-list-drift")).toBe(false);
  });

  it("flags test-list-drift when the frozen test-list was mutated on disk since approval", () => {
    seedApprovedTestList();
    // Mutate the gated list in-build (T2 removed) -> hashes diverge.
    writeMasterTestList(tdd, {
      ...BASELINE_TEST_LIST,
      items: BASELINE_TEST_LIST.items.filter((it) => it.id !== "T2"),
    });
    flagTestListGateDriftIfAny(tdd, FEATURE_ID, "S1");
    const log = readSmellsLog(tdd);
    const hit = log.detected.find((d) => d.smell === "test-list-drift");
    expect(hit).toBeDefined();
    expect(hit?.story_id).toBe("S1");
  });

  it("is idempotent: a second scan does not re-append the drift smell", () => {
    seedApprovedTestList();
    writeMasterTestList(tdd, {
      ...BASELINE_TEST_LIST,
      items: BASELINE_TEST_LIST.items.filter((it) => it.id !== "T2"),
    });
    flagTestListGateDriftIfAny(tdd, FEATURE_ID, "S1");
    flagTestListGateDriftIfAny(tdd, FEATURE_ID, "S1");
    const log = readSmellsLog(tdd);
    expect(log.detected.filter((d) => d.smell === "test-list-drift")).toHaveLength(1);
  });

  it("no-op when the test_list gate was never approved (nothing to verify)", () => {
    makeFeatureDir();
    makeAcDir("S1", "AC1");
    writeMasterTestList(tdd, BASELINE_TEST_LIST);
    // No approveGate call -> no captured hashes.
    flagTestListGateDriftIfAny(tdd, FEATURE_ID, "S1");
    const log = readSmellsLog(tdd);
    expect(log.detected.some((d) => d.smell === "test-list-drift")).toBe(false);
  });
});
