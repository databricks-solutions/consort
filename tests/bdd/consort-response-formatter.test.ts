// response-formatter: the agent-side precheck a role runs on its OWN output.
// It type-checks the artifact against the role's contract and reports the
// specific violations (the CLI turns a non-ok result into a throw). The canonical
// case is the S2 live stall: a test-strategist per-story list that is empty / has
// null or unmapped ac_id must be caught HERE, before it is handed back.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { formatRoleResponse, designGuideConformance, brandAssetDeclared } from "../../consort/session/response-formatter";

const F = "F1-file-bug";
const S = "S2-submit-create-bug";
let tdd: string;

function writeJson(file: string, obj: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}
function acsDir(): string {
  return join(tdd, "features", F, "stories", S, "acs");
}
function perStoryList(): string {
  return join(tdd, "features", F, "stories", S, "test-list-per-story.json");
}
function writeAc(id: string, over: Record<string, unknown> = {}): void {
  writeJson(join(acsDir(), `${id}.json`), {
    id,
    layer: "E2E",
    given: "g",
    when: "w",
    then: "t",
    status: "draft",
    ...over,
  });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-fmt-"));
  mkdirSync(acsDir(), { recursive: true });
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("response-formatter: test-strategist (the S2 contract)", () => {
  beforeEach(() => {
    writeAc("AC1-form-submission-creates-bug");
    writeAc("AC2-redirected-to-detail-page");
  });

  it("FLAGS an empty per-story test list", () => {
    writeJson(perStoryList(), { feature_id: F, story_id: S, items: [] });
    const r = formatRoleResponse({ role: "test-strategist", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/empty `items`/);
  });

  it("FLAGS an item with null/empty ac_id (the exact S2 bug)", () => {
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [{ id: "T7", description: "x", ac_id: null, status: "pending" }],
    });
    const r = formatRoleResponse({ role: "test-strategist", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/null\/empty ac_id/);
  });

  it("FLAGS an item whose ac_id does not map to the story's ACs", () => {
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [{ id: "T1", description: "x", ac_id: "AC9-not-a-real-ac", status: "pending" }],
    });
    const r = formatRoleResponse({ role: "test-strategist", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/not one of the story's ACs/);
  });

  it("FLAGS an AC left with no covering test (reverse coverage; the reflect-testlist-defect the gate raises)", () => {
    // Only AC1 is covered; AC2 (e.g. a client-presentation AC the strategist
    // under-covered) has no item. The self-check must catch it in-turn, not let
    // the reflect gate hard-halt turns later.
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [{ id: "T1", description: "submit creates", ac_id: "AC1-form-submission-creates-bug", status: "pending" }],
    });
    const r = formatRoleResponse({ role: "test-strategist", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((x) => /no covering test/.test(x.problem) && x.problem.includes("AC2-redirected-to-detail-page"))).toBe(true);
  });

  it("FLAGS a kind:fitness item carrying a Gherkin .feature scenario_file (mutually exclusive)", () => {
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [
        { id: "T1", description: "submit creates", ac_id: "AC1-form-submission-creates-bug", status: "pending" },
        { id: "T2", description: "redirect", ac_id: "AC2-redirected-to-detail-page", status: "pending" },
        { id: "T3", description: "layering fitness", ac_id: "AC1-form-submission-creates-bug", kind: "fitness", scenario_file: "tests/features/S1.feature", status: "pending" },
      ],
    });
    const r = formatRoleResponse({ role: "test-strategist", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((x) => /kind:"fitness".*\.feature|Gherkin/.test(x.problem))).toBe(true);
  });

  it("PASSES a conformant per-story list (>=1 item, every ac_id mapped, every AC covered)", () => {
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [
        { id: "T1", description: "submit creates", ac_id: "AC1-form-submission-creates-bug", status: "pending" },
        { id: "T2", description: "redirect", ac_id: "AC2-redirected-to-detail-page", status: "pending" },
      ],
    });
    const r = formatRoleResponse({ role: "test-strategist", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });
});

