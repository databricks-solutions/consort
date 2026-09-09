// Layer 2 (conformance): "did this artifact adhere to the format
// expected?" Layer 1 (existence) is the human-proxy no-fabrication fix;
// Layer 3 (signoff) is approveGate. This is the missing middle: a gate must
// not approve an artifact that exists but does not conform to its declared
// format. JSON artifacts validate against their schema; narrative MD
// artifacts must carry an H1 title plus their declared required sections.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  checkArtifactConformance,
  hasDeclaredFormat,
  ARTIFACT_FORMATS,
  scanFeatureConformance,
  checkLayeringDeclared,
  checkFitnessCoverage,
  checkFitnessClauseCoverage,
  checkE2ECoverage,
  checkPersistenceCoverage,
  checkInvariantCoverageDistinct,
  invariantRealizingStory,
  checkSchemaChangeStoryRealizes,
  checkStoryIndependence,
  checkAcIndependence,
  checkServiceBackedDeclaration,
} from "../../consort/orchestrator/validators/conformance/artifact-conformance";
import { renderTestListMarkdown } from "../../consort/test-list/test-list";
import { normalizeStoryJson } from "../../consort/intake/spec-sync";

describe("checkServiceBackedDeclaration: evidence-bound service_backed (no silent under-declaration)", () => {
  const arch = (over: Record<string, unknown> = {}) => JSON.stringify({ feature_id: "F1", nfrs: [], ...over });

  it("ok when service_backed:true shows persistence evidence AND declares invariants (a real DB feature)", () => {
    expect(
      checkServiceBackedDeclaration(
        arch({ service_backed: true, persistence_invariants: [{ id: "PI1-x", type: "unique", brief: "x" }] }),
        { acLayers: ["Infra"], nfrsText: ["schema migration"] },
      ),
    ).toEqual({ ok: true });
  });

  // A service does not always mean a database: service_backed:true with NO
  // persistence evidence and NO invariants is a legitimate non-persisting
  // service (compute/proxy/aggregator). Layering enforcement still applies; the
  // DB gates (checkDbDesign / checkPersistenceCoverage) exempt it.
  it("ok for a non-persisting service: service_backed:true, no persistence evidence, no invariants", () => {
    expect(
      checkServiceBackedDeclaration(arch({ service_backed: true }), { acLayers: ["API"], nfrsText: ["respond fast"] }),
    ).toEqual({ ok: true });
  });

  // The safety net moves here: service_backed:true that SHOWS persistence
  // evidence (an Infra AC or a storage/migration NFR) MUST declare invariants,
  // so a feature that really persists cannot escape DB testing by leaving
  // persistence_invariants empty.
  it("FLAGS service_backed:true that shows persistence evidence but declares NO invariants", () => {
    const r = checkServiceBackedDeclaration(arch({ service_backed: true }), { acLayers: ["Infra"], nfrsText: ["schema migration"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/persistence evidence.*persistence_invariants|declare .*persistence_invariants/i);
  });

  it("ok for a genuinely trivial feature: not service_backed + NO persistence evidence", () => {
    expect(checkServiceBackedDeclaration(arch({ service_backed: false }), { acLayers: ["API"], nfrsText: ["respond fast"] })).toEqual({ ok: true });
  });

  it("FLAGS not-service_backed while an AC is tagged layer:Infra (a data-store contract)", () => {
    const r = checkServiceBackedDeclaration(arch({ service_backed: false }), { acLayers: ["API", "Infra"], nfrsText: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/not service_backed but shows persistence evidence.*Infra/i);
  });

  it("FLAGS not-service_backed while an NFR references persistence (migration/schema/stored/table)", () => {
    const r = checkServiceBackedDeclaration(arch({ service_backed: false }), {
      acLayers: ["API", "E2E"],
      nfrsText: ["Existing bugs and their data survive every schema migration", "a status is never stored when invalid", "New tables are additive"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/NFR references persistence/i);
  });

  it("treats ABSENT service_backed as not-true (omission is not an escape hatch)", () => {
    const r = checkServiceBackedDeclaration(arch(), { acLayers: ["Infra"], nfrsText: [] });
    expect(r.ok).toBe(false);
  });

  it("returns a violation for invalid JSON", () => {
    expect(checkServiceBackedDeclaration("not json", {}).ok).toBe(false);
  });
});

describe("checkAcIndependence: a later AC must not be a subset of an earlier one (within a story)", () => {
  const ac = (id: string, indep?: unknown): { name: string; content: string } => ({
    name: id,
    content: JSON.stringify({ id, layer: "API", given: "g", when: "w", then: "t", status: "draft", ...(indep !== undefined ? { independence: indep } : {}) }),
  });

  it("no-op for a single-AC story", () => {
    expect(checkAcIndependence([ac("AC1-create-form")]).ok).toBe(true);
  });

  it("exempts the first AC; passes when later ACs record independence", () => {
    const r = checkAcIndependence([
      ac("AC1-create-form"),
      ac("AC2-submitted-bug-is-recorded", { distinct_from_prior: true, rationale: "persists a row; AC1 only renders the form" }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("BLOCKS a later AC missing the determination", () => {
    const r = checkAcIndependence([ac("AC1-create-form"), ac("AC2-recorded")]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/AC2-recorded.*missing independence/i);
  });

  it("BLOCKS the AC3-subset-of-AC2 case (distinct_from_prior:false)", () => {
    const r = checkAcIndependence([
      ac("AC1-create-form"),
      ac("AC2-submitted-bug-is-recorded", { distinct_from_prior: true, rationale: "persists the bug" }),
      ac("AC3-confirmation-shown", { distinct_from_prior: false, rationale: "AC2's redirect already renders the confirmation" }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/AC3-confirmation-shown.*distinct_from_prior is not true/i);
  });

  it("lowest AC-number is 'first' regardless of array order", () => {
    const r = checkAcIndependence([
      ac("AC2-recorded", { distinct_from_prior: true, rationale: "persists" }),
      ac("AC1-create-form"),
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("checkStoryIndependence: a later story must not be a subset of an earlier one", () => {
  const story = (id: string, indep?: unknown): { name: string; content: string } => ({
    name: id,
    content: JSON.stringify({ id, asA: "u", iWantTo: "x", soThat: "y", ...(indep !== undefined ? { independence: indep } : {}) }),
  });

  it("no-op for a single-story feature (nothing to be independent OF)", () => {
    expect(checkStoryIndependence([story("S1-submit")]).ok).toBe(true);
  });

  it("exempts the first story; requires the determination on later stories", () => {
    const r = checkStoryIndependence([
      story("S1-submit"), // first: no independence needed
      story("S2-retrieve", { distinct_from_prior: true, rationale: "lists bugs by status, a view S1 never builds" }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("BLOCKS a later story missing the independence determination", () => {
    const r = checkStoryIndependence([story("S1-submit"), story("S2-retrieve")]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/S2-retrieve.*missing independence/i);
  });

  it("BLOCKS a later story that declares distinct_from_prior:false (subset of an earlier one)", () => {
    const r = checkStoryIndependence([
      story("S1-submit"),
      story("S2-view", { distinct_from_prior: false, rationale: "renders the detail page" }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/distinct_from_prior is not true/i);
  });

  it("BLOCKS a later story with an empty rationale", () => {
    const r = checkStoryIndependence([
      story("S1-submit"),
      story("S2-x", { distinct_from_prior: true, rationale: "  " }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.violations.join(" ")).toMatch(/rationale is empty/i);
  });

  it("uses the lowest S-number as 'first' regardless of array order", () => {
    const r = checkStoryIndependence([
      story("S2-retrieve", { distinct_from_prior: true, rationale: "distinct view" }),
      story("S1-submit"), // first by number, exempt even though listed second
    ]);
    expect(r.ok).toBe(true);
  });

  // Story-SCOPED variant: at story S's own per-story spec gate, validate ONLY S
  // (its independence vs its priors), NOT the whole set. A later, not-yet-designed
  // sibling stub without independence must NOT fault an earlier story's gate.
  describe("targetStory scoping (per-story spec gate)", () => {
    const all = [
      story("S1-submit"),
      story("S2-retrieve"), // stub, no independence yet
      story("S3-search"), // stub, no independence yet
    ];

    it("passes at S1's gate even though S2/S3 stubs lack independence (S1 is first, exempt)", () => {
      expect(checkStoryIndependence(all, "S1-submit")).toEqual({ ok: true });
    });

    it("FAILS at S2's gate because S2 itself lacks independence", () => {
      const r = checkStoryIndependence(all, "S2-retrieve");
      expect(r.ok).toBe(false);
      expect(r.ok ? "" : r.violations.join(" ")).toMatch(/S2-retrieve.*missing independence/i);
    });

    it("does NOT report S3 at S2's gate (only the target story is judged)", () => {
      const r = checkStoryIndependence(all, "S2-retrieve");
      expect(r.ok ? "" : r.violations.join(" ")).not.toMatch(/S3-search/);
    });

    it("passes at S2's gate once S2 records a valid independence determination", () => {
      const withIndep = [
        story("S1-submit"),
        story("S2-retrieve", { distinct_from_prior: true, rationale: "lists by status, a view S1 never builds" }),
        story("S3-search"),
      ];
      expect(checkStoryIndependence(withIndep, "S2-retrieve")).toEqual({ ok: true });
    });

    it("is a no-op when the target story is not present in the set", () => {
      expect(checkStoryIndependence(all, "S9-nonexistent")).toEqual({ ok: true });
    });
  });
});

describe("checkArtifactConformance: JSON artifacts (schema-validated)", () => {
  it("passes a fully-formed feature-spec.json", () => {
    const feature = JSON.stringify({
      id: "F1-initial-domain",
      name: "Initial Domain",
      status: "draft",
      tdd_mode: "N=1",
    });
    const r = checkArtifactConformance("feature-spec.json", feature);
    expect(r.ok).toBe(true);
  });

  it("fails feature-spec.json missing required fields, naming the violations", () => {
    // `{}` was the placeholder content older tests used; it is NOT conformant.
    const r = checkArtifactConformance("feature-spec.json", "{}");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/id|name|status|tdd_mode/);
  });

  it("fails feature-spec.json that is not valid JSON", () => {
    const r = checkArtifactConformance("feature-spec.json", "{ not json");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/json/i);
  });

  it("validates test-list.json against its schema", () => {
    const good = JSON.stringify({
      feature_id: "F1-initial-domain",
      items: [{ id: "T1", description: "files a bug", ac_id: "AC1", status: "pending" }],
    });
    expect(checkArtifactConformance("test-list.json", good).ok).toBe(true);
    // empty items array violates minItems:1
    const bad = JSON.stringify({ feature_id: "F1-initial-domain", items: [] });
    expect(checkArtifactConformance("test-list.json", bad).ok).toBe(false);
  });

  it("validates ac.json: a layer-less AC conforms (layer is the architect's field, not required at spec time)", () => {
    // The spec-author writes ACs WITHOUT `layer` (spec-author.md forbids it,
    // "Architect's, next phase"); the schema must not require what the author
    // is told not to write. A bad enum value, when present, still fails.
    const specAuthored = JSON.stringify({
      id: "AC1-record-stock",
      given: "an operator on the record-stock form",
      when: "they submit a valid SKU and quantity",
      then: "the stock record is persisted",
      status: "draft",
    });
    expect(checkArtifactConformance("ac.json", specAuthored).ok).toBe(true);
    // Missing a truly-required field (then) still fails.
    const missingThen = JSON.stringify({ id: "AC1-x", given: "g", when: "w", status: "draft" });
    expect(checkArtifactConformance("ac.json", missingThen).ok).toBe(false);
    // A present-but-invalid layer enum still fails (architect must use API|E2E|Infra).
    const badLayer = JSON.stringify({ id: "AC1-x", layer: "UI", given: "g", when: "w", then: "t", status: "draft" });
    expect(checkArtifactConformance("ac.json", badLayer).ok).toBe(false);
  });

  it("validates architecture.json (NFRs live here; service_backed is required)", () => {
    const arch = JSON.stringify({
      feature_id: "F1-initial-domain",
      service_backed: false,
      nfrs: [{ category: "security", requirement: "all writes authn'd", hil_status: "accepted" }],
    });
    expect(checkArtifactConformance("architecture.json", arch).ok).toBe(true);
    // empty nfrs array is valid (a feature may have none)
    expect(checkArtifactConformance("architecture.json", JSON.stringify({ feature_id: "F1", service_backed: false, nfrs: [] })).ok).toBe(true);
    // missing nfrs fails
    expect(checkArtifactConformance("architecture.json", JSON.stringify({ feature_id: "F1", service_backed: false })).ok).toBe(false);
    // missing service_backed now fails (no silent omission of the layering-enforcement flag)
    expect(checkArtifactConformance("architecture.json", JSON.stringify({ feature_id: "F1", nfrs: [] })).ok).toBe(false);
  });

  it("accepts the RICH nfr shape the architect prompt teaches (id/brief/brief_ref/fitness_function, free category)", () => {
    // architect-reviewer.md mandates a fitness_function per architectural constraint
    // ("every constraint names the fitness function that defends it"), uses `brief`
    // + `brief_ref`, and real NFR categories (durability/correctness/testability/...).
    // The schema had drifted LEAN (category enum, `requirement`, no id/brief/fitness),
    // so the canonical stockflow reference did NOT conform to its own schema. The
    // schema is reconciled to the shape the prompt + reference + runtime rubric use.
    const rich = JSON.stringify({
      feature_id: "F1-stock-visibility",
      service_backed: true,
      layers: [{ role: "service", module: "app/services" }],
      nfrs: [{
        id: "NFR-F1-durability-migrations",
        category: "durability",
        applies_to: "F1-stock-visibility",
        brief: "Existing rows survive every additive migration; created_at immutable.",
        brief_ref: "R1",
        fitness_function: "Real-branch integration test: apply the revision over seeded rows, assert survival, down reverses cleanly.",
        hil_status: "accepted",
      }],
    });
    expect(checkArtifactConformance("architecture.json", rich).ok).toBe(true);
  });

  it("still accepts the LEAN nfr shape (category/requirement) for back-compat", () => {
    const lean = JSON.stringify({
      feature_id: "F1", service_backed: false,
      nfrs: [{ category: "security", requirement: "all writes authn'd", hil_status: "accepted" }],
    });
    expect(checkArtifactConformance("architecture.json", lean).ok).toBe(true);
  });

  it("rejects an nfr carrying NEITHER brief NOR requirement (must state the requirement somehow)", () => {
    const empty = JSON.stringify({
      feature_id: "F1", service_backed: false,
      nfrs: [{ category: "security", hil_status: "accepted" }],
    });
    expect(checkArtifactConformance("architecture.json", empty).ok).toBe(false);
  });

  // (The "canonical stockflow reference architecture.json conforms to its own schema" guard
  //  moved to consort-examples with the corpus it validates.)

  it("accepts architecture.json with service_backed + layers; rejects a bad layer role", () => {
    const layered = JSON.stringify({
      feature_id: "F1-initial-domain",
      nfrs: [],
      service_backed: true,
      layers: [
        { role: "boundary", module: "app/routes", may_import: ["service"] },
        { role: "service", module: "app/services", may_import: ["repository"] },
        { role: "repository", module: "app/repositories", may_import: ["models"] },
        { role: "models", module: "app/models/" },
      ],
    });
    expect(checkArtifactConformance("architecture.json", layered).ok).toBe(true);
    const badRole = JSON.stringify({
      feature_id: "F1-initial-domain",
      nfrs: [],
      service_backed: true,
      layers: [{ role: "controller", module: "app/routes" }],
    });
    expect(checkArtifactConformance("architecture.json", badRole).ok).toBe(false);
  });

  it("accepts a test-list item with kind behavior|fitness|client (+ invariant_id); rejects a bad kind", () => {
    const withKind = JSON.stringify({
      feature_id: "F1-initial-domain",
      items: [
        { id: "T1", description: "files a bug", ac_id: "AC1", status: "pending", kind: "behavior" },
        { id: "T2", description: "layering contract", ac_id: "AC1", status: "pending", kind: "fitness" },
        { id: "T3", description: "unique constraint realized against the branch DB", ac_id: "AC1", status: "pending", kind: "fitness", invariant_id: "PI1-sku-unique" },
        { id: "T4", description: "the empty form renders its fields (client component)", ac_id: "AC1", status: "pending", kind: "client", scenario_file: "client/tests/pages/CreateForm.test.tsx" },
      ],
    });
    expect(checkArtifactConformance("test-list.json", withKind).ok).toBe(true);
    const badKind = JSON.stringify({
      feature_id: "F1-initial-domain",
      items: [{ id: "T1", description: "x", ac_id: "AC1", status: "pending", kind: "bogus" }],
    });
    expect(checkArtifactConformance("test-list.json", badKind).ok).toBe(false);
  });

  it("rejects nfrs on the spec-gated feature-spec.json (moved to architecture.json)", () => {
    const withNfrs = JSON.stringify({
      id: "F1-initial-domain",
      name: "Initial Domain",
      status: "draft",
      tdd_mode: "N=1",
      nfrs: [{ category: "security", requirement: "x" }],
    });
    // additionalProperties:false now rejects nfrs on feature-spec.json, enforcing the boundary.
    expect(checkArtifactConformance("feature-spec.json", withNfrs).ok).toBe(false);
  });

  it("validates plan.json against the new plan schema", () => {
    const plan = JSON.stringify({
      feature_id: "F1-initial-domain",
      story_id: "S1-submit",
      N: 1,
      mode: "N=1",
      strategies: [{ name: "single", rationale: "iterate" }],
      budget: { concurrent_branches: 1, wall_clock_minutes: 180, agent_pairs: 1 },
      rationale: "one gap",
    });
    expect(checkArtifactConformance("plan.json", plan).ok).toBe(true);
    expect(checkArtifactConformance("plan.json", "{}").ok).toBe(false);
  });
});

describe("checkArtifactConformance: architecture.md (Architect Reviewer contract)", () => {
  // architect-reviewer.md section 6 names three sections; the user extends the
  // required set with the two the HITL adjudicates at Gate 2 (Decisions +
  // Sign-off). All five are hard-blocked.
  const FULL_ARCH = [
    "# F1 - Initial Domain: Architecture",
    "## Architectural Concerns Mapping",
    "| concern | owner |",
    "## Pattern proposals",
    "Repository per aggregate.",
    "## Risks",
    "Status enum may need to move.",
    "## Gate 1 Decisions required",
    "Q1 status transitions.",
    "## Sign-off",
    "architect@example.com",
    "",
  ].join("\n");

  it("passes architecture.md carrying all five required sections", () => {
    expect(checkArtifactConformance("architecture.md", FULL_ARCH).ok).toBe(true);
  });

  it("hard-blocks architecture.md missing the Risks section", () => {
    const md = FULL_ARCH.replace("## Risks\nStatus enum may need to move.\n", "");
    const r = checkArtifactConformance("architecture.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/risk/i);
  });

  it("hard-blocks architecture.md missing Sign-off", () => {
    const md = FULL_ARCH.replace("## Sign-off\narchitect@example.com\n", "");
    const r = checkArtifactConformance("architecture.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/sign-off/i);
  });

  it("hard-blocks architecture.md that has no H1 title", () => {
    const md = FULL_ARCH.replace("# F1 - Initial Domain: Architecture\n", "");
    const r = checkArtifactConformance("architecture.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/h1|title/i);
  });
});

describe("checkArtifactConformance: feature-spec.md (Discovery draft-spec contract)", () => {
  // The PO/Discovery draft-spec narrative. Required: Summary, Stories,
  // Out of scope, Open questions (the boundary questions that seed Gate 1).
  const FULL_FEATURE = [
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

  it("passes feature-spec.md carrying all four required sections", () => {
    expect(checkArtifactConformance("feature-spec.md", FULL_FEATURE).ok).toBe(true);
  });

  it("hard-blocks feature-spec.md missing Open questions", () => {
    const md = FULL_FEATURE.replace("## Open questions\nQ1 status graph?\n", "");
    const r = checkArtifactConformance("feature-spec.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/open|question/i);
  });

  it("hard-blocks feature-spec.md with no H1 title", () => {
    const r = checkArtifactConformance("feature-spec.md", "just prose, no heading\n");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/h1|title/i);
  });
});

describe("checkArtifactConformance: product-overview.md (Product Owner project-level overview)", () => {
  // The Product Owner's project-level overview (replaces the old spec.md).
  // Loose contract: H1 + non-empty body, no named sections.
  it("passes product-overview.md with an H1 and a body", () => {
    expect(checkArtifactConformance("product-overview.md", "# Overview\n\nThe system overall.\n").ok).toBe(true);
  });

  it("hard-blocks an empty-bodied product-overview.md (title only)", () => {
    const r = checkArtifactConformance("product-overview.md", "# Title\n");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/body|empty/i);
  });
});

describe("checkArtifactConformance: feature-request.md (Feature Requester original ask)", () => {
  // The Feature Requester's original ask; the Spec Author's INPUT (never
  // overwritten). Loose contract: H1 + non-empty body, no named sections.
  it("passes feature-request.md with an H1 and a body", () => {
    expect(checkArtifactConformance("feature-request.md", "# Track bugs\n\nUsers need to file bugs.\n").ok).toBe(true);
  });

  it("hard-blocks an empty-bodied feature-request.md (title only)", () => {
    const r = checkArtifactConformance("feature-request.md", "# Title\n");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/body|empty/i);
  });
});

describe("checkArtifactConformance: test-list.md (Beck list, rendered from JSON)", () => {
  // Generated from test-list.json: H1 + "Ordered for:" rationale + every
  // test item traces to an AC + a Deferred section. An orphan item (no AC)
  // hard-blocks.
  const GOOD_LIST = [
    "# Test list: F1 Initial Domain",
    "Ordered for: design-momentum",
    "",
    "- [ ] T1: rejects an empty title  (AC1.4)",
    "- [x] T2: files a bug and returns its id  (AC1.1)",
    "",
    "## Deferred / skipped",
    "- (none)",
    "",
  ].join("\n");

  it("passes a rendered, AC-traceable list", () => {
    expect(checkArtifactConformance("test-list.md", GOOD_LIST).ok).toBe(true);
  });

  it("hard-blocks a test item with no AC reference (orphan)", () => {
    const md = GOOD_LIST.replace("- [ ] T1: rejects an empty title  (AC1.4)", "- [ ] T1: rejects an empty title");
    const r = checkArtifactConformance("test-list.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/ac|orphan/i);
  });

  it("hard-blocks a list missing the Ordered for rationale", () => {
    const md = GOOD_LIST.replace("Ordered for: design-momentum\n", "");
    const r = checkArtifactConformance("test-list.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/ordered for/i);
  });

  it("hard-blocks a list missing the Deferred section", () => {
    const md = GOOD_LIST.replace("## Deferred / skipped\n- (none)\n", "");
    const r = checkArtifactConformance("test-list.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/deferred/i);
  });
});

describe("checkArtifactConformance: UX Designer artifacts (UI projects)", () => {
  const GOOD_GUIDE_JSON = JSON.stringify({
    typography: { font_family: "DM Sans", scale: { "text-base": "15px" } },
    colors: { brand: { "brand-red": "#FF3621" } },
    spacing: { "space-4": "16px" },
  });
  const GOOD_GUIDE_MD = [
    "# Style Guide",
    "## Design Philosophy",
    "Clarity over decoration.",
    "## UI Framework and Templating",
    "Jinja, testable, stable selectors.",
    "## Typography",
    "DM Sans.",
    "## Color Palette",
    "Navy + warm neutrals.",
    "## Spacing",
    "8px grid.",
    "## Components",
    "Buttons, cards.",
    "## User Feedback Principles",
    "No silent failures.",
    "",
  ].join("\n");
  const GOOD_IA = [
    "# Information Architecture",
    "## Screens",
    "MyAssets, AssetForm.",
    "## Navigation",
    "Navbar links.",
    "## User flows",
    "Submit an asset.",
    "",
  ].join("\n");

  it("requires a References section in the HIL design-brief.md", () => {
    const good = "# Design Brief\n\n## References\n- Partner Demo Catalog: brand + color\n- partners.databricks.com: layout + tone\n";
    expect(checkArtifactConformance("design-brief.md", good).ok).toBe(true);
    const bad = "# Design Brief\n\nMake it look nice.\n";
    const r = checkArtifactConformance("design-brief.md", bad);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/reference/i);
  });

  it("validates a well-formed design-guide.json", () => {
    expect(checkArtifactConformance("design-guide.json", GOOD_GUIDE_JSON).ok).toBe(true);
    expect(checkArtifactConformance("design-guide.json", "{}").ok).toBe(false);
  });

  it("passes a section-complete design-guide.md", () => {
    expect(checkArtifactConformance("design-guide.md", GOOD_GUIDE_MD).ok).toBe(true);
  });

  it("hard-blocks design-guide.md missing the Components section", () => {
    const md = GOOD_GUIDE_MD.replace("## Components\nButtons, cards.\n", "");
    const r = checkArtifactConformance("design-guide.md", md);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.join(" ")).toMatch(/components/i);
  });

  it("passes a section-complete ia.md and blocks one missing Navigation", () => {
    expect(checkArtifactConformance("ia.md", GOOD_IA).ok).toBe(true);
    const md = GOOD_IA.replace("## Navigation\nNavbar links.\n", "");
    expect(checkArtifactConformance("ia.md", md).ok).toBe(false);
  });

  it("the shipped default design guide conforms to the design-guide.md contract", () => {
    const p = join(__dirname, "../../skills/consort/references/default-design-guide.md");
    expect(checkArtifactConformance("design-guide.md", readFileSync(p, "utf8")).ok).toBe(true);
  });
});

describe("checkArtifactConformance: artifacts with no declared format", () => {
  it("passes a promote_ref (string, no format)", () => {
    expect(hasDeclaredFormat("promote_ref")).toBe(false);
    expect(checkArtifactConformance("promote_ref", "exp-1:br-bug-pg").ok).toBe(true);
  });

  it("passes an unknown artifact name unchanged", () => {
    expect(checkArtifactConformance("notes.txt", "anything").ok).toBe(true);
  });

  it("renderTestListMarkdown produces a list that is conformant by construction", () => {
    const md = renderTestListMarkdown({
      feature_id: "F1-initial-domain",
      ordered_for: "design-momentum",
      items: [
        { id: "T1", description: "rejects empty title", ac_id: "AC1", status: "pending" },
        { id: "T2", description: "files a bug", ac_id: "AC2", status: "green" },
        { id: "T3", description: "deferred edge case", ac_id: "AC3", status: "skipped", notes: "later" },
      ],
    });
    expect(checkArtifactConformance("test-list.md", md).ok).toBe(true);
  });

  it("exports a format registry covering the gated artifacts", () => {
    expect(Object.keys(ARTIFACT_FORMATS)).toEqual(
      expect.arrayContaining([
        "feature-spec.json",
        "plan.json",
        "test-list.json",
        "test-list.md",
        "feature-request.md",
        "product-overview.md",
        "architecture.md",
        "feature-spec.md",
        "design-brief.md",
        "design-guide.json",
        "design-guide.md",
        "ia.md",
      ]),
    );
  });
});

describe("scanFeatureConformance: checks every artifact that exists on disk", () => {
  let tdd: string;
  let fdir: string;

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
    "Q1?",
    "",
  ].join("\n");

  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-scan-"));
    fdir = join(tdd, "features", "F1-initial-domain");
    mkdirSync(fdir, { recursive: true });
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("reports ok when the present artifacts all conform; ignores absent ones", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    const report = scanFeatureConformance(tdd, "F1-initial-domain");
    expect(report.ok).toBe(true);
    expect(report.entries.map((e) => e.artifact).sort()).toEqual(
      ["features/F1-initial-domain/feature-spec.json", "features/F1-initial-domain/feature-spec.md"].sort(),
    );
  });

  it("flags a non-conformant artifact and reports not-ok", () => {
    writeFileSync(join(fdir, "feature-spec.json"), "{}"); // schema-invalid
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    const report = scanFeatureConformance(tdd, "F1-initial-domain");
    expect(report.ok).toBe(false);
    const bad = report.entries.find((e) => e.artifact.endsWith("feature-spec.json"));
    expect(bad?.ok).toBe(false);
    expect(bad?.violations.join(" ")).toMatch(/id|name|status|tdd_mode/);
  });

  // HEAL-THEN-CHECK (the gate-conformance CLI runs normalizeStoryJson before scanning): a
  // {id}-only story.json stub whose narrative lives in story.md must PASS after the heal,
  // WITHOUT hand-editing – but a stub whose story.md ALSO lacks the narrative must still FAIL.
  const storyStub = (fid: string, sid: string, md: string): void => {
    const sdir = join(fdir, "stories", sid);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "story.json"), JSON.stringify({ id: sid })); // minimal stub, no narrative
    writeFileSync(join(sdir, "story.md"), md);
  };
  const badStoryJson = (): boolean =>
    !scanFeatureConformance(tdd, "F1-initial-domain").entries.find((e) => e.artifact.endsWith("story.json"))!.ok;

  it("story.json stub whose story.md carries the narrative: FAILS the raw scan, PASSES after normalizeStoryJson heal", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    storyStub("F1-initial-domain", "S1-file-a-bug", "# S1: File a bug\nAs a user\nI want to file a bug\nSo that it gets tracked\n");
    // Raw scan (no heal): the {id}-only story.json is missing asA/iWantTo/soThat.
    expect(badStoryJson()).toBe(true);
    // Heal from story.md, then scan again: now conformant – no hand-editing.
    const changed = normalizeStoryJson(tdd, "F1-initial-domain");
    expect(changed).toContain("S1-file-a-bug");
    expect(scanFeatureConformance(tdd, "F1-initial-domain").ok).toBe(true);
  });

  it("story.json stub whose story.md ALSO lacks a parseable narrative: STILL fails after the heal (real gap surfaces)", () => {
    writeFileSync(join(fdir, "feature-spec.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature-spec.md"), FEATURE_MD);
    storyStub("F1-initial-domain", "S1-file-a-bug", "# S1: File a bug\n\nJust a title, no As-a/I-want/So-that lines.\n");
    normalizeStoryJson(tdd, "F1-initial-domain"); // nothing to backfill – story.md has no narrative
    expect(badStoryJson()).toBe(true);
  });
});

describe("checkLayeringDeclared (Gate 2: a service-backed feature must declare its layers)", () => {
  const arch = (o: object) => JSON.stringify({ feature_id: "F1-x", nfrs: [], ...o });
  it("passes a service-backed feature with boundary+service+repository", () => {
    const r = checkLayeringDeclared(
      arch({
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes" },
          { role: "service", module: "app/services" },
          { role: "repository", module: "app/repositories" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });
  it("FAILS a service-backed feature missing the repository layer", () => {
    const r = checkLayeringDeclared(
      arch({ service_backed: true, layers: [{ role: "boundary", module: "app/main.py" }] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/repository|service/);
  });
  it("EXEMPTS a non-service-backed feature (YAGNI), even with no layers", () => {
    expect(checkLayeringDeclared(arch({ service_backed: false })).ok).toBe(true);
    expect(checkLayeringDeclared(arch({})).ok).toBe(true); // service_backed omitted
  });
});

describe("checkFitnessCoverage (Gate 3: a layered feature must have a fitness test)", () => {
  const arch = JSON.stringify({ feature_id: "F1-x", nfrs: [], service_backed: true, layers: [{ role: "service", module: "app/services" }] });
  const tl = (items: object[]) => JSON.stringify({ feature_id: "F1-x", items });
  it("passes when the test-list has a kind:fitness item", () => {
    const r = checkFitnessCoverage(
      tl([
        { id: "T1", description: "x", ac_id: "AC1", status: "pending", kind: "behavior" },
        { id: "T2", description: "layering", ac_id: "AC1", status: "pending", kind: "fitness" },
      ]),
      arch,
    );
    expect(r.ok).toBe(true);
  });
  it("FAILS a service-backed feature whose test-list has only behavior items", () => {
    const r = checkFitnessCoverage(tl([{ id: "T1", description: "x", ac_id: "AC1", status: "pending" }]), arch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/fitness/);
  });
  it("EXEMPTS a non-service-backed feature with no fitness item", () => {
    const trivial = JSON.stringify({ feature_id: "F1-x", nfrs: [] });
    expect(checkFitnessCoverage(tl([{ id: "T1", description: "x", ac_id: "AC1", status: "pending" }]), trivial).ok).toBe(true);
  });
});

describe("checkPersistenceCoverage (Gate 3: DB coverage tied to the schema's declared invariants)", () => {
  const arch = (invariants: object[]) =>
    JSON.stringify({ feature_id: "F1-x", nfrs: [], service_backed: true, layers: [{ role: "repository", module: "app/repositories" }], persistence_invariants: invariants });
  const inv = [
    { id: "PI1-sku-location-unique", type: "unique", table: "stock", brief: "duplicate (sku, location) is rejected" },
    { id: "PI2-qty-nonneg", type: "check", table: "stock", brief: "quantity < 0 is rejected" },
  ];
  const tl = (items: object[]) => JSON.stringify({ feature_id: "F1-x", items });
  it("passes when every declared invariant is covered by an item's invariant_id", () => {
    const r = checkPersistenceCoverage(
      tl([
        { id: "T1", description: "GET /api/stock returns records", ac_id: "AC1", status: "pending", kind: "behavior" },
        { id: "T2", description: "duplicate insert rejected against the branch", ac_id: "AC1", status: "pending", kind: "fitness", invariant_id: "PI1-sku-location-unique" },
        { id: "T3", description: "negative quantity rejected against the branch", ac_id: "AC1", status: "pending", kind: "fitness", invariant_id: "PI2-qty-nonneg" },
      ]),
      arch(inv),
    );
    expect(r.ok).toBe(true);
  });
  it("FAILS when a declared invariant has no covering item", () => {
    const r = checkPersistenceCoverage(
      tl([{ id: "T2", description: "dup rejected", ac_id: "AC1", status: "pending", kind: "fitness", invariant_id: "PI1-sku-location-unique" }]),
      arch(inv),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/PI2-qty-nonneg/);
  });
  it("EXEMPTS a service-backed feature that declares NO persistence_invariants (a non-persisting service: compute/proxy, no database)", () => {
    // A service does not always mean a database. With no declared invariants
    // there is nothing to cover, so persistence coverage is vacuously ok. The
    // safety net against UNDER-declaring a feature that really persists lives in
    // checkServiceBackedDeclaration (Infra AC / storage NFR forces invariants).
    const r = checkPersistenceCoverage(tl([{ id: "T1", description: "x", ac_id: "AC1", status: "pending", kind: "behavior" }]), arch([]));
    expect(r).toEqual({ ok: true });
  });
  it("EXEMPTS a non-service-backed feature", () => {
    const trivial = JSON.stringify({ feature_id: "F1-x", nfrs: [] });
    expect(checkPersistenceCoverage(tl([{ id: "T1", description: "x", ac_id: "AC1", status: "pending" }]), trivial).ok).toBe(true);
  });
});

describe("checkInvariantCoverageDistinct (Gate 3: each invariant belongs to exactly one story)", () => {
  it("passes when each invariant is covered by exactly one story", () => {
    const r = checkInvariantCoverageDistinct([
      { story: "S1-view-stock-by-location", invariantIds: ["PI1-unique", "PI2-notnull"] },
      { story: "S2-view-sku-detail", invariantIds: [] },
      { story: "S3-file-stock", invariantIds: ["PI3-nonneg"] },
    ]);
    expect(r.ok).toBe(true);
  });

  it("FAILS when a later story re-tests an invariant an earlier story already covers", () => {
    const r = checkInvariantCoverageDistinct([
      { story: "S1-view-stock-by-location", invariantIds: ["PI1-unique"] },
      { story: "S2-view-sku-detail", invariantIds: ["PI1-unique"] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Names the duplicate invariant, the offending later story, and the owner.
      expect(r.violations.join(" ")).toMatch(/PI1-unique/);
      expect(r.violations.join(" ")).toMatch(/S2-view-sku-detail re-tests/);
      expect(r.violations.join(" ")).toMatch(/already covered by S1-view-stock-by-location/);
    }
  });

  it("attributes ownership to the lowest S-number story regardless of input order", () => {
    const r = checkInvariantCoverageDistinct([
      { story: "S3-late", invariantIds: ["PI1-unique"] },
      { story: "S1-early", invariantIds: ["PI1-unique"] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.join(" ")).toMatch(/S3-late re-tests/);
      expect(r.violations.join(" ")).toMatch(/already covered by S1-early/);
    }
  });

  it("flags every duplicated invariant (the reflect critic only caught one; the gate catches all)", () => {
    const r = checkInvariantCoverageDistinct([
      { story: "S1-owns", invariantIds: ["PI1", "PI2", "PI3", "PI4"] },
      { story: "S2-dups", invariantIds: ["PI1", "PI2", "PI3", "PI4"] },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.length).toBe(4);
      for (const inv of ["PI1", "PI2", "PI3", "PI4"]) {
        expect(r.violations.join(" ")).toContain(inv);
      }
    }
  });

  it("is a no-op for a single story or a feature with no invariants", () => {
    expect(checkInvariantCoverageDistinct([{ story: "S1-only", invariantIds: ["PI1"] }]).ok).toBe(true);
    expect(
      checkInvariantCoverageDistinct([
        { story: "S1-a", invariantIds: [] },
        { story: "S2-b", invariantIds: [] },
      ]).ok,
    ).toBe(true);
  });

  it("does not flag a story re-listing the SAME invariant twice within itself (only cross-story)", () => {
    const r = checkInvariantCoverageDistinct([{ story: "S1-a", invariantIds: ["PI1", "PI1"] }]);
    expect(r.ok).toBe(true);
  });
});

describe("checkInvariantCoverageDistinct: REALIZATION ownership (db-design), not story order – the front-loaded-invariant defect", () => {
  // The stockflow-full F2 defect: a display-only read story (S1) ordered BEFORE the write story (S2)
  // that creates the table gets front-loaded with the write story's invariant (PI6). Earliest-S-number
  // ownership wrongly makes S1 the owner and dead-locks the reflect gate; realization ownership names
  // S2 (the realizer) and points the fix at moving the item, not keeping it on S1.
  const owner = new Map<string, string>([["PI6", "S2-adjust"]]); // PI6's table is created by S2's migration

  it("flags a SINGLE display-only carrier (S1) holding a later write story's (S2) invariant, naming S2 as the realizer", () => {
    const r = checkInvariantCoverageDistinct(
      [
        { story: "S1-display", invariantIds: ["PI6"] }, // mis-anchored – S1 does not migrate PI6's table
        { story: "S2-adjust", invariantIds: [] },
      ],
      owner,
    );
    expect(r.ok).toBe(false);
    expect((r.ok ? "" : r.violations.join(" "))).toContain("S1-display");
    expect((r.ok ? "" : r.violations.join(" "))).toContain("S2-adjust"); // the realizer is named as the destination
    expect((r.ok ? "" : r.violations.join(" "))).toContain("PI6");
  });

  it("PASSES when the invariant lives on its realizing story (S2 owns PI6, S1 owns none)", () => {
    const r = checkInvariantCoverageDistinct(
      [
        { story: "S1-display", invariantIds: [] },
        { story: "S2-adjust", invariantIds: ["PI6"] },
      ],
      owner,
    );
    expect(r.ok).toBe(true);
  });

  it("without an owner map, falls back to earliest-S-number ownership (unchanged legacy behavior)", () => {
    const r = checkInvariantCoverageDistinct([
      { story: "S1-a", invariantIds: ["PI1"] },
      { story: "S2-b", invariantIds: ["PI1"] },
    ]);
    expect(r.ok).toBe(false);
    expect((r.ok ? "" : r.violations.join(" "))).toContain("S2-b re-tests"); // later story flagged, earliest owns
  });
});

describe("invariantRealizingStory: invariant -> the story whose migration realizes its table", () => {
  const arch = JSON.stringify({
    feature_id: "F2",
    persistence_invariants: [
      { id: "PI1", type: "unique", brief: "stock unique", table: "stock" },
      { id: "PI6", type: "reversible", brief: "adjustment migration reversible", table: "stock_adjustment" },
    ],
  });
  const db = JSON.stringify({
    feature_id: "F2",
    tables: [{ name: "stock", columns: [{ name: "id", type: "uuid" }] }],
    schema_changes: [
      { story_id: "S2-adjust", kind: "create_table", table: "stock_adjustment", detail: "new table" },
      { story_id: "S1-display", kind: "add_index", table: "stock", detail: "read index" },
    ],
    realizes_invariants: ["PI1", "PI6"],
  });

  it("maps PI6 to S2 (its table's create_table story), not S1 which only reads stock", () => {
    const m = invariantRealizingStory(arch, db);
    expect(m.get("PI6")).toBe("S2-adjust");
    expect(m.get("PI1")).toBe("S1-display"); // the only schema_change on `stock` is S1's add_index
  });

  it("returns an empty map when architecture or db-design is absent/unparseable (checker falls back)", () => {
    expect(invariantRealizingStory(undefined, db).size).toBe(0);
    expect(invariantRealizingStory(arch, undefined).size).toBe(0);
    expect(invariantRealizingStory("{bad", db).size).toBe(0);
  });
});

describe("checkSchemaChangeStoryRealizes: a create_table must not land on a UI/E2E shell story", () => {
  const layers = (m: Record<string, string[]>): Map<string, string[]> => new Map(Object.entries(m));

  it("flags a create_table attributed to a pure-shell story (all E2E ACs) – the reflect-loop root cause", () => {
    const changes = [
      { story_id: "S1-scaffold-app-shell", kind: "create_table", table: "stock_levels" },
      { story_id: "S1-scaffold-app-shell", kind: "create_table", table: "stock_adjustments" },
    ];
    const r = checkSchemaChangeStoryRealizes(
      changes,
      layers({ "S1-scaffold-app-shell": ["E2E", "E2E", "E2E", "E2E"], "S2-record-adjustment": ["API", "E2E"] }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.violations.length).toBe(2); // one per mis-attributed table
    expect(r.violations.join("\n")).toContain("stock_levels");
    expect(r.violations.join("\n")).toContain("S1-scaffold-app-shell");
  });

  it("passes when the create_table is attributed to a persisting story (has an API or Infra AC)", () => {
    const changes = [{ story_id: "S2-record-adjustment", kind: "create_table", table: "stock_levels" }];
    expect(checkSchemaChangeStoryRealizes(changes, layers({ "S2-record-adjustment": ["API", "E2E"] })).ok).toBe(true);
    expect(checkSchemaChangeStoryRealizes(changes, layers({ "S2-record-adjustment": ["Infra"] })).ok).toBe(true);
  });

  it("only checks create_table, skips unknown stories, and is a no-op with nothing to create", () => {
    // An add_column on a shell story is not this defect (the table was created by its realizing story).
    expect(
      checkSchemaChangeStoryRealizes(
        [{ story_id: "S1-scaffold-app-shell", kind: "add_column", table: "stock_levels" }],
        layers({ "S1-scaffold-app-shell": ["E2E"] }),
      ).ok,
    ).toBe(true);
    // A story absent from the layer map is skipped (reported by the AC-conformance check), never flagged here.
    expect(
      checkSchemaChangeStoryRealizes([{ story_id: "S9-ghost", kind: "create_table", table: "t" }], layers({})).ok,
    ).toBe(true);
    expect(checkSchemaChangeStoryRealizes([], layers({})).ok).toBe(true);
  });
});

describe("checkE2ECoverage: an E2E-layer AC needs a REAL e2e test, not a mocked component test", () => {
  const tl = (items: Array<{ ac_id: string; kind: string; scenario_file?: string }>): string =>
    JSON.stringify({ items });

  it("passes when the E2E-layer AC has a real Playwright e2e (scenario_file under e2e/)", () => {
    const list = tl([
      { ac_id: "AC1-over-available-rejected", kind: "behavior", scenario_file: "tests/features/s3.feature" },
      { ac_id: "AC1-over-available-rejected", kind: "client", scenario_file: "client/tests/e2e/pick-errors.spec.ts" },
    ]);
    expect(checkE2ECoverage(list, ["AC1-over-available-rejected"]).ok).toBe(true);
  });

  it("HARD-BLOCKS when the E2E-layer AC is covered ONLY by a mocked component test (the S3 defect)", () => {
    const list = tl([
      { ac_id: "AC1-over-available-rejected", kind: "client", scenario_file: "client/tests/pages/OutboundPickPage.test.tsx" },
      { ac_id: "AC1-over-available-rejected", kind: "behavior", scenario_file: "tests/features/s3.feature" },
    ]);
    const r = checkE2ECoverage(list, ["AC1-over-available-rejected"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations[0]).toContain("AC1-over-available-rejected");
      expect(r.violations[0]).toContain("client/tests/e2e/");
    }
  });

  it("HARD-BLOCKS when an E2E-layer AC has no covering test at all", () => {
    const r = checkE2ECoverage(tl([]), ["AC2-unknown-sku-rejected"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations[0]).toContain("has no covering test");
  });

  it("is vacuously ok when there are no E2E-layer ACs (a backend-only or pure-presentation feature)", () => {
    const list = tl([{ ac_id: "AC1", kind: "client", scenario_file: "client/tests/pages/Home.test.tsx" }]);
    expect(checkE2ECoverage(list, []).ok).toBe(true);
  });

  it("reports invalid test-list JSON rather than throwing", () => {
    expect(checkE2ECoverage("{not json", ["AC1"]).ok).toBe(false);
  });
});

describe("checkFitnessClauseCoverage: per-clause coverage for the ATOMIC fitness_functions array form (#4)", () => {
  const archAtomic = (clauses: string[]) =>
    JSON.stringify({
      feature_id: "F1-x",
      service_backed: true,
      nfrs: [{ id: "NFR-F1-spa", brief: "SPA boundary contract", fitness_functions: clauses }],
    });
  const tl = (items: Array<Record<string, unknown>>) => JSON.stringify({ items });

  it("passes when every atomic clause has a covering test tagged with the NFR id", () => {
    const arch = archAtomic(["client-side nav does no full-page reload", "the API boundary returns JSON, not HTML"]);
    const list = tl([
      { id: "T1", ac_id: "AC1", kind: "fitness", nfr_id: "NFR-F1-spa" },
      { id: "T2", ac_id: "AC1", kind: "fitness", nfr_id: "NFR-F1-spa" },
    ]);
    expect(checkFitnessClauseCoverage(list, arch).ok).toBe(true);
  });

  it("blocks when a two-clause NFR has only one covering test (the piecemeal gap, caught mechanically pre-reflect)", () => {
    const arch = archAtomic(["no full-page reload", "boundary returns JSON"]);
    const list = tl([{ id: "T1", ac_id: "AC1", kind: "fitness", nfr_id: "NFR-F1-spa" }]);
    const r = checkFitnessClauseCoverage(list, arch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.join("\n")).toMatch(/NFR-F1-spa declares 2 atomic fitness clause/);
      expect(r.violations.join("\n")).toMatch(/only 1 test-list item/);
    }
  });

  it("is a NO-OP (back-compatible) for an NFR using the singular fitness_function", () => {
    const arch = JSON.stringify({
      feature_id: "F1-x",
      service_backed: true,
      nfrs: [{ id: "NFR-F1-x", brief: "b", fitness_function: "one prose test" }],
    });
    // no nfr_id tags anywhere, yet the singular form is never clause-checked
    expect(checkFitnessClauseCoverage(tl([{ id: "T1", ac_id: "AC1", kind: "fitness" }]), arch).ok).toBe(true);
  });

  it("ignores empty-string clauses when counting the requirement", () => {
    const arch = archAtomic(["real clause", "   ", ""]);
    const list = tl([{ id: "T1", ac_id: "AC1", kind: "fitness", nfr_id: "NFR-F1-spa" }]);
    expect(checkFitnessClauseCoverage(list, arch).ok).toBe(true); // only 1 real clause -> 1 test suffices
  });

  it("tolerates invalid architecture / test-list JSON without throwing", () => {
    expect(checkFitnessClauseCoverage("{}", "{not json").ok).toBe(true); // arch invalid -> vacuously ok
    expect(checkFitnessClauseCoverage("{not json", archAtomic(["a"])).ok).toBe(false); // atomic present, list invalid
  });
});
