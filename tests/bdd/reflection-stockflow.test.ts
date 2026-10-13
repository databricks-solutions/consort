// "Use the recorded steps for stockflow to confirm it works": stage the ACTUAL
// recorded stockflow F1 design artifacts (story.json + acs/*.json +
// architecture.json + the feature test-list master) into a temp .tdd, scope the
// per-story test-list the way the design lane's scoping step does, then drive
// the REAL probe + derive through the new pre-build reflection gate.
//
// The recorded stockflow design is clean (it built + shipped in the corpus), so
// it is the no-false-positive control: the gate must route the reflect turn on
// the real ACs, and a passing verdict must let the story proceed to its spec
// gate. Deterministic (no live agent): the single reflect turn is simulated by
// writing the passing verdict a clean critique would produce.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { diskArtifactProbe } from "../../consort/orchestrator/state/orchestrator-probe.js";
import { deriveDriveState, type DriveContext } from "../../consort/orchestrator/state/orchestrator-derive.js";
import { nextTransition } from "../../consort/orchestrator/drive/orchestrator-drive.js";
import type { StoryPipeline, StoryEntry } from "../../consort/pipeline/story-pipeline.js";
import { writeReflectVerdict } from "../../consort/smells/reflection.js";
import { storyAcIds, acsDir, storyTestListJson } from "../../consort/config/consort-paths.js";
import { analystOrderedJson } from "../../consort/test-list/fan-out-plan.js";

// A readable, self-contained copy of the recorded F1 design (architecture + test-list +
// per-story ACs) lives under tests/fixtures/, so this test OWNS its input and never reaches
// into the shared corpora (which live in the consort-examples repo, fetched via
// scripts/fetch-examples.sh). See tests/fixtures/reflection-stockflow/README.md.
const CORPUS = join(__dirname, "..", "fixtures", "reflection-stockflow");
const FEATURE = "F1-stock-visibility";
const RECORDED_F1 = join(CORPUS, "features", FEATURE);

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "reflect-stockflow-"));
  // Stage the recorded F1 feature tree verbatim (story.json, acs/, architecture.json,
  // the feature test-list master) – the real design-lane outputs.
  mkdirSync(join(tdd, "features"), { recursive: true });
  cpSync(RECORDED_F1, join(tdd, "features", FEATURE), { recursive: true });
  // The recorded corpus predates the DBA role, so it has no db-design.json. The
  // design lane now runs the DBA (architect -> dba -> test-strategist), so stage a
  // db-design.json realizing the recorded architecture's persistence_invariants
  // (PI1-PI4 on stock_records) – the DBA's physical product for this feature – so
  // the derive sees a DBA-complete design just as a real replay would.
  writeFileSync(
    join(tdd, "features", FEATURE, "db-design.json"),
    JSON.stringify({
      feature_id: FEATURE,
      tables: [
        {
          name: "stock_records",
          columns: [
            { name: "id", type: "uuid", nullable: false },
            { name: "sku", type: "text", nullable: false },
            { name: "location", type: "text", nullable: false },
            { name: "quantity", type: "integer", nullable: false },
          ],
          primary_key: ["id"],
          unique_constraints: [["sku", "location"]],
          checks: [{ name: "quantity_non_negative", expression: "quantity >= 0" }],
        },
      ],
      schema_changes: [{ story_id: "S1-record-stock", kind: "create_table", table: "stock_records", detail: "sku+location unique, quantity >= 0" }],
      realizes_invariants: ["PI1-sku-location-unique", "PI2-required-fields-not-null", "PI3-quantity-non-negative", "PI4-migration-reversible"],
    }),
  );
  // The recording ships each story's reflect-verdict.json (a real design-lane
  // artifact). These tests DRIVE the reflect gate themselves (write the verdict
  // under test, leave siblings' absent), so strip the staged verdicts to control
  // the reflection state – otherwise a sibling reads as already-passed.
  const storiesDir = join(tdd, "features", FEATURE, "stories");
  if (existsSync(storiesDir)) {
    for (const s of readdirSync(storiesDir)) {
      const v = join(storiesDir, s, "reflect-verdict.json");
      if (existsSync(v)) rmSync(v);
    }
  }
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

/** Scope the recorded feature test-list master to one story: keep the items
 *  whose ac_id belongs to that story's ACs, and write them where the driver's
 *  scoping step (consort-test-list) would (test-list-per-story.json). This
 *  reproduces the design lane's per-story test-list scoping on the recorded data
 *  so the testListReady probe is satisfied, exactly as a real replay would. */