describe("response-formatter: spec-author + architect-reviewer contracts", () => {
  it("spec-author FLAGS a slug-id AC (not AC<n>) and PASSES a conformant one", () => {
    writeJson(join(acsDir(), "create-form.json"), {
      id: "create-form", // slug id -> violates ac.schema id pattern
      layer: "E2E",
      given: "g",
      when: "w",
      then: "t",
      status: "draft",
    });
    let r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);

    rmSync(join(acsDir(), "create-form.json"));
    writeAc("AC1-create-form");
    r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });

  // Prose-vs-schema drift regression: spec-author.md FORBIDS the spec-author
  // from writing `layer` ("Architect's, next phase") – yet ac.schema once listed
  // `layer` in `required`, so the spec-author's OWN conformance self-check
  // rejected every prompt-obedient (layer-less) AC. In a single-role run (before
  // the architect stamps layer) that DQ'd the spec-author uniformly. `layer` is
  // the architect's field; the spec-author's self-check must PASS a layer-less AC.
  it("spec-author PASSES a prompt-obedient AC that omits `layer` (architect's field)", () => {
    writeJson(join(acsDir(), "AC1-create-form.json"), {
      id: "AC1-create-form",
      given: "g",
      when: "w",
      then: "t",
      status: "draft",
      // NO layer / architectural_notes – those are the architect's, next phase.
    });
    const r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });

  it("architect-reviewer FLAGS an AC missing its layer", () => {
    // No `layer` -> architect contract unmet. (Write a raw AC w/o layer.)
    writeJson(join(acsDir(), "AC1-form.json"), { id: "AC1-form", given: "g", when: "w", then: "t", status: "draft" });
    const r = formatRoleResponse({ role: "architect-reviewer", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /missing\/invalid `layer`/.test(v.problem))).toBe(true);
  });

  // The self-check must enforce what the GATE enforces: every AC carries a
  // non-empty `architectural_notes` (the architect's distinctive per-AC output;
  // the spec-author's bare `layer` does NOT count). Without this, the architect
  // wrote `layer` on every AC, saw the self-check pass, returned – then the
  // design gate rejected the story for missing notes on some ACs (the live
  // PROTOCOL VIOLATION halt). Pin the self-check to the gate.
  it("architect-reviewer FLAGS an AC that has `layer` but NO architectural_notes", () => {
    writeJson(join(acsDir(), "AC1-form.json"), { id: "AC1-form", layer: "E2E", given: "g", when: "w", then: "t", status: "draft", architectural_notes: "E2E: the client fetches from the boundary." });
    writeJson(join(acsDir(), "AC2-list.json"), { id: "AC2-list", layer: "API", given: "g", when: "w", then: "t", status: "draft" }); // layer only, no notes
    const r = formatRoleResponse({ role: "architect-reviewer", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /architectural_notes/.test(v.problem))).toBe(true);
  });

  it("architect-reviewer PASSES when every AC has both layer and architectural_notes", () => {
    writeJson(join(acsDir(), "AC1-form.json"), { id: "AC1-form", layer: "E2E", given: "g", when: "w", then: "t", status: "draft", architectural_notes: "E2E: client fetches from the boundary." });
    writeJson(join(acsDir(), "AC2-list.json"), { id: "AC2-list", layer: "API", given: "g", when: "w", then: "t", status: "draft", architectural_notes: "API: the repository lists rows; the service maps them." });
    const r = formatRoleResponse({ role: "architect-reviewer", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });

  // fitness_function enforcement: architect-reviewer.md mandates every architectural
  // constraint / NFR name the fitness function that defends it (so the Test
  // Strategist authors it as a RED test). The schema now DEFINES fitness_function;
  // the self-check REQUIRES it per declared NFR, so a cheap model can't silently drop
  // it and still pass the gate (the exact regression the architect sweep surfaced).
  function writeArchitecture(nfrs: unknown[]): void {
    writeJson(join(tdd, "features", F, "architecture.json"), {
      feature_id: F, service_backed: true,
      layers: [{ role: "service", module: "app/services" }],
      nfrs,
    });
  }
  it("architect-reviewer FLAGS a declared NFR missing its fitness_function", () => {
    writeJson(join(acsDir(), "AC1-form.json"), { id: "AC1-form", layer: "E2E", given: "g", when: "w", then: "t", status: "draft", architectural_notes: "E2E boundary." });
    writeArchitecture([
      { id: "NFR1", category: "durability", brief: "rows survive migration", fitness_function: "real-branch test asserts survival" },
      { id: "NFR2", category: "security", brief: "writes authn'd" }, // no fitness_function
    ]);
    const r = formatRoleResponse({ role: "architect-reviewer", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /fitness_function/.test(v.problem))).toBe(true);
  });
  it("architect-reviewer PASSES when every declared NFR names a fitness_function", () => {
    writeJson(join(acsDir(), "AC1-form.json"), { id: "AC1-form", layer: "E2E", given: "g", when: "w", then: "t", status: "draft", architectural_notes: "E2E boundary." });
    writeArchitecture([
      { id: "NFR1", category: "durability", brief: "rows survive migration", fitness_function: "real-branch test asserts survival" },
      { id: "NFR2", category: "security", brief: "writes authn'd", fitness_function: "integration test asserts 401 on anon write" },
    ]);
    const r = formatRoleResponse({ role: "architect-reviewer", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });

  it("spec-author FLAGS two ACs with an identical `then` (ac-independence backstop)", () => {
    // The AC2/AC3 overlap that stalled the 2026-06-11 smoke: a non-independent
    // AC whose `then` matches another's can never go RED. Normalization is
    // whitespace + case insensitive.
    writeAc("AC1-submit-files-bug", { then: "Redirects to /bugs/{id}" });
    writeAc("AC2-land-on-bug-url", { then: "redirects to  /bugs/{id}" });
    const r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /identical `then`/.test(v.problem))).toBe(true);
  });

  it("spec-author PASSES ACs with distinct `then` clauses", () => {
    writeAc("AC1-shows-form", { then: "the create-bug form is shown" });
    writeAc("AC2-files-bug", { then: "a new bug row is created" });
    const r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });
});

// Breakdown-mode self-check (no --story): the spec-author runs this on its OWN
// output before returning, so a breakdown that omits story independence
// self-corrects at breakdown instead of slipping to the ship gate. Enforcement
// half of the story-independence fix.
describe("response-formatter: spec-author BREAKDOWN mode (feature-level, no story)", () => {
  const writeStory = (id: string, over: Record<string, unknown> = {}) =>
    writeJson(join(tdd, "features", F, "stories", id, "story.json"), { id, asA: "u", iWantTo: "x", soThat: "y", ...over });
  const writeFeatureSpec = (storyIds: string[]) =>
    writeJson(join(tdd, "features", F, "feature-spec.json"), {
      id: F, name: "File a bug", status: "draft", tdd_mode: "standard", stories: storyIds,
    });

  it("FLAGS a breakdown where a later story stub omits independence", () => {
    writeFeatureSpec(["S1-file", "S2-list"]);
    writeStory("S1-file");
    writeStory("S2-list"); // no independence
    const r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    expect(r.violations.map((x) => x.problem).join(" ")).toMatch(/S2-list.*independence|independence.*S2-list/i);
  });

  it("PASSES a breakdown where every later story records independence", () => {
    writeFeatureSpec(["S1-file", "S2-list"]);
    writeStory("S1-file");
    writeStory("S2-list", { independence: { distinct_from_prior: true, rationale: "lists bugs, a view S1 never builds" } });
    const r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(true);
  });

  it("PASSES a single-story breakdown (nothing to be independent of)", () => {
    writeFeatureSpec(["S1-file"]);
    writeStory("S1-file");
    const r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(true);
  });

  it("FLAGS a breakdown missing feature-spec.json (the required deliverable)", () => {
    writeStory("S1-file");
    const r = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    expect(r.violations.map((x) => x.problem).join(" ")).toMatch(/feature-spec\.json/i);
  });
});

describe("response-formatter: ux-designer (design-guide.json conforms to its schema)", () => {
  function designGuide(): string {
    return join(tdd, "design", "design-guide.json");
  }
  const CONFORMANT = {
    typography: {
      font_family: "'DM Sans', sans-serif",
      font_mono: "'DM Mono', monospace",
      scale: { "text-base": "15px" },
      line_heights: { body: "1.5" },
      font_weights: { medium: "500" },
    },
    colors: { brand: { "brand-red": "#FF3621" } },
    spacing: { "space-4": "16px" },
    // A UI project's guide names the component-class vocabulary feature pages apply.
    components: {
      page: { class: "page" },
      card: { class: "card" },
      button: { class: "btn", variants: "btn--primary, btn--secondary" },
    },
  };

  it("FLAGS a missing design-guide.json", () => {
    const r = formatRoleResponse({ role: "ux-designer", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/not written/);
  });

  it("FLAGS the exact live drift (camelCase keys, nested spacing, extra typography props)", () => {
    writeJson(designGuide(), {
      typography: {
        fontFamilyPrimary: "'DM Sans', sans-serif",
        fontFamilyNumeric: "'DM Mono', monospace",
        scale: { base: "15px" },
        lineHeightBody: "1.5",
        fontWeights: [400, 500],
      },
      colors: { brand: { red: "#FF3621" } },
      spacing: { unit: "4px", scale: { "space-4": "16px" } },
    });
    const r = formatRoleResponse({ role: "ux-designer", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    const problem = r.violations.map((v) => v.problem).join(" ");
    expect(problem).toMatch(/font_family/);
    expect(problem).toMatch(/additional properties/i);
  });

  it("PASSES a conformant guide with the expanded typography tokens", () => {
    writeJson(designGuide(), CONFORMANT);
    const r = formatRoleResponse({ role: "ux-designer", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("FLAGS a schema-valid guide that omits the components vocabulary (UI pages need named classes)", () => {
    const { components, ...noComponents } = CONFORMANT; // schema-valid, but no components
    void components;
    writeJson(designGuide(), noComponents);
    const r = formatRoleResponse({ role: "ux-designer", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.problem).join("\n")).toMatch(/components/i);
  });

  // The design-lane gate (orchestrator-effects `designGuideReady`) reads .ok from
  // this SAME helper, so the self-check and the deterministic gate can never
  // disagree. Lock its contract here.
  it("designGuideConformance: the shared gate/self-check decision", () => {
    expect(designGuideConformance(tdd).ok).toBe(false); // missing
    writeJson(designGuide(), { typography: { fontFamilyPrimary: "x", scale: { base: "15px" } }, colors: { brand: {} }, spacing: {} });
    const bad = designGuideConformance(tdd);
    expect(bad.ok).toBe(false);
    expect(bad.problem).toMatch(/font_family|additional properties/i);
    writeJson(designGuide(), CONFORMANT);
    expect(designGuideConformance(tdd)).toEqual({ ok: true });
  });
});

describe("response-formatter: ux-designer (a STAGED brand asset must be declared as app_icon)", () => {
  const CONFORMANT_UI = {
    typography: { font_family: "'DM Sans', sans-serif", scale: { "text-base": "15px" }, line_heights: { body: "1.5" }, font_weights: { medium: "500" } },
    colors: { brand: { "brand-red": "#FF3621" } },
    spacing: { "space-4": "16px" },
    components: { page: { class: "page" }, card: { class: "card" }, button: { class: "btn" } },
  };
  const guidePath = (): string => join(tdd, "design", "design-guide.json");
  const stageAsset = (name = "warehouse.png"): void => {
    const dir = join(tdd, "design", "assets");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG-ish bytes
  };

  it("PASSES when nothing is staged (no app_icon obligation)", () => {
    writeJson(guidePath(), CONFORMANT_UI);
    expect(brandAssetDeclared(tdd)).toEqual({ ok: true });
    expect(formatRoleResponse({ role: "ux-designer", consortDir: tdd, featureId: F }).ok).toBe(true);
  });

  it("FLAGS a staged asset the guide omits from app_icon (the icon would silently never ship)", () => {
    stageAsset("warehouse.png");
    writeJson(guidePath(), CONFORMANT_UI); // conformant + has components, but NO app_icon
    const b = brandAssetDeclared(tdd);
    expect(b.ok).toBe(false);
    expect(b.problem).toMatch(/app_icon/);
    expect(b.problem).toMatch(/warehouse\.png/);
    const r = formatRoleResponse({ role: "ux-designer", consortDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.problem).join("\n")).toMatch(/app_icon/);
  });

  it("PASSES once the guide declares app_icon for the staged asset", () => {
    stageAsset("warehouse.png");
    writeJson(guidePath(), {
      ...CONFORMANT_UI,
      app_icon: { source: ".consort/design/assets/warehouse.png", install_to: "client/public/warehouse.png" },
    });
    expect(brandAssetDeclared(tdd)).toEqual({ ok: true });
    expect(formatRoleResponse({ role: "ux-designer", consortDir: tdd, featureId: F }).ok).toBe(true);
  });

  it("ignores non-image files in the assets dir (only a real brand asset obliges)", () => {
    const dir = join(tdd, "design", "assets");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "notes.txt"), "not an image");
    writeJson(guidePath(), CONFORMANT_UI);
    expect(brandAssetDeclared(tdd)).toEqual({ ok: true });
  });
});

describe("response-formatter: roles with no deterministic contract pass", () => {
  it("an unknown/uncovered role is a no-op PASS", () => {
    const r = formatRoleResponse({ role: "navigator", consortDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });
});

describe("response-formatter: spec-author enforces the registered breakdown (the design seed)", () => {
  const RF = "F1-stock-visibility";
  function reg(): void {
    writeJson(join(tdd, "registration.json"), {
      feature_id: RF,
      stories: [
        { id: "S1-file-stock", acs: ["AC1-file-stock-record", "AC2-retrieve-stock-record", "AC3-collision-resolved-at-write"] },
        { id: "S2-stock-by-location-table", acs: ["AC1-table-lists-stock-by-location"] },
      ],
    });
  }
  function derivedStory(id: string, acs: string[]): void {
    const dir = join(tdd, "features", RF, "stories", id, "acs");
    mkdirSync(dir, { recursive: true });
    for (const a of acs) writeJson(join(dir, `${a}.json`), { id: a, layer: "API", given: "g", when: "w", then: "t" });
  }
  function featureSpec(ids: string[]): void {
    writeJson(join(tdd, "features", RF, "feature-spec.json"), { id: RF, name: RF, status: "draft", stories: ids });
  }
  const regViolations = (res: { violations: { artifact: string; problem: string }[] }) =>
    res.violations.filter((x) => x.artifact === "registration.json");

  it("breakdown turn FLAGS a renamed story (S2 rename) against the registration", () => {
    reg();
    featureSpec(["S1-file-stock", "S2-stock-home-screen"]);
    derivedStory("S1-file-stock", []);
    derivedStory("S2-stock-home-screen", []); // renamed from registered S2-stock-by-location-table
    const res = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: RF }); // no story => breakdown turn
    expect(regViolations(res).some((v) => /unregistered story "S2-stock-home-screen"/.test(v.problem))).toBe(true);
    expect(regViolations(res).some((v) => /registered story "S2-stock-by-location-table" is missing/.test(v.problem))).toBe(true);
  });

  it("per-story turn FLAGS renamed ACs (S1 AC drift) against the registration", () => {
    reg();
    derivedStory("S1-file-stock", ["AC1-file-new-stock", "AC2-filed-stock-retrievable", "AC3-refile-updates-in-place"]);
    derivedStory("S2-stock-by-location-table", []);
    const res = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: RF, story: "S1-file-stock" });
    expect(regViolations(res).some((v) => /unregistered AC "AC1-file-new-stock"/.test(v.problem))).toBe(true);
    expect(regViolations(res).some((v) => /registered AC "AC1-file-stock-record" is missing/.test(v.problem))).toBe(true);
  });

  it("PASSES the registration check when the derived breakdown matches (canonical ids by construction)", () => {
    reg();
    featureSpec(["S1-file-stock", "S2-stock-by-location-table"]);
    derivedStory("S1-file-stock", ["AC1-file-stock-record", "AC2-retrieve-stock-record", "AC3-collision-resolved-at-write"]);
    derivedStory("S2-stock-by-location-table", []); // S2 ACs not authored yet — skipped, not flagged
    const res = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: RF, story: "S1-file-stock" });
    expect(regViolations(res)).toHaveLength(0);
  });

  it("is a no-op when the feature is NOT registered", () => {
    derivedStory("S1-anything", ["AC1-whatever"]); // no registration.json written
    const res = formatRoleResponse({ role: "spec-author", consortDir: tdd, featureId: RF, story: "S1-anything" });
    expect(regViolations(res)).toHaveLength(0);
  });
});
