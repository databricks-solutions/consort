import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFailedNodeIds,
  classifyDeployVerifyFailure,
  classifyDeployVerifySupersession,
  writeDeployVerifyAssessMarker,
  readDeployVerifyAssessMarker,
  markDeployVerifyAssessed,
  markDeployVerifyRefactored,
  deployVerifyRefactorPending,
  clearDeployVerifyAssessMarker,
  deployVerifyNeedsAssess,
} from "../../consort/smells/deploy-verify-assess";
import { DEFAULT_MIGRATION_DIRS } from "../../consort/architecture/test-smell-clean";

const FEATURE = "F6-split-tracking-code";
const STORY = "S3-view-batch-and-serial";
let consortDir: string;

beforeEach(() => {
  consortDir = mkdtempSync(join(tmpdir(), "dv-assess-"));
  // findFeatureDir resolves by prefix under <consortDir>/features.
  mkdirSync(join(consortDir, "features", FEATURE, "stories", STORY), { recursive: true });
});
afterEach(() => rmSync(consortDir, { recursive: true, force: true }));

describe("parseFailedNodeIds", () => {
  it("pulls the pytest FAILED/ERROR node-ids from the short summary", () => {
    const out = [
      "=========================== short test summary info ============================",
      "FAILED tests/step_defs/test_S2_integrity_probe.py::test_reports_zero",
      "FAILED tests/step_defs/test_S2_integrity_probe.py::test_counts_two",
      "ERROR tests/step_defs/test_S2_integrity_probe.py::test_partial",
      "============ 3 failed, 41 passed in 94s ============",
    ].join("\n");
    expect(parseFailedNodeIds(out)).toEqual([
      "tests/step_defs/test_S2_integrity_probe.py::test_reports_zero",
      "tests/step_defs/test_S2_integrity_probe.py::test_counts_two",
      "tests/step_defs/test_S2_integrity_probe.py::test_partial",
    ]);
  });

  it("dedupes and returns [] when there is no summary", () => {
    expect(parseFailedNodeIds("all good, 44 passed")).toEqual([]);
    const dup = "FAILED a.py::t\nFAILED a.py::t";
    expect(parseFailedNodeIds(dup)).toEqual(["a.py::t"]);
  });
});

describe("classifyDeployVerifyFailure", () => {
  it("pass-in-isolation => contamination (self-healable)", async () => {
    const verdict = await classifyDeployVerifyFailure(["a.py::t"], async () => true);
    expect(verdict).toBe("contamination");
  });
  it("still-fails-in-isolation => genuine (terminal HIL)", async () => {
    const verdict = await classifyDeployVerifyFailure(["a.py::t"], async () => false);
    expect(verdict).toBe("genuine");
  });
  it("no parseable node-ids => genuine (nothing to isolate)", async () => {
    let called = false;
    const verdict = await classifyDeployVerifyFailure([], async () => {
      called = true;
      return true;
    });
    expect(verdict).toBe("genuine");
    expect(called).toBe(false);
  });
});

describe("classifyDeployVerifySupersession (dropped-column references)", () => {
  // A contract migration DROPs tracking_code; a prior-story test still reads it.
  function seedDroppedColumnProject(dir: string): void {
    mkdirSync(join(dir, "alembic", "versions"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(
      join(dir, "alembic", "versions", "0002_contract.py"),
      [
        "def upgrade():",
        "    op.drop_column('stock_records', 'tracking_code')",
        "",
        "def downgrade():",
        "    op.add_column('stock_records', sa.Column('tracking_code', sa.String()))",
        "",
      ].join("\n"),
    );
    // Superseded: reads the dropped column as an ORM attribute (fails at HEAD).
    writeFileSync(
      join(dir, "tests", "test_listing.py"),
      ["def test_sc5(row):", "    assert row.tracking_code is None", ""].join("\n"),
    );
    // NOT superseded: references only a surviving column.
    writeFileSync(
      join(dir, "tests", "test_other.py"),
      ["def test_ok(row):", "    assert row.sku == 'A1'", ""].join("\n"),
    );
  }

  it("flags node-ids whose test file references a contract-dropped column", () => {
    const dir = mkdtempSync(join(tmpdir(), "dv-superseded-"));
    try {
      seedDroppedColumnProject(dir);
      const superseded = classifyDeployVerifySupersession(
        ["tests/test_listing.py::test_sc5", "tests/test_other.py::test_ok"],
        dir,
        DEFAULT_MIGRATION_DIRS,
      );
      expect(superseded).toEqual(["tests/test_listing.py::test_sc5"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns [] when no columns were dropped (nothing superseded)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dv-nodrop-"));
    try {
      mkdirSync(join(dir, "tests"), { recursive: true });
      writeFileSync(join(dir, "tests", "test_listing.py"), "def test(row):\n    assert row.tracking_code is None\n");
      expect(
        classifyDeployVerifySupersession(["tests/test_listing.py::test"], dir, DEFAULT_MIGRATION_DIRS),
      ).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes a supersession marker carrying the dropped columns", () => {
    const ids = ["tests/test_listing.py::test_sc5"];
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, ids, {
      kind: "supersession",
      droppedColumns: ["tracking_code"],
    });
    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m?.kind).toBe("supersession");
    expect(m?.dropped_columns).toEqual(["tracking_code"]);
    expect(m?.failing_node_ids).toEqual(ids);
    // Same one-shot route as contamination: assess-eligible on first detection.
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, STORY)).toBe(true);
  });

  it("a contamination marker omits the supersession fields (byte-identical default)", () => {
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, ["a.py::t"]);
    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m?.kind).toBeUndefined();
    expect(m?.dropped_columns).toBeUndefined();
  });
});