function scopePerStoryTestList(story: string): void {
  const master = JSON.parse(readFileSync(join(RECORDED_F1, "test-list.json"), "utf8")) as {
    items?: Array<{ ac_id?: string }>;
  };
  const storyAcs = new Set(storyAcIds(tdd, FEATURE, story));
  const items = (master.items ?? []).filter((it) => it.ac_id && storyAcs.has(it.ac_id));
  writeFileSync(
    storyTestListJson(tdd, FEATURE, story),
    JSON.stringify({ feature_id: FEATURE, story_id: story, items }, null, 2),
  );
  // B4: testListReady also requires the deterministic fan-out's ordered-list artifact (the bin's
  // output). A real replay writes it when the test-strategist runs the bin; reproduce it here.
  writeFileSync(analystOrderedJson(tdd, FEATURE, story), JSON.stringify({ items }, null, 2));
}

/** Story ids present in the recorded F1 corpus, in directory order. */
function recordedStories(): string[] {
  return readdirSync(join(RECORDED_F1, "stories")).filter((s) =>
    existsSync(join(RECORDED_F1, "stories", s, "story.json")),
  );
}

function pipelineDesigning(stories: string[]): StoryPipeline {
  const entries: Record<string, StoryEntry> = {};
  for (const s of stories) entries[s] = { status: "designing" } as StoryEntry;
  return { version: 1, feature_id: FEATURE, stories: entries, build_queue: [], build_active: null };
}

const CTX: DriveContext = { phase: "feature", breakdownDone: true };

describe("stockflow F1 (recorded): the reflection gate is on the design-lane path", () => {
  it("sanity: the real recorded F1 ACs load (story S1 has its acceptance criteria on disk)", () => {
    const stories = recordedStories();
    expect(stories.length).toBeGreaterThan(0);
    const s1 = stories.find((s) => s.startsWith("S1")) ?? stories[0];
    expect(existsSync(acsDir(tdd, FEATURE, s1))).toBe(true);
    expect(storyAcIds(tdd, FEATURE, s1).length).toBeGreaterThan(0);
  });

  it("routes the Navigator reflect turn once the story is fully designed (ACs + architecture + test-list), before its gate", () => {
    const stories = recordedStories();
    const s1 = stories.find((s) => s.startsWith("S1")) ?? stories[0];
    scopePerStoryTestList(s1);
    // Only S1 is fully designed; the lane advances the first fully-designed story.
    const pipeline = pipelineDesigning([s1]);
    const probe = diskArtifactProbe(tdd, FEATURE);
    const state = deriveDriveState(pipeline, probe, CTX);
    // No reflect verdict yet -> the gate runs the critic (NOT surface-gate).
    expect(nextTransition(state)).toEqual({
      kind: "invoke-role",
      role: "navigator",
      story: s1,
      buildMode: "reflect",
    });
  });

  it("clean-design control: a passing verdict on the real recorded design advances S1 to its spec gate", () => {
    const stories = recordedStories();
    const s1 = stories.find((s) => s.startsWith("S1")) ?? stories[0];
    scopePerStoryTestList(s1);
    // Simulate the one reflect turn: the recorded stockflow design is clean, so
    // the critic passes with no findings (the no-false-positive control).
    writeReflectVerdict(tdd, FEATURE, s1, { version: 1, passed: true, findings: [] });
    const state = deriveDriveState(pipelineDesigning([s1]), diskArtifactProbe(tdd, FEATURE), CTX);
    expect(nextTransition(state)).toEqual({ kind: "surface-gate", story: s1 });
  });

  it("per-story isolation: S1 passing reflection while a sibling story is still pending does not entangle them", () => {
    const stories = recordedStories().slice(0, 2); // first two recorded stories
    const [s1, s2] = stories;
    scopePerStoryTestList(s1);
    scopePerStoryTestList(s2);
    // S1 reflection passes; S2's verdict is absent (still pending). S1 must
    // advance to its gate independently, S2 unaffected (own verdict file).
    writeReflectVerdict(tdd, FEATURE, s1, { version: 1, passed: true, findings: [] });
    const state = deriveDriveState(pipelineDesigning([s1, s2]), diskArtifactProbe(tdd, FEATURE), CTX);
    expect(nextTransition(state)).toEqual({ kind: "surface-gate", story: s1 });
    // S2's reflection is independently unresolved (its own per-story verdict).
    expect(diskArtifactProbe(tdd, FEATURE).reflectionPassed(s2)).toBe(false);
    expect(diskArtifactProbe(tdd, FEATURE).reflectionPassed(s1)).toBe(true);
  });
});
