import { describe, it, expect } from "vitest";
import { FIELD_KIND, CARD_INPUTS, cardInputs, viewCtxOf, guardedProjection, type CardId } from "./card-inputs";
import type { DashboardState, RunPosition } from "./types";

const RP = (feature: string | null): RunPosition => ({ feature, story: null, phase: null, lane: "build", locus: { kind: "idle" } });

// Minimal stub — only the fields the selector/guard tests touch; cast through unknown.
function stub(over: Partial<DashboardState> = {}): DashboardState {
  return {
    feature: "F9",
    stories: [],
    source: undefined,
    atLive: true,
    pinnedFeature: null,
    runPosition: RP("F9"),
    ...over,
  } as unknown as DashboardState;
}

describe("card-inputs MAP — consistency", () => {
  it("every CARD_INPUTS reads entry is a real, tagged DashboardState field", () => {
    const tagged = new Set(Object.keys(FIELD_KIND));
    for (const [id, spec] of Object.entries(CARD_INPUTS)) {
      for (const key of spec.reads) {
        expect(tagged.has(key as string), `card ${id} reads untagged/unknown field ${String(key)}`).toBe(true);
      }
    }
  });

  it("every field's kind is one of live|durable|view", () => {
    for (const k of Object.values(FIELD_KIND)) expect(["live", "durable", "view"]).toContain(k);
  });
});

describe("card-inputs selector — projection + Kind wrapping", () => {
  it("projects ONLY the declared fields for a card", () => {
    const vc = viewCtxOf(stub());
    const got = cardInputs(stub(), "featureStatusSection", vc);
    expect(Object.keys(got).sort()).toEqual([...CARD_INPUTS.featureStatusSection.reads].sort());
  });

  it("a LIVE-bound card gets live fields BARE (it IS the run)", () => {
    const vc = viewCtxOf(stub({ atLive: false })); // diverges, but orchestrator is live-bound
    const got = cardInputs(stub(), "orchestrator", vc);
    expect(got.runPosition).toEqual(RP("F9")); // bare, not wrapped
  });

  it("a VIEWED-bound card WRAPS live fields when the viewed feature diverges from the run", () => {
    const vc = viewCtxOf(stub(), { viewedFeature: "F2", branch: "feature-f2" }); // viewed F2, run on F9
    const got = cardInputs(stub(), "storyTestsLightbox", vc) as Record<string, unknown>;
    // runPosition is a `live` field → wrapped with the live run's feature+branch, never bare F2
    expect(got.runPosition).toEqual({ value: RP("F9"), live: { feature: "F9", branch: "feature-f2" } });
    // a durable field (stories) passes through bare
    expect(got.stories).toEqual([]);
  });

  it("a VIEWED-bound card at the live edge (not diverging) gets live fields bare", () => {
    const vc = viewCtxOf(stub(), { viewedFeature: "F9" }); // viewed == run
    const got = cardInputs(stub(), "storyTestsLightbox", vc);
    expect(got.runPosition).toEqual(RP("F9")); // bare
  });
});

describe("card-inputs guard — undeclared reads throw", () => {
  it("throws when a card reads a field outside its declared reads", () => {
    const g = guardedProjection(stub(), "featureStatusSection"); // reads: features, stories
    expect(() => g.stories).not.toThrow();
    expect(() => g.gates).toThrow(/undeclared field "gates"/);
  });

  it("allows every declared read", () => {
    for (const id of Object.keys(CARD_INPUTS) as CardId[]) {
      const g = guardedProjection(stub(), id);
      for (const key of CARD_INPUTS[id].reads) expect(() => g[key]).not.toThrow();
    }
  });
});
