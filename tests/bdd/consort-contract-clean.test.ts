// BDD coverage for the contract-completeness gate (scripts/sftdd/contract-clean.ts)
// + its wiring into the honest-GREEN verify path (greenOpenCycle).
//
// The gate is the contract half of expand/contract (software-design-principles
// hard rule 9): when a migration DROPS a column the running code still references,
// the app emits SQL for a column the migrated DB no longer has and crashes at
// runtime even though the migration "succeeded". The gate parses the migration's
// net column drops + greps the code tree, so it both NOTICES and LOCALIZES the
// residual references – the two things the Navigator assess used to do by judgment.
// On a hit the GREEN verify-failure self-heals DETERMINISTICALLY: it writes an
// ASSESSED green-failure with a precise file:line fixDirective, routing a bounded
// Driver REPAIR instead of a model assess.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { checkContractClean, netDroppedSymbols, supersededTestCandidates } from "../../consort/architecture/contract-clean.js";
import {
  beginNextPendingCycle,
  greenOpenCycle,
  type GreenVerifier,
} from "../../consort/pipeline/cycle-record.js";
import { readGreenFailure, needsGreenAssess } from "../../consort/smells/supersession.js";

const tmpDirs: string[] = [];

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contract-clean-"));
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
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
});

const DROP_INVENTORY_CODE = `
def upgrade():
    op.drop_column('stock', 'inventory_code')

def downgrade():
    op.add_column('stock', sa.Column('inventory_code', sa.String()))
`;

describe("netDroppedSymbols", () => {
  it("returns a column an alembic migration dropped", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    expect(netDroppedSymbols(dir)).toEqual(["inventory_code"]);
  });

  it("nets clean when a LATER migration re-adds a dropped column (expand/contract round-trip)", () => {
    const dir = mkProject();
    // 0003 drops it; 0004 (sorts after) re-adds it -> last action is add -> not dropped.
    write(dir, "alembic/versions/0003_drop.py", `def upgrade():\n    op.drop_column('stock', 'inventory_code')\n`);
    write(dir, "alembic/versions/0004_readd.py", `def upgrade():\n    op.add_column('stock', sa.Column('inventory_code', sa.String()))\n`);
    expect(netDroppedSymbols(dir)).toEqual([]);
  });

  it("parses raw-SQL ALTER TABLE ... DROP COLUMN migrations", () => {
    const dir = mkProject();
    write(dir, "migrations/0001_drop.sql", `ALTER TABLE stock DROP COLUMN inventory_code;\n`);
    expect(netDroppedSymbols(dir)).toEqual(["inventory_code"]);
  });

  it("returns nothing when there are no migrations", () => {
    expect(netDroppedSymbols(mkProject())).toEqual([]);
  });

  it("does NOT flag a reversible migration's downgrade() drop (forward direction only)", () => {
    // The bug the live S3 re-drive surfaced: a normal reversible migration adds a
    // column in upgrade() and drops it in downgrade(). Scanning the whole file
    // misread batch_number/serial_number/actor as dropped. Only upgrade() counts.
    const dir = mkProject();
    write(dir, "alembic/versions/0001_add_batch_serial.py", `
def upgrade() -> None:
    op.add_column("stock", sa.Column("batch_number", sa.String(255)))
    op.add_column("stock", sa.Column("serial_number", sa.String(255)))

def downgrade() -> None:
    op.drop_column("stock", "serial_number")
    op.drop_column("stock", "batch_number")
`);
    write(dir, "alembic/versions/0002_drop_inventory_code.py", `
def upgrade() -> None:
    op.drop_column("stock", "inventory_code")

def downgrade() -> None:
    op.add_column("stock", sa.Column("inventory_code", sa.String(255)))
`);
    // Only inventory_code is forward-dropped; batch_number/serial_number are preserved.
    expect(netDroppedSymbols(dir).sort()).toEqual(["inventory_code"]);
  });

  it("handles knex-style up/down in one JS file (forward direction only)", () => {
    const dir = mkProject();
    write(dir, "migrations/0001_drop_code.js", `
exports.up = async (knex) => { await knex.schema.alterTable('stock', t => t.dropColumn('inventory_code')); await knex.raw('ALTER TABLE stock DROP COLUMN inventory_code'); };
exports.down = async (knex) => { await knex.raw('ALTER TABLE stock ADD COLUMN inventory_code text'); await knex.raw('ALTER TABLE stock ADD COLUMN batch_number text'); };
`);
    // down re-adds batch_number; it must NOT appear as dropped, and the up drop counts.
    expect(netDroppedSymbols(dir, ["migrations"])).toEqual(["inventory_code"]);
  });
});

