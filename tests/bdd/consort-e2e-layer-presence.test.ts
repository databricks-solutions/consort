// E2E-layer PRESENCE guard. checkE2ECoverage only bites once an AC is tagged layer:"E2E",
// so a design lane that mis-classifies every client-facing AC as API/Infra ships a feature
// with ZERO E2E ACs that passes the coverage guard vacuously – exactly how the actor-less
// pick form shipped (the design lane flattened even a rewritten "operator submits the form
// in the browser" premise into a backend "the pick is saved" API AC). checkE2eLayerPresent
// closes it: a client-facing feature MUST carry >=1 E2E AC. It reads TWO signals so the
// mis-classification cannot dodge it – the architect's own renders_via boundary AND the
// architect-independent React-UI-track project signal. The gate wiring defers until every
// declared story is designed (the streaming design lane), then hard-blocks the spec gate.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkE2eLayerPresent } from "../../consort/orchestrator/validators/conformance/artifact-conformance";
import { e2eLayerPresentReason, storyRequiresE2eReason, uiTrackFlattenReason, featureDir as fdirOf } from "../../consort/gates/gate-conformance-guard";
import { initPipeline, surfaceForGate, writePipeline, approveStoryGateFromDisk } from "../../consort/pipeline/story-pipeline";

const REACT_BOUNDARY = JSON.stringify({
  feature_id: "F4-pick",
  service_backed: true,
  layers: [{ role: "boundary", module: "app/routes", renders_via: "react" }],
});
// A plain API boundary – the shape the mis-classification produces when it ALSO drops renders_via.
const API_BOUNDARY = JSON.stringify({
  feature_id: "F4-pick",
  service_backed: true,
  layers: [{ role: "boundary", module: "app/routes" }],
});

describe("checkE2eLayerPresent (the decision logic, both signals)", () => {
  it("renders_via boundary + no E2E AC => BLOCK (the actor-less-form shape)", () => {
    const r = checkE2eLayerPresent(REACT_BOUNDARY, { acLayers: ["API", "Infra"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/layer:"E2E"/);
  });

  it("renders_via boundary + an E2E AC present => ok", () => {
    expect(checkE2eLayerPresent(REACT_BOUNDARY, { acLayers: ["API", "E2E"] }).ok).toBe(true);
  });

  it("no renders_via + not a React project => ok (a genuine API/CLI/Infra feature)", () => {
    expect(checkE2eLayerPresent(API_BOUNDARY, { acLayers: ["API"], uiReact: false }).ok).toBe(true);
  });

  it("no renders_via BUT a React UI-track project exposing an API AC + no E2E => BLOCK (signal 2)", () => {
    // The mis-classification dropped renders_via too; the project signal still catches it.
    const r = checkE2eLayerPresent(API_BOUNDARY, { acLayers: ["API", "Infra"], uiReact: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/React UI-track/);
  });

  it("a React project with only Infra ACs (no endpoint the SPA calls) => ok (no false positive)", () => {
    expect(checkE2eLayerPresent(API_BOUNDARY, { acLayers: ["Infra"], uiReact: true }).ok).toBe(true);
  });

  it("malformed architecture => BLOCK (surface the parse error, do not pass vacuously)", () => {
    expect(checkE2eLayerPresent("{ not json", { acLayers: ["API"], uiReact: true }).ok).toBe(false);
  });
});

describe("e2eLayerPresentReason (gate wiring: streaming deferral + spec-gate block)", () => {
  const F = "F4-pick";
  let tmp: string;
  let consortDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "e2e-layer-"));
    consortDir = join(tmp, ".consort");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function projectConfig(clientFramework: "react" | "none"): void {
    const p = join(tmp, ".lakebase", "consort-config.json");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify({ project: { uiTrack: true, clientFramework } }));
  }
  function featureFile(rel: string, obj: unknown): void {
    const p = join(consortDir, "features", F, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify(obj));
  }
  function ac(story: string, id: string, layer: "API" | "E2E" | "Infra"): void {
    featureFile(join("stories", story, "acs", `${id}.json`), { id, layer, given: "g", when: "w", then: "t" });
  }

  it("all stories designed, React boundary, all API/Infra (zero E2E) => spec gate BLOCKS", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form", "S2-row"] });
    featureFile("architecture.json", JSON.parse(REACT_BOUNDARY));
    ac("S1-form", "AC1-save", "API");
    ac("S2-row", "AC2-row", "Infra");
    expect(e2eLayerPresentReason(consortDir, F)).not.toBeNull();
  });

  it("all stories designed with an E2E AC present => passes (null)", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form", "S2-row"] });
    featureFile("architecture.json", JSON.parse(REACT_BOUNDARY));
    ac("S1-form", "AC1-submit", "E2E");
    ac("S2-row", "AC2-row", "Infra");
    expect(e2eLayerPresentReason(consortDir, F)).toBeNull();
  });

  it("a declared story not yet designed => DEFERS (null), never a premature block", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form", "S2-row"] });
    featureFile("architecture.json", JSON.parse(REACT_BOUNDARY));
    ac("S1-form", "AC1-save", "API"); // S2 has no acs/ yet – design incomplete
    expect(e2eLayerPresentReason(consortDir, F)).toBeNull();
  });

  it("renders_via dropped but a React project with an API AC => BLOCKS via the project signal", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form"] });
    featureFile("architecture.json", JSON.parse(API_BOUNDARY)); // NO renders_via
    ac("S1-form", "AC1-save", "API");
    expect(e2eLayerPresentReason(consortDir, F)).not.toBeNull();
  });

  it("not a React project + no renders_via => passes (a genuine backend feature)", () => {
    projectConfig("none");
    featureFile("feature-spec.json", { id: F, stories: ["S1-endpoint"] });
    featureFile("architecture.json", JSON.parse(API_BOUNDARY));
    ac("S1-endpoint", "AC1-get", "API");
    expect(e2eLayerPresentReason(consortDir, F)).toBeNull();
  });
});

