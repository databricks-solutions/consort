// The deterministic pre-reflect test_list gate (consort/smells/testlist-conformance.ts):
// runs the structural conformance checks over a story's test-list EARLIER than the
// spec gate — so a structural defect (a client test on a non-E2E AC, a jsdom-vacuous
// browser assertion) flags the reflect-testlist-defect smell without an LLM reflect lap.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { testlistConformanceReason, recordTestListGate } from "../../consort/smells/testlist-conformance.js";
import { checkTestlistEndpointCoherence, checkTestlistE2eSpecSuffix, checkTestlistComponentScenarioFile, checkTestlistMigrationRevision } from "../../consort/orchestrator/validators/conformance/artifact-conformance.js";
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

describe("checkTestlistEndpointCoherence (Fix A: endpoint drift vs the declared API surface)", () => {
  // The declared surface as extractApiEndpoints yields it (clean `/api/...` tokens): a location list on
  // /api/stock, and the DEDICATED SKU-detail endpoint the architecture revise moved sku-detail to.
  const declared = ["/api/stock?location=<loc>", "/api/skus/{sku}"];
  const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "T1", kind: "client", ac_id: "AC1", description: "", ...over });
  const tl = (its: Array<Record<string, unknown>>): string => JSON.stringify({ items: its });

  it("flags a test querying /api/stock?sku= when sku has a dedicated /api/skus/{sku} endpoint (the S3 drift)", () => {
    const r = checkTestlistEndpointCoherence(tl([item({ description: "GET /api/stock?sku=SKU-100 returns only SKU-100 rows" })]), declared);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.join(" ")).toMatch(/dedicated endpoint|skus\/\{sku\}/i);
      expect(r.acIds).toEqual(["AC1"]);
    }
  });

  it("flags a behavior test the same way (not only client)", () => {
    expect(checkTestlistEndpointCoherence(tl([item({ kind: "behavior", description: "GET /api/stock?sku=SKU-300 returns an empty list" })]), declared).ok).toBe(false);
  });

  it("does NOT flag the dedicated endpoint /api/skus/SKU-100 (normalizes to /api/skus/{param})", () => {
    expect(checkTestlistEndpointCoherence(tl([item({ description: "GET /api/skus/SKU-100 returns {sku, par_level, locations}" })]), declared).ok).toBe(true);
  });

  it("does NOT flag a DECLARED query key (/api/stock?location=)", () => {
    expect(checkTestlistEndpointCoherence(tl([item({ description: "GET /api/stock?location=A-01 lists rows" })]), declared).ok).toBe(true);
  });

  it("does NOT flag an undeclared query key with NO dedicated endpoint (fail-open: pagination/filters)", () => {
    expect(checkTestlistEndpointCoherence(tl([item({ description: "GET /api/stock?page=2 paginates the rows" })]), declared).ok).toBe(true);
  });

  it("flags a path absent from the declared surface entirely", () => {
    const r = checkTestlistEndpointCoherence(tl([item({ description: "GET /api/widgets lists widgets" })]), declared);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/not in the architecture's declared API surface/);
  });

  it("is vacuously OK when the declared surface is empty (fail-open: nothing to validate against)", () => {
    expect(checkTestlistEndpointCoherence(tl([item({ description: "GET /api/stock?sku=SKU-100" })]), []).ok).toBe(true);
  });

  it("does NOT flag a non-behavior/client kind, nor an item that names no endpoint (prose phrasing)", () => {
    expect(checkTestlistEndpointCoherence(tl([item({ kind: "fitness", description: "the probe hits GET /api/stock?sku=SKU-100" })]), declared).ok).toBe(true);
    expect(checkTestlistEndpointCoherence(tl([item({ description: "files a stock record and asserts it renders" })]), declared).ok).toBe(true);
  });
});

describe("checkTestlistE2eSpecSuffix (Fix: an e2e-dir scenario_file Playwright won't match — the .e2e.ts defect)", () => {
  const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "T1", kind: "client", ac_id: "AC1-file", ...over });
  const tl = (its: Array<Record<string, unknown>>): string => JSON.stringify({ items: its });

  it("flags a scenario_file under tests/e2e/ that uses the .e2e.ts suffix (the live defect)", () => {
    const r = checkTestlistE2eSpecSuffix(tl([item({ scenario_file: "client/tests/e2e/file-stock.e2e.ts" })]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.join(" ")).toMatch(/tests\/e2e\/|never runs|\.spec\.ts/);
      expect(r.acIds).toEqual(["AC1-file"]);
    }
  });

  it("does NOT flag a real Playwright e2e spec (.spec.ts under tests/e2e)", () => {
    expect(checkTestlistE2eSpecSuffix(tl([item({ scenario_file: "client/tests/e2e/file-stock.spec.ts" })])).ok).toBe(true);
  });

  it("does NOT flag a pages/*.test.tsx harness (NOT under tests/e2e — a separate mechanism concern)", () => {
    expect(checkTestlistE2eSpecSuffix(tl([item({ scenario_file: "client/tests/pages/FileStock.test.tsx" })])).ok).toBe(true);
  });

  it("does NOT flag a .e2e.ts token that is not under a tests/e2e/ dir, nor an item with no scenario_file", () => {
    expect(checkTestlistE2eSpecSuffix(tl([item({ scenario_file: "client/tests/misc/file-stock.e2e.ts" })])).ok).toBe(true);
    expect(checkTestlistE2eSpecSuffix(tl([item({})])).ok).toBe(true);
  });
});

