// The DBA role's db-design.json is the PHYSICAL schema that realizes the
// architect's logical persistence_invariants. These tests pin the two layers:
// (1) db-design.json validates against its schema (ARTIFACT_FORMATS), and
// (2) checkDbDesign cross-checks a service_backed feature declares >=1 table and
//     realizes EVERY architecture.json persistence_invariant id.
// A not-service_backed feature is exempt (db-design may be absent/empty).

import { describe, it, expect } from "vitest";
import {
  checkArtifactConformance,
  hasDeclaredFormat,
  checkDbDesign,
} from "../../consort/orchestrator/validators/conformance/artifact-conformance";

const arch = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({ feature_id: "F1", service_backed: true, nfrs: [], ...over });

const invariants = [
  { id: "PI1-unique-email", type: "unique", table: "users", brief: "email is unique" },
  { id: "PI2-fk-order-user", type: "foreign_key", table: "orders", brief: "order.user_id -> users.id" },
];

const conformantDbDesign = JSON.stringify({
  feature_id: "F1",
  tables: [
    {
      name: "users",
      columns: [
        { name: "id", type: "uuid", nullable: false },
        { name: "email", type: "text", nullable: false },
      ],
      primary_key: ["id"],
      unique_constraints: [["email"]],
    },
    {
      name: "orders",
      columns: [
        { name: "id", type: "uuid", nullable: false },
        { name: "user_id", type: "uuid", nullable: false },
      ],
      primary_key: ["id"],
      foreign_keys: [{ columns: ["user_id"], references_table: "users", references_columns: ["id"], on_delete: "cascade" }],
    },
  ],
  schema_changes: [
    { story_id: "S1", kind: "create_table", table: "users", detail: "id, email unique" },
    { story_id: "S1", kind: "create_table", table: "orders", detail: "id, user_id fk" },
  ],
  realizes_invariants: ["PI1-unique-email", "PI2-fk-order-user"],
});

describe("db-design.json schema conformance", () => {
  it("db-design.json is a declared artifact format", () => {
    expect(hasDeclaredFormat("db-design.json")).toBe(true);
  });

  it("a conformant db-design.json validates against its schema", () => {
    expect(checkArtifactConformance("db-design.json", conformantDbDesign)).toEqual({ ok: true });
  });

  it("rejects an unknown top-level key (additionalProperties:false)", () => {
    const bad = JSON.stringify({ feature_id: "F1", tables: [], surprise: 1 });
    expect(checkArtifactConformance("db-design.json", bad).ok).toBe(false);
  });

  it("rejects a foreign_key missing references_table", () => {
    const bad = JSON.stringify({
      feature_id: "F1",
      tables: [{ name: "orders", columns: [{ name: "id", type: "uuid" }], foreign_keys: [{ columns: ["user_id"], references_columns: ["id"] }] }],
    });
    expect(checkArtifactConformance("db-design.json", bad).ok).toBe(false);
  });
});

describe("checkDbDesign: invariant realization (physical counterpart to checkPersistenceCoverage)", () => {
  it("ok when a service_backed feature realizes every invariant with >=1 table", () => {
    expect(checkDbDesign(conformantDbDesign, arch({ persistence_invariants: invariants }))).toEqual({ ok: true });
  });

  it("exempts a not-service_backed feature (db-design may be absent)", () => {
    expect(checkDbDesign(undefined, arch({ service_backed: false }))).toEqual({ ok: true });
  });

  // A service does NOT always mean a database: a service_backed feature that
  // declares NO persistence_invariants is a non-persisting service (compute /
  // proxy / external-API aggregator). It has nothing to realize, so db-design
  // is optional and the DBA is skipped. persistence_invariants (not
  // service_backed) is the source of truth for "has a database".
  it("exempts a service_backed feature that declares NO persistence_invariants (a non-persisting service)", () => {
    expect(checkDbDesign(undefined, arch({ service_backed: true }))).toEqual({ ok: true });
    expect(checkDbDesign(undefined, arch({ service_backed: true, persistence_invariants: [] }))).toEqual({ ok: true });
  });

  it("FLAGS a service_backed feature with NO db-design.json", () => {
    const r = checkDbDesign(undefined, arch({ persistence_invariants: invariants }));
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/no db-design\.json/i);
  });

  it("FLAGS a service_backed db-design that declares no tables", () => {
    const noTables = JSON.stringify({ feature_id: "F1", tables: [], realizes_invariants: ["PI1-unique-email", "PI2-fk-order-user"] });
    const r = checkDbDesign(noTables, arch({ persistence_invariants: invariants }));
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/no tables/i);
  });

  it("FLAGS an invariant left unrealized by realizes_invariants[]", () => {
    const missingOne = JSON.stringify({
      feature_id: "F1",
      tables: [{ name: "users", columns: [{ name: "id", type: "uuid" }] }],
      realizes_invariants: ["PI1-unique-email"],
    });
    const r = checkDbDesign(missingOne, arch({ persistence_invariants: invariants }));
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/PI2-fk-order-user/);
  });
});

describe("checkDbDesign: access-pattern coverage (the DBA re-trigger for a later read story)", () => {
  const accessPatterns = [{ id: "AP1-stock-by-location", table: "stock", columns: ["location"], brief: "filter stock by location" }];
  const withAp = (dbExtra: Record<string, unknown>): string =>
    JSON.stringify({ ...JSON.parse(conformantDbDesign), ...dbExtra });

  it("ok when the feature declares NO access_patterns (back-compat: a story that adds no new query shape)", () => {
    expect(checkDbDesign(conformantDbDesign, arch({ persistence_invariants: invariants }))).toEqual({ ok: true });
  });

  it("ok when every declared access_pattern id is addressed", () => {
    const db = withAp({ addresses_access_patterns: ["AP1-stock-by-location"] });
    expect(checkDbDesign(db, arch({ persistence_invariants: invariants, access_patterns: accessPatterns }))).toEqual({ ok: true });
  });

  it("FAILS (naming the id) when a declared access_pattern is not addressed — this is what re-runs the DBA", () => {
    // db-design.json realizes the invariants but addresses no access pattern (the DBA ran before this
    // story's query shape existed) -> uncovered -> dbaDesigned reads false -> the DBA re-runs.
    const r = checkDbDesign(conformantDbDesign, arch({ persistence_invariants: invariants, access_patterns: accessPatterns }));
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/AP1-stock-by-location/);
  });

  it("a db-design.json carrying addresses_access_patterns validates against its schema", () => {
    const db = withAp({ addresses_access_patterns: ["AP1-stock-by-location"] });
    expect(checkArtifactConformance("db-design.json", db)).toEqual({ ok: true });
  });
});
