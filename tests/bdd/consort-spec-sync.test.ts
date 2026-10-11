import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  validateSpec,
  readFeature,
  writeFeature,
  readWorkflowState,
  writeWorkflowState,
  normalizeStoryJson,
  healAndReportStoryNarrative,
  type Feature,
  type WorkflowState,
} from "../../consort/intake/spec-sync";

let tdd: string;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-spec-"));
  mkdirSync(join(tdd, "features", "F1-test-feature", "stories", "S1-test-story", "acs"), { recursive: true });
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function fixture(): Feature {
  return {
    id: "F1",
    name: "Test Feature",
    status: "draft",
    tdd_mode: "N=1",
    stories: ["S1"],
  };
}

describe("spec-sync", () => {
  it("round-trips a feature: write then read returns the same object", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative text.\n");
    const round = readFeature(tdd, "F1");
    expect(round).toEqual(feature);
  });

  it("writeFeature updates feature-spec.json", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative text.\n");
    const updated: Feature = { ...feature, status: "spec-approved" };
    writeFeature(tdd, updated);
    const round = readFeature(tdd, "F1");
    expect(round.status).toBe("spec-approved");
  });

  it("validateSpec returns no reports for a valid tree", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative text long enough to pass length check.\n");
    const storyDir = join(featureDir, "stories", "S1-test-story");
    writeFileSync(
      join(storyDir, "story.json"),
      JSON.stringify({ id: "S1", asA: "user", iWantTo: "do thing", soThat: "outcome", feature_id: "F1" })
    );
    writeFileSync(join(storyDir, "story.md"), "# Story\n\nNarrative long enough to satisfy length check.\n");
    const ac = {
      id: "AC1",
      layer: "API",
      given: "g",
      when: "w",
      then: "t",
      status: "draft",
      story_id: "S1",
    };
    writeFileSync(join(storyDir, "acs", "AC1.json"), JSON.stringify(ac));
    writeFileSync(join(storyDir, "acs", "AC1.md"), "# AC1\n\nAC narrative.\n");
    expect(validateSpec(tdd)).toEqual([]);
  });

  it("validateSpec reports schema violation for malformed feature-spec.json", () => {
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify({ id: "F1", name: "X" }));
    writeFileSync(join(featureDir, "feature-spec.md"), "# X\n\nLong enough narrative body.\n");
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "schema")).toBeTruthy();
  });

  it("validateSpec reports pair-missing when .md is absent", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "pair-missing")).toBeTruthy();
  });

  it("validateSpec reports narrative-empty when .md is too short", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "x");
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "narrative-empty")).toBeTruthy();
  });

  it("validateSpec reports id-mismatch when dir name disagrees with id", () => {
    const featureDir = join(tdd, "features", "Z9-wrong-dir");
    mkdirSync(featureDir, { recursive: true });
    const feature = { ...fixture(), id: "F1" };
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# X\n\nLong enough narrative body here.\n");
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "id-mismatch")).toBeTruthy();
  });

  it("writeWorkflowState / readWorkflowState round-trip", () => {
    const state: WorkflowState = {
      phase: "implementation",
      started_at: new Date().toISOString(),
      feature_id: "F1",
    };
    writeWorkflowState(tdd, state);
    const round = readWorkflowState(tdd);
    expect(round).toEqual(state);
  });

  it("readWorkflowState returns null when no state file exists", () => {
    expect(readWorkflowState(tdd)).toBeNull();
  });
});

