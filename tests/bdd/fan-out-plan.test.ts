// Hermetic unit coverage for the deterministic test-analyst fan-out's PURE helpers (the subprocess
// orchestration in bin/consort/fan-out-analysts.cli.ts is live-proven separately). Locks the contract
// the bin depends on: JSON extraction from an analyst reply, feature-flat T-id math, the per-kind
// prompt shape, deterministic slice assembly, and input-path resolution.
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { TEST_ANALYST_CATALOGUE } from "../../consort/test-list/test-analyst-catalogue.js";
import {
  analystInputPaths,
  analystOrderedJson,
  assembleSlices,
  buildKindAnalystPrompt,
  extractJsonArray,
  highestTid,
  mergeOrdered,
  uncoveredAcs,
  validateTestlistItems,
  behaviorWarranted,
  type FanOutLoc,
} from "../../consort/test-list/fan-out-plan.js";

const loc: FanOutLoc = { consortDir: "/p/.consort", projectDir: "/p", featureId: "F1-x", story: "S1-y" };

describe("fan-out-plan — extractJsonArray", () => {
  it("parses the LAST fenced json array in a reply", () => {
    const text = 'prose\n```json\n[{"id":"bhv-1"}]\n```\nmore\n```json\n[{"id":"bhv-2"},{"id":"bhv-3"}]\n```';
    expect(extractJsonArray(text)).toEqual([{ id: "bhv-2" }, { id: "bhv-3" }]);
  });
  it("throws when there is no fenced json block", () => {
    expect(() => extractJsonArray("no fence here")).toThrow(/no fenced/);
  });
  it("throws when the fenced block is not an array", () => {
    expect(() => extractJsonArray('```json\n{"id":"x"}\n```')).toThrow(/not an array/);
  });
});

describe("fan-out-plan — highestTid", () => {
  it("returns the max feature-flat T<n> (0 when none)", () => {
    expect(highestTid([])).toBe(0);
    expect(highestTid([{ id: "T3" }, { id: "T17" }, { id: "T9" }])).toBe(17);
    expect(highestTid([{ id: "bhv-1" }, { id: "T2" }])).toBe(2); // ignores non-T ids
  });
});

describe("fan-out-plan — input paths", () => {
  it("resolves each input kind to its on-disk slice", () => {
    expect(analystInputPaths("story-acs", loc)).toEqual([join(loc.consortDir, "features", "F1-x", "stories", "S1-y", "acs")]);
    expect(analystInputPaths("architecture-invariants", loc)).toEqual([join(loc.consortDir, "features", "F1-x", "architecture.json")]);
    expect(analystInputPaths("db-design", loc)).toEqual([join(loc.consortDir, "features", "F1-x", "db-design.json")]);
    expect(analystInputPaths("design-guide", loc)).toEqual([
      join(loc.consortDir, "design", "design-guide.json"),
      join(loc.consortDir, "design", "ia.md"),
    ]);
  });
  it("names the ordered-list artifact under the story dir", () => {
    expect(analystOrderedJson(loc.consortDir, loc.featureId, loc.story)).toBe(
      join(loc.consortDir, "features", "F1-x", "stories", "S1-y", "analyst-ordered.json"),
    );
  });
});

describe("fan-out-plan — mergeOrdered (scoped re-derive)", () => {
  it("preserves the kept items first (original ids), then appends the freshly-derived ones", () => {
    const preserved = [{ id: "T1", ac_id: "AC1" }, { id: "T2", ac_id: "AC3" }];
    const fresh = [{ id: "T3", ac_id: "AC2" }, { id: "T4", ac_id: "AC2" }];
    expect(mergeOrdered(preserved, fresh)).toEqual([...preserved, ...fresh]);
  });
});

describe("fan-out-plan — uncoveredAcs (coverage-retry)", () => {
  it("returns the story ACs with no covering item (empty = full coverage)", () => {
    const acs = ["AC1", "AC2", "AC3"];
    expect(uncoveredAcs([{ ac_id: "AC1" }, { ac_id: "AC2" }, { ac_id: "AC3" }], acs)).toEqual([]);
    // the live failure mode: behavior analyst under-produced → AC2 uncovered
    expect(uncoveredAcs([{ ac_id: "AC1" }, { ac_id: "AC3" }], acs)).toEqual(["AC2"]);
    expect(uncoveredAcs([], acs)).toEqual(["AC1", "AC2", "AC3"]);
  });
});

