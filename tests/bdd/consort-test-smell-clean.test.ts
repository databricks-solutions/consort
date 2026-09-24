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

describe("checkTestSmells: dropped-column-dangling-reference", () => {
  // create inventory_code, then drop it (the contract), and reference it from
  // app + seed code. downgrade() re-adds it (must NOT suppress the drop).
  function seedContractMigrations(dir: string): void {
    write(dir, "alembic/versions/0001_create.py",
      `def upgrade():\n    op.create_table("stock_records", sa.Column("inventory_code", sa.String()), sa.Column("location", sa.String()))\n`);
    write(dir, "alembic/versions/0002_expand.py",
      `def upgrade():\n    op.add_column("stock_records", sa.Column("batch_number", sa.String()))\n    op.add_column("stock_records", sa.Column("serial_number", sa.String()))\n`);
    write(dir, "alembic/versions/0003_contract.py",
      `def upgrade():\n    op.drop_column("stock_records", "inventory_code")\n\ndef downgrade():\n    op.add_column("stock_records", sa.Column("inventory_code", sa.String()))\n`);
  }

  it("flags a live app/seed reference to a dropped column", () => {
    const dir = mkProject();
    seedContractMigrations(dir);
    write(dir, "seed_dev.py",
      `ROWS = [StockRecord(sku="S1", location="A1", quantity=1, inventory_code="A12-B7-S001")]\n`);
    const r = checkTestSmells({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations[0].smell).toBe("dropped-column-dangling-reference");
    expect(r.violations[0].file).toBe("seed_dev.py");
    expect(r.violations[0].detail).toMatch(/contract migration/);
  });

  it("does NOT flag a docstring mention of the dropped column (the grep-error the diagnosis made)", () => {
    const dir = mkProject();
    seedContractMigrations(dir);
    write(dir, "app/models/stock_record.py",
      `class StockRecord:\n    """A stock row.\n\n    The combined inventory_code column was dropped by the F6 S2 contract\n    migration; batch_number and serial_number are first-class now.\n    """\n    batch_number: str | None\n    serial_number: str | None\n`);
    expect(checkTestSmells({ projectDir: dir }).clean).toBe(true);
  });

  it("does NOT flag a # comment mention, and ignores the migration's own downgrade re-add", () => {
    const dir = mkProject();
    seedContractMigrations(dir);
    write(dir, "app/services/stock_service.py",
      `def upsert(sku, location, quantity, batch_number, serial_number):\n    # inventory_code was split into batch_number/serial_number by F6\n    return repo.upsert(sku, location, quantity, batch_number, serial_number)\n`);
    expect(checkTestSmells({ projectDir: dir }).clean).toBe(true);
  });

  it("stays clean when a column is dropped then re-added by a LATER migration (net present)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0001_create.py",
      `def upgrade():\n    op.create_table("t", sa.Column("temp_flag", sa.Boolean()))\n`);
    write(dir, "alembic/versions/0002_drop.py",
      `def upgrade():\n    op.drop_column("t", "temp_flag")\n`);
    write(dir, "alembic/versions/0003_readd.py",
      `def upgrade():\n    op.add_column("t", sa.Column("temp_flag", sa.Boolean()))\n`);
    write(dir, "app/svc.py", `x = row.temp_flag\n`);
    expect(checkTestSmells({ projectDir: dir }).clean).toBe(true);
  });
});

