// A contract/cleanup story (drop column / remove endpoint / rename) auto-drops
// to the finest `ac` build granularity, regardless of the run default – its
// lockstep DB+code change is too heavy for one story-level GREEN turn (the
// F6/S3-split-drop-old build ground for 20+ min without converging).

import { describe, it, expect } from "vitest";
import { isContractStory, effectiveLoopForStory } from "../../consort/orchestrator/state/orchestrator-derive";

describe("isContractStory", () => {
  it("flags drop/remove/rename/cleanup stories", () => {
    expect(isContractStory("S3-split-drop-old")).toBe(true);
    expect(isContractStory("S4-remove-legacy-endpoint")).toBe(true);
    expect(isContractStory("S2-rename-sku-field")).toBe(true);
    expect(isContractStory("S5-cleanup-deprecated-columns")).toBe(true);
    expect(isContractStory("S6-delete-orphan-rows")).toBe(true);
    expect(isContractStory("S7-deprecate-v1-api")).toBe(true);
  });
  it("does NOT flag additive / expand stories", () => {
    expect(isContractStory("S1-split-add-backfill")).toBe(false);
    expect(isContractStory("S1-record-stock")).toBe(false);
    expect(isContractStory("S2-home-stock-table")).toBe(false);
    expect(isContractStory("S3-sku-detail-view")).toBe(false);
    expect(isContractStory("S2-split-validate")).toBe(false);
  });
});

describe("effectiveLoopForStory", () => {
  it("drops a contract story to ac regardless of the run default", () => {
    expect(effectiveLoopForStory("story", "S3-split-drop-old")).toBe("ac");
    expect(effectiveLoopForStory("hybrid-a", "S3-split-drop-old")).toBe("ac");
    expect(effectiveLoopForStory("ac", "S3-split-drop-old")).toBe("ac");
  });
  it("leaves an additive story at the run default", () => {
    expect(effectiveLoopForStory("story", "S1-split-add-backfill")).toBe("story");
    expect(effectiveLoopForStory("hybrid-a", "S2-split-validate")).toBe("hybrid-a");
    expect(effectiveLoopForStory("ac", "S1-record-stock")).toBe("ac");
  });
  it("#3 batch-RED lever: batchContractStories=true lets a contract story use the run default (opt-in)", () => {
    // Default (false / omitted) keeps the safe fine-grained ac loop...
    expect(effectiveLoopForStory("story", "S3-split-drop-old")).toBe("ac");
    expect(effectiveLoopForStory("story", "S3-split-drop-old", false)).toBe("ac");
    // ...true opts the contract story into the batched loop (fewer cycles; A/B before adopting).
    expect(effectiveLoopForStory("story", "S3-split-drop-old", true)).toBe("story");
    expect(effectiveLoopForStory("hybrid-a", "S3-split-drop-old", true)).toBe("hybrid-a");
    // An additive story is unaffected by the flag.
    expect(effectiveLoopForStory("story", "S1-record-stock", true)).toBe("story");
  });
});
