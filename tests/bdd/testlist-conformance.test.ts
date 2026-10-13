// The deterministic pre-reflect test_list gate (consort/smells/testlist-conformance.ts):
// runs the structural conformance checks over a story's test-list EARLIER than the
// spec gate — so a structural defect (a client test on a non-E2E AC, a jsdom-vacuous
// browser assertion) flags the reflect-testlist-defect smell without an LLM reflect lap.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { testlistConformanceReason, recordTestListGate } from "../../consort/smells/testlist-conformance.js";
import { readSmellsLog } from "../../consort/smells/smells.js";

const F = "F1";
const S = "S1";
const tmpDirs: string[] = [];

/** A .consort dir with a story's acs/*.json + test-list-per-story.json. */
function seed(acs: Array<{ id: string; layer: string }>, items: Array<{ id: string; kind: string; ac_id: string; scenario_file?: string; description?: string }>): string {
  const consortDir = fs.mkdtempSync(path.join(os.tmpdir(), "testlist-conf-"));
  tmpDirs.push(consortDir);
  const storyDir = path.join(consortDir, "features", F, "stories", S);
  const acsDir = path.join(storyDir, "acs");
  fs.mkdirSync(acsDir, { recursive: true });
  for (const ac of acs) fs.writeFileSync(path.join(acsDir, `${ac.id}.json`), JSON.stringify({ id: ac.id, layer: ac.layer }));
  fs.writeFileSync(path.join(storyDir, "test-list-per-story.json"), JSON.stringify({ feature_id: F, story_id: S, items }));
  return consortDir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

describe("testlistConformanceReason", () => {
  it("is null (conformant) for a client item on an E2E AC + a real e2e spec", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [{ id: "T1", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a row" }],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("flags a client item anchored to an API-layer AC (the T22 class)", () => {
    const dir = seed(
      [{ id: "AC3-collision", layer: "API" }],
      [{ id: "T22", kind: "client", ac_id: "AC3-collision", scenario_file: "client/tests/e2e/optimistic.spec.ts", description: "updates in place" }],
    );
    const reason = testlistConformanceReason(dir, F, S);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/AC3-collision|client/i);
  });

  it("flags a jsdom-vacuous browser assertion (the T19 class)", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [
        { id: "T1", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a row" },
        { id: "T19", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/pages/App.routing.test.tsx", description: "no full-page reload occurs during any transition" },
      ],
    );
    expect(testlistConformanceReason(dir, F, S)).not.toBeNull();
  });

  it("flags an absolute whole-table aggregate in the description (the F6/S1 T12 class)", () => {
    const dir = seed(
      [{ id: "AC4-nulls", layer: "Infra" }],
      [{ id: "T12", kind: "fitness", ac_id: "AC4-nulls", description: "the integrity probe returns exactly the count of rows with NULL batch_number or serial_number" }],
    );
    const reason = testlistConformanceReason(dir, F, S);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/whole-table aggregate|aggregate-isolation/i);
  });

  it("does NOT flag a delta-scoped or own-row-scoped count (the aggregate-isolation escape)", () => {
    const dir = seed(
      [{ id: "AC4-nulls", layer: "Infra" }],
      [
        { id: "T12d", kind: "fitness", ac_id: "AC4-nulls", description: "capture count_before, seed 2 rows scoped to the test's own SKUs, assert count_after - count_before == 2 (delta)" },
        { id: "T12e", kind: "behavior", ac_id: "AC4-nulls", description: "the empty-state renders when the table has zero rows for this location" },
      ],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("flags an E2E create flow keyed on a hardcoded business key (the S1 fixed-key-e2e lap)", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [{ id: "T26", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files SKU-100 at B2 with quantity 5 and a tracking code, then asserts the row" }],
    );
    const reason = testlistConformanceReason(dir, F, S);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/hardcoded business key|per-run uniqueness|unique-violation/i);
  });

  it("does NOT flag an E2E create flow that seeds a per-run-unique key (the fix)", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [{ id: "T26", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a fresh per-run-unique SKU (crypto.randomUUID) at B2 with quantity 5, then asserts that same SKU" }],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("does NOT flag an E2E create flow whose only literals are location codes / quantities (no false positive)", () => {
    // A1/B2 (one letter + one digit) and quantities (12) are not business keys — the tight
    // >=2-letters + >=2-digits literal pattern must not trip on them.
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [{ id: "T1", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a stock record at location A1 with quantity 12 and asserts it renders" }],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("does NOT flag a hardcoded key on a NON-E2E (API) client-less item (scoped to the Playwright surface)", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "API" }],
      [{ id: "Tb", kind: "behavior", ac_id: "AC1-file", description: "POST /api/stock for SKU-100 at B2 returns the persisted row" }],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("flags a test whose description names a DIFFERENT spec file than its scenario_file (the S2/T28 class)", () => {
    const dir = seed(
      [{ id: "AC1-table", layer: "E2E" }],
      [{ id: "T28", kind: "client", ac_id: "AC1-table", scenario_file: "client/tests/e2e/stock-table-rows.spec.ts", description: "Playwright e2e in client/tests/e2e/home-stock-table.spec.ts asserts the rows render" }],
    );
    const reason = testlistConformanceReason(dir, F, S);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/scenario_file|which file to author/i);
  });

  it("does NOT flag when the description names the SAME spec file (basename match, path prefix differences OK)", () => {
    const dir = seed(
      [{ id: "AC1-table", layer: "E2E" }],
      [{ id: "T28", kind: "client", ac_id: "AC1-table", scenario_file: "client/tests/e2e/stock-table-rows.spec.ts", description: "the stock-table-rows.spec.ts e2e asserts the rows render at route /" }],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("does NOT flag a description that names an unrelated non-test path (tight: only same-suffix tokens compared)", () => {
    const dir = seed(
      [{ id: "AC1-table", layer: "E2E" }],
      [{ id: "T1", kind: "client", ac_id: "AC1-table", scenario_file: "client/tests/e2e/stock-table-rows.spec.ts", description: "asserts the GET app/routes/stock.py handler response renders rows" }],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("is vacuously null when no test-list exists yet (never pre-empts before testListReady)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "testlist-conf-"));
    tmpDirs.push(dir);
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });
});

describe("recordTestListGate", () => {
  it("flags the reflect-testlist-defect smell on a non-conformant test-list, no LLM turn", () => {
    const dir = seed(
      [{ id: "AC3-collision", layer: "API" }],
      [{ id: "T22", kind: "client", ac_id: "AC3-collision", scenario_file: "client/tests/e2e/x.spec.ts", description: "x" }],
    );
    const hits = recordTestListGate(dir, F, S);
    expect(hits).toHaveLength(1);
    expect(hits[0].smell).toBe("reflect-testlist-defect");
    const open = readSmellsLog(dir).detected.filter((d) => d.smell === "reflect-testlist-defect" && !d.resolution);
    expect(open).toHaveLength(1);
    expect(open[0].detail).toMatch(/test-list conformance/);
  });

  it("carries the flagged ac_id(s) on the smell so the revise self-heal can scope the re-author (#4)", () => {
    const dir = seed(
      [
        { id: "AC3-collision", layer: "API" },
        { id: "AC5-clean", layer: "E2E" },
      ],
      [
        { id: "T22", kind: "client", ac_id: "AC3-collision", scenario_file: "client/tests/e2e/x.spec.ts", description: "x" },
        { id: "T5", kind: "client", ac_id: "AC5-clean", scenario_file: "client/tests/e2e/clean.spec.ts", description: "files a row" },
      ],
    );
    const hits = recordTestListGate(dir, F, S);
    expect(hits).toHaveLength(1);
    // only the flagged AC is named — not the conformant sibling
    expect(hits[0].ac_ids).toEqual(["AC3-collision"]);
    const open = readSmellsLog(dir).detected.find((d) => d.smell === "reflect-testlist-defect" && !d.resolution);
    expect(open?.ac_ids).toEqual(["AC3-collision"]);
  });

  it("returns [] and self-clears on a conformant test-list", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [{ id: "T1", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a row" }],
    );
    expect(recordTestListGate(dir, F, S)).toEqual([]);
    const open = readSmellsLog(dir).detected.filter((d) => d.smell === "reflect-testlist-defect" && !d.resolution);
    expect(open).toHaveLength(0);
  });
});