describe("checkContractClean", () => {
  it("flags production code that still references a migration-dropped column (file:line)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write(dir, "app/models/stock.py", "class Stock(Base):\n    inventory_code = Column(String)\n");
    write(dir, "app/repositories/stock_repo.py", "def by_code(s, v):\n    return s.query(Stock).filter(Stock.inventory_code == v)\n");

    const r = checkContractClean({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.droppedSymbols).toEqual(["inventory_code"]);
    const blob = r.violations.map((v) => `${v.file}:${v.line}`).join("\n");
    expect(blob).toMatch(/app\/models\/stock\.py:\d+/);
    expect(blob).toMatch(/app\/repositories\/stock_repo\.py:\d+/);
    expect(r.remediation).toMatch(/hard rule 9/);
    expect(r.remediation).toMatch(/inventory_code/);
  });

  it("is clean once the dropped column is gone from the code", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write(dir, "app/models/stock.py", "class Stock(Base):\n    batch_number = Column(String)\n    serial_number = Column(String)\n");

    const r = checkContractClean({ projectDir: dir });
    expect(r.clean).toBe(true);
    expect(r.droppedSymbols).toEqual(["inventory_code"]);
    expect(r.violations).toEqual([]);
  });

  it("matches on a word boundary, not a substring (no false positive on inventory_code_legacy)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write(dir, "app/models/stock.py", "class Stock(Base):\n    inventory_code_legacy = Column(String)\n");

    const r = checkContractClean({ projectDir: dir });
    expect(r.clean).toBe(true);
  });

  it("does not scan tests, alembic, or migrations dirs for residual references", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE); // legitimately names it
    write(dir, "tests/test_legacy.py", "assert row.inventory_code is None\n"); // tests are refactored via supersession
    write(dir, "app/models/stock.py", "class Stock(Base):\n    batch_number = Column(String)\n");

    const r = checkContractClean({ projectDir: dir });
    expect(r.clean).toBe(true);
  });

  it("is clean when no migration dropped anything", () => {
    const dir = mkProject();
    write(dir, "app/models/stock.py", "class Stock(Base):\n    inventory_code = Column(String)\n");
    expect(checkContractClean({ projectDir: dir }).clean).toBe(true);
  });
});

describe("supersededTestCandidates (pre-localize prior tests for the Navigator, the test-side of contract-clean)", () => {
  it("flags PRIOR tests that reference a migration-dropped column (file:line) so the Navigator need not search", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write(dir, "tests/test_stock_legacy.py", "def test_code():\n    assert row.inventory_code == 'X'\n");
    write(dir, "tests/architecture/test_schema.py", "def test_col():\n    assert 'inventory_code' in cols\n");

    const r = supersededTestCandidates({ projectDir: dir });
    expect(r.droppedSymbols).toEqual(["inventory_code"]);
    const blob = r.candidates.map((c) => `${c.file}:${c.line}`).join("\n");
    expect(blob).toMatch(/tests\/test_stock_legacy\.py:\d+/);
    expect(blob).toMatch(/tests\/architecture\/test_schema\.py:\d+/);
    expect(r.advisory).toMatch(/SUPERSEDED-TEST CANDIDATES/);
    expect(r.advisory).toMatch(/do NOT need to search/i);
    expect(r.advisory).toMatch(/inventory_code/);
  });

  it("is empty when no prior test references the dropped column (nothing to pre-localize)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write(dir, "tests/test_other.py", "def test_x():\n    assert row.batch_number == 'B'\n");
    const r = supersededTestCandidates({ projectDir: dir });
    expect(r.droppedSymbols).toEqual(["inventory_code"]);
    expect(r.candidates).toEqual([]);
    expect(r.advisory).toBeUndefined();
  });

  it("is empty when no migration dropped anything", () => {
    const dir = mkProject();
    write(dir, "tests/test_x.py", "assert row.inventory_code\n");
    expect(supersededTestCandidates({ projectDir: dir }).candidates).toEqual([]);
  });

  it("pre-localizes a CLIENT e2e spec asserting the dropped column in KEBAB and CAMEL casing (the sku-detail gap)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    // kebab-case test id + camelCase field — the casings the backend-only, exact-snake
    // scan MISSED, forcing the Navigator to catch the client supersession by hand.
    write(dir, "client/tests/e2e/sku-detail.spec.ts",
      `test("T23", async ({ page }) => {\n  await expect(page.getByTestId("inventory-code")).toHaveText(row.inventoryCode);\n});\n`);

    const r = supersededTestCandidates({ projectDir: dir });
    const blob = r.candidates.map((c) => `${c.file}:${c.line} [${c.symbol}]`).join("\n");
    expect(blob).toMatch(/client\/tests\/e2e\/sku-detail\.spec\.ts:\d+/);
    // Reported under the ORIGINAL dropped symbol, not the variant, so the advisory is coherent.
    expect(r.candidates.every((c) => c.symbol === "inventory_code")).toBe(true);
    expect(r.advisory).toMatch(/SUPERSEDED-TEST CANDIDATES/);
  });

  it("does NOT flag a client spec that only references the SURVIVING split fields", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write(dir, "client/tests/e2e/sku-detail.spec.ts",
      `test("T", async ({ page }) => {\n  await expect(page.getByTestId("batch-number")).toBeVisible();\n  await expect(page.getByTestId("serial-number")).toBeVisible();\n});\n`);
    expect(supersededTestCandidates({ projectDir: dir }).candidates).toEqual([]);
  });
});

