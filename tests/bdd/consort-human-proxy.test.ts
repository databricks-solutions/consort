// the mock HITL approver must NOT fabricate approvals, and must
// NOT approve a gate whose artifacts exist but do not conform to their
// declared format.
//
// Layer 1 (existence): regression for the 002 gate-integrity finding, the mock
// previously approved plan / test_list / promote at claim time (all four gates
// default to "open") by hashing a placeholder "MOCK_APPROVED" for the missing
// files, nullifying the gate. It must SKIP gates whose artifacts are absent.
//
// Layer 2 (conformance): a gate whose artifact exists but is malformed (JSON
// that fails its schema, narrative MD missing required sections) must also be
// SKIPPED, with the violations as the reason, never approved.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { drainGatesAsHumanProxy, supplyArtifact, supplyRequests, supplyProposals } from "../../consort/gates/human-proxy";
import { featureProposalsMd } from "../../consort/config/consort-paths";
import { checkArtifactConformance } from "../../consort/orchestrator/validators/conformance/artifact-conformance";
import { readGates } from "../../consort/gates/gates";
import { hashArtifact } from "../../consort/gates/gate-hash";
import { readAgentLog } from "../../consort/logging/agent-log";

const FEATURE_ID = "F1-initial-domain";
const PLACEHOLDER_HASH = hashArtifact("MOCK_APPROVED");

// Conformant fixtures (schema-valid JSON; section-complete narrative).
const FEATURE_JSON = JSON.stringify({
  id: "F1-initial-domain",
  name: "Initial Domain",
  status: "draft",
  tdd_mode: "N=1",
});
const FEATURE_MD = [
  "# v1: Initial Domain",
  "## Summary",
  "A bug tracker.",
  "## Stories",
  "S1 file a bug.",
  "## Out of scope",
  "Auth.",
  "## Open questions",
  "Q1 status graph?",
  "",
].join("\n");
const TEST_LIST_JSON = JSON.stringify({
  feature_id: "F1-initial-domain",
  items: [{ id: "T1", description: "files a bug", ac_id: "AC1", status: "pending" }],
});

let tdd: string;
let fdir: string;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-human-proxy-"));
  fdir = join(tdd, "features", FEATURE_ID);
  mkdirSync(fdir, { recursive: true });
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

/** Seed the test-strategist fan-out provenance the test_list gate now requires (testStrategistFanOutReason
 *  reads the persisted agent-log for a `test-analyst:<kind>` dispatch event per enabled analyst). These
 *  tests target OTHER test_list conditions (fitness/persistence/schema coverage), so give them a legitimate
 *  fan-out log so that condition passes and the one under test is isolated. All three kinds (behavior/fitness/
 *  client) are seeded so it holds whether or not uiTrack enables the client analyst. */
function seedFanOut(consortDir: string): void {
  const line = (kind: string) =>
    JSON.stringify({ timestamp: new Date().toISOString(), level: "info", role: "test-strategist", event: "reasoning", message: `test-analyst:${kind} dispatched (model=sonnet)` });
  appendFileSync(join(consortDir, "agent-log.jsonl"), ["behavior", "fitness", "client"].map(line).join("\n") + "\n");
}

/** Assert no gate record was bound to the fabricated placeholder hash. */
function assertNoFabricatedHashes(consortDir: string): void {
  const state = readGates(FEATURE_ID, { consortDir });
  for (const gate of Object.values(state.gates)) {
    for (const h of Object.values(gate.artifact_hashes ?? {})) {
      expect(h).not.toBe(PLACEHOLDER_HASH);
    }
  }
}