describe("normalizeStoryJson", () => {
  const storyDir = () => join(tdd, "features", "F1-test-feature", "stories", "S1-test-story");

  it("maps a stray `feature` to feature_id and strips non-spec keys, leaving a conformant object", () => {
    // The exact field-drift the spec-author LLM produced live: `feature` instead of
    // feature_id + `status` (pipeline runtime state, not in story.schema).
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "user", iWantTo: "do thing", soThat: "outcome", feature: "F1", status: "draft" })
    );
    const changed = normalizeStoryJson(tdd, "F1");
    expect(changed).toEqual(["S1-test-story"]);
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj).toEqual({ id: "S1", asA: "user", iWantTo: "do thing", soThat: "outcome", feature_id: "F1" });
    // The normalized artifact now passes the schema-backed validator.
    writeFileSync(join(storyDir(), "story.md"), "# Story\n\nNarrative long enough to satisfy the length check.\n");
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(fixture()));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative body long enough to pass.\n");
    expect(validateSpec(tdd).find((r) => r.file.endsWith("story.json"))).toBeUndefined();
  });

  it("PRESERVES requires_e2e (a valid schema field) — the drift that silently disabled the E2E spec gate", () => {
    // requires_e2e is HUMAN/PO-authoritative + a real story.schema property; the hand-maintained
    // allow-list used to omit it, so the normalizer deleted it and requiresE2eReason never fired.
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature_id: "F1", requires_e2e: true, status: "draft" })
    );
    normalizeStoryJson(tdd, "F1");
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj.requires_e2e).toBe(true); // kept (schema property)
    expect(obj.status).toBeUndefined(); // stripped (not a schema property)
  });

  it("keeps EVERY story.schema property (allow-list is DERIVED from the schema, cannot drift)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemaProps = Object.keys(
      (require("../../consort/config/schemas/story.schema.json") as { properties: Record<string, unknown> }).properties,
    );
    const full: Record<string, unknown> = {
      id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature_id: "F1",
      acs: ["AC1"], independence: { distinct_from_prior: true, rationale: "x" },
      requires_e2e: true, external_ref: "JIRA-1",
    };
    // The fixture must exercise every schema property (guards against a new schema field going untested).
    expect(Object.keys(full).sort()).toEqual([...schemaProps].sort());
    writeFileSync(join(storyDir(), "story.json"), JSON.stringify({ ...full, bogus_runtime_key: "x" }));
    normalizeStoryJson(tdd, "F1");
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    for (const k of schemaProps) expect(obj[k]).toBeDefined(); // every schema property survived
    expect(obj.bogus_runtime_key).toBeUndefined(); // the non-schema key was stripped
  });

  it("does not clobber an existing feature_id when both feature and feature_id are present", () => {
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature: "WRONG", feature_id: "F1" })
    );
    normalizeStoryJson(tdd, "F1");
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj.feature_id).toBe("F1");
    expect(obj.feature).toBeUndefined();
  });

  it("is idempotent + a no-op (returns []) for an already-conformant story", () => {
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature_id: "F1" })
    );
    expect(normalizeStoryJson(tdd, "F1")).toEqual([]);
    // Second pass over a file it already normalized also changes nothing.
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature: "F1", status: "draft" })
    );
    expect(normalizeStoryJson(tdd, "F1")).toEqual(["S1-test-story"]);
    expect(normalizeStoryJson(tdd, "F1")).toEqual([]);
  });

  it("backfills missing asA/iWantTo/soThat from story.md (the run17 breakdown drift)", () => {
    // The exact live drift: breakdown emitted `{id, scope, independence}` in the
    // JSON stub but wrote the full As-a/I-want/So-that narrative to story.md, so
    // the JSON tripped the feature-complete gate after all stories were built.
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", scope: "the split columns", independence: { distinct_from_prior: true, rationale: "adds x" } })
    );
    writeFileSync(
      join(storyDir(), "story.md"),
      [
        "# S1-test-story",
        "",
        "As a warehouse data engineer,  ",
        "I want the stock table to include batch_number and serial_number as separate columns,  ",
        "So that batch and serial can be queried and validated independently.",
        "",
        "## Acceptance criteria",
        "",
        "See `acs/` folder.",
      ].join("\n")
    );
    const changed = normalizeStoryJson(tdd, "F1");
    expect(changed).toEqual(["S1-test-story"]);
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj.asA).toBe("warehouse data engineer");
    expect(obj.iWantTo).toBe("the stock table to include batch_number and serial_number as separate columns");
    expect(obj.soThat).toBe("batch and serial can be queried and validated independently");
    // `scope` (not schema-allowed) is stripped; independence (allowed) is kept.
    expect(obj.scope).toBeUndefined();
    expect(obj.independence).toEqual({ distinct_from_prior: true, rationale: "adds x" });
    // The result now validates against the story schema.
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(fixture()));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative body long enough to pass.\n");
    expect(validateSpec(tdd).find((r) => r.file.endsWith("story.json"))).toBeUndefined();
    // Idempotent: a second pass over the now-conformant story changes nothing.
    expect(normalizeStoryJson(tdd, "F1")).toEqual([]);
  });

  it("does not overwrite narrative fields the stub already carries", () => {
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "the-json-role", iWantTo: "the-json-want", soThat: "the-json-outcome", feature_id: "F1" })
    );
    writeFileSync(
      join(storyDir(), "story.md"),
      "# Story\n\nAs a different role,\nI want a different thing,\nSo that a different outcome.\n"
    );
    // Already conformant + non-empty narrative -> no mutation, no md read-back.
    expect(normalizeStoryJson(tdd, "F1")).toEqual([]);
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj.asA).toBe("the-json-role");
    expect(obj.iWantTo).toBe("the-json-want");
    expect(obj.soThat).toBe("the-json-outcome");
  });
});

