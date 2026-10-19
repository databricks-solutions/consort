import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TestBubbles, summarizeTests, type StoryTest } from "./StoryTestsLightbox";

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