describe("drainGatesAsHumanProxy: never fabricates (Layer 1)", () => {
  it("approves ONLY spec when the structured draft spec exists; skips the rest", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);

    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });

    expect(result.approved).toEqual(["spec"]);
    const skippedGates = result.skipped.map((s) => s.gate).sort();
    // deploy joins the skip set: its deploy-evidence.json is absent here too.
    expect(skippedGates).toEqual(["deploy", "plan", "promote", "test_list"]);
    expect(result.skipped.find((s) => s.gate === "plan")?.reason).toMatch(/plan\.json/);
    expect(result.skipped.find((s) => s.gate === "test_list")?.reason).toMatch(/test-list/);
    expect(result.skipped.find((s) => s.gate === "promote")?.reason).toMatch(/promote_ref/);
    expect(result.skipped.find((s) => s.gate === "deploy")?.reason).toMatch(/deploy-evidence/);

    const state = readGates(FEATURE_ID, { consortDir: tdd });
    expect(state.gates.spec.status).toBe("approved");
    expect(state.gates.plan.status).toBe("open");
    expect(state.gates.test_list.status).toBe("open");
    expect(state.gates.promote.status).toBe("open");
    expect(state.gates.deploy.status).toBe("open");
    assertNoFabricatedHashes(tdd);
  });

  it("does NOT bind any gate to the placeholder hash even when all artifacts are absent", () => {
    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(result.approved).toEqual([]);
    // All five gates skip with no artifacts (spec/plan/test_list/promote/deploy).
    expect(result.skipped).toHaveLength(5);
    assertNoFabricatedHashes(tdd);
  });

  it("skips spec when feature-spec.md is absent (structured draft spec incomplete)", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(result.approved).not.toContain("spec");
    expect(result.skipped.find((s) => s.gate === "spec")?.reason).toMatch(/feature-spec\.md/);
    assertNoFabricatedHashes(tdd);
  });
});

