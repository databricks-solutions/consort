import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TestBubbles, summarizeTests, testTailForStory, testType, type StoryTest } from "./StoryTestsLightbox";
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
    expect(s.pct).toBe(50);
    expect(s.by).toEqual({ green: 1, red: 1, pending: 1, refactored: 1 });
  });

  it("is 0% / empty for no items (no divide-by-zero)", () => {
    expect(summarizeTests([])).toEqual({ by: {}, passing: 0, total: 0, pct: 0 });
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
