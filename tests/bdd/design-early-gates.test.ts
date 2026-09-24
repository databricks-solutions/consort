// BDD coverage for the design-lane early gates: three deterministic checks that
// catch the two S1 defect classes one step after authoring instead of at the
// reflect + revise lap downstream.
//
//   A. checkMigrationPreservationClass – a preservation-class NFR on an
//      all-initial-create design (unsatisfiable as written, or a declared
//      self-contradiction) is blocked at the architecture gate.
//   B1. checkFitnessSingularCoverage – the legacy singular `fitness_function`
//      form gets the same per-NFR coverage the atomic array form already had.
//   B2. checkClientKindLayerCoherence – a kind:"client" item may anchor ONLY to
//      an E2E-layer AC (the deterministic mechanism-conflict rule).

import { describe, it, expect } from "vitest";
import {
  checkMigrationPreservationClass,
  checkFitnessSingularCoverage,
  checkClientKindLayerCoherence,
} from "../../consort/orchestrator/validators/conformance/artifact-conformance.js";

const CREATE_ONLY_DB = JSON.stringify({ schema_changes: [{ kind: "create_table", table: "stock_records" }] });
const ADDITIVE_DB = JSON.stringify({ schema_changes: [{ kind: "create_table", table: "stock_records" }, { kind: "add_column", table: "stock_records" }] });

function arch(nfrs: unknown[]): string {
  return JSON.stringify({ nfrs });
}
function tl(items: unknown[]): string {
  return JSON.stringify({ items });
}

describe("checkMigrationPreservationClass", () => {
  it("blocks an NFR whose own text declares the obligation unsatisfiable (self-contradiction)", () => {
    const r = checkMigrationPreservationClass(
      arch([{ id: "NFR-migration-data-preservation", tier: "product", fitness_function: "Data preservation across migration. (NOTE: for the INITIAL create_table this is UNSATISFIABLE — skip it)" }]),
      CREATE_ONLY_DB,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/NFR-migration-data-preservation/);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/self-contradiction/i);
  });

  it("blocks a preservation-class NFR with no forward-only marker on an all-initial-create design", () => {
    const r = checkMigrationPreservationClass(
      arch([{ id: "NFR-rows-survive", tier: "product", statement: "Existing rows survive every migration with no loss." }]),
      CREATE_ONLY_DB,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/unsatisfiable as written/);
  });

  it("passes a FORWARD-ONLY preservation guard on an all-initial-create design (the sanctioned form)", () => {
    const r = checkMigrationPreservationClass(
      arch([{ id: "NFR-migration-data-preservation", tier: "product", fitness_function: "Seed a stock_records row after the initial create, run alembic upgrade head, and assert the row is still present with every value intact." }]),
      CREATE_ONLY_DB,
    );
    expect(r.ok).toBe(true);
  });

  it("passes preservation text when the design has an ADDITIVE change (a pre-existing table)", () => {
    const r = checkMigrationPreservationClass(
      arch([{ id: "NFR-rows-survive", tier: "product", statement: "Existing rows survive every migration with no loss." }]),
      ADDITIVE_DB,
    );
    expect(r.ok).toBe(true);
  });

  it("defers when there is no db-design yet (class unknowable) and exempts platform NFRs", () => {
    expect(
      checkMigrationPreservationClass(arch([{ id: "NFR-rows-survive", tier: "product", statement: "Existing rows survive every migration with no loss." }])).ok,
    ).toBe(true);
    expect(
      checkMigrationPreservationClass(arch([{ id: "NFR-rows-survive", tier: "platform", statement: "Existing rows survive every migration with no loss." }]), CREATE_ONLY_DB).ok,
    ).toBe(true);
  });
});

describe("checkFitnessSingularCoverage", () => {
  it("flags a singular-form NFR with NO nfr_id-tagged item (the hole the clause gate leaves)", () => {
    const r = checkFitnessSingularCoverage(
      tl([{ id: "T1", kind: "behavior" }]),
      arch([{ id: "NFR-migration-data-preservation", tier: "product", fitness_function: "Seed + upgrade head + assert intact." }]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/NFR-migration-data-preservation/);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/nfr_id/);
  });

  it("passes a covered singular NFR, and leaves the ARRAY form to the clause gate", () => {
    expect(
      checkFitnessSingularCoverage(
        tl([{ id: "T8", kind: "fitness", nfr_id: "NFR-migration-data-preservation" }]),
        arch([{ id: "NFR-migration-data-preservation", tier: "product", fitness_function: "Seed + upgrade head + assert intact." }]),
      ).ok,
    ).toBe(true);
    // Array-form NFR with zero items: NOT this gate's job (checkFitnessClauseCoverage owns it).
    expect(
      checkFitnessSingularCoverage(
        tl([]),
        arch([{ id: "NFR-unique", tier: "product", fitness_functions: ["clause a", "clause b"] }]),
      ).ok,
    ).toBe(true);
  });

  it("exempts platform-tier singular NFRs (defended once elsewhere)", () => {
    expect(
      checkFitnessSingularCoverage(tl([]), arch([{ id: "NFR-spa-json", tier: "platform", fitness_function: "respond with JSON." }])).ok,
    ).toBe(true);
  });
});

describe("checkClientKindLayerCoherence", () => {
  it("flags a kind:'client' item anchored to an API-layer AC (the T9 mechanism conflict)", () => {
    const r = checkClientKindLayerCoherence(
      tl([{ id: "T9", kind: "client", ac_id: "AC3-collision-resolved-at-write" }]),
      { "AC3-collision-resolved-at-write": "API" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/T9/);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/AC3-collision-resolved-at-write/);
    if (!r.ok) expect(r.violations?.[0]).toMatch(/mechanism conflict/);
  });

  it("passes a client item on an E2E-layer AC and a behavior item on an API AC", () => {
    const r = checkClientKindLayerCoherence(
      tl([
        { id: "T8", kind: "client", ac_id: "AC1-file-stock-record" },
        { id: "T16", kind: "behavior", ac_id: "AC3-collision-resolved-at-write" },
      ]),
      { "AC1-file-stock-record": "E2E", "AC3-collision-resolved-at-write": "API" },
    );
    expect(r.ok).toBe(true);
  });

  it("defers when the AC has no recorded layer (the layer contract check owns that)", () => {
    const r = checkClientKindLayerCoherence(tl([{ id: "T9", kind: "client", ac_id: "ACX" }]), {});
    expect(r.ok).toBe(true);
  });
});