describe("storyRequiresE2eReason (human-authoritative per-story lever, flatten-proof)", () => {
  const F = "F4-pick";
  const S = "S4-record-actor";
  let tmp: string;
  let consortDir: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "requires-e2e-")); consortDir = join(tmp, ".consort"); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const STORY = { id: S, asA: "operator", iWantTo: "record who made a pick", soThat: "the audit trail is complete" };
  function story(obj: Record<string, unknown>): void {
    const p = join(consortDir, "features", F, "stories", S, "story.json");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify(obj));
  }
  function ac(id: string, layer: "API" | "E2E" | "Infra"): void {
    const p = join(consortDir, "features", F, "stories", S, "acs", `${id}.json`);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify({ id, layer, given: "g", when: "w", then: "t", status: "draft", architectural_notes: "n" }));
  }
  const fdir = (): string => fdirOf(consortDir, F);

  it("requires_e2e:true + only a backend API AC (the flatten) => BLOCK", () => {
    story({ ...STORY, requires_e2e: true });
    ac("AC1-pick-saved", "API");
    const r = storyRequiresE2eReason(fdir(), S);
    expect(r).not.toBeNull();
    expect(r).toMatch(/layer:"E2E"/);
  });

  it("requires_e2e:true + a client-submit E2E AC present => ok", () => {
    story({ ...STORY, requires_e2e: true });
    ac("AC1-pick-saved", "API");
    ac("AC2-submit-via-form", "E2E");
    expect(storyRequiresE2eReason(fdir(), S)).toBeNull();
  });

  it("requires_e2e absent/false + only an API AC => ok (unflagged story is not our concern)", () => {
    story({ ...STORY });
    ac("AC1-pick-saved", "API");
    expect(storyRequiresE2eReason(fdir(), S)).toBeNull();
  });

  it("malformed story.json => null (its own conformance check catches it)", () => {
    const p = join(consortDir, "features", F, "stories", S, "story.json");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, "{ not json");
    expect(storyRequiresE2eReason(fdir(), S)).toBeNull();
  });
});

