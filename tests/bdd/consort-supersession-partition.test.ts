import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { partitionSupersededFiles } from "../../consort/architecture/contract-clean";

// The sweep HYBRID's deterministic half: classify superseded-test files as PURE (every test fn is
// about a dropped symbol -> retire the whole file, no LLM) vs MIXED (has a surviving test, or is not
// Python -> the LLM must surgically retarget). PURE files are deleted; MIXED go to the minutes-long
// claude turn. Conservative: one surviving test makes the whole file MIXED.

let dir: string;
const write = (rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
};
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "superseded-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("partitionSupersededFiles — deterministic PURE vs MIXED split", () => {
  it("PURE: every test fn references the dropped symbol -> retire the whole file", () => {
    write(
      "tests/test_tracking_code.py",
      [
        "import pytest",
        "",
        "def test_tracking_code_is_unique():",
        "    assert 'tracking_code' in cols()",
        "",
        "def test_tracking_code_rebuilt_on_downgrade():",
        "    assert row.tracking_code is not None",
        "",
      ].join("\n"),
    );
    const { pureRemovable, mixed } = partitionSupersededFiles(
      dir,
      [{ file: "tests/test_tracking_code.py" }],
      ["tracking_code"],
    );
    expect(pureRemovable).toEqual(["tests/test_tracking_code.py"]);
    expect(mixed).toEqual([]);
  });

  it("MIXED: one surviving test (no dropped symbol) makes the whole file MIXED -> LLM", () => {
    write(
      "tests/test_stock.py",
      [
        "import pytest",
        "",
        "def test_tracking_code_present():",  // stale
        "    assert 'tracking_code' in cols()",
        "",
        "def test_quantity_never_negative():",  // SURVIVES
        "    assert row.quantity >= 0",
        "",
      ].join("\n"),
    );
    const { pureRemovable, mixed } = partitionSupersededFiles(dir, [{ file: "tests/test_stock.py" }], ["tracking_code"]);
    expect(pureRemovable).toEqual([]);
    expect(mixed).toEqual(["tests/test_stock.py"]);
  });

  it("non-Python (client spec) is always MIXED — the LLM handles casing variants", () => {
    write("client/tests/e2e/sku.spec.ts", "test('shows trackingCode', () => { expect(x).toBe('tracking_code'); });\n");
    const { pureRemovable, mixed } = partitionSupersededFiles(
      dir,
      [{ file: "client/tests/e2e/sku.spec.ts" }],
      ["tracking_code"],
    );
    expect(pureRemovable).toEqual([]);
    expect(mixed).toEqual(["client/tests/e2e/sku.spec.ts"]);
  });

  it("a .py file with no recognizable test fn is MIXED (fail safe to the LLM)", () => {
    write("tests/conftest.py", "import pytest\n\ndef helper_builds_tracking_code():\n    return 'x'\n");
    const { pureRemovable, mixed } = partitionSupersededFiles(dir, [{ file: "tests/conftest.py" }], ["tracking_code"]);
    expect(pureRemovable).toEqual([]);
    expect(mixed).toEqual(["tests/conftest.py"]);
  });

  it("splits a mixed set in one call (pure retired, mixed to LLM)", () => {
    write("tests/test_tc_only.py", "def test_tracking_code_x():\n    assert tracking_code\n");
    write("tests/test_both.py", "def test_tracking_code_y():\n    assert tracking_code\n\ndef test_survivor():\n    assert True\n");
    const { pureRemovable, mixed } = partitionSupersededFiles(
      dir,
      [{ file: "tests/test_tc_only.py" }, { file: "tests/test_both.py" }],
      ["tracking_code"],
    );
    expect(pureRemovable).toEqual(["tests/test_tc_only.py"]);
    expect(mixed).toEqual(["tests/test_both.py"]);
  });

  it("no dropped symbols -> everything MIXED (defensive: never delete blind)", () => {
    write("tests/test_tracking_code.py", "def test_tracking_code_x():\n    assert tracking_code\n");
    const { pureRemovable, mixed } = partitionSupersededFiles(dir, [{ file: "tests/test_tracking_code.py" }], []);
    expect(pureRemovable).toEqual([]);
    expect(mixed).toEqual(["tests/test_tracking_code.py"]);
  });
});