describe("checkTestlistComponentScenarioFile (Fix: a component item must name its .test.tsx file — the S1 file-less class)", () => {
  const comp = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "T1", kind: "component", ac_id: "AC1-file", ...over });
  const tl = (its: Array<Record<string, unknown>>): string => JSON.stringify({ items: its });

  it("flags a component item with NO scenario_file (the S1 defect)", () => {
    const r = checkTestlistComponentScenarioFile(tl([comp({})]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.join(" ")).toMatch(/kind:"component".*missing|\.test\.tsx/);
      expect(r.acIds).toEqual(["AC1-file"]);
    }
  });

  it("flags a component item whose scenario_file is an e2e .spec.ts (wrong harness)", () => {
    expect(checkTestlistComponentScenarioFile(tl([comp({ scenario_file: "client/tests/e2e/file-stock.spec.ts" })])).ok).toBe(false);
  });

  it("does NOT flag a component item with a proper client/tests/<...>.test.tsx file", () => {
    expect(checkTestlistComponentScenarioFile(tl([comp({ scenario_file: "client/tests/components/StockTable.test.tsx" })])).ok).toBe(true);
  });

  it("ignores non-component kinds", () => {
    expect(checkTestlistComponentScenarioFile(tl([{ id: "T2", kind: "client", ac_id: "AC1", scenario_file: "client/tests/e2e/x.spec.ts" }])).ok).toBe(true);
    expect(checkTestlistComponentScenarioFile(tl([{ id: "T3", kind: "behavior", ac_id: "AC1" }])).ok).toBe(true);
  });
});

describe("checkTestlistMigrationRevision (relative `downgrade -1` reversibility tests are fragile)", () => {
  const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "T6", kind: "fitness", ac_id: "AC1-file-stock-record", ...over });
  const tl = (its: Array<Record<string, unknown>>): string => JSON.stringify({ items: its });

  it("flags the live S1 T6: `alembic downgrade -1 then upgrade head recreates stock_records` (relative, head-moves)", () => {
    const r = checkTestlistMigrationRevision(tl([item({ description: "On the paired branch, alembic downgrade -1 then upgrade head recreates stock_records with columns sku, location, quantity and the constraints present again" })]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.join(" ")).toMatch(/relative step|downgrade -1|own revision/i);
      expect(r.acIds).toEqual(["AC1-file-stock-record"]);
    }
  });

  it("flags the S2 T39 'single-step alembic downgrade -1' reversibility test", () => {
    expect(checkTestlistMigrationRevision(tl([item({ id: "T39", ac_id: "AC3-empty-location-state", description: "Migration reversibility: on the paired branch a single-step alembic downgrade -1 then upgrade head recreates index ix_stock_records_location_sku" })])).ok).toBe(false);
  });

  it("flags the S2 T40 data-preservation test that survives a `single-step downgrade -1`", () => {
    expect(checkTestlistMigrationRevision(tl([item({ id: "T40", ac_id: "AC3-empty-location-state", description: "Data preservation: stock_records rows survive a single-step downgrade -1 then upgrade head of the additive index migration with their original values" })])).ok).toBe(false);
  });

  it("does NOT flag the FIX: downgrade pinned to the migration's own explicit revision", () => {
    expect(checkTestlistMigrationRevision(tl([item({ description: "On the paired branch, alembic downgrade to 20261014070350-1 (the create-table migration's parent) then upgrade head recreates stock_records with its columns and constraints" })])).ok).toBe(true);
  });

  it("does NOT flag a reversibility test that names down_revision explicitly", () => {
    expect(checkTestlistMigrationRevision(tl([item({ description: "downgrade to the create-table migration's down_revision, assert stock_records absent, then upgrade head and re-assert the schema" })])).ok).toBe(true);
  });

  it("is vacuously OK for a non-migration test that happens to mention nothing of downgrades", () => {
    expect(checkTestlistMigrationRevision(tl([item({ kind: "behavior", description: "PUT /api/stock/SKU-100/A-01 returns created:true" })])).ok).toBe(true);
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