describe("fan-out-plan — validateTestlistItems (the sub-agent self-check)", () => {
  const ACS = ["AC1-file-stock-record", "AC2-retrieve-stock-record", "AC3-collision-resolved-at-write"];
  const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "bhv-1",
    description: "files a record and returns it",
    ac_id: "AC1-file-stock-record",
    status: "pending",
    kind: "behavior",
    ...over,
  });

  it("passes a well-formed slice whose ac_ids are all full story ac ids", () => {
    expect(validateTestlistItems([item()], ACS)).toEqual([]);
  });

  it("flags a TRUNCATED ac_id (the real bug) naming the full set", () => {
    const problems = validateTestlistItems([item({ ac_id: "AC1" })], ACS);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/ac_id "AC1" is NOT one of the story's EXACT ac ids/);
  });

  it("flags shape problems (missing description, bad kind)", () => {
    const problems = validateTestlistItems([item({ description: "", kind: "weird" })], ACS);
    expect(problems.join(" ")).toMatch(/missing a non-empty "description"/);
    expect(problems.join(" ")).toMatch(/"kind" must be behavior\|fitness\|client/);
  });

  it("ordered mode requires full AC coverage + feature-flat T-ids (unique)", () => {
    // ordered list missing AC2/AC3 + a kind-local id instead of T<n>
    const problems = validateTestlistItems([item({ id: "bhv-1" })], ACS, { ordered: true });
    expect(problems.join(" ")).toMatch(/ordered id must be a feature-flat "T<n>"/);
    expect(problems.join(" ")).toMatch(/no item covers these story AC\(s\): AC2-retrieve-stock-record, AC3-collision-resolved-at-write/);
    // a clean ordered list covering every AC with unique T-ids passes
    const clean = ACS.map((ac, i) => item({ id: `T${i + 1}`, ac_id: ac }));
    expect(validateTestlistItems(clean, ACS, { ordered: true })).toEqual([]);
  });

  it("flags (in-turn) an E2E create flow keyed on a hardcoded business key — so the analyst re-authors before returning", () => {
    const layers = { "AC1-file-stock-record": "E2E" };
    const bad = item({
      id: "T26",
      kind: "client",
      scenario_file: "client/tests/e2e/file.spec.ts",
      description: "files SKU-100 at B2 with quantity 5 and asserts the row",
    });
    const problems = validateTestlistItems([bad], ACS, { acLayers: layers });
    expect(problems.join(" ")).toMatch(/HARDCODED business key|per-run-unique business key/);
  });

  it("passes an E2E create flow that keys on a per-run-unique business key (born clean)", () => {
    const layers = { "AC1-file-stock-record": "E2E" };
    const good = item({
      id: "T26",
      kind: "client",
      scenario_file: "client/tests/e2e/file.spec.ts",
      description: "files a per-run-unique SKU (crypto.randomUUID) at B2 and asserts that same SKU",
    });
    expect(validateTestlistItems([good], ACS, { acLayers: layers })).toEqual([]);
  });

  it("does not fixed-key-flag a non-client (behavior) item that names a key literal", () => {
    const layers = { "AC1-file-stock-record": "E2E" };
    const bhv = item({ description: "POST /api/stock for SKU-100 at B2 returns the row" }); // kind: behavior
    expect(validateTestlistItems([bhv], ACS, { acLayers: layers })).toEqual([]);
  });

  it("flags a non-array", () => {
    expect(validateTestlistItems({ items: [] }, ACS)).toEqual(["output is not a JSON array of test-list items"]);
  });
});

describe("fan-out-plan — behaviorWarranted (#1: skip the behavior analyst for a read-only story)", () => {
  it("warranted when there is an API or Infra-layer AC", () => {
    expect(behaviorWarranted(["E2E", "API"], [undefined, undefined], false)).toBe(true);
    expect(behaviorWarranted(["Infra"], [undefined], false)).toBe(true);
  });
  it("warranted when the story has a schema change (it writes) even if all ACs are E2E", () => {
    // S1 is all-E2E in its final state yet writes (create_table) — must KEEP behavior, not skip it.
    expect(behaviorWarranted(["E2E", "E2E", "E2E"], ["renders the form", "shows the record", "upsert on re-file"], true)).toBe(true);
  });
  it("warranted when an AC note carries a write/mutation verb", () => {
    expect(behaviorWarranted(["E2E"], ["POST /api/stock files a record"], false)).toBe(true);
    expect(behaviorWarranted(["E2E"], ["the service upserts the row"], false)).toBe(true);
  });
  it("NOT warranted for a demonstrably read-only all-E2E story (no API/Infra, no schema change, read notes) → skip", () => {
    // S2/S3: table/detail views over an existing table. Spawning behavior would return 0 — skip it.
    expect(behaviorWarranted(["E2E", "E2E", "E2E"], ["lists stock by location", "right-aligns quantity", "shows an empty state"], false)).toBe(false);
  });
});

