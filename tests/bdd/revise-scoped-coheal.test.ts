// B — scoped re-derive: a clean, AC-scoped test_list revise clears ONLY the flagged AC's items (from
// the master + the fan-out ordered list) and PRESERVES the rest (with their ids) in a sidecar the bin
// merges onto — instead of ditching + regenerating the whole story's test-list. A full/unscoped revise
// clears every story AC and deletes the ordered list (no sidecar).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staleStoryArtifactsForRevise, clearArchitecturalNotes } from "../../consort/orchestrator/status/revise.js";
import { featureTestListJson, acsDir, specReviseScopeJson, testListPatchJson } from "../../consort/config/consort-paths.js";
import { analystOrderedJson, analystOrderedPreservedJson } from "../../consort/test-list/fan-out-plan.js";

const FEATURE = "F1-x";
const STORY = "S1-y";
let tmp: string;
let consortDir: string;

const items = (acs: string[]): Array<{ id: string; ac_id: string }> =>
  acs.map((ac, i) => ({ id: `T${i + 1}`, ac_id: ac }));
const acIdsIn = (path: string): string[] =>
  (JSON.parse(readFileSync(path, "utf8")).items as Array<{ ac_id: string }>).map((it) => it.ac_id);

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "revise-scoped-"));
  consortDir = join(tmp, ".consort");
  // master + ordered list cover AC1/AC2/AC3; acs/ on disk so the FULL path can read storyAcIds.
  const storyDir = join(consortDir, "features", FEATURE, "stories", STORY);
  mkdirSync(join(storyDir, "acs"), { recursive: true });
  for (const ac of ["AC1", "AC2", "AC3"]) writeFileSync(join(storyDir, "acs", `${ac}.json`), JSON.stringify({ id: ac }));
  writeFileSync(featureTestListJson(consortDir, FEATURE), JSON.stringify({ items: items(["AC1", "AC2", "AC3"]) }));
  writeFileSync(analystOrderedJson(consortDir, FEATURE, STORY), JSON.stringify({ items: items(["AC1", "AC2", "AC3"]) }));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("staleStoryArtifactsForRevise — test_list revise (Option A: scoped=PATCH, full=fan-out)", () => {
  it("SCOPED is a PATCH: keeps analyst-ordered.json (the edit source) + writes the patch marker, no fan-out, no sidecar", () => {
    staleStoryArtifactsForRevise(consortDir, FEATURE, STORY, "test_list", ["AC2"]);
    // this story's master items are cleared (the test-strategist re-appends the PATCHED ordered list)
    expect(acIdsIn(featureTestListJson(consortDir, FEATURE))).toEqual([]);
    // analyst-ordered.json is KEPT — the test-strategist edits it in place, NOT a fan-out re-derive
    expect(existsSync(analystOrderedJson(consortDir, FEATURE, STORY))).toBe(true);
    // the patch marker names the flagged AC so the directive patches instead of fanning out
    const marker = testListPatchJson(consortDir, FEATURE, STORY);
    expect(existsSync(marker)).toBe(true);
    expect(JSON.parse(readFileSync(marker, "utf8")).ac_ids).toEqual(["AC2"]);
    // the fan-out merge sidecar is NOT used on a patch
    expect(existsSync(analystOrderedPreservedJson(consortDir, FEATURE, STORY))).toBe(false);
  });

  it("FULL (no scope) re-derives: drops analyst-ordered.json so the fan-out re-runs, and writes NO patch marker", () => {
    // a stale patch marker from a prior scoped revise must be cleared so the directive picks the fan-out
    writeFileSync(testListPatchJson(consortDir, FEATURE, STORY), JSON.stringify({ ac_ids: ["AC2"] }));
    staleStoryArtifactsForRevise(consortDir, FEATURE, STORY, "test_list");
    expect(JSON.parse(readFileSync(featureTestListJson(consortDir, FEATURE), "utf8")).items).toEqual([]);
    expect(existsSync(analystOrderedJson(consortDir, FEATURE, STORY))).toBe(false);
    expect(existsSync(testListPatchJson(consortDir, FEATURE, STORY))).toBe(false);
    expect(existsSync(analystOrderedPreservedJson(consortDir, FEATURE, STORY))).toBe(false);
  });
});