// uiTrackFlattenReason: on a UI project, a story collapsed to all-API ACs with requires_e2e UNSET must
// force an explicit decision (the silent-flatten anomaly). The live stockflow-demo S1 case verbatim.
describe("uiTrackFlattenReason (UI project: all-API story with requires_e2e unset must decide)", () => {
  const F = "F1-stock-visibility";
  const S = "S1-file-stock";
  let tmp: string;
  let consortDir: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "uitrack-flatten-")); consortDir = join(tmp, ".consort"); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function uiTrack(on: boolean): void {
    const p = join(tmp, ".lakebase", "consort-config.json");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify({ project: { uiTrack: on, clientFramework: on ? "react" : "none" } }));
  }
  function story(obj: Record<string, unknown>): void {
    const p = join(consortDir, "features", F, "stories", S, "story.json");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify({ id: S, asA: "operator", iWantTo: "file stock", soThat: "it is tracked", ...obj }));
  }
  function ac(id: string, layer: "API" | "E2E"): void {
    const p = join(consortDir, "features", F, "stories", S, "acs", `${id}.json`);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify({ id, layer, given: "g", when: "w", then: "t", status: "draft", architectural_notes: "n" }));
  }

  it("uiTrack + all-API + requires_e2e unset => BLOCK (the live stockflow-demo S1 flatten)", () => {
    uiTrack(true); story({}); ac("AC1-file-stock-record", "API"); ac("AC2-retrieve", "API");
    const r = uiTrackFlattenReason(consortDir, F);
    expect(r).not.toBeNull();
    expect(r).toMatch(/ALL layer:"API"/i);
    expect(r).toMatch(/requires_e2e:false to confirm/);
  });

  it("uiTrack + a client-submit E2E AC present => ok (UI is exercised)", () => {
    uiTrack(true); story({}); ac("AC1-file-stock-record", "API"); ac("AC2-submit-via-form", "E2E");
    expect(uiTrackFlattenReason(consortDir, F)).toBeNull();
  });

  it("uiTrack + requires_e2e:false => ok (explicit backend-only opt-out honored)", () => {
    uiTrack(true); story({ requires_e2e: false }); ac("AC1-file-stock-record", "API");
    expect(uiTrackFlattenReason(consortDir, F)).toBeNull();
  });

  it("uiTrack + requires_e2e:true => ok here (requiresE2eReason owns enforcing the E2E AC)", () => {
    uiTrack(true); story({ requires_e2e: true }); ac("AC1-file-stock-record", "API");
    expect(uiTrackFlattenReason(consortDir, F)).toBeNull();
  });

  it("backend-only project (uiTrack:false) + all-API => null (no UI to exercise)", () => {
    uiTrack(false); story({}); ac("AC1-file-stock-record", "API");
    expect(uiTrackFlattenReason(consortDir, F)).toBeNull();
  });
});

describe("approveStoryGateFromDisk enforces requires_e2e (fail-closed at the per-story spec gate)", () => {
  const F = "F4-pick";
  const S = "S1-record-actor"; // first story – no independence determination needed
  let tdd: string;
  beforeEach(() => { tdd = mkdtempSync(join(tmpdir(), "requires-e2e-gate-")); });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  function ac(id: string, layer: "API" | "E2E"): void {
    const p = join(tdd, "features", F, "stories", S, "acs", `${id}.json`);
    mkdirSync(join(p, ".."), { recursive: true });
    const num = parseInt(id.match(/^AC(\d+)/)?.[1] ?? "1", 10);
    const base: Record<string, unknown> = { id, layer, given: "g", when: "w", then: "t", status: "draft", architectural_notes: "n" };
    // AC-independence gate: every AC after the first must carry independence.
    if (num > 1) base.independence = { distinct_from_prior: true, rationale: "distinct client-submit outcome" };
    writeFileSync(p, JSON.stringify(base));
  }
  function storyJson(requiresE2e: boolean): void {
    const p = join(tdd, "features", F, "stories", S, "story.json");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify({ id: S, asA: "operator", iWantTo: "record who made a pick", soThat: "audit", requires_e2e: requiresE2e }));
  }
  function surfaced(): void {
    const p = initPipeline(F);
    surfaceForGate(p, S);
    writePipeline(tdd, p);
  }

  it("REFUSES a flagged story with only a backend API AC (the 3x-flatten, now fail-closed)", () => {
    surfaced();
    storyJson(true);
    ac("AC1-pick-saved", "API");
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: "po@example.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/requires_e2e/);
    expect(r.queue).toBeUndefined(); // never queued for build
  });

  it("approves once the story carries a client-submit E2E AC", () => {
    surfaced();
    storyJson(true);
    ac("AC1-pick-saved", "API");
    ac("AC2-submit-via-form", "E2E");
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: "po@example.com" });
    expect(r.ok).toBe(true);
  });
});