// The greenOpenCycle wiring: a FIRST verify failure runs the deterministic gate
// before routing the model assess. consortDir lives at <project>/.sftdd so
// dirname(consortDir) === the project root the gate scans.
describe("greenOpenCycle: contract-incompleteness self-heals deterministically", () => {
  const F = "F1";
  const S = "S1";
  let project: string;
  let tdd: string;
  const writeJson = (file: string, obj: unknown): void => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  const fail: GreenVerifier = async () => ({ passed: false, summary: "column stock.inventory_code does not exist" });

  beforeEach(() => {
    project = mkProject();
    tdd = path.join(project, ".sftdd");
    const acsDir = path.join(tdd, "features", F, "stories", S, "acs");
    fs.mkdirSync(acsDir, { recursive: true });
    writeJson(path.join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "drop the legacy column" });
    const items = [{ id: "T1", description: "no inventory_code column", ac_id: "AC1", status: "pending" }];
    writeJson(path.join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    writeJson(path.join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    const expDir = path.join(tdd, "experiments", F, S, "exp1");
    fs.mkdirSync(expDir, { recursive: true });
    fs.writeFileSync(path.join(expDir, "branch.txt"), "experiment-s1-exp1");
    writeJson(path.join(expDir, "outcomes.json"), { status: "running" });
  });

  it("a failing verify with a residual reference to a dropped column routes the Navigator assess + records a contractRefs ADVISORY (does NOT short-circuit)", async () => {
    write(project, "alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write(project, "app/models/stock.py", "class Stock(Base):\n    inventory_code = Column(String)\n");
    // A prior test that asserts the dropped column: a supersession candidate the
    // gate pre-localizes so the assess flags it (path a) without searching.
    write(project, "tests/test_legacy_code.py", "def test_code():\n    assert row.inventory_code == 'X'\n");

    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: fail });

    expect(r.recorded).toBe(false);
    // Routes the Navigator assess (which also handles superseded prior tests),
    // enriched with the deterministic contract refs – NOT a contract-only repair.
    expect(r.needsAssess).toBe(true);
    expect(r.escalated).toBeFalsy();
    const gf = readGreenFailure(tdd, F, S, "AC1");
    expect(gf?.assessed).toBe(false); // assess still runs (supersession needs it)
    expect(gf?.contractRefs).toMatch(/inventory_code/);
    expect(gf?.contractRefs).toMatch(/hard rule 9/);
    // The test-side pre-localization rode into the same green-failure marker.
    expect(gf?.supersededTestRefs).toMatch(/SUPERSEDED-TEST CANDIDATES/);
    expect(gf?.supersededTestRefs).toMatch(/test_legacy_code\.py/);
    expect(needsGreenAssess(tdd, F, S, "AC1")).toBe(true);
  });

  it("a failing verify with NO migration drop falls through to the Navigator assess with no contractRefs", async () => {
    // no migration, just a verify failure (e.g. a superseded sibling test)
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: fail });

    expect(r.recorded).toBe(false);
    expect(r.needsAssess).toBe(true);
    expect(needsGreenAssess(tdd, F, S, "AC1")).toBe(true);
    const gf = readGreenFailure(tdd, F, S, "AC1");
    expect(gf?.assessed).toBe(false);
    expect(gf?.contractRefs).toBeUndefined();
  });
});