describe("staleStoryArtifactsForRevise — ARCHITECTURE revise PRESERVES the test-list (A)", () => {
  it("clears architectural_notes (architect re-runs) but keeps the master test-list + ordered list intact", () => {
    // AC files with notes so we can see the notes clear
    for (const ac of ["AC1", "AC2", "AC3"]) {
      writeFileSync(join(acsDir(consortDir, FEATURE, STORY), `${ac}.json`), JSON.stringify({ id: ac, architectural_notes: `note-${ac}` }));
    }
    staleStoryArtifactsForRevise(consortDir, FEATURE, STORY, "architecture");
    // the test-list (master + ordered) survives — a ui_seams/notes change does NOT re-derive the tests
    expect(acIdsIn(featureTestListJson(consortDir, FEATURE))).toEqual(["AC1", "AC2", "AC3"]);
    expect(existsSync(analystOrderedJson(consortDir, FEATURE, STORY))).toBe(true);
    expect(existsSync(testListPatchJson(consortDir, FEATURE, STORY))).toBe(false);
    // but the architect's notes ARE cleared so the architect re-annotates (adds the missing seams)
    const notes = (ac: string): unknown => JSON.parse(readFileSync(join(acsDir(consortDir, FEATURE, STORY), `${ac}.json`), "utf8")).architectural_notes;
    for (const ac of ["AC1", "AC2", "AC3"]) expect(notes(ac)).toBeUndefined();
  });
});

describe("staleStoryArtifactsForRevise — scoped SPEC revise (B, spec analogue)", () => {
  const acFile = (ac: string): string => join(acsDir(consortDir, FEATURE, STORY), `${ac}.json`);
  beforeEach(() => {
    // AC files carry architect notes — the scoped clear must PRESERVE the unflagged ones (content + notes).
    for (const ac of ["AC1", "AC2", "AC3"]) {
      writeFileSync(acFile(ac), JSON.stringify({ id: ac, given: "g", architectural_notes: `note-${ac}` }));
      writeFileSync(join(acsDir(consortDir, FEATURE, STORY), `${ac}.md`), `# ${ac}\n`);
    }
  });

  it("clears ONLY the spec-author's flagged AC file(s) + records them in the marker; the rest (with notes) survive", () => {
    staleStoryArtifactsForRevise(consortDir, FEATURE, STORY, "spec", undefined, ["AC2"]);
    // AC2 is gone (re-authored); AC1 + AC3 (and their architect notes) stay on disk
    expect(existsSync(acFile("AC2"))).toBe(false);
    expect(existsSync(join(acsDir(consortDir, FEATURE, STORY), "AC2.md"))).toBe(false);
    expect(existsSync(acFile("AC1"))).toBe(true);
    expect(existsSync(acFile("AC3"))).toBe(true);
    expect(JSON.parse(readFileSync(acFile("AC1"), "utf8")).architectural_notes).toBe("note-AC1");
    // the marker names the cleared AC so specRevisePending re-invokes the spec-author for just it
    const marker = specReviseScopeJson(consortDir, FEATURE, STORY);
    expect(existsSync(marker)).toBe(true);
    expect(JSON.parse(readFileSync(marker, "utf8")).ac_ids).toEqual(["AC2"]);
  });

  it("FULL spec revise (no scope) wipes every AC file and writes NO marker", () => {
    staleStoryArtifactsForRevise(consortDir, FEATURE, STORY, "spec");
    for (const ac of ["AC1", "AC2", "AC3"]) expect(existsSync(acFile(ac))).toBe(false);
    expect(existsSync(specReviseScopeJson(consortDir, FEATURE, STORY))).toBe(false);
  });

  it("#4 — clearArchitecturalNotes SCOPED clears only the flagged AC's notes; unscoped clears all", () => {
    const notes = (ac: string): unknown => JSON.parse(readFileSync(acFile(ac), "utf8")).architectural_notes;
    // scoped to AC2: AC1 + AC3 keep their notes (no needless re-annotate churn)
    clearArchitecturalNotes(consortDir, FEATURE, STORY, ["AC2"]);
    expect(notes("AC2")).toBeUndefined();
    expect(notes("AC1")).toBe("note-AC1");
    expect(notes("AC3")).toBe("note-AC3");
    // unscoped: every AC's notes cleared (the whole-story re-annotate)
    clearArchitecturalNotes(consortDir, FEATURE, STORY);
    for (const ac of ["AC1", "AC2", "AC3"]) expect(notes(ac)).toBeUndefined();
  });
});