describe("drainGatesAsHumanProxy: hard-blocks non-conformant artifacts (Layer 2)", () => {
  it("skips spec when feature-spec.json fails its schema", () => {
    writeFileSync(join(fdir, "feature-spec.json"), "{}"); // missing required fields
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);

    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });

    expect(result.approved).not.toContain("spec");
    const reason = result.skipped.find((s) => s.gate === "spec")?.reason ?? "";
    expect(reason).toMatch(/conformance/i);
    expect(readGates(FEATURE_ID, { consortDir: tdd }).gates.spec.status).toBe("open");
    assertNoFabricatedHashes(tdd);
  });

  it("skips spec when feature-spec.md is missing a required section", () => {
    const incomplete = FEATURE_MD.replace("## Open questions\nQ1 status graph?\n", "");
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), incomplete);

    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });

    expect(result.approved).not.toContain("spec");
    expect(result.skipped.find((s) => s.gate === "spec")?.reason).toMatch(/conformance|open question/i);
    assertNoFabricatedHashes(tdd);
  });

  it("hard-blocks spec when a per-AC file uses a slug id; approves once it is AC<n>", () => {
    // feature-spec.{json,md} both conform; only the AC id is wrong. The spec
    // gate previously validated only feature-spec.* and let slug-id acs through.
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    const acsDir = join(fdir, "stories", "S1-file-bug", "acs");
    mkdirSync(acsDir, { recursive: true });
    // Backend-opt-out: this test isolates AC-id conformance, not the uiTrack-flatten gate.
    writeFileSync(join(fdir, "stories", "S1-file-bug", "story.json"), JSON.stringify({ id: "S1-file-bug", asA: "operator", iWantTo: "file a bug", soThat: "it is tracked", requires_e2e: false }));
    const ac = (id: string) =>
      JSON.stringify({
        id,
        layer: "API",
        given: "a reporter on the new-bug form",
        when: "they submit a title and description",
        then: "the bug is persisted and listed",
        status: "draft",
      });

    // slug id violates ac.schema's ^AC[0-9]+ pattern -> spec gate skipped
    writeFileSync(join(acsDir, "create-form-displays.json"), ac("create-form-displays"));
    const blocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(blocked.approved).not.toContain("spec");
    const reason = blocked.skipped.find((s) => s.gate === "spec")?.reason ?? "";
    expect(reason).toMatch(/AC conformance/i);
    expect(readGates(FEATURE_ID, { consortDir: tdd }).gates.spec.status).toBe("open");
    assertNoFabricatedHashes(tdd);

    // rename to a conformant AC<n> id -> spec gate approves
    rmSync(join(acsDir, "create-form-displays.json"));
    writeFileSync(join(acsDir, "AC1-create-form-displays.json"), ac("AC1-create-form-displays"));
    const ok = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(ok.approved).toContain("spec");
  });

  it("hard-blocks spec when architecture.json diverges from the established project conventions; approves once it conforms", () => {
    // Project conventions (set by an earlier feature) pin service -> app/services.
    // A later feature that remaps it to app/logic must be hard-blocked at the spec
    // gate, before it reaches build where it would mismatch the inherited code.
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    const acsDir = join(fdir, "stories", "S1-file-bug", "acs");
    mkdirSync(acsDir, { recursive: true });
    writeFileSync(
      join(acsDir, "AC1-create.json"),
      JSON.stringify({ id: "AC1-create", layer: "API", given: "a reporter", when: "they submit", then: "it persists", status: "draft" }),
    );
    // Backend-opt-out: this test isolates the conventions-divergence check, not the uiTrack-flatten gate.
    writeFileSync(join(fdir, "stories", "S1-file-bug", "story.json"), JSON.stringify({ id: "S1-file-bug", asA: "operator", iWantTo: "file a bug", soThat: "it is tracked", requires_e2e: false }));
    // Established project conventions.
    mkdirSync(join(tdd, "architecture"), { recursive: true });
    writeFileSync(
      join(tdd, "architecture", "conventions.json"),
      JSON.stringify({
        established_by: "F0-prior",
        established_at: "2026-06-12T00:00:00.000Z",
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes" },
          { role: "service", module: "app/services" },
          { role: "repository", module: "app/repositories" },
        ],
      }),
    );
    // A DIVERGENT architecture.json (service remapped to app/logic).
    writeFileSync(
      join(fdir, "architecture.json"),
      JSON.stringify({
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes" },
          { role: "service", module: "app/logic" },
          { role: "repository", module: "app/repositories" },
        ],
      }),
    );
    const blocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(blocked.approved).not.toContain("spec");
    expect(blocked.skipped.find((s) => s.gate === "spec")?.reason ?? "").toMatch(/architecture conventions failed.*service/i);
    expect(readGates(FEATURE_ID, { consortDir: tdd }).gates.spec.status).toBe("open");

    // Conform the layout -> spec gate approves.
    writeFileSync(
      join(fdir, "architecture.json"),
      JSON.stringify({
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes" },
          { role: "service", module: "app/services" },
          { role: "repository", module: "app/repositories" },
        ],
      }),
    );
    // The DBA's db-design.json is required at the spec gate for a service_backed
    // feature (>=1 table; no invariants to realize here).
    writeFileSync(join(fdir, "db-design.json"), JSON.stringify({ feature_id: FEATURE_ID, tables: [{ name: "bugs", columns: [{ name: "id", type: "uuid" }] }], realizes_invariants: [] }));
    const ok = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(ok.approved).toContain("spec");
  });

  it("hard-blocks spec when architecture under-declares service_backed despite persistence evidence (checkServiceBackedDeclaration); approves once declared+layered", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    const acsDir = join(fdir, "stories", "S1-file-bug", "acs");
    mkdirSync(acsDir, { recursive: true });
    writeFileSync(
      join(acsDir, "AC1-create.json"),
      JSON.stringify({ id: "AC1-create", layer: "API", given: "a reporter", when: "they submit", then: "it persists", status: "draft" }),
    );
    // Backend-opt-out: this test isolates the service_backed-declaration check, not the uiTrack-flatten gate.
    writeFileSync(join(fdir, "stories", "S1-file-bug", "story.json"), JSON.stringify({ id: "S1-file-bug", asA: "operator", iWantTo: "file a bug", soThat: "it is tracked", requires_e2e: false }));
    // service_backed:false BUT an NFR clearly about persistence -> contradiction.
    writeFileSync(
      join(fdir, "architecture.json"),
      JSON.stringify({ feature_id: "F1-initial-domain", service_backed: false, nfrs: [{ category: "operability", requirement: "bugs survive every schema migration", hil_status: "accepted" }] }),
    );
    const blocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(blocked.approved).not.toContain("spec");
    expect(blocked.skipped.find((s) => s.gate === "spec")?.reason ?? "").toMatch(/service_backed declaration failed.*persistence evidence/i);

    // Own it: service_backed:true + the 3 layers. The migration NFR is
    // persistence evidence, so the safety net now also requires a declared
    // persistence_invariant (a service does not always mean a database, but a
    // feature that DOES persist must name its DB-level guarantee) – declare it
    // and realize it, then spec approves.
    writeFileSync(
      join(fdir, "architecture.json"),
      JSON.stringify({
        feature_id: "F1-initial-domain",
        service_backed: true,
        layers: [{ role: "boundary", module: "app/main.py" }, { role: "service", module: "app/services" }, { role: "repository", module: "app/repositories" }],
        persistence_invariants: [{ id: "PI1-bug-migration-reversible", type: "migration_reversible", table: "bugs", brief: "existing bugs survive every schema migration" }],
        nfrs: [{ category: "operability", requirement: "bugs survive every schema migration", hil_status: "accepted" }],
      }),
    );
    writeFileSync(join(fdir, "db-design.json"), JSON.stringify({ feature_id: FEATURE_ID, tables: [{ name: "bugs", columns: [{ name: "id", type: "uuid" }] }], realizes_invariants: ["PI1-bug-migration-reversible"] }));
    expect(drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd }).approved).toContain("spec");
  });

  it("hard-blocks spec when a service_backed architecture.json declares no layers (checkLayeringDeclared, previously unwired)", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    // service_backed but NO layers -> layering-declaration hard-block.
    writeFileSync(join(fdir, "architecture.json"), JSON.stringify({ service_backed: true, layers: [] }));
    const blocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(blocked.approved).not.toContain("spec");
    expect(blocked.skipped.find((s) => s.gate === "spec")?.reason ?? "").toMatch(/layering declaration failed/i);

    // Declare the layers -> spec approves.
    writeFileSync(
      join(fdir, "architecture.json"),
      JSON.stringify({ service_backed: true, layers: [{ role: "boundary", module: "app/routes" }, { role: "service", module: "app/services" }, { role: "repository", module: "app/repositories" }] }),
    );
    writeFileSync(join(fdir, "db-design.json"), JSON.stringify({ feature_id: FEATURE_ID, tables: [{ name: "bugs", columns: [{ name: "id", type: "uuid" }] }], realizes_invariants: [] }));
    expect(drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd }).approved).toContain("spec");
  });

  it("hard-blocks spec when the DBA's db-design.json is missing or leaves an architect invariant unrealized (dbDesignReason)", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    // A conformant service_backed architecture that declares one invariant.
    const archJson = JSON.stringify({
      feature_id: FEATURE_ID,
      service_backed: true,
      layers: [{ role: "boundary", module: "app/routes" }, { role: "service", module: "app/services" }, { role: "repository", module: "app/repositories" }],
      persistence_invariants: [{ id: "PI1-bug-title-not-null", type: "not_null", table: "bugs", brief: "a bug row requires a title" }],
      nfrs: [],
    });
    writeFileSync(join(fdir, "architecture.json"), archJson);
    // No db-design.json yet -> the DBA has not run -> spec gate blocks.
    const blocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(blocked.approved).not.toContain("spec");
    expect(blocked.skipped.find((s) => s.gate === "spec")?.reason ?? "").toMatch(/db-design failed.*no db-design\.json/i);

    // db-design.json present but does NOT realize the invariant -> still blocked.
    writeFileSync(join(fdir, "db-design.json"), JSON.stringify({ feature_id: FEATURE_ID, tables: [{ name: "bugs", columns: [{ name: "id", type: "uuid" }] }], realizes_invariants: [] }));
    const stillBlocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(stillBlocked.approved).not.toContain("spec");
    expect(stillBlocked.skipped.find((s) => s.gate === "spec")?.reason ?? "").toMatch(/db-design failed.*PI1-bug-title-not-null/i);

    // Realize it -> spec approves.
    writeFileSync(join(fdir, "db-design.json"), JSON.stringify({ feature_id: FEATURE_ID, tables: [{ name: "bugs", columns: [{ name: "id", type: "uuid" }, { name: "title", type: "text", nullable: false }] }], realizes_invariants: ["PI1-bug-title-not-null"] }));
    expect(drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd }).approved).toContain("spec");
  });

  it("hard-blocks spec when a Required nfrs.md item is uncovered by architecture.json (checkNfrCoverage, previously unwired)", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    writeFileSync(join(tdd, "nfrs.md"), "# NFRs\n## Required\n- R1: queries respond < 200ms\n");
    // architecture.json covers NOTHING -> R1 uncovered -> hard-block.
    writeFileSync(join(fdir, "architecture.json"), JSON.stringify({ nfrs: [] }));
    const blocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(blocked.approved).not.toContain("spec");
    expect(blocked.skipped.find((s) => s.gate === "spec")?.reason ?? "").toMatch(/NFR coverage HARD-BLOCK.*R1/i);

    // Cover R1 via a brief_ref -> spec approves.
    writeFileSync(
      join(fdir, "architecture.json"),
      JSON.stringify({ nfrs: [{ category: "performance", requirement: "p95 < 200ms", brief_ref: "R1", hil_status: "accepted" }] }),
    );
    expect(drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd }).approved).toContain("spec");
  });

  it("hard-blocks test_list when a service_backed feature has no fitness item (checkFitnessCoverage, previously unwired)", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    seedFanOut(tdd); // isolate the fitness/persistence coverage conditions from the new fan-out condition
    writeFileSync(join(fdir, "architecture.json"), JSON.stringify({ service_backed: true, layers: [{ role: "boundary", module: "app/routes" }, { role: "service", module: "app/services" }, { role: "repository", module: "app/repositories" }], persistence_invariants: [{ id: "PI1-bug-title-not-null", type: "not_null", table: "bug", brief: "a bug with no title is rejected" }] }));
    // test-list with only behavior items -> fitness coverage hard-block.
    writeFileSync(
      join(fdir, "test-list.json"),
      JSON.stringify({ feature_id: "F1-initial-domain", items: [{ id: "T1", description: "files a bug", ac_id: "AC1", status: "pending", kind: "behavior" }] }),
    );
    const blocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, onlyGate: "test_list" });
    expect(blocked.approved).not.toContain("test_list");
    expect(blocked.skipped.find((s) => s.gate === "test_list")?.reason ?? "").toMatch(/fitness coverage failed/i);

    // Add a fitness item but leave the declared invariant uncovered -> persistence coverage hard-block.
    writeFileSync(
      join(fdir, "test-list.json"),
      JSON.stringify({ feature_id: "F1-initial-domain", items: [{ id: "T1", description: "files a bug", ac_id: "AC1", status: "pending", kind: "behavior" }, { id: "T2", description: "boundary does not touch the DB session", ac_id: "AC1", status: "pending", kind: "fitness" }] }),
    );
    const stillBlocked = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, onlyGate: "test_list" });
    expect(stillBlocked.approved).not.toContain("test_list");
    expect(stillBlocked.skipped.find((s) => s.gate === "test_list")?.reason ?? "").toMatch(/persistence coverage failed/i);

    // Cover the declared invariant with a real-branch fitness test (invariant_id) -> test_list approves.
    writeFileSync(
      join(fdir, "test-list.json"),
      JSON.stringify({ feature_id: "F1-initial-domain", items: [{ id: "T1", description: "files a bug", ac_id: "AC1", status: "pending", kind: "behavior" }, { id: "T2", description: "boundary does not touch the DB session", ac_id: "AC1", status: "pending", kind: "fitness" }, { id: "T3", description: "inserting a bug with a null title is rejected by the branch DB", ac_id: "AC1", status: "pending", kind: "fitness", invariant_id: "PI1-bug-title-not-null" }] }),
    );
    expect(drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, onlyGate: "test_list" }).approved).toContain("test_list");
  });

  it("approves test_list only with a schema-valid test-list.json", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    // malformed test list (empty items violates minItems) -> skipped
    writeFileSync(join(fdir, "test-list.json"), JSON.stringify({ feature_id: "F1", items: [] }));
    const bad = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(bad.approved).not.toContain("test_list");

    // valid test list -> approved with the real hash
    writeFileSync(join(fdir, "test-list.json"), TEST_LIST_JSON);
    seedFanOut(tdd); // this test isolates schema validity; satisfy the new fan-out condition so it can approve
    const good = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(good.approved).toContain("test_list");
    const state = readGates(FEATURE_ID, { consortDir: tdd });
    expect(state.gates.test_list.artifact_hashes?.["test-list.json"]).toBe(hashArtifact(TEST_LIST_JSON));
    assertNoFabricatedHashes(tdd);
  });

  it("records the HITL decision: product-owner gate.approved when it validates + approves", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });

    const log = readAgentLog({ consortDir: tdd, role: "product-owner" });
    const approved = log.find((e) => e.event === "gate.approved" && (e.metadata as { gate?: string })?.gate === "spec");
    expect(approved).toBeDefined();
    expect((approved?.metadata as { validated?: boolean })?.validated).toBe(true);
    expect((approved?.metadata as { approver?: string })?.approver).toBe("human-proxy");
  });

  it("records the HITL decision: product-owner gate.rejected (warn) when an artifact is non-conformant", () => {
    writeFileSync(join(fdir, "feature-spec.json"), "{}"); // schema-invalid
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });

    const refused = readAgentLog({ consortDir: tdd, role: "product-owner" }).find(
      (e) => e.event === "gate.rejected" && (e.metadata as { gate?: string })?.gate === "spec",
    );
    expect(refused).toBeDefined();
    expect(refused?.level).toBe("warn");
  });

  it("approves promote only when a real promote_ref is supplied", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    const noRef = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd });
    expect(noRef.approved).not.toContain("promote");

    const ref = "exp-1:br-bug-pg";
    const withRef = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, promoteRef: ref });
    expect(withRef.approved).toContain("promote");
    const state = readGates(FEATURE_ID, { consortDir: tdd });
    expect(state.gates.promote.artifact_hashes?.promote_ref).toBe(hashArtifact(ref));
    assertNoFabricatedHashes(tdd);
  });
});

