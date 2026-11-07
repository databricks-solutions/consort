import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TestBubbles, summarizeTests, testTailForStory, resolveTestDisplayStatus, testType, branchChipLabel, type StoryTest } from "./StoryTestsLightbox";
import type { ActivityLine } from "./AgentLogReplay";

const items: StoryTest[] = [
  { id: "T1", description: "files a stock record and reads it back", ac_id: "AC1", status: "green", kind: "behavior" },
  { id: "T2", description: "a NULL sku is rejected by the NOT NULL constraint", ac_id: "AC1", status: "red", kind: "fitness", invariant_id: "PI2" },
  { id: "T3", description: "retrieves the record later", ac_id: "AC2", status: "pending", kind: "behavior" },
  { id: "T4", description: "repository extracted, behaviour unchanged", ac_id: "AC1", status: "refactored", kind: "behavior" },
];

describe("summarizeTests", () => {
  it("counts passing as green + refactored", () => {
    const s = summarizeTests(items);
    expect(s.total).toBe(4);
    expect(s.passing).toBe(2); // green + refactored both read as passing
    expect(s.superseded).toBe(0);
    expect(s.pct).toBe(50);
    expect(s.by).toEqual({ green: 1, red: 1, pending: 1, refactored: 1 });
  });

  it("counts both superseded variants apart from passing", () => {
    const s = summarizeTests([
      { id: "A", description: "", ac_id: "AC1", status: "green" },
      { id: "B", description: "", ac_id: "AC1", status: "superseded" },
      { id: "C", description: "", ac_id: "AC1", status: "supersededGreen" },
    ]);
    expect(s.passing).toBe(1); // only the live green
    expect(s.superseded).toBe(2); // never-greened + was-green-then-regressed
    expect(s.total).toBe(3);
  });

  it("is 0% / empty for no items (no divide-by-zero)", () => {
    expect(summarizeTests([])).toEqual({ by: {}, passing: 0, superseded: 0, total: 0, pct: 0 });
  });
});

describe("resolveTestDisplayStatus — authoritative, never inferred from the lossy trail", () => {
  const t = (over: Partial<StoryTest> = {}): StoryTest => ({ id: "T1", description: "d", ac_id: "AC1", status: "green", ...over });
  const base = { supersededIds: new Set<string>(), featureShipped: false, trail: new Map<string, string>(), haveTestLines: false, atLive: true };

  it("supersession wins ONLY from the real set, struck green or red by the authored status", () => {
    expect(resolveTestDisplayStatus({ ...base, test: t({ status: "green" }), supersededIds: new Set(["T1"]) })).toBe("supersededGreen");
    expect(resolveTestDisplayStatus({ ...base, test: t({ status: "red" }), supersededIds: new Set(["T1"]) })).toBe("superseded");
  });

  it("a SHIPPED story trusts the authoritative per-story status, ignoring the trail", () => {
    // Even if the (lossy) trail only ever saw red, a shipped story reads its authoritative green.
    const trail = new Map([["T1", "red"]]);
    expect(resolveTestDisplayStatus({ ...base, test: t({ status: "green" }), featureShipped: true, trail, haveTestLines: true, atLive: false })).toBe("green");
  });

  it("an ACTIVE story reveals the recorded red→green progression from the trail", () => {
    const trail = new Map([["T1", "red"]]);
    expect(resolveTestDisplayStatus({ ...base, test: t(), trail, haveTestLines: true, atLive: false })).toBe("red");
    const greened = new Map([["T1", "green"]]);
    expect(resolveTestDisplayStatus({ ...base, test: t(), trail: greened, haveTestLines: true, atLive: false })).toBe("green");
  });

  it("an ACTIVE story with a test not yet reached is pending when scrubbed, HEAD status at the live edge", () => {
    expect(resolveTestDisplayStatus({ ...base, test: t({ status: "green" }), trail: new Map(), haveTestLines: true, atLive: false })).toBe("pending");
    expect(resolveTestDisplayStatus({ ...base, test: t({ status: "green" }), trail: new Map(), haveTestLines: true, atLive: true })).toBe("green");
  });

  it("never fabricates supersession from a red-only trail (the corrected behavior)", () => {
    // A test red in the trail, NOT in the superseded set, NOT shipped → red (being worked), never superseded.
    const trail = new Map([["T1", "red"]]);
    const out = resolveTestDisplayStatus({ ...base, test: t({ status: "red" }), trail, haveTestLines: true, atLive: false });
    expect(out).toBe("red");
    expect(out).not.toBe("superseded");
  });
});

describe("TestBubbles", () => {
  const html = renderToStaticMarkup(<TestBubbles items={items} />);

  it("renders every authored test id", () => {
    for (const t of items) expect(html).toContain(t.id);
  });

  it("tags each bubble with its status so the colour is status-driven", () => {
    expect(html).toContain('data-status="green"');
    expect(html).toContain('data-status="red"');
    expect(html).toContain('data-status="pending"');
    expect(html).toContain('data-status="refactored"');
  });

  it("shows the passing summary (green + refactored over total)", () => {
    expect(html).toContain("2/4 passing");
  });

  it("surfaces pending tests as upcoming", () => {
    expect(html).toContain("upcoming");
  });

  it("carries the ac_id and invariant/nfr tags for provenance", () => {
    expect(html).toContain("AC1");
    expect(html).toContain("PI2");
  });

  it("renders an explicit empty state when a story has no authored tests", () => {
    expect(renderToStaticMarkup(<TestBubbles items={[]} />)).toContain("No tests authored");
  });
});

