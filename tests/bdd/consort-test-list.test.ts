import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  readMasterTestList,
  writeMasterTestList,
  viewByAc,
  viewsForAllAcs,
  writePerAcViews,
  acsForStory,
  scopeToStory,
  writeStoryTestList,
  readStoryTestList,
  type TestList,
} from "../../consort/test-list/test-list";

let tdd: string;
const FEATURE_DIR = "features/F1-test-feature";
const STORY_DIR = `${FEATURE_DIR}/stories/S1-test-story`;
const ACS_DIR = `${STORY_DIR}/acs`;
// A second story owning AC3, to prove scoping isolates one story's ACs.
const STORY2_DIR = `${FEATURE_DIR}/stories/S2-other-story`;
const ACS2_DIR = `${STORY2_DIR}/acs`;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-test-list-"));
  mkdirSync(join(tdd, ACS_DIR), { recursive: true });
  writeFileSync(join(tdd, ACS_DIR, "AC1.json"), JSON.stringify({ id: "AC1", layer: "API" }));
  writeFileSync(join(tdd, ACS_DIR, "AC2.json"), JSON.stringify({ id: "AC2", layer: "API" }));
  mkdirSync(join(tdd, ACS2_DIR), { recursive: true });
  writeFileSync(join(tdd, ACS2_DIR, "AC3.json"), JSON.stringify({ id: "AC3", layer: "API" }));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function masterList(): TestList {
  return {
    feature_id: "F1",
    ordered_for: "design-momentum",
    items: [
      { id: "T1", description: "force API shape", ac_id: "AC1", status: "pending" },
      { id: "T2", description: "happy path", ac_id: "AC1", status: "pending" },
      { id: "T3", description: "edge case", ac_id: "AC2", status: "pending" },
    ],
  };
}

describe("test-list", () => {
  it("writeMasterTestList then readMasterTestList round-trip", () => {
    const list = masterList();
    writeMasterTestList(tdd, list);
    expect(readMasterTestList(tdd, "F1")).toEqual(list);
  });

  it("viewByAc filters items to a single AC", () => {
    const list = masterList();
    const view = viewByAc(list, "AC1");
    expect(view.ac_id).toBe("AC1");
    expect(view.items.map((i) => i.id)).toEqual(["T1", "T2"]);
  });

  it("viewsForAllAcs partitions items by ac_id", () => {
    const list = masterList();
    const views = viewsForAllAcs(list);
    expect(Object.keys(views).sort()).toEqual(["AC1", "AC2"]);
    expect(views.AC1.items.length).toBe(2);
    expect(views.AC2.items.length).toBe(1);
  });

  it("writePerAcViews writes one file per story dir with views for each AC in that story", () => {
    const list = masterList();
    writeMasterTestList(tdd, list);
    const written = writePerAcViews(tdd, "F1", list);
    expect(written.length).toBeGreaterThan(0);

    const perAcFile = join(tdd, STORY_DIR, "test-list-per-ac.json");
    expect(existsSync(perAcFile)).toBe(true);
    const views = JSON.parse(readFileSync(perAcFile, "utf8"));
    expect(views.length).toBe(2);
    const ac1 = views.find((v: { ac_id: string }) => v.ac_id === "AC1");
    const ac2 = views.find((v: { ac_id: string }) => v.ac_id === "AC2");
    expect(ac1.items.length).toBe(2);
    expect(ac2.items.length).toBe(1);
  });

  it("writePerAcViews preserves existing entries when called repeatedly", () => {
    const list = masterList();
    writeMasterTestList(tdd, list);
    writePerAcViews(tdd, "F1", list);
    const second: TestList = {
      ...list,
      items: [{ id: "T1", description: "force API shape (updated)", ac_id: "AC1", status: "red" }],
    };
    writePerAcViews(tdd, "F1", second);
    const perAcFile = join(tdd, STORY_DIR, "test-list-per-ac.json");
    const views = JSON.parse(readFileSync(perAcFile, "utf8"));
    expect(views.length).toBe(2);
    const ac1 = views.find((v: { ac_id: string }) => v.ac_id === "AC1");
    expect(ac1.items[0].status).toBe("red");
  });
});

// Master list spanning both stories: AC1/AC2 -> S1, AC3 -> S2. Interleaved so
// scoping must select by AC membership, not by contiguity.
function masterListBothStories(): TestList {
  return {
    feature_id: "F1",
    ordered_for: "risk-first",
    items: [
      { id: "T1", description: "force API shape", ac_id: "AC1", status: "pending" },
      { id: "T3", description: "other-story edge", ac_id: "AC3", status: "pending" },
      { id: "T2", description: "happy path", ac_id: "AC2", status: "green" },
      { id: "T4", description: "other-story happy", ac_id: "AC3", status: "pending" },
    ],
  };
}