describe("supplyArtifact: Human Proxy supplies recorded intake artifacts (stage-aware)", () => {
  const PRODUCT_OVERVIEW = ["# Product", "", "Who it is for and what they need to accomplish.", ""].join("\n");

  it("places a conformant recorded artifact + logs intake.supplied", () => {
    const from = join(tdd, "recorded-product-overview.md");
    const to = join(tdd, "product-overview.md");
    writeFileSync(from, PRODUCT_OVERVIEW);

    const result = supplyArtifact({ from, to, artifact: "product-overview.md", consortDir: tdd });

    expect(result.ok).toBe(true);
    expect(existsSync(to)).toBe(true);
    expect(readFileSync(to, "utf8")).toBe(PRODUCT_OVERVIEW);
    const supplied = readAgentLog({ consortDir: tdd, role: "product-owner" }).find((e) => e.event === "intake.supplied");
    expect(supplied).toBeDefined();
    expect((supplied?.metadata as { validated?: boolean })?.validated).toBe(true);
  });

  it("refuses (does not place) a non-conformant recording", () => {
    const from = join(tdd, "bad-nfrs.md");
    const to = join(tdd, "nfrs.md");
    writeFileSync(from, "# NFRs\n\njust prose, no Required/Preferences/Out of bounds sections\n");

    const result = supplyArtifact({ from, to, artifact: "nfrs.md", consortDir: tdd });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/conformance/i);
    expect(existsSync(to)).toBe(false);
    const refused = readAgentLog({ consortDir: tdd, role: "product-owner" }).find((e) => e.event === "intake.refused");
    expect(refused?.level).toBe("warn");
  });

  it("refuses when the recorded source is missing", () => {
    const result = supplyArtifact({
      from: join(tdd, "does-not-exist.md"),
      to: join(tdd, "product-overview.md"),
      artifact: "product-overview.md",
      consortDir: tdd,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });
});

describe("drainGatesAsHumanProxy: deploy gate teeth", () => {
  // The deploy (working-software) gate approves ONLY when deploy-evidence.json
  // exists, conforms, AND records reachable=true + verify.passed=true.
  function writeEvidence(over: Record<string, unknown> = {}): void {
    const evidence = {
      schema_version: 1,
      feature_id: FEATURE_ID,
      target: "local",
      url: "http://localhost:8000/",
      reachable: true,
      verify: { passed: true, summary: "verify passed" },
      deployed_at: "2026-06-07T00:00:00.000Z",
      ...over,
    };
    writeFileSync(join(fdir, "deploy-evidence.json"), JSON.stringify(evidence));
  }

  it("approves deploy when the evidence is reachable AND verify.passed", () => {
    writeEvidence();
    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, onlyGate: "deploy" });
    expect(result.approved).toEqual(["deploy"]);
    expect(readGates(FEATURE_ID, { consortDir: tdd }).gates.deploy.status).toBe("approved");
  });

  it("skips deploy when the evidence is absent", () => {
    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, onlyGate: "deploy" });
    expect(result.approved).toEqual([]);
    expect(result.skipped.find((s) => s.gate === "deploy")?.reason).toMatch(/not found/);
  });

  it("REFUSES deploy when the app was not reachable", () => {
    writeEvidence({ reachable: false });
    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, onlyGate: "deploy" });
    expect(result.approved).toEqual([]);
    expect(result.skipped.find((s) => s.gate === "deploy")?.reason).toMatch(/reachable=false/);
    expect(readGates(FEATURE_ID, { consortDir: tdd }).gates.deploy.status).toBe("open");
  });

  it("REFUSES deploy when the feature-verify did not pass", () => {
    writeEvidence({ verify: { passed: false, summary: "verify FAILED" } });
    const result = drainGatesAsHumanProxy({ featureId: FEATURE_ID, consortDir: tdd, onlyGate: "deploy" });
    expect(result.approved).toEqual([]);
    expect(result.skipped.find((s) => s.gate === "deploy")?.reason).toMatch(/verify\.passed=false/);
    expect(readGates(FEATURE_ID, { consortDir: tdd }).gates.deploy.status).toBe("open");
  });
});

