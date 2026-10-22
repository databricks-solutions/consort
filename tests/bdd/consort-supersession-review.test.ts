// The REVIEW step runs a deterministic SUPERSESSION gate (supersededTestCandidates against the
// project's migrations × test tree) and, when a migration DROPPED a column that PRIOR tests still
// assert, flags the story-scoped `superseded-tests` smell — with NO model cooperation. This closes
// the rubber-stamp-review escape behind the S2 supersession miss: a layer-scoped GREEN verify can
// pass without running the prior story's tests, and a `refactor:false` review then lets the retired
// tests ship as a red suite. Because `superseded-tests` is build-refactor-routable, the open smell
// routes the Driver's REFACTOR even on refactor:false; the refactor-verify failure then routes the
// Navigator's supersession assess (superseded-vs-regression decision — never a blind auto-retire).
// Mirrors the layering/ux review backstops (consort-layering-review.test.ts).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewStory } from "../../consort/pipeline/cycle-record.js";
import { readSmellsLog } from "../../consort/smells/smells.js";

const F = "F1";
const S = "S1";
let proj: string;
let tdd: string;

function writeJson(file: string, obj: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}
function write(rel: string, body: string): void {
  const abs = join(proj, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

const DROP_INVENTORY_CODE = `
def upgrade():
    op.drop_column('stock', 'inventory_code')

def downgrade():
    op.add_column('stock', sa.Column('inventory_code', sa.String()))
`;

const openSupersededSmells = () =>
  readSmellsLog(tdd).detected.filter((d) => d.smell === "superseded-tests" && !d.resolution);

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "supersede-review-"));
  tdd = join(proj, ".sftdd");
  writeJson(join(tdd, "features", F, "stories", S, "acs", "AC1.json"), { id: "AC1", layer: "API" });
});
afterEach(() => rmSync(proj, { recursive: true, force: true }));

describe("reviewStory flags superseded-tests when a migration drop supersedes prior tests (deterministic backstop)", () => {
  it("writes the story-scoped superseded-tests smell when a prior test asserts a dropped column", () => {
    write("alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write("tests/test_stock_legacy.py", "def test_code():\n    assert row.inventory_code == 'X'\n");
    reviewStory(tdd, F, S);
    const hits = openSupersededSmells();
    expect(hits.length).toBe(1);
    expect(hits[0].story_id).toBe(S);
    expect(hits[0].detail).toMatch(/superseded-test candidates|inventory_code/i);
  });

  it("writes nothing when a column was dropped but NO prior test references it", () => {
    write("alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write("tests/test_other.py", "def test_x():\n    assert row.batch_number == 'B'\n");
    reviewStory(tdd, F, S);
    expect(openSupersededSmells().length).toBe(0);
  });

  it("writes nothing when no migration dropped anything (ordinary review untouched)", () => {
    write("tests/test_stock.py", "def test_code():\n    assert row.inventory_code == 'X'\n");
    reviewStory(tdd, F, S);
    expect(openSupersededSmells().length).toBe(0);
  });

  it("is idempotent (no double-write on a repeat review)", () => {
    write("alembic/versions/0003_drop.py", DROP_INVENTORY_CODE);
    write("tests/test_stock_legacy.py", "def test_code():\n    assert row.inventory_code == 'X'\n");
    reviewStory(tdd, F, S);
    reviewStory(tdd, F, S);
    expect(openSupersededSmells().length).toBe(1);
  });
});