describe("healAndReportStoryNarrative – the breakdown post-hook's heal + fail-fast input", () => {
  const storyDir = (s = "S1-test-story") => join(tdd, "features", "F1-test-feature", "stories", s);
  const narrativeMd = (role: string) =>
    [`# story`, "", `As a ${role},`, `I want a thing,`, `So that an outcome.`, ""].join("\n");

  it("heals a stub from story.md and reports NO missing (the common breakdown drift)", () => {
    // JSON stub lacks the narrative; story.md carries it => backfilled, none missing.
    writeFileSync(join(storyDir(), "story.json"), JSON.stringify({ id: "S1", independence: { distinct_from_prior: true, rationale: "r" } }));
    writeFileSync(join(storyDir(), "story.md"), narrativeMd("warehouse engineer"));
    const { healed, missing } = healAndReportStoryNarrative(tdd, "F1");
    expect(healed).toEqual(["S1-test-story"]);
    expect(missing).toEqual([]);
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj.asA).toBe("warehouse engineer");
    expect(obj.iWantTo).toBe("a thing");
    expect(obj.soThat).toBe("an outcome");
  });

  it("reports the story as missing when story.md ALSO lacks a parseable narrative (fail-fast trigger)", () => {
    // The unrecoverable case (e.g. a truncated breakdown turn): nothing to backfill FROM,
    // so the stub stays non-conformant and the caller must halt at DESIGN.
    writeFileSync(join(storyDir(), "story.json"), JSON.stringify({ id: "S1" }));
    writeFileSync(join(storyDir(), "story.md"), "# story\n\nSome prose with no As-a / I-want / So-that lines.\n");
    const { healed, missing } = healAndReportStoryNarrative(tdd, "F1");
    expect(healed).toEqual([]); // nothing to heal
    expect(missing).toHaveLength(1);
    expect(missing[0].story).toBe("S1-test-story");
    expect(missing[0].fields).toEqual(["asA", "iWantTo", "soThat"]);
  });

  it("across stories: heals the recoverable one, reports only the unhealable one", () => {
    mkdirSync(join(storyDir("S2-second"), "acs"), { recursive: true });
    // S1: JSON missing, md has it -> healed.
    writeFileSync(join(storyDir(), "story.json"), JSON.stringify({ id: "S1" }));
    writeFileSync(join(storyDir(), "story.md"), narrativeMd("ops user"));
    // S2: JSON missing, md missing narrative -> reported.
    writeFileSync(join(storyDir("S2-second"), "story.json"), JSON.stringify({ id: "S2", independence: { distinct_from_prior: true, rationale: "r" } }));
    writeFileSync(join(storyDir("S2-second"), "story.md"), "# s2\n\nNo narrative here.\n");
    const { healed, missing } = healAndReportStoryNarrative(tdd, "F1");
    expect(healed).toEqual(["S1-test-story"]);
    expect(missing.map((m) => m.story)).toEqual(["S2-second"]);
  });

  it("returns clean (no missing) once every stub is conformant – idempotent", () => {
    writeFileSync(join(storyDir(), "story.json"), JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature_id: "F1" }));
    writeFileSync(join(storyDir(), "story.md"), "# story\n\nAlready conformant.\n");
    expect(healAndReportStoryNarrative(tdd, "F1")).toEqual({ healed: [], missing: [] });
  });
});
