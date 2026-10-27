import { describe, it, expect } from "vitest";
import { parseFailedNodeDetails, decomposeBatchFailure, testidToTestName, splitBatchByResult } from "../../consort/pipeline/batch-decompose";

// Real pytest output shape (FAILURES section + short summary) — not mocked, the
// actual text the verify emits.
const PYTEST_OUTPUT = [
  "=================================== FAILURES ===================================",
  "____________________________ test_schema_diff_added ____________________________",
  "",
  "    def test_schema_diff_added():",
  '>       assert "batch_number" in diff',
  "E       AssertionError: assert 'batch_number' in 'stock_records(sku)'",
  "",
  "tests/test_expand.py:42: AssertionError",
  "______________________________ test_rows_survive _______________________________",
  "",
  "    def test_rows_survive():",
  ">       assert count == 4",
  "E       assert 3 == 4",
  "",
  "tests/test_expand.py:88: AssertionError",
  "=========================== short test summary info ============================",
  "FAILED tests/test_expand.py::test_schema_diff_added - AssertionError: assert 'batch_number' in '...'",
  "FAILED tests/test_expand.py::test_rows_survive - assert 3 == 4",
  "========================= 2 failed, 30 passed in 45.2s =========================",
].join("\n");

describe("parseFailedNodeDetails (per-node-id structured capture)", () => {
  it("pairs each failing node-id with its reason + its own FAILURES traceback", () => {
    const d = parseFailedNodeDetails(PYTEST_OUTPUT);
    expect(d.map((x) => x.nodeId)).toEqual([
      "tests/test_expand.py::test_schema_diff_added",
      "tests/test_expand.py::test_rows_survive",
    ]);
    // Each gets ITS OWN reason (short summary) ...
    expect(d[0].reason).toContain("batch_number");
    expect(d[1].reason).toBe("assert 3 == 4");
    // ... and ITS OWN traceback block (not a shared tail).
    expect(d[0].detail).toContain("test_schema_diff_added");
    expect(d[0].detail).toContain("AssertionError");
    expect(d[0].detail).not.toContain("test_rows_survive"); // isolated to its block
    expect(d[1].detail).toContain("assert 3 == 4");
  });

  it("matches a parametrized node-id to its block by test name (params stripped)", () => {
    const out = [
      "=================================== FAILURES ===================================",
      "________________________ test_param[case-a] ________________________",
      "E       assert False",
      "=========================== short test summary info ============================",
      "FAILED tests/t.py::test_param[case-a] - assert False",
      "===== 1 failed =====",
    ].join("\n");
    const d = parseFailedNodeDetails(out);
    expect(d).toHaveLength(1);
    expect(d[0].nodeId).toBe("tests/t.py::test_param[case-a]");
    expect(d[0].detail).toContain("assert False");
  });

  it("no failures => empty", () => {
    expect(parseFailedNodeDetails("===== 32 passed in 12s =====")).toEqual([]);
  });
});

describe("decomposeBatchFailure (one repair unit per failing test; passers untouched)", () => {
  it("splits the failing set into per-node-id units + reports the batch passers", () => {
    const r = decomposeBatchFailure({
      output: PYTEST_OUTPUT,
      batchNodeIds: [
        "tests/test_expand.py::test_schema_diff_added",
        "tests/test_expand.py::test_rows_survive",
        "tests/test_expand.py::test_ok_1",
        "tests/test_expand.py::test_ok_2",
      ],
    });
    // One unit per FAILING test — the decomposition.
    expect(r.units.map((u) => u.nodeId)).toEqual([
      "tests/test_expand.py::test_schema_diff_added",
      "tests/test_expand.py::test_rows_survive",
    ]);
    expect(r.units[0].detail).toContain("AssertionError");
    // The batch's passers are left alone.
    expect(r.passed).toEqual(["tests/test_expand.py::test_ok_1", "tests/test_expand.py::test_ok_2"]);
  });

  it("degrades gracefully: all-fail batch => a unit for every test (≈ fine-grained)", () => {
    const r = decomposeBatchFailure({
      output: PYTEST_OUTPUT,
      batchNodeIds: ["tests/test_expand.py::test_schema_diff_added", "tests/test_expand.py::test_rows_survive"],
    });
    expect(r.units).toHaveLength(2);
    expect(r.passed).toEqual([]);
  });
});

// ── tag-and-re-batch: bank passers, re-queue failers (the fitness-lane compression) ──
// A test source carries @pytest.mark.testid markers (possibly among other decorators). The split must
// map a failing node-id back to its test-list id and re-queue it, BANK the confirmed passers, and —
// the safety property — NEVER bank an id it can't confirm passed (unmapped -> re-queue).
const SRC = [
  "import pytest",
  "",
  '@pytest.mark.testid("T40")',
  "def test_schema_diff_added():",
  "    assert True",
  "",
  "@pytest.mark.migration",
  '@pytest.mark.testid("T41")',          // marker among other decorators
  "def test_rows_survive():",
  "    assert True",
  "",
  '@pytest.mark.testid("T42")',
  "def test_round_trip():",
  "    assert True",
].join("\n");

describe("testidToTestName — maps test-list id -> test fn via the @pytest.mark.testid marker", () => {
  it("maps across intervening decorators, ignores un-marked defs", () => {
    const m = testidToTestName([SRC]);
    expect(m.get("T40")).toBe("test_schema_diff_added");
    expect(m.get("T41")).toBe("test_rows_survive"); // marker was NOT the immediate line above the def
    expect(m.get("T42")).toBe("test_round_trip");
    expect(m.size).toBe(3);
  });
});

describe("splitBatchByResult — bank passers, re-queue failers (align back into pending)", () => {
  const map = testidToTestName([SRC]);
  it("banks the passed test-list ids and re-queues the failed ones with their failure detail", () => {
    // Batch ran T40,T41,T42; PYTEST_OUTPUT fails test_schema_diff_added (T40) + test_rows_survive (T41).
    const { banked, requeue } = splitBatchByResult({ batchIds: ["T40", "T41", "T42"], output: PYTEST_OUTPUT, testidToName: map });
    expect(banked).toEqual(["T42"]);                       // the only confirmed pass -> banked green
    expect(requeue.map((u) => u.id).sort()).toEqual(["T40", "T41"]); // failers -> re-queued to pending
    const t40 = requeue.find((u) => u.id === "T40")!;
    expect(t40.nodeId).toBe("tests/test_expand.py::test_schema_diff_added");
    expect(t40.reason).toContain("AssertionError");        // carries its own failure detail for the retry
  });

  it("SAFETY: an un-mappable id is RE-QUEUED, never banked (no silent-loss of a failer)", () => {
    const { banked, requeue } = splitBatchByResult({ batchIds: ["T40", "T99-unmapped"], output: PYTEST_OUTPUT, testidToName: map });
    expect(banked).not.toContain("T99-unmapped");          // unknown mapping -> cannot confirm pass -> re-queue
    expect(requeue.map((u) => u.id)).toContain("T99-unmapped");
    expect(requeue.find((u) => u.id === "T99-unmapped")!.reason).toBe("unmapped-testid");
  });

  it("all-pass batch banks everything, re-queues nothing", () => {
    const { banked, requeue } = splitBatchByResult({ batchIds: ["T42"], output: "===== 30 passed in 12s =====", testidToName: map });
    expect(banked).toEqual(["T42"]);
    expect(requeue).toEqual([]);
  });
});