describe("fan-out-plan — validateTestlistItems #2: an E2E-layer AC's client test must be a real e2e spec", () => {
  const base = { id: "T1", description: "x", status: "pending", kind: "client" as const };
  it("rejects a *.e2e.ts file + a pages/*.test.tsx harness for an E2E-layer AC's client item", () => {
    const layers = { AC1: "E2E" };
    const eDotTs = validateTestlistItems([{ ...base, ac_id: "AC1", scenario_file: "client/tests/e2e/x.e2e.ts" }], ["AC1"], { acLayers: layers });
    expect(eDotTs.join(" ")).toMatch(/must be a real Playwright e2e spec/);
    const harness = validateTestlistItems([{ ...base, ac_id: "AC1", scenario_file: "client/tests/pages/X.test.tsx" }], ["AC1"], { acLayers: layers });
    expect(harness.join(" ")).toMatch(/pages\/\*\.test\.tsx component harness/);
    const missing = validateTestlistItems([{ ...base, ac_id: "AC1" }], ["AC1"], { acLayers: layers });
    expect(missing.join(" ")).toMatch(/no scenario_file/);
  });
  it("accepts a real e2e .spec.ts for an E2E AC, and does not constrain a non-E2E AC's client item", () => {
    expect(validateTestlistItems([{ ...base, ac_id: "AC1", scenario_file: "client/tests/e2e/x.spec.ts" }], ["AC1"], { acLayers: { AC1: "E2E" } })).toEqual([]);
    // a client-layer AC (not E2E) may use a component harness
    expect(validateTestlistItems([{ ...base, ac_id: "AC2", scenario_file: "client/tests/pages/X.test.tsx" }], ["AC2"], { acLayers: { AC2: "client" } })).toEqual([]);
  });
});

describe("fan-out-plan — prompt builders", () => {
  const ACS = ["AC1-file-stock-record", "AC2-retrieve-stock-record", "AC3-collision-resolved-at-write"];
  it("a kind analyst prompt carries its focusPrompt + story scope + the EXACT AC ids/files (not just the dir)", () => {
    const p = buildKindAnalystPrompt(TEST_ANALYST_CATALOGUE.behavior!, loc, ACS);
    expect(p).toContain("story S1-y of feature F1-x");
    expect(p).toContain(join(loc.consortDir, "features", "F1-x", "stories", "S1-y", "acs"));
    expect(p).toContain("BEHAVIOR test analyst"); // the focusPrompt body
    expect(p).toContain("UNORDERED JSON array"); // the baked SLICE_CONTRACT
    // ROOT-CAUSE FIX: the EXACT ac ids + files are injected so the analyst reads the files + tags verbatim
    // instead of inferring ids from architecture.json (the acs/ dir is not Read-listable).
    expect(p).toContain("EXACT acceptance-criterion ids are: AC1-file-stock-record, AC2-retrieve-stock-record, AC3-collision-resolved-at-write");
    expect(p).toContain(join(loc.consortDir, "features", "F1-x", "stories", "S1-y", "acs", "AC3-collision-resolved-at-write.json"));
    expect(p).toMatch(/do NOT infer ac_ids from architecture\.json/);
    expect(p).toMatch(/COPIED VERBATIM/);
  });
  it("a SCOPED kind-analyst prompt limits authoring to the target ACs", () => {
    const p = buildKindAnalystPrompt(TEST_ANALYST_CATALOGUE.behavior!, loc, ACS, ["AC2-retrieve-stock-record"]);
    expect(p).toContain("SCOPE: author items ONLY for these AC id(s): AC2-retrieve-stock-record");
    // a non-scoped build carries no SCOPE line
    expect(buildKindAnalystPrompt(TEST_ANALYST_CATALOGUE.behavior!, loc, ACS)).not.toContain("SCOPE: author items ONLY");
  });

  it("the kind-analyst prompt carries the logging directive (consort-log) so the fan-out is observable", () => {
    const kind = buildKindAnalystPrompt(TEST_ANALYST_CATALOGUE.behavior!, loc, ACS);
    expect(kind).toMatch(/OBSERVABILITY \(REQUIRED\)/);
    expect(kind).toContain("consort-log --role test-strategist --event reasoning --feature F1-x");
    expect(kind).toMatch(/EXACT ac_id STRING[\s\S]*never abbreviated/); // surfaces the truncation bug
    expect(kind).toMatch(/0 items for AND WHY/); // surfaces the behavior=0 under-production
    expect(kind).toContain("[behavior analyst] story S1-y");
  });

  it("the kind-analyst prompt carries the SELF-CHECK directive (consort-check-testlist), UNORDERED slice", () => {
    const kind = buildKindAnalystPrompt(TEST_ANALYST_CATALOGUE.behavior!, loc, ACS);
    expect(kind).toMatch(/SELF-CHECK \(REQUIRED\) before you call this complete/);
    expect(kind).toContain("consort-check-testlist --feature F1-x --story S1-y --file");
    expect(kind).toMatch(/re-run until[\s\S]*prints "ok"/);
    expect(kind).not.toContain("--ordered"); // a kind slice is unordered; the bin assembles + orders
  });
});

