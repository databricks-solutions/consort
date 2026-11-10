import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFailedNodeIds,
  verifyFailureDigest,
  classifyDeployVerifyFailure,
  classifyDeployVerifySupersession,
  classifyDeployVerifyTestSmell,
  writeDeployVerifyAssessMarker,
  readDeployVerifyAssessMarker,
  markDeployVerifyAssessed,
  markDeployVerifyRefactored,
  deployVerifyRefactorPending,
  clearDeployVerifyAssessMarker,
  deployVerifyNeedsAssess,
} from "../../consort/smells/deploy-verify-assess";
import { DEFAULT_MIGRATION_DIRS } from "../../consort/architecture/test-smell-clean";
import { deployToTarget } from "../../consort/deploy/deploy";

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

// REGRESSION (F3/S2 client deploy-verify HIL): a CLIENT (vitest) failure has no pytest `::` node-id, so
// parseFailedNodeIds returns [] and the terminal escalation used to name no test — the failing identity
// was lost. verifyFailureDigest recovers it from the WHOLE output across runners, for the escalation forensic.
describe("verifyFailureDigest (runner-agnostic failure lines for the terminal escalation forensic)", () => {
  it("captures a vitest client failure (file-level FAIL + per-test glyph + assertion) parseFailedNodeIds misses", () => {
    const out = [
      " ✓ tests/components/StockTable.test.tsx (7 tests) 11s",
      " FAIL  tests/components/Confirmation.test.tsx > Confirmation > shows the receipt @T17",
      "   × Confirmation > shows the receipt @T17 1203ms",
      "     AssertionError: expected '7' to be '4'",
      " ✓ tests/components/SkuDetail.test.tsx (1 test) 2s",
      " Test Files  1 failed | 9 passed (10)",
    ].join("\n");
    expect(parseFailedNodeIds(out)).toEqual([]); // pytest parser is blind to this
    const digest = verifyFailureDigest(out);
    expect(digest.some((l) => l.includes("Confirmation.test.tsx"))).toBe(true);
    expect(digest.some((l) => l.includes("@T17"))).toBe(true);
    expect(digest.some((l) => l.includes("AssertionError"))).toBe(true);
    expect(digest.some((l) => l.includes("✓"))).toBe(false); // passing lines are not in the digest
  });

  it("captures pytest failures and strips ANSI, deduped + capped", () => {
    const out = "\u001b[31mFAILED a.py::t_one\u001b[0m\nFAILED a.py::t_one\nFAILED b.py::t_two\nok";
    expect(verifyFailureDigest(out)).toEqual(["FAILED a.py::t_one", "FAILED b.py::t_two"]);
    expect(verifyFailureDigest("all 42 passed")).toEqual([]);
    expect(verifyFailureDigest(Array.from({ length: 200 }, (_, i) => `× t${i} > case`).join("\n"), 5)).toHaveLength(5);
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

// Faithful replay of the F2/S3 sprint-2 blocker: the deploy-verify FAILED on S1's fitness
// test T17 — an over-broad migration-creator finder (`len(owners) == 2` where it asserts 1)
// after S3's additive index migration ALSO named stock_adjustments. The app was correct; the
// TEST carried a deterministic, Driver-fixable authoring smell (migration-creator-uniqueness).
// This drives the REAL deployToTarget over a fixture built from the REAL recorded artifacts
// (the constant-idiom create migration `TABLE = "stock_adjustments"; op.create_table(TABLE)`,
// the S3 `op.create_index(..., "stock_adjustments")` migration, and T17's finder), proving the
// NEW third self-heal kind routes a Driver repair instead of the terminal HIL the live run hit.
describe("deploy-verify self-heal: test-smell kind (the F2/S3 migration-creator-uniqueness replay)", () => {
  const F2 = "F2-stock-adjustment";
  const S3 = "S3-view-adjustment-audit";
  const NODE = "tests/test_f2s1_stock_adjustments_fitness.py::test_migration_round_trip";
  const RECORDED_FAILURE = [
    "=========================== short test summary info ============================",
    `FAILED ${NODE} - AssertionError: one additive migration must create stock_adjustments`,
    "assert 2 == 1",
    "============ 1 failed, 16 passed in 30s ============",
  ].join("\n");

  // The REAL alembic constant idiom: the create migration references TABLE = "stock_adjustments"
  // AND calls op.create_table(TABLE) — so it contains BOTH "create_table" and the table name; the
  // S3 index migration names the table via op.create_index but has NO create_table.
  const CREATE_MIG = [
    'revision = "20261103221344"',
    'down_revision = "20261102200143"',
    'TABLE = "stock_adjustments"',
    "def upgrade():",
    "    op.create_table(TABLE, sa.Column('id', sa.Integer, primary_key=True))",
    '    op.create_index("ix_stock_adjustments_stock_record_id", TABLE, ["stock_record_id"])',
    "def downgrade():",
    "    op.drop_table(TABLE)",
    "",
  ].join("\n");
  const INDEX_MIG = [
    'revision = "20261103224142"',
    'down_revision = "20261103221344"',
    'INDEX = "ix_stock_adjustments_record_created_id"',
    "def upgrade():",
    '    op.create_index(INDEX, "stock_adjustments", ["stock_record_id"])',
    "def downgrade():",
    '    op.drop_index(INDEX, table_name="stock_adjustments")',
    "",
  ].join("\n");

  // T17's migration finder: BARE-name (over-broad) vs the Driver's constant-safe two-token fix.
  const BARE_FINDER = '    owners = [s for s in script.walk_revisions() if "stock_adjustments" in Path(s.path).read_text()]';
  const TWO_TOKEN_FINDER =
    '    owners = [s for s in script.walk_revisions() if "create_table" in (src := Path(s.path).read_text()) and "stock_adjustments" in src]';
  const t17 = (finder: string): string =>
    [
      "import pytest",
      "from pathlib import Path",
      "from alembic.script import ScriptDirectory",
      "from alembic.config import Config",
      "",
      "@pytest.mark.migration",
      "def test_migration_round_trip():",
      '    script = ScriptDirectory.from_config(Config("alembic.ini"))',
      finder,
      '    assert len(owners) == 1, "one additive migration must create stock_adjustments"',
      "",
    ].join("\n");

  function seedScaffold(dir: string, finder: string): void {
    mkdirSync(join(dir, "alembic", "versions"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    mkdirSync(join(dir, ".consort", "features", F2, "stories", S3), { recursive: true });
    writeFileSync(join(dir, "alembic", "versions", "20261103221344_create_stock_adjustments.py"), CREATE_MIG);
    writeFileSync(join(dir, "alembic", "versions", "20261103224142_add_index.py"), INDEX_MIG);
    writeFileSync(join(dir, "tests", "test_f2s1_stock_adjustments_fitness.py"), t17(finder));
    writeFileSync(
      join(dir, "deploy-targets.yaml"),
      ["targets:", "  local:", "    type: local", '    run: "echo run"', "    base_url: http://127.0.0.1:8000", "    health_path: /health", '    verify: "run-verify"', ""].join("\n"),
    );
  }

  // Injected: migrate/verify both via run-verify; the FULL verify fails with the recorded output;
  // the ISOLATION re-run (node-id appended) also fails (GENUINE — the finder is deterministic, not
  // contamination). No app, no Lakebase fork (EPHEMERAL_VERIFY=0).
  const runVerify = (cmd: string) =>
    cmd.includes("::") ? { passed: false, output: RECORDED_FAILURE } : { passed: false, output: RECORDED_FAILURE };

  async function drive(dir: string): Promise<void> {
    await deployToTarget({
      projectDir: dir,
      targetName: "local",
      featureId: F2,
      storyId: S3,
      consortDir: join(dir, ".consort"),
      lakebaseBranch: "exp-f2-s3",
      startProcess: () => 4242,
      reachable: async () => true,
      servingOk: async () => true,
      runVerify,
      stop: () => {},
      sleep: async () => {},
      now: () => new Date("2026-11-03T23:13:00Z"),
    });
  }

  let prevEphemeral: string | undefined;
  let proj: string;
  beforeEach(() => {
    prevEphemeral = process.env.LAKEBASE_CONSORT_EPHEMERAL_VERIFY;
    process.env.LAKEBASE_CONSORT_EPHEMERAL_VERIFY = "0"; // skip the real ephemeral-branch fork
    proj = mkdtempSync(join(tmpdir(), "dv-testsmell-"));
  });
  afterEach(() => {
    if (prevEphemeral === undefined) delete process.env.LAKEBASE_CONSORT_EPHEMERAL_VERIFY;
    else process.env.LAKEBASE_CONSORT_EPHEMERAL_VERIFY = prevEphemeral;
    rmSync(proj, { recursive: true, force: true });
  });

  it("the classifier flags the bare-name finder's node-id (migration-creator-uniqueness), not the two-token fix", () => {
    seedScaffold(proj, BARE_FINDER);
    const hits = classifyDeployVerifyTestSmell([NODE], proj, DEFAULT_MIGRATION_DIRS);
    expect(hits.map((h) => h.smell)).toEqual(["migration-creator-uniqueness"]);
    expect(hits[0].node_id).toBe(NODE);

    const fixed = mkdtempSync(join(tmpdir(), "dv-testsmell-fixed-"));
    try {
      seedScaffold(fixed, TWO_TOKEN_FINDER);
      expect(classifyDeployVerifyTestSmell([NODE], fixed, DEFAULT_MIGRATION_DIRS)).toEqual([]);
    } finally {
      rmSync(fixed, { recursive: true, force: true });
    }
  });

  it("drives the REAL deployToTarget: bare-name T17 -> a test-smell marker (Driver repair), NOT a terminal escalation", async () => {
    seedScaffold(proj, BARE_FINDER);
    await drive(proj);
    const consortDir = join(proj, ".consort");
    const marker = readDeployVerifyAssessMarker(consortDir, F2, S3);
    expect(marker?.kind).toBe("test-smell");
    expect(marker?.failing_node_ids).toContain(NODE);
    expect(marker?.smell_fixes?.[0]?.smell).toBe("migration-creator-uniqueness");
    expect(marker?.smell_fixes?.[0]?.fix).toMatch(/create_table.*AND|both .*create_table/i);
    // The one-shot route is live: assess-eligible, and NO terminal escalation was written.
    expect(deployVerifyNeedsAssess(consortDir, F2, S3)).toBe(true);
    expect(existsSync(join(consortDir, "escalations"))).toBe(false);
  });

  it("drives the REAL deployToTarget: the two-token fix still failing -> NO test-smell marker, terminal escalation (the smell is what gates it)", async () => {
    // With the finder already correct, a still-failing verify is a GENUINE failure: the self-heal
    // must NOT fire (nothing to narrow), so it escalates — proving the smell classification, not the
    // mere fact of failure, is what routes the Driver repair.
    seedScaffold(proj, TWO_TOKEN_FINDER);
    await drive(proj);
    const consortDir = join(proj, ".consort");
    expect(readDeployVerifyAssessMarker(consortDir, F2, S3)).toBeUndefined();
    expect(existsSync(join(consortDir, "escalations"))).toBe(true);
  });
});