// supplyRequests: at the planning author-requests step the Human Proxy provides
// the PO's recorded feature-request.md per committed feature WHEN ASKED (not
// earlier), validate-then-place, and logs each. The recorded source is named
// independently of the feature id (v1-... -> F1-...), so pairs are explicit.
describe("Human Proxy supplyRequests (the PO's artifacts, given when the state machine asks)", () => {
  const CONFORMANT_REQUEST = "# Feature request: initial domain\n\nAs a user I want to file a bug so that it is tracked.\n";

  it("places each recorded feature-request at features/<id>/feature-request.md + logs intake.supplied", () => {
    const recorded = join(tdd, "recorded-v1.md");
    writeFileSync(recorded, CONFORMANT_REQUEST);

    const result = supplyRequests({ consortDir: tdd, pairs: [{ featureId: FEATURE_ID, from: recorded }] });

    expect(result.supplied).toEqual([FEATURE_ID]);
    expect(result.skipped).toEqual([]);
    // Landed at the resolved feature dir (created above as features/F1-initial-domain).
    const target = join(fdir, "feature-request.md");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(CONFORMANT_REQUEST);
    // The interaction is logged (gives, then logs what it gave).
    const supplied = readAgentLog({ consortDir: tdd }).filter((e) => e.event === "intake.supplied");
    expect(supplied.some((e) => e.metadata?.artifact === "feature-request.md")).toBe(true);
  });

  it("reads the (feature_id, source) pairs from $LAKEBASE_SFTDD_SPRINT_REQUESTS when pairs are not passed", () => {
    const recorded = join(tdd, "recorded-v1.md");
    writeFileSync(recorded, CONFORMANT_REQUEST);
    const prev = process.env.LAKEBASE_SFTDD_SPRINT_REQUESTS;
    process.env.LAKEBASE_SFTDD_SPRINT_REQUESTS = `${FEATURE_ID}\t${recorded}\n`;
    try {
      const result = supplyRequests({ consortDir: tdd });
      expect(result.supplied).toEqual([FEATURE_ID]);
      expect(existsSync(join(fdir, "feature-request.md"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LAKEBASE_SFTDD_SPRINT_REQUESTS;
      else process.env.LAKEBASE_SFTDD_SPRINT_REQUESTS = prev;
    }
  });

  it("supplies nothing when unset (a live human provides them out-of-band)", () => {
    const prev = process.env.LAKEBASE_SFTDD_SPRINT_REQUESTS;
    delete process.env.LAKEBASE_SFTDD_SPRINT_REQUESTS;
    try {
      expect(supplyRequests({ consortDir: tdd })).toEqual({ supplied: [], skipped: [] });
    } finally {
      if (prev !== undefined) process.env.LAKEBASE_SFTDD_SPRINT_REQUESTS = prev;
    }
  });
});

describe("Human Proxy supplyProposals (deterministic propose from recorded requests)", () => {
  it("projects a CONFORMING feature-proposals.md, one candidate per recorded request", () => {
    const r1 = join(tdd, "req-f1.md");
    const r2 = join(tdd, "req-f6.md");
    writeFileSync(r1, "# Record and view stock by SKU and location\n\nFoundation: file and read back stock.\n");
    writeFileSync(r2, "# Split the combined tracking code into batch + serial\n\nLater iteration splits the fields.\n");

    const res = supplyProposals({
      consortDir: tdd,
      uiTrack: true,
      pairs: [
        { featureId: "F1-stock-visibility", from: r1 },
        { featureId: "F6-split-tracking-code", from: r2 },
      ],
    });

    expect(res.written).toBe(true);
    expect(res.count).toBe(2);
    const md = readFileSync(featureProposalsMd(tdd), "utf8");
    // Both features present, with their one-line ask lifted from the request heading.
    expect(md).toMatch(/## F1-stock-visibility/);
    expect(md).toMatch(/## F6-split-tracking-code/);
    expect(md).toMatch(/Record and view stock by SKU and location/);
    // Conforms as md-narrative (the plan gate's teeth).
    expect(checkArtifactConformance("feature-proposals.md", md).ok).toBe(true);
  });

  it("writes nothing when there are no recorded requests (the live LLM propose runs instead)", () => {
    const res = supplyProposals({ consortDir: tdd, pairs: [] });
    expect(res.written).toBe(false);
    expect(existsSync(featureProposalsMd(tdd))).toBe(false);
  });

  it("skips (does not place) a missing or non-conformant recording", () => {
    const missing = join(tdd, "nope.md");
    const result = supplyRequests({ consortDir: tdd, pairs: [{ featureId: FEATURE_ID, from: missing }] });
    expect(result.supplied).toEqual([]);
    expect(result.skipped[0]?.featureId).toBe(FEATURE_ID);
    expect(existsSync(join(fdir, "feature-request.md"))).toBe(false);
  });
});