describe("testTailForStory — the per-test tail is SCOPED to one feature+story (no cross-story leak)", () => {
  // A multi-feature stream: F1/S1 built its T1,T2 GREEN; F2/S1 is still designing (its T1,T2 have
  // no `test` line yet). Test ids collide (both stories have T1,T2) — the leak the scope closes.
  const line = (idx: number, testId: string, status: string, feature: string, story: string): ActivityLine => ({
    idx,
    turn: 0,
    role: "driver",
    kind: "test",
    testId,
    status,
    featureId: feature,
    storyId: story,
  });
  const lines: ActivityLine[] = [
    line(0, "T1", "green", "F1", "S1"),
    line(1, "T2", "green", "F1", "S1"),
    line(2, "T1", "red", "F2", "S2"), // a DIFFERENT story's T1, interleaved
  ];

  it("returns ONLY this feature+story's statuses — F1/S1's greens never touch F2/S1", () => {
    const f2s1 = testTailForStory(lines, 99, "F2", "S1");
    expect(f2s1.size).toBe(0); // F2/S1 has no test line yet — its bubbles stay pending, not F1's green

    const f1s1 = testTailForStory(lines, 99, "F1", "S1");
    expect(f1s1.get("T1")).toBe("green");
    expect(f1s1.get("T2")).toBe("green");
    expect(f1s1.size).toBe(2);

    const f2s2 = testTailForStory(lines, 99, "F2", "S2");
    expect(f2s2.get("T1")).toBe("red"); // the same T-id, correctly scoped to its own story
    expect(f2s2.size).toBe(1);
  });

  it("folds only lines REVEALED by the playhead (idx < lineAt), last status winning", () => {
    const partial = testTailForStory(lines, 1, "F1", "S1"); // only line idx 0 revealed
    expect(partial.get("T1")).toBe("green");
    expect(partial.has("T2")).toBe(false); // idx 1 not yet revealed
  });

  it("ignores non-test lines", () => {
    const withTool: ActivityLine[] = [{ idx: 0, turn: 0, role: "driver", kind: "tool", verb: "Edit", target: "x.ts" }, ...lines];
    expect(testTailForStory(withTool, 99, "F1", "S1").size).toBe(2);
  });
});

describe("testType — a client test is E2E, never a bare CLIENT", () => {
  const t = (over: Partial<StoryTest>): StoryTest => ({ id: "T", description: "d", ac_id: "AC1", status: "pending", ...over });

  it("behavior / fitness / component map straight through", () => {
    expect(testType(t({ kind: "behavior" }))).toBe("behavior");
    expect(testType(t({ kind: "fitness" }))).toBe("fitness");
    expect(testType(t({ kind: "component" }))).toBe("component");
  });

  it("a client .spec.ts (or /e2e/ path) is E2E", () => {
    expect(testType(t({ kind: "client", scenario_file: "client/tests/e2e/stock.spec.ts" }))).toBe("e2e");
    expect(testType(t({ kind: "client", scenario_file: "client/e2e/thing.ts" }))).toBe("e2e");
  });

  it("a client .test.tsx is a component test (no DB)", () => {
    expect(testType(t({ kind: "client", scenario_file: "client/src/Foo.test.tsx" }))).toBe("component");
  });

  it("a client test with no/unrecognized scenario_file defaults to E2E (never CLIENT)", () => {
    expect(testType(t({ kind: "client" }))).toBe("e2e");
    expect(testType(t({ kind: "client", scenario_file: "weird" }))).toBe("e2e");
  });

  it("renders abbreviated type pills (BDD / FIT / E2E / COMP), not the long words", () => {
    const html = renderToStaticMarkup(
      <TestBubbles
        items={[
          t({ id: "B", kind: "behavior" }),
          t({ id: "F", kind: "fitness" }),
          t({ id: "E", kind: "client", scenario_file: "client/tests/e2e/x.spec.ts" }),
          t({ id: "C", kind: "component" }),
        ]}
      />,
    );
    expect(html).toContain(">BDD<");
    expect(html).toContain(">FIT<");
    expect(html).toContain(">E2E<");
    expect(html).toContain(">COMP<");
    expect(html).not.toContain(">CLIENT<");
  });
});

describe("branchChipLabel (live-vs-viewed hard label)", () => {
  it("is a plain label when the viewed story IS the live one", () => {
    expect(branchChipLabel(true, "F9-stock-search")).toBe("lakebase branch");
  });
  it("hard-labels the live run's feature when viewing a non-live story", () => {
    expect(branchChipLabel(false, "F9-stock-search")).toBe("live · F9-stock-search · branch");
  });
  it("falls back to 'run' when the live feature is unknown", () => {
    expect(branchChipLabel(false, null)).toBe("live · run · branch");
  });
});
