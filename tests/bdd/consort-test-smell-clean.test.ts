// BDD coverage for the test-authoring-smell gate (consort/architecture/test-smell-clean.ts)
// + its wiring into the honest-GREEN path (greenOpenCycle), issue #199.
//
// Each detector maps to a real failure class from the issue: loose Playwright
// locators (strict-mode/UUID collisions), vi.mock TDZ (0-test suites), framenavigated
// reload detectors, DELETE-based teardowns (append-only/RESTRICT), umbrella
// `except IntegrityError` (masks the real failure), and schema-unsatisfiable table
// refs (UndefinedTable on every run). The APP is never the defect.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { checkTestSmells } from "../../consort/architecture/test-smell-clean.js";
import { beginNextPendingCycle, greenOpenCycle, type GreenVerifier } from "../../consort/pipeline/cycle-record.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-smell-clean-"));
  tmpDirs.push(dir);
  return dir;
}
function write(dir: string, rel: string, body: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

describe("checkTestSmells", () => {
  it("flags a bare NUMERIC locator with no exact/scoping (the getByText(\"5\") collision class)", () => {
    const dir = mkProject();
    write(dir, "client/tests/e2e/stock.spec.ts", `await expect(page.getByText("5")).toBeVisible();\n`);
    const r = checkTestSmells({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations[0].smell).toBe("loose-locator");
    expect(r.violations[0].detail).toMatch(/UNIQUE KEY/);
  });

  it("does NOT flag a word-label locator or an exact-scoped one", () => {
    const dir = mkProject();
    write(dir, "client/tests/e2e/form.spec.ts",
      `await page.getByText("Save").click();\nawait expect(page.getByText("5", { exact: true })).toBeVisible();\n`);
    expect(checkTestSmells({ projectDir: dir }).clean).toBe(true);
  });

  it("flags an unanchored broad alternation (/404|not found/i matches UUID digits)", () => {
    const dir = mkProject();
    write(dir, "client/tests/e2e/detail.spec.ts", `await expect(page.getByText(/404|not found/i)).toBeVisible();\n`);
    const r = checkTestSmells({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations[0].smell).toBe("loose-locator");
    expect(r.violations[0].detail).toMatch(/UUID/);
  });

  it("flags a vi.mock factory closing over a top-level const (TDZ) but not a vi.hoisted one", () => {
    const dir = mkProject();
    write(dir, "client/tests/pages/list.test.tsx",
      `const ROWS = [{ sku: "A" }];\nvi.mock("../api", () => ({ list: () => ROWS }));\n`);
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("vi-mock-tdz");

    const dir2 = mkProject();
    write(dir2, "client/tests/pages/list.test.tsx",
      `const ROWS = vi.hoisted(() => [{ sku: "A" }]);\nvi.mock("../api", () => ({ list: () => ROWS }));\n`);
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(true);
  });

  it("flags a framenavigated reload detector", () => {
    const dir = mkProject();
    write(dir, "client/tests/e2e/nav.spec.ts", `page.on("framenavigated", () => { reloaded = true; });\n`);
    const r = checkTestSmells({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations[0].smell).toBe("framenavigated-reload-detector");
    expect(r.violations[0].detail).toMatch(/STATE/);
  });

  it("flags a DELETE-based teardown but not a delete inside the test body", () => {
    const dir = mkProject();
    write(dir, "tests/step_defs/test_stock.py",
      `def teardown():\n    cur.execute("DELETE FROM stock_records")\n\ndef test_create():\n    pass\n`);
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("delete-teardown");

    const dir2 = mkProject();
    write(dir2, "tests/step_defs/test_stock.py",
      `def test_delete_flow():\n    cur.execute("DELETE FROM stock_records WHERE sku = %s", (sku,))\n`);
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(true);
  });

  it("flags a bare umbrella swallow (`except IntegrityError: pass`) but NOT a discriminated catch", () => {
    const dir = mkProject();
    write(dir, "tests/test_checks.py",
      `try:\n    insert(row)\nexcept IntegrityError:\n    pass\n`);
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("broad-integrity-except");

    // A broad catch DISCRIMINATED by a message assertion + isinstance on the bound
    // exception is a narrowing pattern, not a smell (the :68/:85 live-run case).
    const dir2 = mkProject();
    write(dir2, "tests/architecture/test_stock_records_schema.py",
      `try:\n    conn.execute(text("INSERT INTO stock_records VALUES ('S','A',-1,'IC')"))\n    conn.rollback()\n    raise AssertionError("negative accepted")\nexcept Exception as exc:\n    conn.rollback()\n    assert "check" in str(exc).lower() or isinstance(exc, CheckViolation), f"unexpected: {exc}"\n`);
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(true);
  });

  it("flags a bound exception name that is never discriminated (swallow with a name)", () => {
    const dir = mkProject();
    write(dir, "tests/test_swallow.py",
      `try:\n    insert(row)\nexcept Exception as exc:\n    conn.rollback()\n    pass\n`);
    const r = checkTestSmells({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations[0].smell).toBe("broad-integrity-except");
  });

  it("flags a raw-SQL table ref no migration creates, and accepts a created one", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0001_create.py", `def upgrade():\n    op.create_table("stock_records")\n`);
    write(dir, "tests/test_stock.py", `rows = cur.execute("SELECT * FROM stock_record").fetchall()\n`);
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("schema-unsatisfiable-ref");
    expect(bad.violations[0].detail).toMatch(/stock_records/);

    const dir2 = mkProject();
    write(dir2, "alembic/versions/0001_create.py", `def upgrade():\n    op.create_table("stock_records")\n`);
    write(dir2, "tests/test_stock.py", `rows = cur.execute("SELECT * FROM stock_records").fetchall()\n`);
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(true);
  });

  it("the remediation routes fixes to the test's AUTHOR, never a Driver code repair", () => {
    const dir = mkProject();
    write(dir, "client/tests/e2e/stock.spec.ts", `await expect(page.getByText("5")).toBeVisible();\n`);
    const r = checkTestSmells({ projectDir: dir });
    expect(r.remediation).toMatch(/TEST-AUTHORING-SMELL/);
    expect(r.remediation).toMatch(/not the defect/);
  });
});

// greenOpenCycle wiring: the gate runs even when the honest verify PASSES – a
// flaky/unsatisfiable test can green locally while the app is correct, so the smell
// must route a test-author fix BEFORE anything ships (issue #199).
describe("greenOpenCycle: a smell-laden test is caught proactively at GREEN", () => {
  const F = "F1";
  const S = "S1";
  const writeJson = (file: string, obj: unknown): void => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  const pass: GreenVerifier = async () => ({ passed: true, summary: "all tests green" });

  it("a PASSING verify + a loose-locator spec converts to a routed test-author fix (does not green)", async () => {
    const project = mkProject();
    const tdd = path.join(project, ".sftdd");
    const acsDir = path.join(tdd, "features", F, "stories", S, "acs");
    fs.mkdirSync(acsDir, { recursive: true });
    writeJson(path.join(acsDir, "AC1.json"), { id: "AC1", layer: "E2E", text: "quantity cell" });
    const items = [{ id: "T20", description: "quantity cell shows 5", ac_id: "AC1", status: "pending" }];
    writeJson(path.join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    writeJson(path.join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    const expDir = path.join(tdd, "experiments", F, S, "exp1");
    fs.mkdirSync(expDir, { recursive: true });
    fs.writeFileSync(path.join(expDir, "branch.txt"), "experiment-s1-exp1");
    writeJson(path.join(expDir, "outcomes.json"), { status: "running" });
    write(project, "client/tests/e2e/stock.spec.ts", `await expect(page.getByText("5")).toBeVisible();\n`);

    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });

    expect(r.recorded).toBe(false);
    expect(r.needsAssess).toBe(true);
    expect(r.summary).toMatch(/TEST-AUTHORING-SMELL/);
  });
});