describe("fan-out-plan — assembleSlices (deterministic in-process assembler)", () => {
  const ACS = ["AC1", "AC2", "AC3"];
  const mk = (kind: string, ac: string, description: string, extra: Record<string, unknown> = {}) => ({ kind, ac_id: ac, description, ...extra });

  it("concatenates every slice item, orders by AC then kind, and assigns feature-flat T-ids from startId", () => {
    const slices = [
      { kind: "client", items: [mk("client", "AC2", "renders AC2 row")] },
      { kind: "behavior", items: [mk("behavior", "AC1", "POST AC1"), mk("behavior", "AC2", "GET AC2")] },
      { kind: "fitness", items: [mk("fitness", "AC1", "AC1 invariant", { invariant_id: "PI1" })] },
    ];
    const out = assembleSlices(slices, 42, ACS) as Array<Record<string, unknown>>;
    // every item kept (coverage never lost): 1 client + 2 behavior + 1 fitness = 4
    expect(out).toHaveLength(4);
    // feature-flat T-ids from 42, contiguous in emit order
    expect(out.map((i) => i.id)).toEqual(["T42", "T43", "T44", "T45"]);
    // ordered by AC order (AC1 before AC2), then kind (behavior → fitness → client)
    expect(out.map((i) => `${i.ac_id}:${i.kind}`)).toEqual(["AC1:behavior", "AC1:fitness", "AC2:behavior", "AC2:client"]);
    expect(out.every((i) => i.status === "pending")).toBe(true);
  });

  it("drops EXACT (ac_id + normalized description) duplicates", () => {
    const slices = [
      { kind: "behavior", items: [mk("behavior", "AC1", "POST  AC1 Returns  the row")] },
      { kind: "behavior", items: [mk("behavior", "AC1", "post ac1 returns the row")] }, // same, differently cased/spaced
      { kind: "behavior", items: [mk("behavior", "AC1", "POST AC1 returns a 422")] }, // genuinely different → kept
    ];
    const out = assembleSlices(slices, 1, ACS) as Array<Record<string, unknown>>;
    expect(out).toHaveLength(2);
  });

  it("keeps exactly one fitness item per invariant_id", () => {
    const slices = [
      { kind: "fitness", items: [mk("fitness", "AC1", "PI1 realized one way", { invariant_id: "PI1" })] },
      { kind: "fitness", items: [mk("fitness", "AC1", "PI1 realized another way", { invariant_id: "PI1" })] },
      { kind: "fitness", items: [mk("fitness", "AC2", "PI2 realized", { invariant_id: "PI2" })] },
    ];
    const out = assembleSlices(slices, 1, ACS) as Array<Record<string, unknown>>;
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.invariant_id).sort()).toEqual(["PI1", "PI2"]);
  });

  it("produces a list that passes the ordered self-check contract (every AC covered, T<n> unique)", () => {
    const slices = [
      { kind: "behavior", items: [mk("behavior", "AC1", "a"), mk("behavior", "AC2", "b"), mk("behavior", "AC3", "c")] },
    ];
    const out = assembleSlices(slices, 10, ACS);
    expect(validateTestlistItems(out, ACS, { ordered: true })).toEqual([]);
  });
});