describe("test-list: per-story scoping (phase 2c)", () => {
  it("acsForStory reads a story's AC ids from its acs/ dir", () => {
    expect(acsForStory(tdd, "F1", "S1")).toEqual(["AC1", "AC2"]);
    expect(acsForStory(tdd, "F1", "S2")).toEqual(["AC3"]);
  });

  it("acsForStory returns [] for an unknown story", () => {
    expect(acsForStory(tdd, "F1", "S9")).toEqual([]);
  });

  it("scopeToStory selects only the story's ACs, preserving master order + status", () => {
    const scoped = scopeToStory(masterListBothStories(), "S1", ["AC1", "AC2"]);
    expect(scoped.story_id).toBe("S1");
    expect(scoped.feature_id).toBe("F1");
    expect(scoped.ordered_for).toBe("risk-first");
    // T1 (AC1) then T2 (AC2): master order kept, T3/T4 (AC3) excluded.
    expect(scoped.items.map((i) => i.id)).toEqual(["T1", "T2"]);
    expect(scoped.items.find((i) => i.id === "T2")?.status).toBe("green");
  });

  it("scopeToStory GROUPS the build list by AC (per-AC RED-GREEN-REVIEW-REFACTOR), keeping master order within an AC", () => {
    // Master interleaves AC1 and AC2 (design-momentum): AC1-Ta, AC2-Tb, AC1-Tc, AC2-Td.
    // The per-story BUILD list must group by AC so each AC's tests are contiguous
    // (AC1 first since it appears first): [Ta, Tc, Tb, Td], NOT the interleaved order.
    const interleaved: TestList = {
      feature_id: "F1",
      ordered_for: "design-momentum",
      items: [
        { id: "Ta", description: "ac1 first", ac_id: "AC1", status: "pending" },
        { id: "Tb", description: "ac2 first", ac_id: "AC2", status: "pending" },
        { id: "Tc", description: "ac1 second", ac_id: "AC1", status: "pending" },
        { id: "Td", description: "ac2 second", ac_id: "AC2", status: "pending" },
      ],
    };
    const scoped = scopeToStory(interleaved, "S1", ["AC1", "AC2"]);
    expect(scoped.items.map((i) => i.id)).toEqual(["Ta", "Tc", "Tb", "Td"]);
  });

  it("writeStoryTestList writes stories/<story>/test-list-per-story.json scoped to that story", () => {
    writeMasterTestList(tdd, masterListBothStories());
    const file = writeStoryTestList(tdd, "F1", "S2");
    expect(file).toBe(join(tdd, STORY2_DIR, "test-list-per-story.json"));
    const scoped = JSON.parse(readFileSync(file!, "utf8"));
    expect(scoped.story_id).toBe("S2");
    expect(scoped.items.map((i: { id: string }) => i.id)).toEqual(["T3", "T4"]);
  });

  it("writeStoryTestList returns null for an unresolvable story", () => {
    writeMasterTestList(tdd, masterListBothStories());
    expect(writeStoryTestList(tdd, "F1", "S9")).toBeNull();
  });

  it("readStoryTestList round-trips what writeStoryTestList wrote", () => {
    writeMasterTestList(tdd, masterListBothStories());
    writeStoryTestList(tdd, "F1", "S1");
    const read = readStoryTestList(tdd, "F1", "S1");
    expect(read?.story_id).toBe("S1");
    expect(read?.items.map((i) => i.id)).toEqual(["T1", "T2"]);
  });

  it("readStoryTestList returns null before the per-story list is written", () => {
    writeMasterTestList(tdd, masterListBothStories());
    expect(readStoryTestList(tdd, "F1", "S1")).toBeNull();
  });

  it("tolerates a non-conformant master (no `items`) without crashing the scope step", () => {
    // Regression: a Test Strategist (haiku) wrote the master with a top-level
    // `tests` key + no `items`, and scopeToStory's `list.items.filter` crashed
    // the whole driver with "Cannot read properties of undefined (reading
    // 'filter')". readMasterTestList must normalize items to [] so the lane
    // re-issues the role (clean stall) instead of dying opaquely.
    writeFileSync(
      join(tdd, FEATURE_DIR, "test-list.json"),
      JSON.stringify({ feature_id: "F1", ordered_for: "design-momentum", tests: [{ id: "T1" }], gate_3_status: "ready" }),
    );
    const master = readMasterTestList(tdd, "F1");
    expect(master.items).toEqual([]);
    expect(() => scopeToStory(master, "S1", ["AC1"])).not.toThrow();
    // writeStoryTestList yields an empty per-story list (testListReady stays false).
    const file = writeStoryTestList(tdd, "F1", "S1");
    expect(file).toBeTruthy();
    expect(readStoryTestList(tdd, "F1", "S1")!.items).toEqual([]);
  });

  it("accumulates a later story's authored tests into the master (no empty-scope stall)", () => {
    // Live two-story stall: the master held only the FIRST story's tests
    // (AC1/AC2). S2 owns AC3; its Test Strategist wrote S2's own per-story list.
    // Without accumulation, scoping the S1-only master to S2 is empty, so
    // testListReady(S2) stays false and the design lane re-issues test-strategist
    // forever. writeStoryTestList must fold the story's authored items into the
    // master, then scope.
    writeMasterTestList(tdd, masterList()); // T1/T2 (AC1), T3 (AC2) – story 1 only
    writeFileSync(
      join(tdd, STORY2_DIR, "test-list-per-story.json"),
      JSON.stringify({
        feature_id: "F1",
        story_id: "S2",
        ordered_for: "design-momentum",
        items: [{ id: "T9", description: "detail page loads", ac_id: "AC3", status: "pending" }],
      }) + "\n",
    );
    expect(writeStoryTestList(tdd, "F1", "S2")).toBeTruthy();
    // S2's per-story list is now non-empty (the fix).
    expect(readStoryTestList(tdd, "F1", "S2")!.items.map((i) => i.id)).toEqual(["T9"]);
    // The master accumulated S2's test, so markTestItemGreen can find it later.
    expect(readMasterTestList(tdd, "F1").items.map((i) => i.id).sort()).toEqual(["T1", "T2", "T3", "T9"]);
    // S1 still scopes to exactly its own ACs (no regression).
    expect(writeStoryTestList(tdd, "F1", "S1")).toBeTruthy();
    expect(readStoryTestList(tdd, "F1", "S1")!.items.map((i) => i.id).sort()).toEqual(["T1", "T2", "T3"]);
  });

  it("folds a later story whose per-story ids COLLIDE with the master (the live S3 abort)", () => {
    // The real failure: the Strategist restarts test ids at T1 per story, so S2's
    // authored ids (T1, T2) collided with the master's existing T1/T2. The old
    // id-keyed dedup dropped every S2 item, the master never got S2, and S2 scoped
    // to EMPTY -> protocol abort. Dedup must key on (ac_id, description) and re-id
    // the colliding additions.
    writeMasterTestList(tdd, masterList()); // T1/T2 (AC1), T3 (AC2)
    writeFileSync(
      join(tdd, STORY2_DIR, "test-list-per-story.json"),
      JSON.stringify({
        feature_id: "F1",
        story_id: "S2",
        ordered_for: "design-momentum",
        items: [
          { id: "T1", description: "owner opens the detail page", ac_id: "AC3", status: "pending" },
          { id: "T2", description: "missing id returns not-found", ac_id: "AC3", status: "pending" },
        ],
      }) + "\n",
    );
    expect(writeStoryTestList(tdd, "F1", "S2")).toBeTruthy();
    // S2's per-story list is non-empty (both items survived, not dropped).
    const s2 = readStoryTestList(tdd, "F1", "S2")!;
    expect(s2.items.map((i) => i.ac_id)).toEqual(["AC3", "AC3"]);
    // The master accumulated both S2 items, re-id'd to keep ids globally unique.
    const master = readMasterTestList(tdd, "F1");
    const ids = master.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    expect(master.items.filter((i) => i.ac_id === "AC3").length).toBe(2);
  });

  it("fold is idempotent on a re-dispatch (does not duplicate the story's items)", () => {
    writeMasterTestList(tdd, masterList());
    const authored =
      JSON.stringify({
        feature_id: "F1",
        story_id: "S2",
        items: [{ id: "T1", description: "owner opens the detail page", ac_id: "AC3", status: "pending" }],
      }) + "\n";
    const s2File = join(tdd, STORY2_DIR, "test-list-per-story.json");
    writeFileSync(s2File, authored);
    writeStoryTestList(tdd, "F1", "S2");
    writeFileSync(s2File, authored); // re-dispatch re-writes the same per-story list
    writeStoryTestList(tdd, "F1", "S2");
    expect(readMasterTestList(tdd, "F1").items.filter((i) => i.ac_id === "AC3").length).toBe(1);
  });
});

// The per-story-view postTurn (consort-test-list <dir> <feature> <story>) TRACES whether it ran + what
// it scoped into the persisted agent-log, so a run can diagnose the double-dispatch (testListReady reads
// the per-story view; when it does not materialize on the authoring turn the lane re-dispatches). The CLI
// is a self-invoking bin (dist __dirname shim), so assert the WIRING statically, like the drive bin tests.
describe("test-list CLI traces the per-story-view generation (postTurn observability)", () => {
  const SRC = readFileSync(new URL("../../bin/consort/test-list.cli.ts", import.meta.url), "utf8");
  it("emits an orchestrator agent-log event with the master + scoped item counts, and traces failures", () => {
    expect(SRC).toMatch(/import\s*\{[^}]*\bemitAgentLogEvent\b[^}]*\}\s*from/);
    expect(SRC).toMatch(/per-story-view generated/);
    expect(SRC).toMatch(/master=.*scoped=/);
    // The erred path is traced too, so "ran but failed" is distinguishable from "never ran".
    expect(SRC).toMatch(/per-story-view generation FAILED/);
    // Best-effort: diagnostics never fail the CLI.
    expect(SRC).toMatch(/diagnostics never fail the CLI/);
  });
});