describe("checkTestSmells: the three migration/aggregate detectors", () => {
  it("whole-table-aggregate: flags an ABSOLUTE whole-table count with no scope/delta, not a scoped or delta one", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0001_create.py", `def upgrade():\n    op.create_table("stock_records")\n`);
    write(dir, "tests/test_counts.py",
      `def test_no_rows_dropped():\n    cur.execute("SELECT COUNT(*) FROM stock_records")\n    count = cur.fetchone()[0]\n    assert count == 3\n`);
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("whole-table-aggregate");

    const dir2 = mkProject();
    write(dir2, "alembic/versions/0001_create.py", `def upgrade():\n    op.create_table("stock_records")\n`);
    write(dir2, "tests/test_counts.py",
      `import uuid\n\ndef test_own_rows():\n    key = str(uuid.uuid4())\n    cur.execute("SELECT COUNT(*) FROM stock_records WHERE inventory_code = %s", (key,))\n    assert cur.fetchone()[0] == 2\n`);
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(true);

    const dir3 = mkProject();
    write(dir3, "alembic/versions/0001_create.py", `def upgrade():\n    op.create_table("stock_records")\n`);
    write(dir3, "tests/test_counts.py",
      `def test_delta():\n    count_before = cur.execute("SELECT COUNT(*) FROM stock_records").fetchone()[0]\n    seed(2)\n    count_after = cur.execute("SELECT COUNT(*) FROM stock_records").fetchone()[0]\n    assert count_after - count_before == 2\n`);
    expect(checkTestSmells({ projectDir: dir3 }).clean).toBe(true);
  });

  it("migration-marker-presence: flags a downgrade without @pytest.mark.migration, not a marked or forward-only test", () => {
    const dir = mkProject();
    write(dir, "tests/test_reversible.py",
      `def test_reversible():\n    command.downgrade(Config(ini), "-1")\n    command.upgrade(Config(ini), "head")\n`);
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("migration-marker-presence");

    const dir2 = mkProject();
    write(dir2, "tests/test_reversible.py",
      `import pytest\n\n@pytest.mark.migration\ndef test_reversible():\n    command.downgrade(Config(ini), "-1")\n`);
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(true);

    // A forward-only restore (upgrade head, no downgrade) is idempotent – NOT the smell.
    const dir3 = mkProject();
    write(dir3, "tests/conftest.py",
      `def restore():\n    command.upgrade(Config(ini), "head")\n`);
    expect(checkTestSmells({ projectDir: dir3 }).clean).toBe(true);
  });

  it("pytest-bdd-parse-conversion: flags a parse() step pattern using !r/!s/!a, not a spec-only or quoted pattern", () => {
    // !r conversion — the parse lib can't match it → StepDefinitionNotFoundError.
    const dir = mkProject();
    write(dir, "tests/step_defs/test_stock.py",
      `@then(parsers.parse("the serial_number matches {serial!r}"))\ndef then_serial(serial, ctx):\n    pass\n`);
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("pytest-bdd-parse-conversion");
    expect(bad.violations[0].detail).toMatch(/!r/);

    // !s is equally unsupported.
    const dir2 = mkProject();
    write(dir2, "tests/step_defs/test_stock.py",
      `@given(parsers.parse("a row at location {loc!s} is seeded"))\ndef given_row(loc):\n    pass\n`);
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(false);

    // A quoted value with NO conversion is the correct form — clean.
    const dir3 = mkProject();
    write(dir3, "tests/step_defs/test_stock.py",
      `@then(parsers.parse('the serial_number matches "{serial}"'))\ndef then_serial(serial, ctx):\n    pass\n`);
    expect(checkTestSmells({ projectDir: dir3 }).clean).toBe(true);

    // A format SPEC ({name:d}) IS supported by parse — not flagged.
    const dir4 = mkProject();
    write(dir4, "tests/step_defs/test_stock.py",
      `@then(parsers.parse("the quantity is {qty:d}"))\ndef then_qty(qty):\n    pass\n`);
    expect(checkTestSmells({ projectDir: dir4 }).clean).toBe(true);
  });

  it("reversible-invariant-round-trip: flags a forward-only test covering a migration_reversible invariant, not a round-trip", () => {
    const dir = mkProject();
    write(dir, ".consort/features/F1/architecture.json", JSON.stringify({
      persistence_invariants: [{ id: "PI1-expand-migration-reversible", type: "migration_reversible", table: "stock_records" }],
    }));
    write(dir, ".consort/features/F1/test-list.json", JSON.stringify({ items: [
      { id: "T9", invariant_id: "PI1-expand-migration-reversible", description: "seed rows, run alembic upgrade head, assert columns present" },
    ] }));
    const bad = checkTestSmells({ projectDir: dir });
    expect(bad.clean).toBe(false);
    expect(bad.violations[0].smell).toBe("reversible-invariant-round-trip");

    const dir2 = mkProject();
    write(dir2, ".consort/features/F1/architecture.json", JSON.stringify({
      persistence_invariants: [{ id: "PI1-expand-migration-reversible", type: "migration_reversible", table: "stock_records" }],
    }));
    write(dir2, ".consort/features/F1/test-list.json", JSON.stringify({ items: [
      { id: "T14", invariant_id: "PI1-expand-migration-reversible", description: "downgrade -1 then upgrade head, assert schema recreated" },
    ] }));
    expect(checkTestSmells({ projectDir: dir2 }).clean).toBe(true);

    const dir3 = mkProject();
    write(dir3, ".consort/features/F1/architecture.json", JSON.stringify({
      persistence_invariants: [{ id: "PI2-not-null", type: "not_null", table: "stock_records" }],
    }));
    write(dir3, ".consort/features/F1/test-list.json", JSON.stringify({ items: [] }));
    expect(checkTestSmells({ projectDir: dir3 }).clean).toBe(true);
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