describe("deploy-verify-assess marker lifecycle (one-shot bound)", () => {
  it("write -> assess-eligible -> markAssessed spends the shot -> not eligible", () => {
    const ids = ["tests/step_defs/test_S2_integrity_probe.py::test_reports_zero"];
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, ids);

    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m?.failing_node_ids).toEqual(ids);
    expect(m?.assessed).toBe(false);
    expect(m?.attempts).toBe(0);
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, STORY)).toBe(true);

    markDeployVerifyAssessed(consortDir, FEATURE, STORY);
    const m2 = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m2?.assessed).toBe(true);
    expect(m2?.attempts).toBe(1);
    // The one shot is spent: a repeat deploy-verify failure now takes the HIL.
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, STORY)).toBe(false);
  });

  it("re-detecting the same failure preserves spent attempts (bound not reset)", () => {
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, ["a.py::t"]);
    markDeployVerifyAssessed(consortDir, FEATURE, STORY); // attempts -> 1
    // A second deploy re-detects contamination and rewrites the marker.
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, ["a.py::t"]);
    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m?.attempts).toBe(1); // preserved, so still NOT eligible
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, STORY)).toBe(false);
  });

  it("clear removes the marker (the scope worked, re-verify passed)", () => {
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, ["a.py::t"]);
    clearDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, STORY)).toBeUndefined();
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, STORY)).toBe(false);
  });
});

describe("deploy-verify SCOPE routing (assess -> driver scope -> re-deploy)", () => {
  const IDS = ["a.py::t1", "a.py::t2"];

  it("assess with a scope set -> refactor-pending; refactor -> not pending", () => {
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, IDS);
    // No scope set yet: assessed:false, so nothing to refactor.
    expect(deployVerifyRefactorPending(consortDir, FEATURE, STORY)).toBe(false);

    // The Navigator confirmed the scope set: assessed + flagged_tests recorded.
    markDeployVerifyAssessed(consortDir, FEATURE, STORY, IDS);
    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m?.assessed).toBe(true);
    expect(m?.flagged_tests).toEqual(IDS);
    // Eligible for the Driver SCOPE turn, and no longer for a fresh assess.
    expect(deployVerifyRefactorPending(consortDir, FEATURE, STORY)).toBe(true);
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, STORY)).toBe(false);

    // The Driver scoped the tests: no longer refactor-pending (the one re-deploy runs).
    markDeployVerifyRefactored(consortDir, FEATURE, STORY);
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, STORY)?.refactored).toBe(true);
    expect(deployVerifyRefactorPending(consortDir, FEATURE, STORY)).toBe(false);
  });

  it("assess with NO scope set (Navigator veto) -> never refactor-pending (routes HIL)", () => {
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, IDS);
    markDeployVerifyAssessed(consortDir, FEATURE, STORY); // no flagged_tests
    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m?.assessed).toBe(true);
    expect(m?.flagged_tests).toBeUndefined();
    expect(deployVerifyRefactorPending(consortDir, FEATURE, STORY)).toBe(false);
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, STORY)).toBe(false);
  });
});

describe("deploy-verify-assess at FEATURE scope (storyId undefined -> feature-ship self-heal)", () => {
  const IDS = ["tests/architecture/test_layering.py::test_T3_json_not_html"];

  it("markers persist at features/<F>/ (not stories/<S>/) when no story is given", () => {
    // The feature-ship deploy has no story; its contamination marker must live at
    // feature scope so the same assess->scope->re-deploy loop can run on the ship.
    writeDeployVerifyAssessMarker(consortDir, FEATURE, undefined, IDS);
    const featureMarker = join(consortDir, "features", FEATURE, "deploy-verify-assess.json");
    expect(existsSync(featureMarker)).toBe(true);
    // It must NOT be created under any story dir.
    expect(existsSync(join(consortDir, "features", FEATURE, "stories", STORY, "deploy-verify-assess.json"))).toBe(false);

    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, undefined);
    expect(m?.failing_node_ids).toEqual(IDS);
    expect(m?.assessed).toBe(false);
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, undefined)).toBe(true);
  });

  it("runs the full one-shot assess -> scope -> refactor -> clear lifecycle at feature scope", () => {
    writeDeployVerifyAssessMarker(consortDir, FEATURE, undefined, IDS);
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, undefined)).toBe(true);

    // Navigator confirms a scope set -> refactor-pending, no longer assess-eligible.
    markDeployVerifyAssessed(consortDir, FEATURE, undefined, IDS);
    expect(deployVerifyNeedsAssess(consortDir, FEATURE, undefined)).toBe(false);
    expect(deployVerifyRefactorPending(consortDir, FEATURE, undefined)).toBe(true);

    // Driver scopes -> no longer refactor-pending (the one re-deploy runs).
    markDeployVerifyRefactored(consortDir, FEATURE, undefined);
    expect(deployVerifyRefactorPending(consortDir, FEATURE, undefined)).toBe(false);

    // Re-verify passes -> clear.
    clearDeployVerifyAssessMarker(consortDir, FEATURE, undefined);
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, undefined)).toBeUndefined();
  });

  it("feature-scope and story-scope markers are independent (do not collide)", () => {
    writeDeployVerifyAssessMarker(consortDir, FEATURE, undefined, ["a.py::feat"]);
    writeDeployVerifyAssessMarker(consortDir, FEATURE, STORY, ["a.py::story"]);
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, undefined)?.failing_node_ids).toEqual(["a.py::feat"]);
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, STORY)?.failing_node_ids).toEqual(["a.py::story"]);
    // Clearing the feature marker leaves the story marker intact.
    clearDeployVerifyAssessMarker(consortDir, FEATURE, undefined);
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, undefined)).toBeUndefined();
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, STORY)?.failing_node_ids).toEqual(["a.py::story"]);
  });
});
